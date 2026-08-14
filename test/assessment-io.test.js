// test/assessment-io.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeAssessment, serializeAssessment, deserializeAssessment, validateAssessmentSchema, nextAssessmentId } from '../core/assessment/assessment-io.js';

test('nextAssessmentId генерує послідовний ID за роком', () => {
  const year = new Date().getFullYear();
  assert.equal(nextAssessmentId([]), `ASSESS-${year}-001`);
  assert.equal(nextAssessmentId([`ASSESS-${year}-001`, `ASSESS-${year}-002`]), `ASSESS-${year}-003`);
  assert.equal(nextAssessmentId([`ASSESS-${year - 1}-005`]), `ASSESS-${year}-001`);
});

test('makeAssessment/serialize/deserialize round-trip', () => {
  const approvedRecord = { kind: 'approved', approved_at: '2026-01-01T00:00:00.000Z',
    state: { passport: { ics_name: 'Т', as_class: 1 }, info_type: 'service' }, summary: {} };
  const assessment = makeAssessment({ approvedRecord, approvedName: 'тест', items: [], warnings: [] });
  assert.equal(assessment.kind, 'assessment');
  assert.equal(assessment.metadata.ics_name, 'Т');
  assert.equal(assessment.cpb_snapshot.source_approved_name, 'тест');
  const json = serializeAssessment(assessment);
  const back = deserializeAssessment(json);
  assert.deepEqual(back, assessment);
});

test('validateAssessmentSchema виявляє відсутній kind', () => {
  const errs = validateAssessmentSchema({ items: [] });
  assert.ok(errs.some(e => /kind/i.test(e)));
});

test('deserializeAssessment кидає на биту JSON', () => {
  assert.throws(() => deserializeAssessment('{ not json'));
});
