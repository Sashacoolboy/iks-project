export function filterAssetsByClass(assets, asClass) {
  return assets.filter(a => a.min_as_class <= asClass);
}

export function groupByCategory(assets) {
  const map = new Map();
  for (const a of assets) {
    if (!map.has(a.category)) map.set(a.category, []);
    map.get(a.category).push(a);
  }
  return map;
}
