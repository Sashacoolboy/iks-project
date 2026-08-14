import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildAssessmentSummary } from '../core/assessment/assessment-summary.js';

test('buildAssessmentSummary рахує за conclusion та unmapped', () => {
  const assessment = {
    items: [
      { conclusion: 'POSITIVE', catalog_missing: false, finding: null },
      { conclusion: 'NEGATIVE', catalog_missing: false, finding: { description: 'x' } },
      { conclusion: null, catalog_missing: true, finding: null },
      { conclusion: null, catalog_missing: false, finding: null },
    ],
  };
  const s = buildAssessmentSummary(assessment);
  assert.equal(s.total, 4);
  assert.equal(s.positive, 1);
  assert.equal(s.negative, 1);
  assert.equal(s.not_assessed, 2);
  assert.equal(s.unmapped, 1);
  assert.equal(s.has_finding, 1);
});
