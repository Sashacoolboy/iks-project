import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildProfile, INFO_TYPES } from '../core/profile-engine.js';

const read = (p) => JSON.parse(readFileSync(new URL(`../data/${p}`, import.meta.url)));
const catalogs = {
  ndTzi: read('nd_tzi.json'),
  bpb: { service: read('bpb_service.json'), open_confidential: read('bpb_open_confidential.json') },
  exemptions: read('as_class_exemptions.json'),
  policyMapping: read('policy_mapping.json'),
  genericDefaults: read('generic_parameter_defaults.json'),
};
const baseState = {
  passport: { as_class: 1 },
  global_constants: {},
  info_type: 'service',
  profile: { param_overrides: {}, enhancements: [], excluded: [], exemption_overrides: [] },
};

test('service-каталог дає 100 пунктів, open_confidential — 85', () => {
  assert.equal(buildProfile(baseState, catalogs).items.length, 100);
  assert.equal(buildProfile({ ...baseState, info_type: 'open_confidential' }, catalogs).items.length, 85);
});

test('на АС-1 пункти з exemption мають статус Виконано архітектурно і примітку', () => {
  const doc = buildProfile(baseState, catalogs);
  const exempted = doc.items.filter(i => i.status === 'Виконано архітектурно');
  assert.ok(exempted.length > 0);
  assert.ok(exempted.every(i => i.exemptionNote?.length > 30));
  assert.equal(doc.summary.exempted, exempted.length);
});

test('на АС-3 ті самі пункти застосовуються звичайно', () => {
  const doc = buildProfile({ ...baseState, passport: { as_class: 3 } }, catalogs);
  assert.equal(doc.items.filter(i => i.status === 'Виконано архітектурно').length, 0);
});

test('exemption_overrides повертає пункт у Застосовується', () => {
  const doc1 = buildProfile(baseState, catalogs);
  const key = doc1.items.find(i => i.status === 'Виконано архітектурно').key;
  const doc2 = buildProfile({ ...baseState, profile: { ...baseState.profile, exemption_overrides: [key] } }, catalogs);
  assert.equal(doc2.items.find(i => i.key === key).status, 'Застосовується (автозаповнено)');
});

test('глобальна політика підставляється у текст', () => {
  const pm = catalogs.policyMapping.global_constants.find(g => g.odp_params.length > 0);
  const state = { ...baseState, global_constants: { [pm.key]: 'ТЕСТ-ЗНАЧЕННЯ-123' } };
  const doc = buildProfile(state, catalogs);
  const hit = doc.items.some(i => i.controls.some(c => c.statementLines.some(l => l.text.includes('ТЕСТ-ЗНАЧЕННЯ-123'))));
  assert.ok(hit);
});

test('state_secret не має каталогу', () => {
  assert.equal(INFO_TYPES.state_secret, null);
});
