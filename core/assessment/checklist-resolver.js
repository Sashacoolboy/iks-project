// core/assessment/checklist-resolver.js
// Токени НД ТЗІ: {{ insert: param, <local_odp_id> }} — той самий формат, що й у nd_tzi.json.
const PARAM_RE = /\{\{\s*insert:\s*param,\s*([\w.-]+)\s*\}\}/g;

const undefinedTag = (localOdpId) => `[НЕ ВИЗНАЧЕНО: ${localOdpId}]`;

export function resolveChecklistStatement({ template, effectiveValueFor }) {
  const placeholders = [];
  const resolved_statement = String(template ?? '').replace(PARAM_RE, (m, localOdpId) => {
    const ev = effectiveValueFor(localOdpId);
    if (ev?.status === 'RESOLVED') {
      const text = Array.isArray(ev.value) ? ev.value.join('; ') : ev.value;
      placeholders.push({ local_odp_id: localOdpId, resolution: 'SUBSTITUTED', value: text });
      return text;
    }
    placeholders.push({ local_odp_id: localOdpId, resolution: 'UNRESOLVED_VALUE', value: null });
    return undefinedTag(localOdpId);
  });
  return { resolved_statement, placeholders };
}
