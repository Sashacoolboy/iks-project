// test/assessment/assessment-io.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeAssessment, migrateAssessment, validateAssessmentSchema, nextAssessmentId } from '../../core/assessment/assessment-io.js';

const plan = { items: [{ assessment_source_id: 'AC-02e', control_id: 'AC-02', available_methods: ['EXAMINE'], odp_values: [] }] };
const approvedRecord = { state: { passport: { ics_name: 'Тест', as_class: 2, designation: 'ІКС-1/01',
  system_id: 'SYS-01', owner_info: 'ТОВ «Власник»', developer_info: 'ТОВ «Розробник»',
  development_basis: 'наказ №1', baseline_profile_info: 'галузевий профіль X', normative_acts: 'НД ТЗІ 2.5-005' },
  info_type: 'open_confidential' } };

test('makeAssessment v3: schema 3.0.0, results ініціалізовані NOT_ASSESSED', () => {
  const a = makeAssessment({ approvedRecord, approvedName: 'test', plan, warnings: [], id: 'ASSESS-2026-002' });
  assert.equal(a.schema_version, '3.0.0');
  assert.equal(a.results.length, 1);
  assert.deepEqual(a.results[0], { assessment_source_id: 'AC-02e', methods_used: [], result: 'NOT_ASSESSED',
    evidence_ids: [], source_references: [], assessor_comment: '', conclusion: '', conclusion_id: null, finding_ids: [] });
  assert.deepEqual(validateAssessmentSchema(a), []);
});

test('makeAssessment: metadata переносить ідентифікаційні поля паспорта ІКС (для аудиту)', () => {
  const a = makeAssessment({ approvedRecord, approvedName: 'test', plan, warnings: [], id: 'ASSESS-2026-003' });
  assert.equal(a.metadata.designation, 'ІКС-1/01');
  assert.equal(a.metadata.system_id, 'SYS-01');
  assert.equal(a.metadata.owner_info, 'ТОВ «Власник»');
  assert.equal(a.metadata.developer_info, 'ТОВ «Розробник»');
  assert.equal(a.metadata.development_basis, 'наказ №1');
  assert.equal(a.metadata.baseline_profile_info, 'галузевий профіль X');
  assert.equal(a.metadata.normative_acts, 'НД ТЗІ 2.5-005');
});

test('migrateAssessment: v1 → v3 enum/evidence/finding', () => {
  const v1 = { kind: 'assessment', schema_version: '1.0.0', id: 'ASSESS-2026-001', status: 'IN_PROGRESS',
    metadata: {}, cpb_snapshot: { source_approved_name: 'x', relative_path: 'cpb-snapshot.json', hash: '' },
    warnings: [], items: [{ id: 'AC-02.e', control_id: 'AC-02', statement_path: 'e', resolved_statement: 'текст',
      odp_refs: ['ac-2_odp.01'], odp_values: { 'ac-2_odp.01': 'значення' }, recommended_methods: ['EXAMINE'],
      conclusion: 'POSITIVE', assessor_comment: 'ок',
      evidence: [{ method: 'EXAMINE', source_type: 'ORDER', title: 'Наказ', reference: 'п. 4.2', observation: 'є' }],
      finding: { description: 'зауваження' } }] };
  const a = migrateAssessment(v1);
  assert.equal(a.schema_version, '3.0.0');
  const r = a.results.find(x => x.assessment_source_id === 'AC-02.e');
  assert.equal(r.result, 'SATISFIED');
  assert.deepEqual(r.methods_used, ['EXAMINE']);
  assert.equal(a.evidence.length, 1);
  assert.equal(a.evidence[0].evidence_id, 'EV-001');
  assert.equal(a.evidence[0].type, 'ORDER');
  assert.deepEqual(r.evidence_ids, ['EV-001']);
  assert.equal(a.findings[0].finding_id, 'F-001');
  assert.equal(a.findings[0].description, 'зауваження');
  assert.deepEqual(r.finding_ids, ['F-001']);
  const planItem = a.plan.items.find(i => i.assessment_source_id === 'AC-02.e');
  assert.equal(planItem.resolved_objective, 'текст');
  assert.deepEqual(a.plan.checklist, [], 'v1→v3 міграція додає порожній plan.checklist');
  // v3 проходить без змін
  assert.equal(migrateAssessment(a), a);
});

test('makeAssessment v3: статус PLANNING (не IN_PROGRESS), plan.checklist присутній', () => {
  const a = makeAssessment({ approvedRecord, approvedName: 'test', plan, warnings: [], id: 'ASSESS-2026-004' });
  assert.equal(a.status, 'PLANNING');
  assert.deepEqual(a.plan.checklist, []);
});

test('makeAssessment: передає checklist, якщо наданий', () => {
  const planWithChecklist = { ...plan, checklist: [{ canonical_control_id: 'AT-2', control_id: 'AT-02', family: 'AT',
    family_title: 'Обізнаність', control_title: 'X', statements: [{ id: 'AT-2#1', text: 'текст' }],
    included: true, exclusion_reason: null }] };
  const a = makeAssessment({ approvedRecord, approvedName: 'test', plan: planWithChecklist, warnings: [], id: 'ASSESS-2026-005' });
  assert.equal(a.plan.checklist.length, 1);
  assert.equal(validateAssessmentSchema(a).length, 0);
});

test('validateAssessmentSchema: вимагає plan.checklist як масив', () => {
  const a = makeAssessment({ approvedRecord, approvedName: 'test', plan, warnings: [], id: 'ASSESS-2026-006' });
  a.plan.checklist = 'не масив';
  assert.ok(validateAssessmentSchema(a).some(e => e.includes('plan.checklist')));
});

test('migrateAssessment: v3-об\u02BCєкт без plan.checklist отримує backfill []', () => {
  const a = makeAssessment({ approvedRecord, approvedName: 'test', plan, warnings: [], id: 'ASSESS-2026-007' });
  delete a.plan.checklist;
  const migrated = migrateAssessment(a);
  assert.deepEqual(migrated.plan.checklist, []);
  assert.notEqual(migrated, a, 'має повернути новий обʼєкт при backfill');
});

test('migrateAssessment: v3-об\u02BCєкт з наявним plan.checklist — identity (без змін)', () => {
  const a = makeAssessment({ approvedRecord, approvedName: 'test', plan, warnings: [], id: 'ASSESS-2026-008' });
  assert.equal(migrateAssessment(a), a);
});
test('migrateAssessment: нормалізує старий формат verification_statement → statements[]', () => {
  const a = makeAssessment({ approvedRecord, approvedName: 'test', plan, warnings: [], id: 'ASSESS-2026-012' });
  a.plan.checklist = [{ control_id: 'AT-02', verification_statement: 'старий текст', source_status: 'GENERATED',
    included: true, exclusion_reason: null }];
  const migrated = migrateAssessment(a);
  assert.deepEqual(migrated.plan.checklist[0].statements, [{ id: 'AT-02#1', text: 'старий текст' }]);
  assert.equal(migrated.plan.checklist[0].verification_statement, undefined);
  assert.equal(migrated.plan.checklist[0].source_status, undefined);
});

test('migrateAssessment: старий формат з null verification_statement → statements []', () => {
  const a = makeAssessment({ approvedRecord, approvedName: 'test', plan, warnings: [], id: 'ASSESS-2026-013' });
  a.plan.checklist = [{ control_id: 'AT-02', verification_statement: null, source_status: 'MANUAL_REQUIRED',
    included: true, exclusion_reason: null }];
  const migrated = migrateAssessment(a);
  assert.deepEqual(migrated.plan.checklist[0].statements, []);
});

test('migrateAssessment: вже новий формат (statements присутній) — identity, без змін', () => {
  const a = makeAssessment({ approvedRecord, approvedName: 'test', plan, warnings: [], id: 'ASSESS-2026-014' });
  a.plan.checklist = [{ control_id: 'AT-02', statements: [{ id: 'AT-02#1', text: 'x' }], included: true, exclusion_reason: null }];
  assert.equal(migrateAssessment(a), a);
});
test('nextAssessmentId', () => {
  const y = new Date().getFullYear();
  assert.equal(nextAssessmentId([`ASSESS-${y}-001`, `ASSESS-${y}-007`]), `ASSESS-${y}-008`);
});
