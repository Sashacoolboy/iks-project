import { test } from 'node:test';
import assert from 'node:assert/strict';
import { defaultState, makeIcsTemplate, applyIcsTemplate, makeCpbTemplate, applyCpbTemplate, validateTemplate } from '../core/template-io.js';

test('ICS template round-trip', () => {
  const s = defaultState();
  s.passport = { ics_name: 'ІКС-1', cert_body: 'ДССЗЗІ', as_class: 2 };
  s.global_constants = { password_rotation_days: '90 днів' };
  s.selected_assets = ['A-01', 'A-08'];
  const tpl = makeIcsTemplate(s);
  assert.equal(validateTemplate('ics', tpl).length, 0);
  const restored = applyIcsTemplate(defaultState(), tpl);
  assert.deepEqual(restored.passport, s.passport);
  assert.deepEqual(restored.selected_assets, s.selected_assets);
  assert.equal(restored.info_type, null); // не зачіпає профільну частину
});

test('CPB template round-trip', () => {
  const s = defaultState();
  s.info_type = 'service';
  s.profile.enhancements = ['IA-2(1)'];
  s.profile.param_overrides = { 'x_odp.01': 'значення' };
  const tpl = makeCpbTemplate(s);
  assert.equal(validateTemplate('cpb', tpl).length, 0);
  const restored = applyCpbTemplate(defaultState(), tpl);
  assert.equal(restored.info_type, 'service');
  assert.deepEqual(restored.profile.enhancements, ['IA-2(1)']);
});

test('validateTemplate ловить чужий kind і сміття', () => {
  assert.ok(validateTemplate('ics', { kind: 'cpb' }).length > 0);
  assert.ok(validateTemplate('ics', null).length > 0);
  assert.ok(validateTemplate('cpb', { kind: 'cpb', info_type: 'bad_type', profile: {} }).length > 0);
});
