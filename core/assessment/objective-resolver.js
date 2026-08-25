// дефіс опційний: у частині каталогу референси без нього (<IR08_ODP[06] …>) — нормалізуємо при розборі
const PLACEHOLDER_RE = /<([A-Z]{2}-?\d{2}(?:\(\d{2}\))?_ODP(?:\[\d{2}\])?)\s+([^>]+)>/g;
const normalizeRef = (ref) => ref.replace(/^([A-Z]{2})(\d)/, '$1-$2');
// включає id ODP, щоб було зрозуміло, який параметр треба задати в ЦПБ
const undefinedTag = (assessmentOdpId) => `[НЕ ВИЗНАЧЕНО: ${assessmentOdpId}]`;

export function resolveAssessmentObjective({ objectiveTemplate, adapterIndex, effectiveValueFor }) {
  const placeholders = [];
  const resolved_objective = String(objectiveTemplate ?? '').replace(PLACEHOLDER_RE, (m, rawRef, label) => {
    const ref = normalizeRef(rawRef);
    const verified = adapterIndex.nistVerified.get(ref);
    if (!verified) {
      placeholders.push({ ref, label, resolution: 'REFERENCE_ONLY', local_odp_id: null, assessment_odp_id: null, value: null });
      return label; // нормативний текст плейсхолдера як є
    }
    const { entry } = verified;
    const ev = effectiveValueFor(entry.local_odp_id);
    if (ev?.status === 'RESOLVED') {
      const text = Array.isArray(ev.value) ? ev.value.join('; ') : ev.value;
      placeholders.push({ ref, label, resolution: 'SUBSTITUTED', local_odp_id: entry.local_odp_id,
        assessment_odp_id: entry.assessment_odp_id, value: text });
      return text;
    }
    placeholders.push({ ref, label, resolution: 'UNRESOLVED_VALUE', local_odp_id: entry.local_odp_id,
      assessment_odp_id: entry.assessment_odp_id, value: null });
    return undefinedTag(entry.assessment_odp_id);
  });
  return { resolved_objective, placeholders };
}
