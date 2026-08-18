// test/assessment/ac02-gold-standard.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { indexAdapter } from '../../core/assessment/odp-adapter.js';
import { resolveEffectiveValue } from '../../core/assessment/effective-value-resolver.js';
import { resolveAssessmentObjective } from '../../core/assessment/objective-resolver.js';

const adapter = JSON.parse(await readFile(new URL('../../data/assessment/assessment_odp_adapter.json', import.meta.url), 'utf8'));
const genericDefaults = JSON.parse(await readFile(new URL('../../data/generic_parameter_defaults.json', import.meta.url), 'utf8'));
const as2 = JSON.parse(await readFile(new URL('../../data/FIXTURES/АС-2.json', import.meta.url), 'utf8'));
const idx = indexAdapter(adapter);

const GOLD = [
  ['AC-02_ODP[01]', 'ac-2_odp.01', ['AC-02_ODP[03]']],
  ['AC-02_ODP[02]', 'ac-2_odp.02', ['AC-02_ODP[04]']],
  ['AC-02_ODP[03]', 'ac-2_odp.03', ['AC-02_ODP[06]', 'AC-02_ODP[07]', 'AC-02_ODP[08]']],
  ['AC-02_ODP[04]', 'ac-2_odp.04', ['AC-02_ODP[10]']],
];

test('gold standard: local mapping + VERIFIED NIST traceability', () => {
  for (const [aid, localId, nistIds] of GOLD) {
    const { entry } = idx.byAssessmentId.get(aid);
    assert.equal(entry.local_odp_id, localId);
    assert.equal(entry.nist_traceability.status, 'VERIFIED');
    assert.deepEqual(entry.nist_traceability.odp_ids, nistIds);
  }
});

test('AS-2: ac-2_odp.01 unresolved (немає target value), ac-2_odp.02 — CPB override', () => {
  const r1 = resolveEffectiveValue({ adapterEntry: idx.byAssessmentId.get('AC-02_ODP[01]').entry, cpb: as2, genericDefaults });
  assert.deepEqual([r1.status, r1.value], ['UNRESOLVED', null]);
  const r2 = resolveEffectiveValue({ adapterEntry: idx.byAssessmentId.get('AC-02_ODP[02]').entry, cpb: as2, genericDefaults });
  assert.equal(r2.source, 'CPB_OVERRIDE');
});

test('AC-02_ODP[03]: statement_usage h, порожні BPB bindings, UNRESOLVED без override', () => {
  const e3 = idx.byAssessmentId.get('AC-02_ODP[03]').entry;
  assert.equal(e3.statement_usage[0].statement_path, 'h');
  assert.deepEqual(e3.bpb_bindings.open_confidential, []);
  const cpbNoOverride = { info_type: 'open_confidential', profile: { param_overrides: {} } };
  const r = resolveEffectiveValue({ adapterEntry: e3, cpb: cpbNoOverride, genericDefaults });
  assert.equal(r.status, 'UNRESOLVED');
  assert.equal(r.requires_input, true);
});

test('resolved objective: placeholder substitution і [НЕ ВИЗНАЧЕНО]', () => {
  const tpl = 'для запитів на створення облікових записів потрібні схвалення від <AC-02_ODP[03] персоналу або ролей>;';
  const withValue = resolveAssessmentObjective({ objectiveTemplate: tpl, adapterIndex: idx,
    effectiveValueFor: (id) => id === 'ac-2_odp.01' ? { status: 'RESOLVED', value: 'Начальник служби захисту інформації' } : null });
  assert.ok(withValue.resolved_objective.includes('Начальник служби захисту інформації'));
  const noValue = resolveAssessmentObjective({ objectiveTemplate: tpl, adapterIndex: idx,
    effectiveValueFor: () => ({ status: 'UNRESOLVED', value: null }) });
  assert.ok(noValue.resolved_objective.includes('[НЕ ВИЗНАЧЕНО]'));
  assert.ok(!noValue.resolved_objective.includes('<AC-02_ODP'));
});
