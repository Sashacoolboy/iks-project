import { test } from 'node:test';
import assert from 'node:assert/strict';
import { labelKey, mergeRecord, emptyDictionary, suggestionsFor, clusterQuestions, dynamicPolicyIndex, DYN_PREFIX } from '../core/odp-dictionary.js';

test('labelKey зводить словоформи до одного ключа', () => {
  assert.equal(labelKey('частота, визначена організацією'), labelKey('з визначеною організацією частотою'));
  assert.notEqual(labelKey('визначену організацією посадову особу'), labelKey('частота, визначена організацією'));
});

test('mergeRecord накопичує значення з лічильниками', () => {
  let d = emptyDictionary();
  d = mergeRecord(d, { paramId: 'x_odp.01', label: 'частота, визначена організацією', source_text: '[П]', value: 'щорічно' });
  d = mergeRecord(d, { paramId: 'x_odp.01', label: 'частота, визначена організацією', source_text: '[П]', value: 'щорічно' });
  d = mergeRecord(d, { paramId: 'x_odp.01', label: 'частота, визначена організацією', source_text: '[П]', value: 'щоквартально' });
  const e = d.entries['x_odp.01'];
  assert.equal(e.values[0].value, 'щорічно');
  assert.equal(e.values[0].count, 2);
  assert.equal(e.values.length, 2);
  // порожні значення ігноруються
  assert.deepEqual(mergeRecord(d, { paramId: 'y', label: '', value: '  ' }), d);
});

test('suggestionsFor віддає власні значення + кластерні', () => {
  let d = emptyDictionary();
  d = mergeRecord(d, { paramId: 'a_odp.01', label: 'з визначеною організацією частотою', value: 'щорічно' });
  d = mergeRecord(d, { paramId: 'b_odp.02', label: 'частота, визначена організацією', value: 'щомісяця' });
  d = mergeRecord(d, { paramId: 'c_odp.03', label: 'посадову особу', value: 'начальник ІБ' });
  const s = suggestionsFor(d, 'a_odp.01', 'з визначеною організацією частотою');
  assert.ok(s.includes('щорічно') && s.includes('щомісяця'));
  assert.ok(!s.includes('начальник ІБ'));
});

test('clusterQuestions пропускає параметри, покриті policy_mapping', () => {
  let d = emptyDictionary();
  d = mergeRecord(d, { paramId: 'covered_odp.01', label: 'тайм-аут сеансу', value: '30 хв' });
  d = mergeRecord(d, { paramId: 'free_odp.01', label: 'умови повторної перевірки', value: 'щороку' });
  d = mergeRecord(d, { paramId: 'free_odp.02', label: 'умови повторної перевірки', value: 'при інциденті' });
  const pm = { global_constants: [{ key: 'x', odp_params: ['covered_odp.01'] }] };
  const qs = clusterQuestions(d, pm);
  assert.equal(qs.length, 1);
  assert.equal(qs[0].paramIds.length, 2);
  assert.ok(qs[0].key.startsWith(DYN_PREFIX));
  assert.deepEqual(qs[0].values.slice(0, 2).sort(), ['при інциденті', 'щороку']);
});

test('dynamicPolicyIndex мапить відповідь на всі параметри кластера', () => {
  let d = emptyDictionary();
  d = mergeRecord(d, { paramId: 'p1', label: 'умови повторної перевірки', value: 'щороку' });
  d = mergeRecord(d, { paramId: 'p2', label: 'умови повторної перевірки', value: 'інше' });
  const key = DYN_PREFIX + labelKey('умови повторної перевірки');
  const idx = dynamicPolicyIndex(d, { [key]: 'щопівроку' });
  assert.equal(idx.get('p1'), 'щопівроку');
  assert.equal(idx.get('p2'), 'щопівроку');
  assert.equal(dynamicPolicyIndex(d, {}).size, 0);
});
