import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildReportProjection } from '../../core/assessment/report-projection.js';

const assessment = {
  id: 'ASSESS-2026-077', metadata: { ics_name: 'АС-2', as_class: 2, info_type: 'open_confidential', assessment_body: 'Орган', assessor_name: 'Оцінювач',
    designation: 'ІКС-1/01', system_id: 'SYS-01', owner_info: 'ТОВ «Власник»', developer_info: 'ТОВ «Розробник»',
    development_basis: 'наказ №1', baseline_profile_info: 'галузевий профіль X', normative_acts: 'НД ТЗІ 2.5-005' },
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

test('проєкція: system_info несе ідентифікаційні поля паспорта ІКС (для аудиту)', () => {
  const p = buildReportProjection({ assessment, cpbSnapshot: { state: {} } });
  assert.equal(p.system_info.designation, 'ІКС-1/01');
  assert.equal(p.system_info.system_id, 'SYS-01');
  assert.equal(p.system_info.owner_info, 'ТОВ «Власник»');
  assert.equal(p.system_info.developer_info, 'ТОВ «Розробник»');
  assert.equal(p.system_info.development_basis, 'наказ №1');
  assert.equal(p.system_info.baseline_profile_info, 'галузевий профіль X');
  assert.equal(p.system_info.normative_acts, 'НД ТЗІ 2.5-005');
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
