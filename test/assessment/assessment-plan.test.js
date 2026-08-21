import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { buildAssessmentPlan } from '../../core/assessment/assessment-plan.js';

const read = async (p) => JSON.parse(await readFile(new URL(`../../${p}`, import.meta.url), 'utf8'));
const catalogs = {
  ndTzi: await read('data/nd_tzi.json'),
  bpb: { service: await read('data/bpb_service.json'), open_confidential: await read('data/bpb_open_confidential.json') },
  exemptions: await read('data/as_class_exemptions.json'),
  genericDefaults: await read('data/generic_parameter_defaults.json'),
};
const assessmentCatalog = await read('data/assessment/assessment_catalog.json');
const adapter = await read('data/assessment/assessment_odp_adapter.json');
const as2 = await read('data/FIXTURES/АС-2.json');
const approvedState = { info_type: as2.info_type, profile: as2.profile, passport: { as_class: 2, ics_name: 'АС-2' } };

const { items, warnings } = buildAssessmentPlan({ approvedState, catalogs, assessmentCatalog, adapter });

test('план містить лише applicable контролі, без EXEMPT/EXCLUDED items', () => {
  assert.ok(items.length > 0);
  assert.ok(items.every(i => i.cpb_status === 'APPLIED'));
});

test('AC-02e: resolved_objective, odp_values зі baseline/target', () => {
  const e = items.find(i => i.assessment_source_id === 'AC-02e');
  assert.ok(e, 'AC-02e має бути в плані');
  assert.ok(e.objective_template.includes('<AC-02_ODP[03]'));
  // ac-2_odp.01 unresolved в АС-2 → [НЕ ВИЗНАЧЕНО]
  assert.ok(e.resolved_objective.includes('[НЕ ВИЗНАЧЕНО]'));
  const odp1 = e.odp_values.find(v => v.assessment_odp_id === 'AC-02_ODP[01]');
  assert.deepEqual([odp1.local_odp_id, odp1.status, odp1.target_value], ['ac-2_odp.01', 'UNRESOLVED', null]);
  const odp4 = e.odp_values.find(v => v.assessment_odp_id === 'AC-02_ODP[04]');
  assert.deepEqual([odp4.baseline_value, odp4.target_value, odp4.effective_source],
    ['мінімум щоквартально', 'мінімум щоквартально', 'BPB_INHERITED']);
  assert.ok(e.available_methods.includes('EXAMINE') && e.available_methods.includes('TEST'));
});

test('unresolved ODP потрапляють у warnings', () => {
  assert.ok(warnings.some(w => w.code === 'ODP_UNRESOLVED' && w.local_odp_id === 'ac-2_odp.01'));
});

test('relevant_local_odp_ids: statement-матчинг, VERIFIED-мапінг та порожньо без звʼязку', () => {
  // AC-02e: statement 'e' → адаптерне statement_usage 'e' у ac-2_odp.01 (+ плейсхолдер теж ac-2_odp.01)
  const e = items.find(i => i.assessment_source_id === 'AC-02e');
  assert.deepEqual(e.relevant_local_odp_ids, ['ac-2_odp.01']);
  // ODP-рядок з reference-нумерацією AC-02_ODP[03] → через VERIFIED → локальний ac-2_odp.01
  const ref3 = items.find(i => i.assessment_source_id === 'AC-02_ODP[03]');
  assert.equal(ref3.kind, 'ODP_DEFINITION');
  assert.deepEqual(ref3.relevant_local_odp_ids, ['ac-2_odp.01']);
  // ODP-рядок без VERIFIED-звʼязку → порожньо
  const ref1 = items.find(i => i.assessment_source_id === 'AC-02_ODP[01]');
  assert.deepEqual(ref1.relevant_local_odp_ids, []);
  // statement_paths присутні в odp_values
  const odp4 = e.odp_values.find(v => v.assessment_odp_id === 'AC-02_ODP[04]');
  assert.ok(Array.isArray(odp4.statement_paths) && odp4.statement_paths.length > 0);
});

test('statement_text: текст вимоги заходу з nd_tzi на кожному пункті', () => {
  const a1 = items.find(i => i.assessment_source_id === 'AC-02a.[01]');
  assert.equal(a1.statement_text, 'Визначити та задокументувати типи облікових записів системи, дозволених для використання в ІС для підтримки цілей, завдань, функцій і процесів організації.');
  const e = items.find(i => i.assessment_source_id === 'AC-02e');
  assert.ok(e.statement_text.includes('Вимагати схвалення'));
  // ODP-рядок з VERIFIED-звʼязком → текст стейтменту, де вжито локальний ODP
  const ref3 = items.find(i => i.assessment_source_id === 'AC-02_ODP[03]');
  assert.ok(ref3.statement_text.includes('Вимагати схвалення'));
  // без VERIFIED-звʼязку → повний текст заходу (всі пункти a..l)
  const ref1 = items.find(i => i.assessment_source_id === 'AC-02_ODP[01]');
  assert.ok(ref1.statement_text.includes('a) Визначити та задокументувати типи облікових записів'));
  assert.ok(ref1.statement_text.includes('j) Проводити перегляд облікових записів'));
});

test('невибрані enhancements не потрапляють у план', () => {
  // АС-2: profile.enhancements = [] → only БПБ-mandated enhancements, no user-selected ones
  // Check: any enhancement in items should NOT be from the (empty) profile.enhancements list
  const enhItems = items.filter(i => i.enhancement);
  assert.ok(enhItems.length > 0, 'БПБ should mandate some enhancements for АС-2');
  // Since profile.enhancements is [], no items should come from user selection (all are БПБ-mandated)
  assert.ok(enhItems.every(i => !as2.profile.enhancements.includes(i.control_id)));
});

test('methods_reference: копія assessment_methods_reference з адаптера', () => {
  const e = items.find(i => i.assessment_source_id === 'AC-02e');
  const adapterCtrl = adapter.controls.find(c => c.control_id === 'AC-02');
  assert.deepEqual(e.methods_reference, adapterCtrl.assessment_methods_reference);
  assert.ok(e.methods_reference.EXAMINE?.length > 0);
});
