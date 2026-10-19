import { STATUS } from '../profile-engine.js';
import { buildPolicyParamIndex } from '../policy-autofill.js';
import { normalizeControlId, denormalizeControlId } from './control-id.js';
import { indexAdapter } from './odp-adapter.js';
import { resolveEffectiveValue, baselineValue } from './effective-value-resolver.js';
import { resolveAssessmentObjective } from './objective-resolver.js';
import { resolveChecklistStatement } from './checklist-resolver.js';

function cpbApplicableControlIds(approvedState, catalogs) {
  const bpb = catalogs.bpb[approvedState.info_type];
  const ids = new Map(); // controlId -> 'APPLIED' | 'EXEMPT' | 'EXCLUDED'
  if (!bpb) return ids;
  const exemptByControl = new Map();
  for (const e of catalogs.exemptions.exemptions)
    if (e.applies_to_classes.includes(approvedState.passport.as_class)) exemptByControl.set(e.control_ref, e);
  for (const sc of bpb.security_classes) {
    for (const action of sc.actions) {
      const key = `${sc.security_class.class_id}:${action.number}`;
      let status = STATUS.APPLIED;
      const mandatedBaseIds = new Set(action.security_actions.map(sa => sa.control.base_id));
      if ((approvedState.profile.excluded ?? []).includes(key)) status = STATUS.EXCLUDED;
      else if ([...mandatedBaseIds].some(id => exemptByControl.has(id))
        && !(approvedState.profile.exemption_overrides ?? []).includes(key)) status = STATUS.EXEMPT;
      for (const sa of action.security_actions) ids.set(sa.control.id, status);
    }
  }
  for (const enhId of approvedState.profile.enhancements ?? [])
    if (!ids.has(enhId)) ids.set(enhId, STATUS.APPLIED);
  return ids;
}

const CPB_STATUS_MAP = { [STATUS.APPLIED]: 'APPLIED', [STATUS.EXEMPT]: 'EXEMPT', [STATUS.EXCLUDED]: 'EXCLUDED' };

// 'а.01(a)[01]' → 'a', 'd.03[02]' → 'd', 'c.2' → 'c', '(a)' → 'a', '(03)' → '03'
// — спільний перший сегмент для матчингу каталог ↔ адаптер.
// Дзеркалить firstSegmentLabel з public/js/assessment/assessment-table.js: без
// цього обгортка "(x)"/"(x)[NN]" (CP-09, CP-01, PE-02, PE-03, AT-01, CM-01,
// AC-16 тощо) давала порожній сегмент і statement_text = null для всього контролю.
export function firstPathSegment(path) {
  const seg = String(path ?? '').split('.')[0];
  const wrapped = seg.match(/^[\[(]([a-zA-Zа-яіїєґА-ЯІЇЄҐ0-9]+)[\])]/);
  if (wrapped) return wrapped[1];
  return seg.replace(/[\[(].*$/, '');
}

// nd_tzi: canonical_id → верхньорівневі statement-рядки {seg ('a'), text}
function indexNdStatements(ndTzi) {
  const map = new Map();
  for (const fam of ndTzi.document.security_families)
    for (const c of fam.controls)
      for (const node of [c, ...(c.children ?? [])]) {
        const items = node.catalog?.statement?.items ?? [];
        map.set(node.canonical_id, items.map(it => ({
          seg: String(it.label ?? '').replace(/[^\p{L}\p{N}]/gu, ''),
          text: it.text ?? '',
        })));
      }
  return map;
}

function ndStatementTextFor(flat, statementPath) {
  if (!flat?.length) return null;
  if (!statementPath) return flat.length === 1 ? flat[0].text : null;
  const seg = firstPathSegment(statementPath);
  const hit = flat.find(l => l.seg === seg);
  return hit ? hit.text : (flat.length === 1 ? flat[0].text : null);
}

// Повний текст вимоги заходу (всі верхньорівневі пункти) — для ODP-рядків без точного пункту
function ndFullStatementText(flat) {
  if (!flat?.length) return null;
  return flat.map(l => (l.seg ? `${l.seg}) ` : '') + l.text).join('\n');
}

// Порядок дій у BPB не збігається з номерами заходів (напр. AU-01 опиняється перед
// AU-09(04), а той — перед AU-02); сортуємо в межах кожної родини за номером заходу,
// потім номером посилення (базовий захід — перед своїми ж посиленнями). Родини
// лишаються в порядку першої появи, а запис без власної родини в масиві — без прив'язки
// до суміжності (enhancements додаються окремим циклом, тому не йдуть поруч з базовим заходом).
function controlSortKey(canonicalId) {
  const m = String(canonicalId ?? '').match(/^[A-Z]+-(\d+)(?:\((\d+)\))?$/);
  if (!m) return [Infinity, Infinity];
  return [Number(m[1]), m[2] !== undefined ? Number(m[2]) : -1];
}

function sortWithinFamilyByControlNumber(list) {
  const familyOrder = [];
  const byFamily = new Map();
  for (const entry of list) {
    if (!byFamily.has(entry.family)) { byFamily.set(entry.family, []); familyOrder.push(entry.family); }
    byFamily.get(entry.family).push(entry);
  }
  const result = [];
  for (const family of familyOrder) {
    const withKey = byFamily.get(family).map((entry, i) => ({ entry, i, key: controlSortKey(entry.canonical_control_id) }));
    withKey.sort((a, b) => (a.key[0] - b.key[0]) || (a.key[1] - b.key[1]) || (a.i - b.i));
    for (const { entry } of withKey) result.push(entry);
  }
  return result;
}
export { sortWithinFamilyByControlNumber };

// canonical_id (базовий захід АБО посилення) → { family, family_title, control_title } — для plan.checklist
function indexNdNodes(ndTzi) {
  const map = new Map();
  for (const fam of ndTzi.document.security_families)
    for (const c of fam.controls) {
      map.set(c.canonical_id, { family: c.family, family_title: fam.title, control_title: c.title });
      for (const ch of c.children ?? [])
        map.set(ch.canonical_id, { family: c.family, family_title: fam.title, control_title: ch.title });
    }
  return map;
}

/**
 * buildAssessmentPlan (v3)
 * @param {object} params
 * @param {object} params.approvedState – { info_type, profile, passport }
 * @param {object} params.catalogs – { ndTzi, bpb, exemptions, genericDefaults }
 * @param {object} params.assessmentCatalog – v3 assessment catalog
 * @param {object} params.adapter – ODP adapter document
 * @param {object} [params.checklistReference] – { entries: { [canonical_id]: { statements: string[] } } }
 * @returns {{ items: Array, checklist: Array, warnings: Array }}
 */
export function buildAssessmentPlan({ approvedState, catalogs, assessmentCatalog, adapter, checklistReference = { entries: {} } }) {
  const items = [];
  const warnings = [];
  const adapterIndex = indexAdapter(adapter);
  const ndStatements = indexNdStatements(catalogs.ndTzi);
  const ndNodes = indexNdNodes(catalogs.ndTzi);
  const cpb = { info_type: approvedState.info_type, profile: approvedState.profile };
  const genericDefaults = catalogs.genericDefaults;
  const policyIndex = buildPolicyParamIndex(catalogs.policyMapping ?? { global_constants: [] }, approvedState.global_constants ?? {});
  const applicable = cpbApplicableControlIds(approvedState, catalogs);

  const catalogByNorm = new Map();
  for (const ctrl of assessmentCatalog.controls) {
    catalogByNorm.set(normalizeControlId(ctrl.control_id), ctrl);
  }

  const effCache = new Map();
  const effectiveFor = (adapterEntry) => {
    if (!effCache.has(adapterEntry.local_odp_id)) {
      effCache.set(adapterEntry.local_odp_id, resolveEffectiveValue({ adapterEntry, cpb, genericDefaults, policyIndex }));
    }
    return effCache.get(adapterEntry.local_odp_id);
  };
  const effectiveValueFor = (localOdpId) => {
    const hit = adapterIndex.byLocalId.get(localOdpId)?.[0];
    return hit ? effectiveFor(hit.entry) : { status: 'UNRESOLVED', value: null };
  };

  const checklistEntries = checklistReference.entries ?? {};
  const checklist = [];
  for (const [controlId, statusKey] of applicable) {
    if (CPB_STATUS_MAP[statusKey] !== 'APPLIED') continue;
    const canonicalId = normalizeControlId(controlId);
    const ndNode = ndNodes.get(canonicalId);
    if (!ndNode) {
      warnings.push({ code: 'ND_NODE_MISSING', control_id: denormalizeControlId(controlId) });
      continue;
    }
    const refEntry = checklistEntries[canonicalId];
    const statements = (refEntry?.statements ?? []).map((template, i) => ({
      id: `${canonicalId}#${i + 1}`,
      text: resolveChecklistStatement({ template, effectiveValueFor }).resolved_statement,
    }));
    checklist.push({
      canonical_control_id: canonicalId,
      control_id: denormalizeControlId(canonicalId),
      family: ndNode.family,
      family_title: ndNode.family_title,
      control_title: ndNode.control_title,
      statements,
      included: true,
      exclusion_reason: null,
    });
  }

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
    const ndFlat = ndStatements.get(catCtrl.canonical_control_id);
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
        statement_paths: (entry.statement_usage ?? []).map(u => u.statement_path),
        statement_usage: (entry.statement_usage ?? []).map(u => ({ statement_path: u.statement_path, text: u.text })),
        baseline_value: baselineValue({ adapterEntry: entry, infoType: cpb.info_type }),
        target_value: eff.value, 
        effective_source: eff.source, 
        status: eff.status,
        semantic_label: entry.semantic?.label ?? null,
        semantic_source_text: entry.semantic?.source_text ?? null,
      };
    });

    for (const item of catCtrl.items) {
      const { resolved_objective, placeholders } = resolveAssessmentObjective({
        objectiveTemplate: item.objective_template, 
        adapterIndex, 
        effectiveValueFor 
      });

      // ОДП, релевантні саме цьому пункту: за першим сегментом statement_path,
      // VERIFIED-мапінгом для ODP-рядків та підставленими плейсхолдерами
      const relevantIds = new Set();
      let statementText = null;
      if (item.kind === 'ODP_DEFINITION') {
        const hit = adapterIndex.nistVerified.get(item.assessment_source_id);
        if (hit) {
          relevantIds.add(hit.entry.local_odp_id);
          statementText = hit.entry.statement_usage?.[0]?.text ?? null;
        }
        // без VERIFIED-зв'язку точний пункт невідомий — показуємо повний текст заходу
        if (!statementText) statementText = ndFullStatementText(ndFlat);
      } else if (item.statement_path) {
        const seg = firstPathSegment(item.statement_path);
        for (const v of odpValues)
          if ((v.statement_paths ?? []).some(p => firstPathSegment(p) === seg)) relevantIds.add(v.local_odp_id);
        statementText = ndStatementTextFor(ndFlat, item.statement_path);
      } else {
        statementText = ndStatementTextFor(ndFlat, null);
      }
      for (const ph of placeholders) if (ph.local_odp_id) relevantIds.add(ph.local_odp_id);

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
        statement_text: statementText,
        objective_template: item.objective_template, 
        resolved_objective, 
        placeholders,
        odp_values: odpValues, 
        relevant_local_odp_ids: [...relevantIds],
        available_methods: Object.keys(item.methods),
        methods_reference: adapterCtrl?.assessment_methods_reference ?? {},
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

  return { items: sortWithinFamilyByControlNumber(items), checklist: sortWithinFamilyByControlNumber(checklist), warnings: dedup };
}
