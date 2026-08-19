import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildAssessmentSummary } from '../../core/assessment/assessment-summary.js';

test('summary рахує по v3 results', () => {
  const a = { results: [
    { result: 'SATISFIED', finding_ids: [] }, { result: 'PARTIALLY_SATISFIED', finding_ids: ['F-001'] },
    { result: 'NOT_SATISFIED', finding_ids: ['F-002'] }, { result: 'NOT_APPLICABLE', finding_ids: [] },
    { result: 'NOT_ASSESSED', finding_ids: [] } ], evidence: [{}, {}] };
  assert.deepEqual(buildAssessmentSummary(a), { total: 5, satisfied: 1, partially_satisfied: 1,
    not_satisfied: 1, not_applicable: 1, not_assessed: 1, has_finding: 2, evidence_count: 2 });
});
