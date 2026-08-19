// core/assessment/assessment-run.js
export { RESULT_VALUES } from './assessment-io.js';
import { RESULT_VALUES } from './assessment-io.js';

const METHODS = ['EXAMINE', 'INTERVIEW', 'TEST'];

function assertMutable(assessment) {
  if (assessment.status === 'FINALIZED') throw new Error('оцінювання фіналізовано — зміни заборонені');
}

export function updateResult(assessment, assessmentSourceId, patch) {
  assertMutable(assessment);
  const i = assessment.results.findIndex(r => r.assessment_source_id === assessmentSourceId);
  if (i === -1) throw new Error(`результат не знайдено: ${assessmentSourceId}`);
  if (patch.result !== undefined && !RESULT_VALUES.includes(patch.result))
    throw new Error(`невідомий result: ${patch.result}`);
  if (patch.methods_used !== undefined)
    for (const m of patch.methods_used) if (!METHODS.includes(m)) throw new Error(`невідомий метод: ${m}`);
  const before = assessment.results[i];
  const allowed = ['result', 'methods_used', 'assessor_comment', 'conclusion', 'source_references'];
  const after = { ...before };
  for (const k of allowed) if (patch[k] !== undefined) after[k] = patch[k];
  const results = assessment.results.slice();
  results[i] = after;
  return { assessment: { ...assessment, results, updated_at: new Date().toISOString() }, before, after };
}

export function finalizeAssessment(assessment, { finalizedBy = '' } = {}) {
  assertMutable(assessment);
  const now = new Date().toISOString();
  return { ...assessment, status: 'FINALIZED', finalized_at: now, finalized_by: finalizedBy, updated_at: now };
}
