import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolveStatement, collectControlOdpValues } from '../core/assessment/assessment-resolver.js';

test('resolveStatement підставляє відоме значення', () => {
  const odpValues = new Map([['ac-2_odp.01', 'керівник СЗІ']]);
  const r = resolveStatement('Вимагати схвалення {{ insert: param, ac-2_odp.01 }} запитів.', odpValues);
  assert.equal(r.text, 'Вимагати схвалення керівник СЗІ запитів.');
  assert.deepEqual(r.unresolved, []);
});

test('resolveStatement позначає невідоме значення явно', () => {
  const r = resolveStatement('Період {{ insert: param, ac-2_odp.03 }}.', new Map());
  assert.equal(r.text, 'Період [НЕ ВИЗНАЧЕНО: ac-2_odp.03].');
  assert.deepEqual(r.unresolved, ['ac-2_odp.03']);
});

test('collectControlOdpValues повертає лише resolved (непорожні) значення контролю', () => {
  const approvedState = {
    passport: { as_class: 1 },
    info_type: 'service',
    global_constants: {},
    profile: { param_overrides: { 'ac-2_odp.01': 'керівник СЗІ' } },
  };
  const read = (p) => JSON.parse(readFileSync(new URL(`../data/${p}`, import.meta.url)));
  const catalogs = {
    ndTzi: read('nd_tzi.json'),
    bpb: {
      service: read('bpb_service.json'),
      open_confidential: read('bpb_open_confidential.json'),
    },
    policyMapping: read('policy_mapping.json'),
    genericDefaults: read('generic_parameter_defaults.json'),
    exemptions: read('as_class_exemptions.json'),
  };
  const values = collectControlOdpValues(approvedState, catalogs, 'AC-02');
  assert.equal(values.get('ac-2_odp.01'), 'керівник СЗІ');
});

test('collectControlOdpValues розпізнає BPB-значення з AC-02-style control ID', () => {
  const approvedState = {
    passport: { as_class: 1 },
    info_type: 'service',
    global_constants: {},
    profile: {},
  };
  const read = (p) => JSON.parse(readFileSync(new URL(`../data/${p}`, import.meta.url)));
  const catalogs = {
    ndTzi: read('nd_tzi.json'),
    bpb: {
      service: read('bpb_service.json'),
      open_confidential: read('bpb_open_confidential.json'),
    },
    policyMapping: read('policy_mapping.json'),
    genericDefaults: read('generic_parameter_defaults.json'),
    exemptions: read('as_class_exemptions.json'),
  };
  const values = collectControlOdpValues(approvedState, catalogs, 'AC-02');
  assert.ok(values.has('ac-2_odp.04'), 'має містити BPB-значення для ac-2_odp.04');
  assert.equal(values.get('ac-2_odp.04'), 'мінімум щоквартально');
});
