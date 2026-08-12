// Словник варіантів заповнення ODP: накопичення, кластеризація за семантикою
// мітки, генерація динамічних питань для Кроку 1.

export const DYN_PREFIX = 'dyn:';

// Префікс-стемінг (4 символи) зводить словоформи мітки до одного ключа кластера
export const labelKey = (label) => [...new Set((label ?? '').toLowerCase()
  .replace(/[^а-яіїєґa-z\s]/g, ' ')
  .split(/\s+/)
  .filter(w => w.length >= 4)
  .map(w => w.slice(0, 4)))].sort().join(' ');

export function emptyDictionary() {
  return { entries: {} };
}

/** Додає факт заповнення параметра; повертає НОВИЙ словник (count++, макс 15 значень) */
export function mergeRecord(dict, { paramId, label, source_text, value }) {
  const v = (value ?? '').trim();
  if (!paramId || !v) return dict;
  const entries = { ...(dict?.entries ?? {}) };
  const prev = entries[paramId] ?? { label: label ?? '', source_text: source_text ?? '', values: [] };
  const values = [...prev.values];
  const hit = values.find(x => x.value === v);
  if (hit) { hit.count += 1; hit.last_used = new Date().toISOString(); }
  else values.unshift({ value: v, count: 1, last_used: new Date().toISOString() });
  values.sort((a, b) => b.count - a.count);
  entries[paramId] = { label: prev.label || label || '', source_text: prev.source_text || source_text || '', values: values.slice(0, 15) };
  return { entries };
}

/** Підказки для конкретного параметра: власні значення + значення кластера */
export function suggestionsFor(dict, paramId, label) {
  const key = labelKey(label);
  const own = dict?.entries?.[paramId]?.values?.map(v => v.value) ?? [];
  const cluster = [];
  for (const [pid, e] of Object.entries(dict?.entries ?? {})) {
    if (pid === paramId || labelKey(e.label) !== key) continue;
    cluster.push(...e.values.map(v => v.value));
  }
  return [...new Set([...own, ...cluster])];
}

/**
 * Динамічні питання Кроку 1: кластери словника, НЕ покриті наявними
 * константами policy_mapping. Питання формується, щойно є хоч одне значення.
 */
export function clusterQuestions(dict, policyMapping) {
  const covered = new Set();
  for (const gc of policyMapping?.global_constants ?? [])
    for (const pid of gc.odp_params) covered.add(pid);
  const clusters = new Map();
  for (const [pid, e] of Object.entries(dict?.entries ?? {})) {
    if (covered.has(pid)) continue;
    const key = labelKey(e.label);
    if (!key) continue;
    if (!clusters.has(key)) clusters.set(key, { key: DYN_PREFIX + key, label: e.label, paramIds: [], values: new Map() });
    const c = clusters.get(key);
    c.paramIds.push(pid);
    for (const v of e.values) c.values.set(v.value, (c.values.get(v.value) ?? 0) + v.count);
  }
  return [...clusters.values()]
    .map(c => ({ key: c.key, label: c.label, paramIds: c.paramIds,
      values: [...c.values.entries()].sort((a, b) => b[1] - a[1]).map(([v]) => v) }))
    .sort((a, b) => b.paramIds.length - a.paramIds.length);
}

/** Map paramId→value з відповідей на динамічні питання (ключі dyn:*) */
export function dynamicPolicyIndex(dict, globalConstants) {
  const index = new Map();
  const answers = Object.entries(globalConstants ?? {}).filter(([k, v]) => k.startsWith(DYN_PREFIX) && v?.trim());
  if (!answers.length) return index;
  const byKey = new Map(answers.map(([k, v]) => [k.slice(DYN_PREFIX.length), v.trim()]));
  for (const [pid, e] of Object.entries(dict?.entries ?? {})) {
    const v = byKey.get(labelKey(e.label));
    if (v) index.set(pid, v);
  }
  return index;
}
