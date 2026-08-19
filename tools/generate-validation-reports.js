// Генерує звіти валідації: AC-02 gold standard + AS-2 regression
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { indexAdapter } from '../core/assessment/odp-adapter.js';
import { resolveEffectiveValue } from '../core/assessment/effective-value-resolver.js';
import { resolveAssessmentObjective } from '../core/assessment/objective-resolver.js';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const read = async (p) => JSON.parse(await readFile(join(ROOT, p), 'utf8'));

const adapter = await read('data/assessment/assessment_odp_adapter.json');
const genericDefaults = await read('data/generic_parameter_defaults.json');
const as2 = await read('data/FIXTURES/АС-2.json');
const sanity = await read('data/VALIDATED_ARTIFACTS/as2_full_odp_sanity_check_v1.json');
const idx = indexAdapter(adapter);

// AC-02 Gold Standard
const GOLD = [
  ['AC-02_ODP[01]', 'ac-2_odp.01', ['AC-02_ODP[03]']],
  ['AC-02_ODP[02]', 'ac-2_odp.02', ['AC-02_ODP[04]']],
  ['AC-02_ODP[03]', 'ac-2_odp.03', ['AC-02_ODP[06]', 'AC-02_ODP[07]', 'AC-02_ODP[08]']],
  ['AC-02_ODP[04]', 'ac-2_odp.04', ['AC-02_ODP[10]']],
];

let ac02Report = `# AC-02 Gold Standard Validation

## VERIFIED NIST Traceability Mappings

| Assessment ODP ID | Local ODP ID | NIST ODP IDs |
|-------------------|--------------|--------------|
`;

for (const [aid, localId, nistIds] of GOLD) {
  ac02Report += `| ${aid} | ${localId} | ${nistIds.join(', ')} |\n`;
}

ac02Report += `\n## Resolver Outcomes на АС-2 для кожного AC-02 ODP\n\n`;

const effectiveValueFor = (localOdpId) => {
  const hit = idx.byLocalId.get(localOdpId)?.[0];
  return hit ? resolveEffectiveValue({ adapterEntry: hit.entry, cpb: as2, genericDefaults }) : { status: 'UNRESOLVED', value: null };
};

for (const [aid, localId] of GOLD) {
  const eff = effectiveValueFor(localId);
  ac02Report += `### ${aid} (${localId})\n\n`;
  ac02Report += `- **Status**: ${eff.status}\n`;
  ac02Report += `- **Source**: ${eff.source ?? 'N/A'}\n`;
  ac02Report += `- **Value**: ${eff.value ?? 'null'}\n`;
  ac02Report += `- **Requires input**: ${eff.requires_input ?? false}\n\n`;
}

await mkdir(join(ROOT, 'docs', 'reports'), { recursive: true });
await writeFile(join(ROOT, 'docs', 'reports', 'ac02-validation.md'), ac02Report);

// AS-2 Regression
const counts = {
  total: sanity.rows.length,
  RESOLVED: 0,
  UNRESOLVED: 0,
  CPB_OVERRIDE: 0,
  BPB_INHERITED: 0,
  GENERIC_DEFAULT: 0
};

const unresolvedItems = [];

for (const row of sanity.rows) {
  const hit = idx.byAssessmentId.get(row.assessment_odp_id);
  if (!hit) continue;
  const r = resolveEffectiveValue({ adapterEntry: hit.entry, cpb: as2, genericDefaults });
  counts[r.status]++;
  if (r.source) counts[r.source]++;
  if (r.status === 'UNRESOLVED') {
    unresolvedItems.push(row.local_odp_id);
  }
}

const resolvedPct = Math.round((counts.RESOLVED / counts.total) * 10000) / 100;

let as2Report = `# AS-2 Regression Test

## Summary

- **Total ODP rows**: ${counts.total}
- **Resolved**: ${counts.RESOLVED} (${resolvedPct}%)
- **Unresolved**: ${counts.UNRESOLVED}

## Source Breakdown

- **CPB_OVERRIDE**: ${counts.CPB_OVERRIDE}
- **BPB_INHERITED**: ${counts.BPB_INHERITED}
- **GENERIC_DEFAULT**: ${counts.GENERIC_DEFAULT}

## Unresolved Local ODP IDs (${counts.UNRESOLVED})

`;

for (const localId of unresolvedItems) {
  as2Report += `- ${localId}\n`;
}

await writeFile(join(ROOT, 'docs', 'reports', 'as2-regression.md'), as2Report);

console.log(`Reports generated:`);
console.log(`- docs/reports/ac02-validation.md (4 gold mappings)`);
console.log(`- docs/reports/as2-regression.md (${counts.total} rows, ${counts.RESOLVED}/${counts.UNRESOLVED}, ${resolvedPct}%)`);
