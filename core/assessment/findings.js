export const SEVERITIES = ['OBSERVATION', 'MINOR', 'MAJOR', 'CRITICAL'];
export const FINDING_STATUSES = ['OPEN', 'CLOSED'];

export function nextFindingId(assessment) {
  const nums = assessment.findings.map(f => Number(f.finding_id?.match(/^F-(\d+)$/)?.[1] ?? 0));
  return `F-${String((nums.length ? Math.max(...nums) : 0) + 1).padStart(3, '0')}`;
}

function assertMutable(assessment) {
  if (assessment.status === 'FINALIZED') throw new Error('оцінювання фіналізовано — зміни заборонені');
}

export function addFinding(assessment, { assessment_source_id, severity, title, description, evidence_ids = [], recommendation = '' }) {
  assertMutable(assessment);
  const i = assessment.results.findIndex(r => r.assessment_source_id === assessment_source_id);
  if (i === -1) throw new Error(`результат не знайдено: ${assessment_source_id}`);
  if (!SEVERITIES.includes(severity)) throw new Error(`невідома severity: ${severity}`);
  const finding = { finding_id: nextFindingId(assessment), assessment_source_id, severity,
    title: title ?? '', description: description ?? '', evidence_ids, recommendation, status: 'OPEN' };
  const results = assessment.results.slice();
  results[i] = { ...results[i], finding_ids: [...results[i].finding_ids, finding.finding_id] };
  return { assessment: { ...assessment, results, findings: [...assessment.findings, finding], updated_at: new Date().toISOString() }, finding };
}

export function updateFinding(assessment, findingId, patch) {
  assertMutable(assessment);
  const i = assessment.findings.findIndex(f => f.finding_id === findingId);
  if (i === -1) throw new Error(`недолік не знайдено: ${findingId}`);
  if (patch.severity !== undefined && !SEVERITIES.includes(patch.severity)) throw new Error(`невідома severity: ${patch.severity}`);
  if (patch.status !== undefined && !FINDING_STATUSES.includes(patch.status)) throw new Error(`невідомий статус: ${patch.status}`);
  const before = assessment.findings[i];
  const allowed = ['severity', 'title', 'description', 'evidence_ids', 'recommendation', 'status'];
  const after = { ...before };
  for (const k of allowed) if (patch[k] !== undefined) after[k] = patch[k];
  const findings = assessment.findings.slice();
  findings[i] = after;
  return { assessment: { ...assessment, findings, updated_at: new Date().toISOString() }, before, after };
}

export function removeFinding(assessment, findingId) {
  assertMutable(assessment);
  const removed = assessment.findings.find(f => f.finding_id === findingId);
  if (!removed) throw new Error(`недолік не знайдено: ${findingId}`);
  return { assessment: { ...assessment,
    findings: assessment.findings.filter(f => f.finding_id !== findingId),
    results: assessment.results.map(r => ({ ...r, finding_ids: r.finding_ids.filter(id => id !== findingId) })),
    updated_at: new Date().toISOString() }, removed };
}
