// core/assessment/assessment-io.js
import { validateAssessment } from './assessment-validator.js';

export function nextAssessmentId(existingIds) {
  const year = new Date().getFullYear();
  const nums = existingIds
    .map(id => id.match(new RegExp(`^ASSESS-${year}-(\\d+)$`)))
    .filter(Boolean)
    .map(m => Number(m[1]));
  const next = (nums.length ? Math.max(...nums) : 0) + 1;
  return `ASSESS-${year}-${String(next).padStart(3, '0')}`;
}

export function makeAssessment({ approvedRecord, approvedName, items, warnings, id }) {
  const now = new Date().toISOString();
  return {
    kind: 'assessment',
    schema_version: '1.0.0',
    id: id ?? nextAssessmentId([]),
    created_at: now,
    updated_at: now,
    status: 'IN_PROGRESS',
    metadata: {
      ics_name: approvedRecord.state.passport?.ics_name ?? '',
      as_class: approvedRecord.state.passport?.as_class ?? null,
      info_type: approvedRecord.state.info_type ?? null,
      assessment_body: '',
      assessor_name: '',
      assessor_position: '',
      assessment_start_date: now.slice(0, 10),
      assessment_end_date: '',
    },
    cpb_snapshot: {
      source_approved_name: approvedName,
      relative_path: 'cpb-snapshot.json',
      hash: '',
    },
    warnings: warnings ?? [],
    items,
  };
}

export function serializeAssessment(assessment) {
  return JSON.stringify(assessment, null, 2);
}

export function deserializeAssessment(jsonText) {
  return JSON.parse(jsonText);
}

export function validateAssessmentSchema(obj) {
  const errs = [];
  if (!obj || typeof obj !== 'object') return ['assessment має бути об\u02BCєктом'];
  if (obj.kind !== 'assessment') errs.push('Відсутній або невірний kind (очікується "assessment")');
  if (!obj.id) errs.push('Відсутній id');
  if (!Array.isArray(obj.items)) errs.push('items має бути масивом');
  else errs.push(...validateAssessment(obj));
  return errs;
}
