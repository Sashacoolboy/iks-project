import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeAssessment } from '../../core/assessment/assessment-io.js';
import { addFinding, updateFinding, SEVERITIES } from '../../core/assessment/findings.js';

const plan = { items: [{ assessment_source_id: 'AC-02e', control_id: 'AC-02', available_methods: [], odp_values: [] }] };
const base = () => makeAssessment({ approvedRecord: { state: { passport: {}, info_type: 'open_confidential' } }, approvedName: 'x', plan, warnings: [], id: 'ASSESS-2026-051' });

test('addFinding: id, severity, лінк до result', () => {
  const { assessment, finding } = addFinding(base(), { assessment_source_id: 'AC-02e', severity: 'MAJOR',
    title: 'Відсутні схвалення', description: 'Запити створюються без погодження', evidence_ids: [], recommendation: 'Впровадити' });
  assert.equal(finding.finding_id, 'F-001');
  assert.equal(finding.status, 'OPEN');
  assert.deepEqual(assessment.results[0].finding_ids, ['F-001']);
  assert.throws(() => addFinding(base(), { assessment_source_id: 'AC-02e', severity: 'HUGE', title: 't', description: 'd' }), /severity/i);
  assert.throws(() => addFinding(base(), { assessment_source_id: 'нема', severity: 'MINOR', title: 't', description: 'd' }), /не знайдено/i);
  assert.deepEqual(SEVERITIES, ['OBSERVATION', 'MINOR', 'MAJOR', 'CRITICAL']);
});

test('updateFinding: статус і перевірка before/after', () => {
  const a = addFinding(base(), { assessment_source_id: 'AC-02e', severity: 'MINOR', title: 't', description: 'd' }).assessment;
  const { assessment, after } = updateFinding(a, 'F-001', { status: 'CLOSED' });
  assert.equal(after.status, 'CLOSED');
  assert.equal(assessment.findings[0].status, 'CLOSED');
  assert.throws(() => updateFinding(a, 'F-001', { status: 'MAYBE' }), /статус/i);
});
