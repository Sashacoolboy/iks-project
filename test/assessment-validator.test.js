import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateAssessmentItem, validateAssessment } from '../core/assessment/assessment-validator.js';

function baseItem(overrides = {}) {
  return { id: 'AC-02.e', conclusion: null, evidence: [], finding: null, assessor_comment: '', ...overrides };
}

test('POSITIVE вимагає щонайменше один доказ', () => {
  const errs = validateAssessmentItem(baseItem({ conclusion: 'POSITIVE', evidence: [] }));
  assert.ok(errs.some(e => /доказ/i.test(e)));
});

test('POSITIVE з доказом — валідний', () => {
  const errs = validateAssessmentItem(baseItem({ conclusion: 'POSITIVE', evidence: [{ id: 'EV-0001' }] }));
  assert.deepEqual(errs, []);
});

test('PARTIALLY_POSITIVE вимагає finding.description', () => {
  const errs = validateAssessmentItem(baseItem({ conclusion: 'PARTIALLY_POSITIVE', evidence: [{ id: 'EV-0001' }], finding: null }));
  assert.ok(errs.some(e => /finding/i.test(e)));
});

test('NEGATIVE вимагає finding.description', () => {
  const errs = validateAssessmentItem(baseItem({ conclusion: 'NEGATIVE', evidence: [{ id: 'EV-0001' }], finding: { description: '' } }));
  assert.ok(errs.some(e => /finding/i.test(e)));
});

test('NOT_APPLICABLE вимагає коментар-обґрунтування', () => {
  const errs = validateAssessmentItem(baseItem({ conclusion: 'NOT_APPLICABLE', assessor_comment: '' }));
  assert.ok(errs.some(e => /обґрунтування|коментар/i.test(e)));
});

test('NOT_ASSESSED не вимагає доказів', () => {
  const errs = validateAssessmentItem(baseItem({ conclusion: 'NOT_ASSESSED' }));
  assert.deepEqual(errs, []);
});

test('validateAssessment агрегує помилки по всіх items', () => {
  const assessment = { kind: 'assessment', items: [baseItem({ conclusion: 'POSITIVE', evidence: [] })] };
  const errs = validateAssessment(assessment);
  assert.equal(errs.length, 1);
});
