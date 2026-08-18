const PLACEHOLDER_RE = /<([A-Z]{2}-\d{2}(?:\(\d{2}\))?_ODP(?:\[\d{2}\])?)\s+([^>]+)>/g;
export const UNDEFINED_TAG = '[НЕ ВИЗНАЧЕНО]';

export function resolveAssessmentObjective({ objectiveTemplate, adapterIndex, effectiveValueFor }) {
  const placeholders = [];
  const resolved_objective = String(objectiveTemplate ?? '').replace(PLACEHOLDER_RE, (m, ref, label) => {
    const verified = adapterIndex.nistVerified.get(ref);
    if (!verified) {
      placeholders.push({ ref, label, resolution: 'REFERENCE_ONLY', local_odp_id: null, assessment_odp_id: null, value: null });
      return label; // нормативний текст плейсхолдера як є
    }
    const { entry } = verified;
    const ev = effectiveValueFor(entry.local_odp_id);
    if (ev?.status === 'RESOLVED') {
      placeholders.push({ ref, label, resolution: 'SUBSTITUTED', local_odp_id: entry.local_odp_id,
        assessment_odp_id: entry.assessment_odp_id, value: ev.value });
      return ev.value;
    }
    placeholders.push({ ref, label, resolution: 'UNRESOLVED_VALUE', local_odp_id: entry.local_odp_id,
      assessment_odp_id: entry.assessment_odp_id, value: null });
    return UNDEFINED_TAG;
  });
  return { resolved_objective, placeholders };
}
