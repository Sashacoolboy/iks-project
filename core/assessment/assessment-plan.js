import { STATUS } from '../profile-engine.js';
import { normalizeControlId, denormalizeControlId } from './control-id.js';
import { indexAdapter } from './odp-adapter.js';
import { resolveEffectiveValue, baselineValue } from './effective-value-resolver.js';
import { resolveAssessmentObjective } from './objective-resolver.js';

/**
 * Returns a map of all ЦПБ-applicable control IDs to their statuses.
 * - APPLIED: selected, not exempt nor excluded
 * - EXEMPT: ДСТЗІ exemption applies (unless overridden)
 * - EXCLUDED: user explicitly excluded
 */
function cpbApplicableControlIds(approvedState, catalogs) {
  const bpb = catalogs.bpb[approvedState.info_type];
  const ids = new Map();
  if (!bpb) return ids;

  const exemptByControl = new Map();
  for (const e of catalogs.exemptions.exemptions) {
    if (e.applies_to_classes.includes(approvedState.passport.as_class)) {
      exemptByControl.set(e.control_ref, e);
    }
  }

  for (const sc of bpb.security_classes) {
    for (const action of sc.actions) {
      const key = `${sc.security_class.class_id}:${action.number}`;
      let status = STATUS.APPLIED;
      const mandatedBaseIds = new Set(action.security_actions.map(sa => sa.control.base_id));

      if ((approvedState.profile.excluded ?? []).includes(key)) {
        status = STATUS.EXCLUDED;
      } else if ([...mandatedBaseIds].some(id => exemptByControl.has(id))
                 && !(approvedState.profile.exemption_overrides ?? []).includes(key)) {
        status = STATUS.EXEMPT;
      }

      for (const sa of action.security_actions) {
        ids.set(sa.control.id, status);
      }
    }
  }

  for (const enhId of (approvedState.profile.enhancements ?? [])) {
    if (!ids.has(enhId)) ids.set(enhId, STATUS.APPLIED);
  }

  return ids;
}

const CPB_STATUS_MAP = { [STATUS.APPLIED]: 'APPLIED', [STATUS.EXEMPT]: 'EXEMPT', [STATUS.EXCLUDED]: 'EXCLUDED' };

/**
 * buildAssessmentPlan (v3)
 * @param {object} params
 * @param {object} params.approvedState – { info_type, profile, passport }
 * @param {object} params.catalogs – { ndTzi, bpb, exemptions, genericDefaults }
 * @param {object} params.assessmentCatalog – v3 assessment catalog
 * @param {object} params.adapter – ODP adapter document
 * @returns {{ items: Array, warnings: Array }}
 */
export function buildAssessmentPlan({ approvedState, catalogs, assessmentCatalog, adapter }) {
  const items = [];
  const warnings = [];
  const adapterIndex = indexAdapter(adapter);
  const cpb = { info_type: approvedState.info_type, profile: approvedState.profile };
  const genericDefaults = catalogs.genericDefaults;
  const applicable = cpbApplicableControlIds(approvedState, catalogs);

  const catalogByNorm = new Map();
  for (const ctrl of assessmentCatalog.controls) {
    catalogByNorm.set(normalizeControlId(ctrl.control_id), ctrl);
  }

  const effCache = new Map();
  const effectiveFor = (adapterEntry) => {
    if (!effCache.has(adapterEntry.local_odp_id)) {
      effCache.set(adapterEntry.local_odp_id, resolveEffectiveValue({ adapterEntry, cpb, genericDefaults }));
    }
    return effCache.get(adapterEntry.local_odp_id);
  };
  const effectiveValueFor = (localOdpId) => {
    const hit = adapterIndex.byLocalId.get(localOdpId)?.[0];
    return hit ? effectiveFor(hit.entry) : { status: 'UNRESOLVED', value: null };
  };

  for (const [controlId, statusKey] of applicable) {
    const cpbStatus = CPB_STATUS_MAP[statusKey];
    if (cpbStatus !== 'APPLIED') {
      warnings.push({ 
        code: cpbStatus === 'EXEMPT' ? 'CONTROL_EXEMPT' : 'CONTROL_EXCLUDED', 
        control_id: denormalizeControlId(controlId) 
      });
      continue;
    }

    const catCtrl = catalogByNorm.get(normalizeControlId(controlId));
    if (!catCtrl) { 
      warnings.push({ code: 'CATALOG_MISSING', control_id: denormalizeControlId(controlId) }); 
      continue; 
    }

    const adapterCtrl = adapterIndex.controls.get(catCtrl.control_id);
    const odpValues = (adapterCtrl?.assessment_odps ?? []).map(entry => {
      const eff = effectiveFor(entry);
      if (eff.status === 'UNRESOLVED') {
        warnings.push({ 
          code: 'ODP_UNRESOLVED', 
          control_id: catCtrl.control_id, 
          local_odp_id: entry.local_odp_id 
        });
      }
      return { 
        assessment_odp_id: entry.assessment_odp_id, 
        local_odp_id: entry.local_odp_id,
        baseline_value: baselineValue({ adapterEntry: entry, infoType: cpb.info_type }),
        target_value: eff.value, 
        effective_source: eff.source, 
        status: eff.status 
      };
    });

    for (const item of catCtrl.items) {
      const { resolved_objective, placeholders } = resolveAssessmentObjective({
        objectiveTemplate: item.objective_template, 
        adapterIndex, 
        effectiveValueFor 
      });

      items.push({
        assessment_source_id: item.assessment_source_id, 
        control_id: catCtrl.control_id,
        canonical_control_id: catCtrl.canonical_control_id, 
        family: catCtrl.family,
        family_title: catCtrl.family_title, 
        control_title: catCtrl.title, 
        enhancement: catCtrl.enhancement,
        statement_path: item.statement_path, 
        kind: item.kind, 
        cpb_status: cpbStatus,
        objective_template: item.objective_template, 
        resolved_objective, 
        placeholders,
        odp_values: odpValues, 
        available_methods: Object.keys(item.methods),
      });

      if (!Object.keys(item.methods).length) {
        warnings.push({ code: 'NO_METHODS', assessment_source_id: item.assessment_source_id });
      }
    }
  }

  // Deduplicate ODP_UNRESOLVED warnings (one per local_odp_id)
  const seen = new Set();
  const dedup = warnings.filter(w => {
    if (w.code !== 'ODP_UNRESOLVED') return true;
    const k = `${w.code}:${w.local_odp_id}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });

  return { items, warnings: dedup };
}
