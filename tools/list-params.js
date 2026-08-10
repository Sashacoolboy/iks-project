import { readFileSync, writeFileSync } from 'node:fs';
const nd = JSON.parse(readFileSync(new URL('../data/nd_tzi.json', import.meta.url)));
const rows = [];
for (const fam of nd.document.security_families)
  for (const c of fam.controls)
    for (const node of [c, ...(c.children ?? [])])
      for (const p of node.catalog?.parameters ?? [])
        rows.push(`${node.canonical_id}\t${p.id}\t${p.type}\t${p.label}`);
writeFileSync(new URL('../tools/params_dump.tsv', import.meta.url), rows.join('\n'));
console.log(`${rows.length} параметрів → tools/params_dump.tsv`);
