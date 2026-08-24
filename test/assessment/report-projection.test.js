import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildReportProjection } from '../../core/assessment/report-projection.js';

const assessment = {
  id: 'ASSESS-2026-077', metadata: { ics_name: 'АС-2', as_class: 2, info_type: 'open_confidential', assessment_body: 'Орган', assessor_name: 'Оцінювач' },
  cpb_snapshot: { source_approved_name: 'as2', hash: 'abc' },
  warnings: [{ code: 'ODP_UNRESOLVED', control_id: 'AC-02', local_odp_id: 'ac-2_odp.01' }],
  plan: { items: [{ assessment_source_id: 'AC-02e', control_id: 'AC-02', family: 'AC', family_title: 'ДОСТУП',
    control_title: 'ОБЛІК', resolved_objective: 'мета', odp_values: [] }] },
  results: [{ assessment_source_id: 'AC-02e', result: 'NOT_SATISFIED', methods_used: ['EXAMINE', 'INTERVIEW'],
    evidence_ids: ['EV-001'], finding_ids: ['F-001'], conclusion: 'не виконується', assessor_comment: '' }],
  evidence: [{ evidence_id: 'EV-001', type: 'ORDER', title: 'Наказ', reference: 'п.1', collected_by: 'О', collected_at: 'т' }],
  findings: [{ finding_id: 'F-001', assessment_source_id: 'AC-02e', severity: 'MAJOR', title: 'Недолік', description: 'опис', recommendation: 'рек', status: 'OPEN' }],
};

test('проєкція: розділи, лейбли, загальний висновок', () => {
  const p = buildReportProjection({ assessment, cpbSnapshot: { state: {} } });
  assert.equal(p.title.assessment_id, 'ASSESS-2026-077');
  assert.equal(p.families[0].controls[0].items[0].result_label, 'Не відповідає');
  assert.equal(p.families[0].controls[0].items[0].methods_used_labels, undefined);
  assert.equal(p.methods, undefined);
  assert.equal(p.findings[0].severity_label, 'Значний');
  assert.equal(p.evidence_register.length, 1);
  assert.ok(p.overall.conclusion_text.includes('не відповідає'));
  assert.deepEqual(p.appendices.unresolved_odp, [{ local_odp_id: 'ac-2_odp.01', control_id: 'AC-02' }]);
});

test('висновок tier 2 (partially_satisfied)', () => {
  const a2 = { ...assessment, results: [{ ...assessment.results[0], result: 'PARTIALLY_SATISFIED' }] };
  const p = buildReportProjection({ assessment: a2, cpbSnapshot: { state: {} } });
  assert.match(p.overall.conclusion_text, /частково відповідає/);
});

test('висновок tier 3 (not_assessed)', () => {
  const a3 = { ...assessment, results: [{ ...assessment.results[0], result: 'NOT_ASSESSED' }] };
  const p = buildReportProjection({ assessment: a3, cpbSnapshot: { state: {} } });
  assert.match(p.overall.conclusion_text, /не завершено/);
});

test('висновок tier 4 (clean)', () => {
  const a4 = { ...assessment, results: [{ ...assessment.results[0], result: 'SATISFIED' }] };
  const p = buildReportProjection({ assessment: a4, cpbSnapshot: { state: {} } });
  assert.equal(p.overall.conclusion_text, 'ІКС відповідає вимогам ЦПБ');
});
