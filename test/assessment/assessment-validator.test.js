import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateResult, validateAssessment } from '../../core/assessment/assessment-validator.js';

test('validateResult: evidence обовʼязкові для оцінених, finding для negative, коментар для N/A', () => {
  const ok = (r, f = []) => validateResult(r, { findings: f });
  assert.equal(ok({ assessment_source_id: 'x', result: 'SATISFIED', evidence_ids: ['EV-001'], finding_ids: [], assessor_comment: '' }).length, 0);
  assert.ok(ok({ assessment_source_id: 'x', result: 'SATISFIED', evidence_ids: [], finding_ids: [], assessor_comment: '' }).length > 0);
  assert.ok(ok({ assessment_source_id: 'x', result: 'NOT_SATISFIED', evidence_ids: ['EV-001'], finding_ids: [], assessor_comment: '' }).length > 0);
  assert.equal(ok({ assessment_source_id: 'x', result: 'NOT_SATISFIED', evidence_ids: ['EV-001'], finding_ids: ['F-001'], assessor_comment: '' },
    [{ finding_id: 'F-001' }]).length, 0);
  assert.ok(ok({ assessment_source_id: 'x', result: 'NOT_APPLICABLE', evidence_ids: [], finding_ids: [], assessor_comment: '' }).length > 0);
  assert.equal(ok({ assessment_source_id: 'x', result: 'NOT_ASSESSED', evidence_ids: [], finding_ids: [], assessor_comment: '' }).length, 0);
});

test('validateAssessment: referential integrity', () => {
  const a = { results: [{ assessment_source_id: 'x', result: 'NOT_ASSESSED', evidence_ids: ['EV-404'], finding_ids: [], assessor_comment: '' }],
    evidence: [], findings: [] };
  assert.ok(validateAssessment(a).some(e => e.includes('EV-404')));
});
