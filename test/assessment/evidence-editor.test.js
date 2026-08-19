import { test } from 'node:test';
import assert from 'node:assert/strict';
import { evidenceFieldsFromForm } from '../../public/js/assessment/evidence-editor.js';

test('evidenceFieldsFromForm без файлу', () => {
  const fields = evidenceFieldsFromForm({
    type: 'POLICY',
    title: 'Політика ІБ',
    reference: 'П-01-2024',
    observation: 'Затверджено 2024-01-15',
    collected_by: 'Іванов І.І.'
  }, null);

  assert.equal(fields.type, 'POLICY');
  assert.equal(fields.title, 'Політика ІБ');
  assert.equal(fields.reference, 'П-01-2024');
  assert.equal(fields.observation, 'Затверджено 2024-01-15');
  assert.equal(fields.collected_by, 'Іванов І.І.');
  assert.deepEqual(fields.source, { kind: 'NONE', path: null });
});

test('evidenceFieldsFromForm з файлом', () => {
  const fields = evidenceFieldsFromForm({
    type: 'DOCUMENT',
    title: 'Акт перевірки',
    reference: 'АП-123',
    observation: 'Перевірено системні журнали',
    collected_by: 'Петренко П.П.'
  }, 'akt_123.pdf');

  assert.equal(fields.type, 'DOCUMENT');
  assert.equal(fields.title, 'Акт перевірки');
  assert.deepEqual(fields.source, { kind: 'LOCAL_FILE', path: 'evidence/akt_123.pdf' });
});

test('evidenceFieldsFromForm порожні значення', () => {
  const fields = evidenceFieldsFromForm({
    type: 'OTHER',
    title: '',
    reference: '',
    observation: '',
    collected_by: ''
  }, null);

  assert.equal(fields.type, 'OTHER');
  assert.equal(fields.title, '');
  assert.equal(fields.reference, '');
  assert.equal(fields.observation, '');
  assert.equal(fields.collected_by, '');
});
