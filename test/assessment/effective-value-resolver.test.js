import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { indexAdapter } from '../../core/assessment/odp-adapter.js';
import { resolveEffectiveValue, baselineValue } from '../../core/assessment/effective-value-resolver.js';

const adapter = JSON.parse(await readFile(new URL('../../data/assessment/assessment_odp_adapter.json', import.meta.url), 'utf8'));
const genericDefaults = JSON.parse(await readFile(new URL('../../data/generic_parameter_defaults.json', import.meta.url), 'utf8'));
const as2 = JSON.parse(await readFile(new URL('../../data/FIXTURES/АС-2.json', import.meta.url), 'utf8'));
const idx = indexAdapter(adapter);
const entry = (aid) => idx.byAssessmentId.get(aid).entry;

test('CPB_OVERRIDE перемагає все', () => {
  const r = resolveEffectiveValue({ adapterEntry: entry('AC-02_ODP[02]'), cpb: as2, genericDefaults });
  assert.equal(r.status, 'RESOLVED');
  assert.equal(r.source, 'CPB_OVERRIDE');
  assert.equal(r.value, as2.profile.param_overrides['ac-2_odp.02']);
});

test('BPB_INHERITED через explicit adapter binding (пріоритет над generic)', () => {
  // ac-2_odp.04 має і BPB binding, і generic default "щорічно" — перемагає БПБ
  const r = resolveEffectiveValue({ adapterEntry: entry('AC-02_ODP[04]'), cpb: as2, genericDefaults });
  assert.deepEqual([r.status, r.source, r.value], ['RESOLVED', 'BPB_INHERITED', 'мінімум щоквартально']);
});

test('GENERIC_DEFAULT коли немає override і БПБ', () => {
  const r = resolveEffectiveValue({ adapterEntry: entry('AC-01_ODP[03]'), cpb: as2, genericDefaults });
  assert.deepEqual([r.status, r.source, r.value], ['RESOLVED', 'GENERIC_DEFAULT', 'Адміністратор безпеки']);
});

test('UNRESOLVED: value null, ніколи не вигадувати; requires_input прокидається', () => {
  const r = resolveEffectiveValue({ adapterEntry: entry('AC-02_ODP[01]'), cpb: as2, genericDefaults });
  assert.deepEqual([r.status, r.source, r.value], ['UNRESOLVED', null, null]);
  assert.equal(r.requires_input, true); // generic_parameter_defaults: ac-2_odp.01 requiresInput=true, defaultValue=null
});

test('baselineValue не залежить від CPB override', () => {
  assert.equal(baselineValue({ adapterEntry: entry('AC-02_ODP[04]'), infoType: 'open_confidential' }), 'мінімум щоквартально');
  assert.equal(baselineValue({ adapterEntry: entry('AC-02_ODP[01]'), infoType: 'open_confidential' }), null);
});

test('BPB_INHERITED: порожнє значення binding не пропускається; кілька bindings → масив', () => {
  // ac-1_odp.06: єдиний binding зі значенням '' → BPB_INHERITED, value ''
  const r1 = resolveEffectiveValue({ adapterEntry: entry('AC-01_ODP[06]'), cpb: as2, genericDefaults });
  assert.deepEqual([r1.status, r1.source, r1.value], ['RESOLVED', 'BPB_INHERITED', '']);
  // at-1_odp.01: два bindings → масив значень у порядку
  const r2 = resolveEffectiveValue({ adapterEntry: entry('AT-01_ODP[01]'), cpb: as2, genericDefaults });
  assert.deepEqual([r2.status, r2.source], ['RESOLVED', 'BPB_INHERITED']);
  assert.deepEqual(r2.value, ['весь персонал c.1,', 'щонайменше раз на рік']);
});
