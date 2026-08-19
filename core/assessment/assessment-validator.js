const ASSESSED = ['SATISFIED', 'PARTIALLY_SATISFIED', 'NOT_SATISFIED'];
const NEEDS_FINDING = ['PARTIALLY_SATISFIED', 'NOT_SATISFIED'];

export function validateResult(result, { findings = [] } = {}) {
  const errs = [];
  const label = result.assessment_source_id;
  if (ASSESSED.includes(result.result) && !result.evidence_ids.length)
    errs.push(`${label}: оцінка «${result.result}» потребує щонайменше одного доказу`);
  if (NEEDS_FINDING.includes(result.result)) {
    const has = result.finding_ids.some(id => findings.some(f => f.finding_id === id));
    if (!has) errs.push(`${label}: оцінка «${result.result}» потребує зафіксованого недоліку`);
  }
  if (result.result === 'NOT_APPLICABLE' && !result.assessor_comment?.trim())
    errs.push(`${label}: «NOT_APPLICABLE» потребує коментаря оцінювача`);
  return errs;
}

export function validateAssessment(assessment) {
  const errs = [];
  const evidenceIds = new Set((assessment.evidence ?? []).map(e => e.evidence_id));
  const findingIds = new Set((assessment.findings ?? []).map(f => f.finding_id));
  for (const r of assessment.results ?? []) {
    errs.push(...validateResult(r, { findings: assessment.findings ?? [] }));
    for (const id of r.evidence_ids) if (!evidenceIds.has(id)) errs.push(`${r.assessment_source_id}: посилання на неіснуючий доказ ${id}`);
    for (const id of r.finding_ids) if (!findingIds.has(id)) errs.push(`${r.assessment_source_id}: посилання на неіснуючий недолік ${id}`);
  }
  return errs;
}
