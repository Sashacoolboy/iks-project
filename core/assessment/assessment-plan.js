import { collectControlOdpValues, resolveStatement } from './assessment-resolver.js';
import { STATUS } from '../profile-engine.js';

function normSeg(s) {
  return String(s ?? '').replace(/[^\p{L}\p{N}.]/gu, '').replace(/\.+$/, '');
}

// Плоский перелік statement-рядків контролю з locator-шляхом ("h.1") та власним текстом
function flattenStatementForCatalog(items, prefix = []) {
  const out = [];
  for (const it of items ?? []) {
    const seg = normSeg(it.label);
    const path = [...prefix, seg].filter(Boolean);
    out.push({ path: path.join('.'), text: it.text ?? '' });
    out.push(...flattenStatementForCatalog(it.children, path));
  }
  return out;
}

// Normalize AC-02 → AC-2, AC-02(05) → AC-2(5) (strip leading zeros)
function normalizeControlId(id) {
  return id
    .replace(/^([A-Z]+-)0+(\d+)/, '$1$2')
    .replace(/\(0+(\d+)\)/, '($1)');
}

// Denormalize AC-2 → AC-02, AC-2(2) → AC-02(02) (add leading zeros for consistency with catalog)
function denormalizeControlId(id) {
  return id.replace(/^([A-Z]+-)(\d+)/, (m, prefix, num) => prefix + num.padStart(2, '0'))
    .replace(/\((\d+)\)/, (m, num) => `(${num.padStart(2, '0')})`);
}

function indexNdControls(ndTzi) {
  const map = new Map();
  for (const fam of ndTzi.document.security_families)
    for (const c of fam.controls) {
      map.set(c.canonical_id, c);
      for (const ch of c.children ?? []) map.set(ch.canonical_id, ch);
    }
  return map;
}

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

export function buildAssessmentPlan({ approvedState, catalogs, assessmentCatalog }) {
  const items = [];
  const warnings = [];
  const ndControls = indexNdControls(catalogs.ndTzi);
  const applicable = cpbApplicableControlIds(approvedState, catalogs);
  const catalogByControlId = new Map();
  for (const ctrl of assessmentCatalog.controls)
    for (const entry of ctrl.entries) {
      // Normalize control_id from catalog (AC-02 → AC-2) to match BPB format
      const normalizedId = normalizeControlId(entry.control_id);
      if (!catalogByControlId.has(normalizedId)) catalogByControlId.set(normalizedId, []);
      catalogByControlId.get(normalizedId).push({ ...entry, family: ctrl.family, canonical_control_id: ctrl.canonical_control_id, control_title: ctrl.title });
    }

  for (const [controlId, statusKey] of applicable) {
    const cpb_status = CPB_STATUS_MAP[statusKey];
    const entries = catalogByControlId.get(controlId);
    const ndControl = ndControls.get(controlId);
    if (!entries) {
      const denormalizedId = denormalizeControlId(controlId);
      warnings.push({ code: 'CATALOG_MISSING', control_id: denormalizedId });
      items.push({
        id: denormalizedId, control_id: denormalizedId, canonical_control_id: ndControl?.canonical_id ?? controlId,
        family: ndControl?.family ?? controlId.slice(0, 2), control_title: ndControl?.title ?? '',
        enhancement: controlId.includes('('), statement_path: null,
        source_statement: '', resolved_statement: '', odp_refs: [], odp_values: {},
        cpb_status, catalog_missing: true, assessment_status: 'NOT_STARTED',
        recommended_methods: [], evidence: [], conclusion: null, assessor_comment: '', finding: null,
      });
      continue;
    }
    const flat = ndControl ? flattenStatementForCatalog(ndControl.catalog?.statement?.items) : [];
    const odpValues = collectControlOdpValues(approvedState, catalogs, controlId);
    for (const entry of entries) {
      const flatLine = entry.statement_path ? flat.find(l => l.path === entry.statement_path) : null;
      const sourceStatement = flatLine ? flatLine.text : (ndControl?.catalog?.statement?.items?.[0]?.text ?? '');
      const { text: resolved, unresolved } = resolveStatement(sourceStatement, odpValues);
      for (const paramId of unresolved) warnings.push({ code: 'ODP_UNRESOLVED', assessment_item_id: entry.id, param_id: paramId });
      const odp_values = {};
      for (const ref of entry.odp_refs) if (odpValues.has(ref)) odp_values[ref] = odpValues.get(ref);
      items.push({
        id: entry.id, control_id: entry.control_id, canonical_control_id: entry.canonical_control_id,
        family: entry.family, control_title: entry.control_title, enhancement: entry.enhancement,
        statement_path: entry.statement_path, source_statement: sourceStatement, resolved_statement: resolved,
        odp_refs: entry.odp_refs, odp_values, cpb_status, catalog_missing: false,
        assessment_status: 'NOT_STARTED', recommended_methods: entry.methods,
        evidence: [], conclusion: null, assessor_comment: '', finding: null,
      });
    }
  }
  return { items, warnings };
}
