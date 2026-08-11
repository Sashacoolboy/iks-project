import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildPolicyParamIndex, resolveParamValue, renderText } from '../core/policy-autofill.js';

const policyMapping = { global_constants: [
  { key: 'password_rotation_days', label: '', example: '', odp_params: ['ia-5_odp.03'] },
] };

test('пріоритет: override > policy > bpb > generic > empty', () => {
  const sources = {
    overrides: { 'ia-5_odp.03': 'кожні 60 днів' },
    policyIndex: buildPolicyParamIndex(policyMapping, { password_rotation_days: '90 днів' }),
    bpbValues: new Map([['ia-5_odp.03', 'раз на рік']]),
    genericDefaults: { 'ia-5_odp.03': 'періодично' },
  };
  assert.deepEqual(resolveParamValue('ia-5_odp.03', sources), { value: 'кожні 60 днів', source: 'override' });
  delete sources.overrides['ia-5_odp.03'];
  assert.deepEqual(resolveParamValue('ia-5_odp.03', sources), { value: '90 днів', source: 'policy' });
  sources.policyIndex.delete('ia-5_odp.03');
  assert.deepEqual(resolveParamValue('ia-5_odp.03', sources), { value: 'раз на рік', source: 'bpb' });
  sources.bpbValues.delete('ia-5_odp.03');
  assert.deepEqual(resolveParamValue('ia-5_odp.03', sources), { value: 'періодично', source: 'generic' });
  delete sources.genericDefaults['ia-5_odp.03'];
  assert.deepEqual(resolveParamValue('ia-5_odp.03', sources), { value: '', source: 'empty' });
});

test('renderText підставляє плейсхолдери і формує parts', () => {
  const resolve = (id) => id === 'x_odp.01' ? { value: '90 днів', source: 'policy' } : { value: '', source: 'empty' };
  const r = renderText('Зміна паролів кожні {{ insert: param, x_odp.01 }} під контролем {{ insert: param, y_odp.02 }}.', resolve);
  assert.equal(r.text, 'Зміна паролів кожні 90 днів під контролем [не визначено].');
  assert.equal(r.parts.filter(p => p.type === 'param').length, 2);
  assert.equal(r.parts[1].source, 'policy');
});
