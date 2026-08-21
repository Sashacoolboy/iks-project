// test/assessment/au11-parameter.test.js
// Регресія: базовий AU-11 має параметр підстановки <AU-11_ODP період часу>,
// який був відсутній у словнику nd_tzi та адаптері (сирий текст [Призначення: …]).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { indexAdapter } from '../../core/assessment/odp-adapter.js';
import { buildAssessmentPlan } from '../../core/assessment/assessment-plan.js';

const read = async (p) => JSON.parse(await readFile(new URL(`../../${p}`, import.meta.url), 'utf8'));
const adapter = await read('data/assessment/assessment_odp_adapter.json');
const assessmentCatalog = await read('data/assessment/assessment_catalog.json');
const ndTzi = await read('data/nd_tzi.json');
const as2 = await read('data/FIXTURES/АС-2.json');
const catalogs = {
  ndTzi,
  bpb: { service: await read('data/bpb_service.json'), open_confidential: await read('data/bpb_open_confidential.json') },
  exemptions: await read('data/as_class_exemptions.json'),
  genericDefaults: await read('data/generic_parameter_defaults.json'),
};
const idx = indexAdapter(adapter);

test('nd_tzi: базовий AU-11 параметризований (au-11_odp.01)', () => {
  const au = ndTzi.document.security_families.find(f => f.family === 'AU' || true) && (() => {
    for (const fam of ndTzi.document.security_families)
      for (const c of fam.controls) if (c.id === 'AU-11') return c;
    return null;
  })();
  assert.ok(au, 'AU-11 відсутній у nd_tzi');
  assert.equal(au.catalog.parameters.length, 1);
  assert.equal(au.catalog.parameters[0].id, 'au-11_odp.01');
  const text = au.catalog.statement.items[0].text;
  assert.ok(text.includes('{{ insert: param, au-11_odp.01 }}'), 'плейсхолдер не вставлено');
  assert.ok(!/\[Призначення:/.test(text), 'сирий [Призначення: …] лишився у тексті');
});

test('adapter: AU-11_ODP → au-11_odp.01, VERIFIED traceability', () => {
  const hit = idx.byAssessmentId.get('AU-11_ODP');
  assert.ok(hit, 'AU-11_ODP відсутній в адаптері');
  assert.equal(hit.entry.local_odp_id, 'au-11_odp.01');
  assert.equal(hit.entry.nist_traceability.status, 'VERIFIED');
  assert.deepEqual(hit.entry.nist_traceability.odp_ids, ['AU-11_ODP']);
  assert.equal(idx.nistVerified.get('AU-11_ODP').entry.assessment_odp_id, 'AU-11_ODP');
});

test('план АС-2: AU-11 плейсхолдер опрацьовано, ODP релевантний', () => {
  const approvedState = { info_type: as2.info_type, profile: as2.profile, passport: { ics_name: 'АС-2', as_class: 2 } };
  const { items } = buildAssessmentPlan({ approvedState, catalogs, assessmentCatalog, adapter });
  const stmt = items.find(i => i.control_id === 'AU-11' && i.kind === 'STATEMENT');
  assert.ok(stmt, 'STATEMENT-рядок AU-11 відсутній у плані');
  const ph = stmt.placeholders.find(p => p.ref === 'AU-11_ODP');
  assert.ok(ph, 'плейсхолдер AU-11_ODP не знайдено');
  assert.notEqual(ph.resolution, 'REFERENCE_ONLY');
  assert.equal(ph.local_odp_id, 'au-11_odp.01');
  assert.ok(stmt.relevant_local_odp_ids.includes('au-11_odp.01'));
  // без значення в ЦПБ/БПБ/дефолтах — [НЕ ВИЗНАЧЕНО], не сирий текст
  if (ph.resolution === 'UNRESOLVED_VALUE') assert.ok(stmt.resolved_objective.includes('[НЕ ВИЗНАЧЕНО]'));
  const def = items.find(i => i.control_id === 'AU-11' && i.kind === 'ODP_DEFINITION');
  assert.ok(def.relevant_local_odp_ids.includes('au-11_odp.01'));
});

test('план АС-2: CPB override підставляється в AU-11', () => {
  const profile = { ...as2.profile, param_overrides: { ...(as2.profile.param_overrides ?? {}), 'au-11_odp.01': '1 рік' } };
  const approvedState = { info_type: as2.info_type, profile, passport: { ics_name: 'АС-2', as_class: 2 } };
  const { items } = buildAssessmentPlan({ approvedState, catalogs, assessmentCatalog, adapter });
  const stmt = items.find(i => i.control_id === 'AU-11' && i.kind === 'STATEMENT');
  assert.ok(stmt.resolved_objective.includes('1 рік'));
  const ph = stmt.placeholders.find(p => p.ref === 'AU-11_ODP');
  assert.equal(ph.resolution, 'SUBSTITUTED');
});
