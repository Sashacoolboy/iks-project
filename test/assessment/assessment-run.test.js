// test/assessment/assessment-run.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeAssessment } from '../../core/assessment/assessment-io.js';
import { updateResult, finalizeAssessment, RESULT_VALUES } from '../../core/assessment/assessment-run.js';

const plan = { items: [{ assessment_source_id: 'AC-02e', control_id: 'AC-02', available_methods: ['EXAMINE', 'TEST'], odp_values: [] }] };
const approvedRecord = { state: { passport: {}, info_type: 'open_confidential' } };
const base = () => makeAssessment({ approvedRecord, approvedName: 'x', plan, warnings: [], id: 'ASSESS-2026-009' });

test('updateResult: enum, методи, immutability, before/after', () => {
  const a = base();
  const { assessment, before, after } = updateResult(a, 'AC-02e', { result: 'SATISFIED', methods_used: ['EXAMINE'] });
  assert.equal(after.result, 'SATISFIED');
  assert.equal(before.result, 'NOT_ASSESSED');
  assert.equal(a.results[0].result, 'NOT_ASSESSED'); // вихідний не мутований
  assert.equal(assessment.results[0].result, 'SATISFIED');
  assert.throws(() => updateResult(a, 'AC-02e', { result: 'POSITIVE' }), /result/);
  assert.throws(() => updateResult(a, 'AC-02e', { methods_used: ['OBSERVE'] }), /метод/i);
  assert.throws(() => updateResult(a, 'нема', {}), /не знайдено/i);
  assert.deepEqual(RESULT_VALUES, ['NOT_ASSESSED', 'SATISFIED', 'PARTIALLY_SATISFIED', 'NOT_SATISFIED', 'NOT_APPLICABLE']);
});

test('finalizeAssessment: read-only після FINALIZED', () => {
  const a = finalizeAssessment(base(), { finalizedBy: 'Оцінювач' });
  assert.equal(a.status, 'FINALIZED');
  assert.ok(a.finalized_at);
  assert.throws(() => updateResult(a, 'AC-02e', { result: 'SATISFIED' }), /finalized|фіналізован/i);
  assert.throws(() => finalizeAssessment(a, { finalizedBy: 'x' }), /finalized|фіналізован/i);
});
