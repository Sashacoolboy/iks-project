export const PARAM_RE = /\{\{\s*insert:\s*param,\s*([A-Za-z0-9._-]+)\s*\}\}/g;
const EMPTY_TEXT = '[не визначено]';

export function buildPolicyParamIndex(policyMapping, globalConstants) {
  const index = new Map();
  for (const gc of policyMapping.global_constants) {
    const value = globalConstants?.[gc.key];
    if (!value) continue;
    for (const pid of gc.odp_params) index.set(pid, value);
  }
  return index;
}

export function resolveParamValue(paramId, { overrides = {}, policyIndex = new Map(), bpbValues = new Map(), genericDefaults = {} }) {
  if (overrides[paramId]) return { value: overrides[paramId], source: 'override' };
  if (policyIndex.has(paramId)) return { value: policyIndex.get(paramId), source: 'policy' };
  if (bpbValues.has(paramId)) return { value: bpbValues.get(paramId), source: 'bpb' };
  if (genericDefaults[paramId]) return { value: genericDefaults[paramId], source: 'generic' };
  return { value: '', source: 'empty' };
}

export function renderText(text, resolveFn) {
  const parts = [];
  let out = '';
  let last = 0;
  for (const m of text.matchAll(PARAM_RE)) {
    if (m.index > last) { const t = text.slice(last, m.index); parts.push({ type: 'text', value: t }); out += t; }
    const { value, source } = resolveFn(m[1]);
    const shown = value || EMPTY_TEXT;
    parts.push({ type: 'param', value: shown, paramId: m[1], source });
    out += shown;
    last = m.index + m[0].length;
  }
  if (last < text.length) { const t = text.slice(last); parts.push({ type: 'text', value: t }); out += t; }
  return { text: out, parts };
}
