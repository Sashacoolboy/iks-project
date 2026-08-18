import { indexNdParams } from '../profile-engine.js';

export function indexAdapter(adapterDoc) {
  const controls = new Map();
  const byAssessmentId = new Map();
  const byLocalId = new Map();
  const nistVerified = new Map();
  const duplicates = [];
  for (const ctrl of adapterDoc.controls ?? []) {
    controls.set(ctrl.control_id, ctrl);
    for (const entry of ctrl.assessment_odps ?? []) {
      if (byAssessmentId.has(entry.assessment_odp_id)) duplicates.push(entry.assessment_odp_id);
      byAssessmentId.set(entry.assessment_odp_id, { entry, control: ctrl });
      if (!byLocalId.has(entry.local_odp_id)) byLocalId.set(entry.local_odp_id, []);
      byLocalId.get(entry.local_odp_id).push({ entry, control: ctrl });
      if (entry.nist_traceability?.status === 'VERIFIED')
        for (const nid of entry.nist_traceability.odp_ids ?? []) nistVerified.set(nid, { entry, control: ctrl });
    }
  }
  return { controls, byAssessmentId, byLocalId, nistVerified, duplicates };
}

function collectScorePaths(node, path, out) {
  if (Array.isArray(node)) node.forEach((v, i) => collectScorePaths(v, `${path}[${i}]`, out));
  else if (node && typeof node === 'object')
    for (const [k, v] of Object.entries(node)) {
      if (k === 'score' || /similarity/i.test(k)) out.push(`${path}.${k}`);
      collectScorePaths(v, `${path}.${k}`, out);
    }
}

export function validateAdapter(adapterDoc, ndTzi) {
  const errors = [];
  const warnings = [];
  const idx = indexAdapter(adapterDoc);
  for (const d of idx.duplicates) errors.push({ code: 'DUPLICATE_PRIMARY_BINDING', assessment_odp_id: d });
  const ndParams = indexNdParams(ndTzi);
  for (const ctrl of adapterDoc.controls ?? []) {
    for (const entry of ctrl.assessment_odps ?? []) {
      if (!ndParams.has(entry.local_odp_id))
        errors.push({ code: 'BROKEN_LOCAL_ODP_BINDING', assessment_odp_id: entry.assessment_odp_id, local_odp_id: entry.local_odp_id });
      if (entry.binding?.type !== 'DIRECT_LOCAL_ODP' || entry.binding?.cpb_ref !== entry.local_odp_id)
        errors.push({ code: 'BINDING_MISMATCH', assessment_odp_id: entry.assessment_odp_id });
    }
  }
  const scorePaths = [];
  collectScorePaths(adapterDoc, '$', scorePaths);
  for (const p of scorePaths) errors.push({ code: 'SCORE_IN_PRODUCTION', path: p });
  return { errors, warnings };
}
