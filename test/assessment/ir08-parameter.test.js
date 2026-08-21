// test/assessment/ir08-parameter.test.js
// Регресія IR-8(d): сирий [Призначення: …] розірвав структуру пунктів d/e у словнику,
// параметр не екстраговано; плейсхолдери каталогу без дефіса (<IR08_ODP[06] …>) не розпізнавались.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { indexAdapter } from '../../core/assessment/odp-adapter.js';
import { resolveAssessmentObjective } from '../../core/assessment/objective-resolver.js';
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

const ir08 = (() => {
  for (const fam of ndTzi.document.security_families)
    for (const c of fam.controls) if (c.id === 'IR-08') return c;
  return null;
})();

test('nd_tzi: структура IR-08 відновлена (a..e, без розірваного пункту d)', () => {
  const labels = ir08.catalog.statement.items.map(i => i.label);
  assert.deepEqual(labels, ['a.', 'b.', 'c.', 'd.', 'e.']);
  const d = ir08.catalog.statement.items[3];
  assert.ok(d.text.includes('{{ insert: param, ir-8_odp.04 }}'), 'плейсхолдер не вставлено у пункт d');
  assert.ok(!/\[Призначення:/.test(d.text), 'сирий [Призначення: …] лишився');
  assert.equal(ir08.catalog.parameters.length, 4);
  assert.equal(ir08.catalog.parameters[3].id, 'ir-8_odp.04');
});

test('adapter: IR-08_ODP[04] → ir-8_odp.04, VERIFIED до NIST [06]+[07]', () => {
  const hit = idx.byAssessmentId.get('IR-08_ODP[04]');
  assert.ok(hit, 'IR-08_ODP[04] відсутній в адаптері');
  assert.equal(hit.entry.local_odp_id, 'ir-8_odp.04');
  assert.equal(hit.entry.nist_traceability.status, 'VERIFIED');
  assert.deepEqual(hit.entry.nist_traceability.odp_ids, ['IR-08_ODP[06]', 'IR-08_ODP[07]']);
});

test('resolver: плейсхолдер без дефіса (<IR08_ODP[06] …>) розпізнається і нормалізується', () => {
  const tpl = 'зміни в плані реагування на інцидент повідомляються <IR08_ODP[06] персоналу з реагування на інциденти>;';
  const r = resolveAssessmentObjective({ objectiveTemplate: tpl, adapterIndex: idx,
    effectiveValueFor: (id) => id === 'ir-8_odp.04' ? { status: 'RESOLVED', value: 'CSIRT' } : { status: 'UNRESOLVED', value: null } });
  assert.ok(r.resolved_objective.includes('CSIRT'));
  assert.equal(r.placeholders[0].ref, 'IR-08_ODP[06]');
  assert.equal(r.placeholders[0].resolution, 'SUBSTITUTED');
});

test('план АС-2: IR-8(d) рядки без сирих <IR08_ODP…>, ODP релевантний', () => {
  const approvedState = { info_type: as2.info_type, profile: as2.profile, passport: { ics_name: 'АС-2', as_class: 2 } };
  const { items } = buildAssessmentPlan({ approvedState, catalogs, assessmentCatalog, adapter });
  const dRows = items.filter(i => i.control_id === 'IR-08' && /^\(d\)/.test(i.statement_path ?? ''));
  assert.equal(dRows.length, 2);
  for (const row of dRows) {
    assert.ok(!row.resolved_objective.includes('<IR08_ODP'), `сирий плейсхолдер: ${row.resolved_objective}`);
    assert.ok(row.relevant_local_odp_ids.includes('ir-8_odp.04'), `ODP не релевантний для ${row.assessment_source_id}`);
  }
});
