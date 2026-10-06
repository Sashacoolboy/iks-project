import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveChecklistStatement } from '../../core/assessment/checklist-resolver.js';

test('підставляє значення для {{ insert: param, ... }}', () => {
  const { resolved_statement, placeholders } = resolveChecklistStatement({
    template: 'Перевірити повторення навчання з періодичністю {{ insert: param, at-2_odp.01 }}.',
    effectiveValueFor: () => ({ status: 'RESOLVED', value: 'щороку' }),
  });
  assert.equal(resolved_statement, 'Перевірити повторення навчання з періодичністю щороку.');
  assert.deepEqual(placeholders, [{ local_odp_id: 'at-2_odp.01', resolution: 'SUBSTITUTED', value: 'щороку' }]);
});

test('нерозвʼязане значення → [НЕ ВИЗНАЧЕНО: local_odp_id]', () => {
  const { resolved_statement, placeholders } = resolveChecklistStatement({
    template: 'Періодичність {{ insert: param, at-2_odp.01 }}.',
    effectiveValueFor: () => ({ status: 'UNRESOLVED', value: null }),
  });
  assert.equal(resolved_statement, 'Періодичність [НЕ ВИЗНАЧЕНО: at-2_odp.01].');
  assert.equal(placeholders[0].resolution, 'UNRESOLVED_VALUE');
});

test('масив значень обʼєднується через "; "', () => {
  const { resolved_statement } = resolveChecklistStatement({
    template: '{{ insert: param, at-3_odp.01 }}',
    effectiveValueFor: () => ({ status: 'RESOLVED', value: ['Адміністратор', 'Оператор'] }),
  });
  assert.equal(resolved_statement, 'Адміністратор; Оператор');
});

test('текст без плейсхолдерів повертається як є', () => {
  const { resolved_statement, placeholders } = resolveChecklistStatement({
    template: 'Перевірити журнал.', effectiveValueFor: () => ({ status: 'RESOLVED', value: 'x' }),
  });
  assert.equal(resolved_statement, 'Перевірити журнал.');
  assert.deepEqual(placeholders, []);
});

test('null/undefined template → порожній рядок', () => {
  assert.equal(resolveChecklistStatement({ template: null, effectiveValueFor: () => ({}) }).resolved_statement, '');
});
