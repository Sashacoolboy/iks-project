// test/assessment/as2-regression.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { indexAdapter } from '../../core/assessment/odp-adapter.js';
import { resolveEffectiveValue } from '../../core/assessment/effective-value-resolver.js';

const adapter = JSON.parse(await readFile(new URL('../../data/assessment/assessment_odp_adapter.json', import.meta.url), 'utf8'));
const genericDefaults = JSON.parse(await readFile(new URL('../../data/generic_parameter_defaults.json', import.meta.url), 'utf8'));
const as2 = JSON.parse(await readFile(new URL('../../data/FIXTURES/АС-2.json', import.meta.url), 'utf8'));
const sanity = JSON.parse(await readFile(new URL('../../data/VALIDATED_ARTIFACTS/as2_full_odp_sanity_check_v1.json', import.meta.url), 'utf8'));
const idx = indexAdapter(adapter);

// Baseline regression ТЗ §25: 270 рядків, 231 resolved / 39 unresolved (85.56%), 90/83/58 за джерелами.
test('AS-2 baseline: per-row відповідність validated sanity check', () => {
  assert.equal(sanity.rows.length, 270);
  const mismatches = [];
  const counts = { RESOLVED: 0, UNRESOLVED: 0, CPB_OVERRIDE: 0, BPB_INHERITED: 0, GENERIC_DEFAULT: 0 };
  for (const row of sanity.rows) {
    const hit = idx.byAssessmentId.get(row.assessment_odp_id);
    if (!hit) { mismatches.push(`${row.assessment_odp_id}: відсутній в адаптері`); continue; }
    const r = resolveEffectiveValue({ adapterEntry: hit.entry, cpb: as2, genericDefaults });
    counts[r.status]++;
    if (r.source) counts[r.source]++;
    const exp = row.effective_value;
    if (r.status !== exp.status || (r.source ?? null) !== (exp.source ?? null) || JSON.stringify(r.value ?? null) !== JSON.stringify(exp.value ?? null))
      mismatches.push(`${row.assessment_odp_id} (${row.local_odp_id}): got ${r.status}/${r.source}/${r.value} want ${exp.status}/${exp.source}/${exp.value}`);
  }
  assert.deepEqual(mismatches, [], `розбіжності:\n${mismatches.slice(0, 15).join('\n')}`);
  assert.equal(counts.RESOLVED, 231);
  assert.equal(counts.UNRESOLVED, 39);
  assert.equal(counts.CPB_OVERRIDE, 90);
  assert.equal(counts.BPB_INHERITED, 83);
  assert.equal(counts.GENERIC_DEFAULT, 58);
  assert.equal(Math.round((counts.RESOLVED / 270) * 10000) / 100, 85.56);
});
