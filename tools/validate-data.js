import { readFileSync } from 'node:fs';

const read = (p) => JSON.parse(readFileSync(new URL(`../data/${p}`, import.meta.url)));
const nd = read('nd_tzi.json');
const assets = read('assets_catalog.json').assets;
const tr = read('threats_risks.json');
const pm = read('policy_mapping.json');

const knownControls = new Set();
for (const fam of nd.document.security_families)
  for (const c of fam.controls) {
    knownControls.add(c.canonical_id);
    for (const ch of c.children ?? []) knownControls.add(ch.canonical_id);
  }
const knownAssets = new Set(assets.map(a => a.id));
const knownParams = new Set();
for (const fam of nd.document.security_families)
  for (const c of fam.controls)
    for (const node of [c, ...(c.children ?? [])])
      for (const p of node.catalog?.parameters ?? []) knownParams.add(p.id);

const errors = [];
for (const r of tr.risks) {
  if (!knownAssets.has(r.asset_id)) errors.push(`${r.id}: невідомий asset_id ${r.asset_id}`);
  for (const ref of r.control_refs) if (!knownControls.has(ref)) errors.push(`${r.id}: невідомий control_ref ${ref}`);
  for (const e of r.enhancement_suggestions) if (!knownControls.has(e)) errors.push(`${r.id}: невідоме посилення ${e}`);
  if (r.impact < 1 || r.impact > 5) errors.push(`${r.id}: impact поза межами`);
  if (r.likelihood < 0.1 || r.likelihood > 0.9) errors.push(`${r.id}: likelihood поза межами`);
}
// Покриття: кожен клас активів має >= 2 ризики
for (const a of assets) {
  const n = tr.risks.filter(r => r.asset_id === a.id).length;
  if (n < 2) errors.push(`Актив ${a.id} (${a.name}): лише ${n} ризиків (мінімум 2)`);
}
// Валідація policy_mapping.json
for (const gc of pm.global_constants)
  for (const pid of gc.odp_params)
    if (!knownParams.has(pid)) errors.push(`policy_mapping ${gc.key}: невідомий param ${pid}`);

// Валідація as_class_exemptions.json
const ex = read('as_class_exemptions.json');
for (const e of ex.exemptions) {
  if (!knownControls.has(e.control_ref)) errors.push(`exemption: невідомий control_ref ${e.control_ref}`);
  if (!e.reason_note || e.reason_note.length < 30) errors.push(`exemption ${e.control_ref}: примітка закоротка`);
  if (!e.applies_to_classes.every(c => c === 1 || c === 2)) errors.push(`exemption ${e.control_ref}: класи лише 1/2`);
}

if (errors.length) { console.error(errors.join('\n')); process.exit(1); }
console.log(`OK: ${tr.risks.length} ризиків, покриття всіх ${assets.length} класів, ${pm.global_constants.length} глобальних констант, ${ex.exemptions.length} архітектурних винятків`);
