function plainStatement(items, out = []) {
  for (const it of items ?? []) {
    if (it.text) out.push(it.text);
    plainStatement(it.children, out);
  }
  return out;
}

export function enhancementsForControl(ndTzi, baseControlId) {
  for (const fam of ndTzi.document.security_families)
    for (const c of fam.controls)
      if (c.canonical_id === baseControlId)
        return (c.children ?? []).map(ch => ({
          id: ch.canonical_id,
          title: ch.title,
          text: plainStatement(ch.catalog?.statement?.items).join(' '),
        }));
  return [];
}

const HIGH_LEVELS = new Set(['Високий', 'Критичний']);

export function suggestionsFromRisks(annotatedRisks) {
  const map = new Map();
  for (const r of annotatedRisks) {
    if (!HIGH_LEVELS.has(r.level)) continue;
    for (const eid of r.enhancement_suggestions ?? []) {
      const base = eid.slice(0, eid.indexOf('('));
      if (!map.has(base)) map.set(base, []);
      map.get(base).push({ enhancementId: eid, riskId: r.id, level: r.level });
    }
  }
  return map;
}
