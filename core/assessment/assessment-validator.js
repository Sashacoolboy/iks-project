export function validateAssessmentItem(item) {
  const errs = [];
  const hasEvidence = Array.isArray(item.evidence) && item.evidence.length > 0;
  switch (item.conclusion) {
    case 'POSITIVE':
      if (!hasEvidence) errs.push(`${item.id}: POSITIVE потребує щонайменше одного доказу`);
      break;
    case 'PARTIALLY_POSITIVE':
      if (!hasEvidence) errs.push(`${item.id}: PARTIALLY_POSITIVE потребує щонайменше одного доказу`);
      if (!item.finding?.description?.trim()) errs.push(`${item.id}: PARTIALLY_POSITIVE потребує finding.description`);
      break;
    case 'NEGATIVE':
      if (!hasEvidence) errs.push(`${item.id}: NEGATIVE потребує щонайменше одного доказу`);
      if (!item.finding?.description?.trim()) errs.push(`${item.id}: NEGATIVE потребує finding.description`);
      break;
    case 'NOT_APPLICABLE':
      if (!item.assessor_comment?.trim()) errs.push(`${item.id}: NOT_APPLICABLE потребує обґрунтування у коментарі`);
      break;
    case 'NOT_ASSESSED':
    case null:
    case undefined:
      break;
    default:
      errs.push(`${item.id}: невідомий conclusion "${item.conclusion}"`);
  }
  return errs;
}

export function validateAssessment(assessment) {
  const errs = [];
  if (assessment.kind !== 'assessment') errs.push('kind має бути "assessment"');
  for (const item of assessment.items ?? []) errs.push(...validateAssessmentItem(item));
  return errs;
}
