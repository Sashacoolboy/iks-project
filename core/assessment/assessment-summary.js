export function buildAssessmentSummary(assessment) {
  const s = { total: 0, satisfied: 0, partially_satisfied: 0, not_satisfied: 0, not_applicable: 0,
    not_assessed: 0, has_finding: 0, evidence_count: (assessment.evidence ?? []).length };
  for (const r of assessment.results ?? []) {
    s.total++;
    if (r.result === 'SATISFIED') s.satisfied++;
    else if (r.result === 'PARTIALLY_SATISFIED') s.partially_satisfied++;
    else if (r.result === 'NOT_SATISFIED') s.not_satisfied++;
    else if (r.result === 'NOT_APPLICABLE') s.not_applicable++;
    else s.not_assessed++;
    if (r.finding_ids?.length) s.has_finding++;
  }
  return s;
}
