import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeAssessment } from '../../core/assessment/assessment-io.js';
import { addEvidence, removeEvidence, EVIDENCE_TYPES } from '../../core/assessment/evidence.js';
import { finalizeAssessment } from '../../core/assessment/assessment-run.js';

const plan = { items: [{ assessment_source_id: 'AC-02e', control_id: 'AC-02', available_methods: ['EXAMINE'], odp_values: [] }] };
const base = () => makeAssessment({ approvedRecord: { state: { passport: {}, info_type: 'open_confidential' } }, approvedName: 'x', plan, warnings: [], id: 'ASSESS-2026-050' });
const fields = { type: 'ORDER', title: 'Наказ про облікові записи', source: { kind: 'LOCAL_FILE', path: 'evidence/nakaz.pdf' },
  reference: 'п. 4.2', observation: 'схвалення фіксується', collected_by: 'Оцінювач' };

test('addEvidence: id, лінк до result, sandbox path', () => {
  const { assessment, evidence } = addEvidence(base(), 'AC-02e', fields);
  assert.equal(evidence.evidence_id, 'EV-001');
  assert.ok(evidence.collected_at);
  assert.deepEqual(assessment.results[0].evidence_ids, ['EV-001']);
  assert.throws(() => addEvidence(base(), 'AC-02e', { ...fields, type: 'MALWARE' }), /тип/i);
  assert.throws(() => addEvidence(base(), 'AC-02e', { ...fields, source: { kind: 'LOCAL_FILE', path: '../secret' } }), /шлях/i);
  assert.throws(() => addEvidence(finalizeAssessment(base()), 'AC-02e', fields), /фіналізован/i);
  assert.equal(EVIDENCE_TYPES.length, 12);
});

test('removeEvidence знімає всі посилання', () => {
  const a1 = addEvidence(base(), 'AC-02e', fields).assessment;
  const { assessment } = removeEvidence(a1, 'EV-001');
  assert.deepEqual(assessment.evidence, []);
  assert.deepEqual(assessment.results[0].evidence_ids, []);
});
