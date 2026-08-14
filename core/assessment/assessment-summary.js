export function buildAssessmentSummary(assessment) {
  const items = assessment.items ?? [];
  const count = (pred) => items.filter(pred).length;
  return {
    total: items.length,
    positive: count(i => i.conclusion === 'POSITIVE'),
    partially_positive: count(i => i.conclusion === 'PARTIALLY_POSITIVE'),
    negative: count(i => i.conclusion === 'NEGATIVE'),
    not_applicable: count(i => i.conclusion === 'NOT_APPLICABLE'),
    not_assessed: count(i => !i.conclusion),
    unmapped: count(i => i.catalog_missing),
    has_finding: count(i => i.finding?.description?.trim()),
  };
}
