// test/assessment/dictionary-integrity.test.js
// Інваріанти після batch-екстракції параметрів (2026-08-21): у словнику немає сирих
// [Призначення:/Вибір:/Завдання:], дужки збалансовані, кожен параметр використаний,
// а в плані АС-2 немає нерозпізнаних плейсхолдерів.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { buildAssessmentPlan } from '../../core/assessment/assessment-plan.js';
import { validateAdapter } from '../../core/assessment/odp-adapter.js';

const read = async (p) => JSON.parse(await readFile(new URL(`../../${p}`, import.meta.url), 'utf8'));
const ndTzi = await read('data/nd_tzi.json');
const adapter = await read('data/assessment/assessment_odp_adapter.json');

const allNodes = [];
for (const fam of ndTzi.document.security_families)
  for (const c of fam.controls) allNodes.push(c, ...(c.children ?? []));

test('nd_tzi: немає сирих дужок призначення/вибору, дужки збалансовані', () => {
  const bad = [];
  for (const node of allNodes) {
    const walk = (arr) => {
      for (const it of arr) {
        if (/\[(Призначення|Призначенням|Вибір|Завдання)\b/.test(it.text ?? '')) bad.push(`${node.id}: сира дужка`);
        const o = ((it.text ?? '').match(/\[/g) ?? []).length, c = ((it.text ?? '').match(/\]/g) ?? []).length;
        if (o !== c) bad.push(`${node.id}: незбалансовано (${o}/${c}): ${(it.text ?? '').slice(0, 60)}`);
        walk(it.children ?? []);
      }
    };
    walk(node.catalog?.statement?.items ?? []);
  }
  assert.deepEqual(bad, []);
});

test('nd_tzi: кожен параметр використаний у statement свого контролу', () => {
  const bad = [];
  for (const node of allNodes) {
    const stmt = JSON.stringify(node.catalog?.statement ?? {});
    for (const p of node.catalog?.parameters ?? [])
      if (!stmt.includes(`{{ insert: param, ${p.id} }}`)) bad.push(`${node.id}: ${p.id}`);
  }
  assert.deepEqual(bad, []);
});

test('adapter: validateAdapter без помилок, статистика узгоджена', () => {
  const { errors } = validateAdapter(adapter, ndTzi);
  assert.deepEqual(errors, []);
  let total = 0, verified = 0;
  for (const c of adapter.controls) for (const e of c.assessment_odps ?? []) { total++; if (e.nist_traceability?.status === 'VERIFIED') verified++; }
  assert.equal(adapter.statistics.local_odp_total, total);
  assert.equal(adapter.statistics.nist_traceability_status.VERIFIED, verified);
});

test('план АС-2: без сирих плейсхолдерів і дужок у resolved_objective та statement_text', async () => {
  const as2 = await read('data/FIXTURES/АС-2.json');
  const catalogs = {
    ndTzi,
    bpb: { service: await read('data/bpb_service.json'), open_confidential: await read('data/bpb_open_confidential.json') },
    exemptions: await read('data/as_class_exemptions.json'),
    genericDefaults: await read('data/generic_parameter_defaults.json'),
  };
  const assessmentCatalog = await read('data/assessment/assessment_catalog.json');
  const approvedState = { info_type: as2.info_type, profile: as2.profile, passport: { ics_name: 'АС-2', as_class: 2 } };
  const { items } = buildAssessmentPlan({ approvedState, catalogs, assessmentCatalog, adapter });
  const bad = [];
  for (const it of items) {
    if (/<[A-Z]{2}-?\d/.test(it.resolved_objective)) bad.push(`${it.assessment_source_id}: плейсхолдер у objective`);
    if (/\[(Призначення|Вибір|ВИБІР|Завдання)[::]/.test(it.resolved_objective)) bad.push(`${it.assessment_source_id}: дужка в objective`);
    if (/\[(Призначення|Вибір|Завдання)[::]/.test(it.statement_text ?? '')) bad.push(`${it.assessment_source_id}: дужка в statement_text`);
  }
  assert.deepEqual(bad, []);
});
