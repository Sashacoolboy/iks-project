export function computeRiskScore(impact, likelihood) {
  return Math.round(impact * likelihood * 100) / 100;
}

export function riskLevel(score, scale) {
  for (const l of scale.levels) if (score <= l.max) return l.label;
  return scale.levels.at(-1).label;
}

export function annotateRisk(risk, scale) {
  const score = computeRiskScore(risk.impact, risk.likelihood);
  return { ...risk, score, level: riskLevel(score, scale) };
}

export function baseRisksFor(catalog, selectedAssetIds, asClass) {
  const sel = new Set(selectedAssetIds);
  return catalog.risks
    .filter(r => sel.has(r.asset_id) && r.min_as_class <= asClass)
    .map(r => annotateRisk(r, catalog.scale));
}

export function threatDirectory(catalog, assetId = null) {
  const seen = new Set();
  const out = [];
  for (const r of catalog.risks) {
    if (assetId && r.asset_id !== assetId) continue;
    const key = r.threat + '|' + r.vulnerability;
    if (!seen.has(key)) { seen.add(key); out.push({ threat: r.threat, vulnerability: r.vulnerability }); }
  }
  return out.sort((a, b) => a.threat.localeCompare(b.threat, 'uk'));
}

export function buildCustomRisk(input, existingIds, scale) {
  let n = 1;
  while (existingIds.includes(`C-${String(n).padStart(3, '0')}`)) n++;
  return annotateRisk({
    id: `C-${String(n).padStart(3, '0')}`,
    custom: true,
    min_as_class: 1,
    treatment_strategy: input.treatment_strategy ?? 'Зменшення',
    treatment_plan: input.treatment_plan ?? '',
    responsible: input.responsible ?? '',
    control_refs: input.control_refs ?? [],
    enhancement_suggestions: input.enhancement_suggestions ?? [],
    ...input,
  }, scale);
}
