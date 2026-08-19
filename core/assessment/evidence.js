export const EVIDENCE_TYPES = ['DOCUMENT', 'POLICY', 'PROCEDURE', 'ORDER', 'REGISTER', 'SYSTEM_CONFIGURATION',
  'SCREENSHOT', 'LOG', 'INTERVIEW_NOTE', 'TEST_RESULT', 'PHYSICAL_INSPECTION', 'OTHER'];

export function nextEvidenceId(assessment) {
  const nums = assessment.evidence.map(e => Number(e.evidence_id?.match(/^EV-(\d+)$/)?.[1] ?? 0));
  return `EV-${String((nums.length ? Math.max(...nums) : 0) + 1).padStart(3, '0')}`;
}

function assertMutable(assessment) {
  if (assessment.status === 'FINALIZED') throw new Error('оцінювання фіналізовано — зміни заборонені');
}

export function addEvidence(assessment, resultSourceId, fields) {
  assertMutable(assessment);
  const i = assessment.results.findIndex(r => r.assessment_source_id === resultSourceId);
  if (i === -1) throw new Error(`результат не знайдено: ${resultSourceId}`);
  if (!EVIDENCE_TYPES.includes(fields.type)) throw new Error(`невідомий тип доказу: ${fields.type}`);
  const path = fields.source?.path;
  if (fields.source?.kind === 'LOCAL_FILE' && (typeof path !== 'string' || !path.startsWith('evidence/') || path.includes('..')))
    throw new Error('шлях доказу має бути в межах evidence/');
  const evidence = { evidence_id: nextEvidenceId(assessment), type: fields.type, title: fields.title ?? '',
    source: fields.source ?? { kind: 'NONE', path: null }, reference: fields.reference ?? '',
    observation: fields.observation ?? '', collected_at: new Date().toISOString(), collected_by: fields.collected_by ?? '' };
  const results = assessment.results.slice();
  results[i] = { ...results[i], evidence_ids: [...results[i].evidence_ids, evidence.evidence_id] };
  return { assessment: { ...assessment, results, evidence: [...assessment.evidence, evidence], updated_at: evidence.collected_at }, evidence };
}

export function removeEvidence(assessment, evidenceId) {
  assertMutable(assessment);
  const removed = assessment.evidence.find(e => e.evidence_id === evidenceId);
  if (!removed) throw new Error(`доказ не знайдено: ${evidenceId}`);
  return { assessment: { ...assessment,
    evidence: assessment.evidence.filter(e => e.evidence_id !== evidenceId),
    results: assessment.results.map(r => ({ ...r, evidence_ids: r.evidence_ids.filter(id => id !== evidenceId) })),
    findings: assessment.findings.map(f => ({ ...f, evidence_ids: (f.evidence_ids ?? []).filter(id => id !== evidenceId) })),
    updated_at: new Date().toISOString() }, removed };
}
