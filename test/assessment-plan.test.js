import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildAssessmentPlan } from '../core/assessment/assessment-plan.js';

const read = (p) => JSON.parse(readFileSync(`data/${p}`, 'utf8'));
const catalogs = {
  ndTzi: read('nd_tzi.json'),
  bpb: { service: read('bpb_service.json'), open_confidential: read('bpb_open_confidential.json') },
  policyMapping: read('policy_mapping.json'),
  genericDefaults: read('generic_parameter_defaults.json'),
  exemptions: read('as_class_exemptions.json'),
};
const assessmentCatalog = read('assessment_catalog.json');

function approvedStateFixture() {
  return {
    passport: { ics_name: 'Тест АС', as_class: 1 },
    info_type: 'service',
    global_constants: {},
    selected_assets: ['A-01'],
    risks: { accepted_base: [], custom: [] },
    profile: { param_overrides: { 'ac-2_odp.01': 'керівник СЗІ' }, enhancements: [], excluded: [], exemption_overrides: [], exemption_note_overrides: {} },
  };
}

test('buildAssessmentPlan створює items для AC-02 base statements з assessment_catalog', () => {
  const plan = buildAssessmentPlan({ approvedState: approvedStateFixture(), catalogs, assessmentCatalog });
  const item = plan.items.find(i => i.id === 'AC-02.e');
  assert.ok(item, 'AC-02.e має бути в плані');
  assert.equal(item.canonical_control_id, 'AC-2');
  assert.match(item.resolved_statement, /керівник СЗІ/);
  assert.deepEqual(item.odp_refs, ['ac-2_odp.01']);
});

test('unresolved ODP формує warning і явний плейсхолдер у тексті', () => {
  const state = approvedStateFixture();
  state.profile.param_overrides = {}; // прибрати override -> ac-2_odp.01 нерозв'язаний
  const plan = buildAssessmentPlan({ approvedState: state, catalogs, assessmentCatalog });
  const item = plan.items.find(i => i.id === 'AC-02.e');
  assert.match(item.resolved_statement, /НЕ ВИЗНАЧЕНО: ac-2_odp\.01/);
  assert.ok(plan.warnings.some(w => w.code === 'ODP_UNRESOLVED' && w.param_id === 'ac-2_odp.01'));
});

test('посилення не потрапляє в план, якщо його немає у profile.enhancements', () => {
  const plan = buildAssessmentPlan({ approvedState: approvedStateFixture(), catalogs, assessmentCatalog });
  assert.equal(plan.items.some(i => i.control_id === 'AC-02(02)'), false);
});

test('посилення потрапляє в план, якщо воно включене', () => {
  const state = approvedStateFixture();
  state.profile.enhancements = ['AC-2(2)'];
  const plan = buildAssessmentPlan({ approvedState: state, catalogs, assessmentCatalog });
  assert.ok(plan.items.some(i => i.control_id === 'AC-02(02)'));
});

test('control без запису в assessment_catalog отримує UNMAPPED_CONTROL fallback', () => {
  const plan = buildAssessmentPlan({ approvedState: approvedStateFixture(), catalogs, assessmentCatalog });
  const unmapped = plan.items.filter(i => i.catalog_missing);
  assert.ok(unmapped.length > 0, 'мають існувати непокриті каталогом контролі (лише AC-02 має методику)');
  assert.ok(unmapped.every(i => i.assessment_status === 'NOT_STARTED'));
});

test('normalizeControlId strips leading zeros from enhancement numbers (regression for AC-02(05) bug)', () => {
  const state = approvedStateFixture();
  state.info_type = 'open_confidential'; // AC-2(5) is BPB-mandated here
  const plan = buildAssessmentPlan({ approvedState: state, catalogs, assessmentCatalog });
  const ac205 = plan.items.find(i => i.control_id === 'AC-02(05)');
  assert.ok(ac205, 'AC-02(05) має бути в плані (BPB-mandated in open_confidential)');
  assert.equal(ac205.catalog_missing, false, 'AC-02(05) має знайти відповідність у каталозі');
  assert.ok(ac205.resolved_statement.length > 0, 'resolved_statement має бути не порожнім');
  assert.ok(!ac205.resolved_statement.includes('не визначена у локальному каталозі'), 'не має бути fallback-тексту');
});

test('normalizeControlId strips leading zeros for AC-02(01)', () => {
  const state = approvedStateFixture();
  state.profile.enhancements = ['AC-2(1)']; // canonical unpadded format
  const plan = buildAssessmentPlan({ approvedState: state, catalogs, assessmentCatalog });
  const ac201 = plan.items.find(i => i.control_id === 'AC-02(01)');
  assert.ok(ac201, 'AC-02(01) має бути в плані');
  assert.equal(ac201.catalog_missing, false, 'AC-02(01) має знайти відповідність у каталозі');
  assert.ok(ac201.resolved_statement.length > 0, 'resolved_statement має бути не порожнім');
});
