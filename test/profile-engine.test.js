import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildProfile, INFO_TYPES } from '../core/profile-engine.js';
import { labelKey } from '../core/odp-dictionary.js';

const read = (p) => JSON.parse(readFileSync(new URL(`../data/${p}`, import.meta.url)));
const catalogs = {
  ndTzi: read('nd_tzi.json'),
  bpb: { service: read('bpb_service.json'), open_confidential: read('bpb_open_confidential.json') },
  exemptions: read('as_class_exemptions.json'),
  policyMapping: read('policy_mapping.json'),
  genericDefaults: read('generic_parameter_defaults.json'),
};
const baseState = {
  passport: { as_class: 1 },
  global_constants: {},
  info_type: 'service',
  profile: { param_overrides: {}, enhancements: [], excluded: [], exemption_overrides: [] },
};

test('service-каталог дає 100 пунктів, open_confidential — 85', () => {
  assert.equal(buildProfile(baseState, catalogs).items.length, 100);
  assert.equal(buildProfile({ ...baseState, info_type: 'open_confidential' }, catalogs).items.length, 85);
});

test('на АС-1 пункти з exemption мають статус Виконано архітектурно і примітку', () => {
  const doc = buildProfile(baseState, catalogs);
  const exempted = doc.items.filter(i => i.status === 'Виконано архітектурно');
  assert.ok(exempted.length > 0);
  assert.ok(exempted.every(i => i.exemptionNote?.length > 30));
  assert.equal(doc.summary.exempted, exempted.length);
});

test('на АС-3 ті самі пункти застосовуються звичайно', () => {
  const doc = buildProfile({ ...baseState, passport: { as_class: 3 } }, catalogs);
  assert.equal(doc.items.filter(i => i.status === 'Виконано архітектурно').length, 0);
});

test('exemption_overrides повертає пункт у Застосовується', () => {
  const doc1 = buildProfile(baseState, catalogs);
  const key = doc1.items.find(i => i.status === 'Виконано архітектурно').key;
  const doc2 = buildProfile({ ...baseState, profile: { ...baseState.profile, exemption_overrides: [key] } }, catalogs);
  assert.equal(doc2.items.find(i => i.key === key).status, 'Застосовується (автозаповнено)');
});

test('глобальна політика підставляється у текст', () => {
  const pm = catalogs.policyMapping.global_constants.find(g => g.odp_params.length > 0);
  const state = { ...baseState, global_constants: { [pm.key]: 'ТЕСТ-ЗНАЧЕННЯ-123' } };
  const doc = buildProfile(state, catalogs);
  const hit = doc.items.some(i => i.controls.some(c => c.statementLines.some(l => l.text.includes('ТЕСТ-ЗНАЧЕННЯ-123'))));
  assert.ok(hit);
});

test('state_secret не має каталогу', () => {
  assert.equal(INFO_TYPES.state_secret, null);
});

test('emptyParams не містить дублікатів', () => {
  const doc = buildProfile(baseState, catalogs);
  for (const item of doc.items)
    for (const c of item.controls)
      assert.equal(new Set(c.emptyParams).size, c.emptyParams.length);
});

test('контролі пункту не дублюються (AC:1 — база один раз + посилення власними текстами)', () => {
  const doc = buildProfile(baseState, catalogs);
  for (const item of doc.items) {
    const ids = item.controls.map(c => c.id);
    assert.equal(new Set(ids).size, ids.length, `дублікати у ${item.key}: ${ids}`);
  }
  const ac1 = doc.items.find(i => i.key === 'AC:1');
  assert.equal(ac1.controls.filter(c => c.id === 'AC-2').length, 1);
  const mandated = ac1.controls.filter(c => c.isEnhancement);
  assert.ok(mandated.length >= 1);
  assert.ok(mandated.every(c => c.statementLines.length > 0 && c.title.length > 0));
});

test('додане користувачем посилення має рендерені рядки тексту', () => {
  const state = { ...baseState, profile: { ...baseState.profile, enhancements: ['AC-2(1)'] } };
  const doc = buildProfile(state, catalogs);
  const ac1 = doc.items.find(i => i.key === 'AC:1');
  const enh = ac1.enhancements.find(e => e.id === 'AC-2(1)');
  assert.ok(enh, 'посилення відсутнє');
  assert.ok(enh.lines.length > 0 && enh.lines[0].text.length > 0);
});

test('BPB-обов’язкове посилення не дублюється в user-посиленнях', () => {
  const state = { ...baseState, profile: { ...baseState.profile, enhancements: ['AC-2(3)'] } };
  const doc = buildProfile(state, catalogs);
  const ac1 = doc.items.find(i => i.key === 'AC:1');
  assert.equal(ac1.enhancements.filter(e => e.id === 'AC-2(3)').length, 0);
  assert.equal(ac1.controls.filter(c => c.id === 'AC-2(3)').length, 1);
});

test('exemption_note_overrides замінює текст примітки', () => {
  const doc1 = buildProfile(baseState, catalogs);
  const key = doc1.items.find(i => i.status === 'Виконано архітектурно').key;
  const state = { ...baseState, profile: { ...baseState.profile,
    exemption_note_overrides: { [key]: 'Власне обґрунтування організації.' } } };
  const doc2 = buildProfile(state, catalogs);
  assert.equal(doc2.items.find(i => i.key === key).exemptionNote, 'Власне обґрунтування організації.');
});

test('порожній параметр несе info з source_text для тултіпа', () => {
  const doc = buildProfile(baseState, catalogs);
  let found = false;
  for (const item of doc.items)
    for (const c of item.controls)
      for (const l of c.statementLines)
        for (const p of l.parts)
          if (p.type === 'param' && p.source === 'empty' && p.info?.source_text) found = true;
  assert.ok(found, 'жоден порожній параметр не має info.source_text');
});

test('відповідь на динамічне питання (словник ODP) підставляється як політика', () => {
  // знайти реально порожній параметр і його мітку
  const doc0 = buildProfile(baseState, catalogs);
  let target = null;
  outer: for (const item of doc0.items)
    for (const c of item.controls)
      for (const l of c.statementLines)
        for (const p of l.parts)
          if (p.type === 'param' && p.source === 'empty' && p.info?.label) { target = p; break outer; }
  assert.ok(target, 'немає порожнього параметра для тесту');
  const odpDictionary = {
    entries: { [target.paramId]: { label: target.info.label, source_text: '', values: [{ value: 'x', count: 1 }] } } };
  const dynKey = 'dyn:' + labelKey(target.info.label);
  const state = { ...baseState, global_constants: { [dynKey]: 'ДИНАМІЧНЕ-42' } };
  const doc = buildProfile(state, { ...catalogs, odpDictionary });
  const hit = doc.items.some(i => i.controls.some(c => c.statementLines.some(l => l.text.includes('ДИНАМІЧНЕ-42'))));
  assert.ok(hit, 'динамічна відповідь не потрапила у текст');
});

const threatsRisks = read('threats_risks.json');
const emptyRisksState = { accepted_base: [], base_overrides: {}, hidden_base: [], defaulted_assets: [], custom: [] };

test('additional_controls: порожній, якщо risks/threatsRisks не передано (зворотна сумісність)', () => {
  const doc = buildProfile(baseState, catalogs);
  assert.deepEqual(doc.additional_controls, []);
});

test('additional_controls: кастомний ризик з control_ref поза БПБ зʼявляється окремо', () => {
  const state = { ...baseState, selected_assets: ['A-01'],
    risks: { ...emptyRisksState, custom: [{ id: 'C-001', custom: true, asset_id: 'A-01',
      threat: 'Т', vulnerability: 'В', impact: 3, likelihood: 0.5, control_refs: ['AC-9'] }] } };
  const doc = buildProfile(state, { ...catalogs, threatsRisks });
  assert.equal(doc.additional_controls.length, 1);
  assert.equal(doc.additional_controls[0].id, 'AC-9');
  assert.equal(doc.additional_controls[0].family, 'AC');
  assert.deepEqual(doc.additional_controls[0].risk_ids, ['C-001']);
});

test('additional_controls: control_ref, що вже мандований БПБ, не дублюється', () => {
  const state = { ...baseState, selected_assets: ['A-01'],
    risks: { ...emptyRisksState, custom: [{ id: 'C-001', custom: true, asset_id: 'A-01',
      threat: 'Т', vulnerability: 'В', impact: 3, likelihood: 0.5, control_refs: ['AC-2'] }] } };
  const doc = buildProfile(state, { ...catalogs, threatsRisks });
  assert.equal(doc.additional_controls.length, 0);
});

test('additional_controls: override базового ризику з control_ref поза БПБ зʼявляється окремо', () => {
  const r0 = threatsRisks.risks.find(r => r.asset_id === 'A-01');
  const state = { ...baseState, selected_assets: ['A-01'],
    risks: { ...emptyRisksState, accepted_base: [r0.id], base_overrides: { [r0.id]: { control_refs: ['AC-9'] } } } };
  const doc = buildProfile(state, { ...catalogs, threatsRisks });
  assert.equal(doc.additional_controls.length, 1);
  assert.equal(doc.additional_controls[0].id, 'AC-9');
  assert.deepEqual(doc.additional_controls[0].risk_ids, [r0.id]);
});

test('additional_controls: два ризики з однаковим позабпбшним control_ref обʼєднуються в один запис', () => {
  const r0 = threatsRisks.risks.find(r => r.asset_id === 'A-01');
  const state = { ...baseState, selected_assets: ['A-01'],
    risks: { ...emptyRisksState, accepted_base: [r0.id], base_overrides: { [r0.id]: { control_refs: ['AC-9'] } },
      custom: [{ id: 'C-001', custom: true, asset_id: 'A-01', threat: 'Т', vulnerability: 'В',
        impact: 3, likelihood: 0.5, control_refs: ['AC-9'] }] } };
  const doc = buildProfile(state, { ...catalogs, threatsRisks });
  assert.equal(doc.additional_controls.length, 1);
  assert.deepEqual(doc.additional_controls[0].risk_ids.sort(), [r0.id, 'C-001'].sort());
});

test('additional_controls: CA-*/PT-* групуються за власним БПБ-класом, а не за nd_tzi родиною', () => {
  const state = { ...baseState, selected_assets: ['A-01'],
    risks: { ...emptyRisksState, custom: [{ id: 'C-001', custom: true, asset_id: 'A-01',
      threat: 'Т', vulnerability: 'В', impact: 3, likelihood: 0.5, control_refs: ['CA-4'] }] } };
  const doc = buildProfile(state, { ...catalogs, threatsRisks });
  assert.equal(doc.items.filter(i => i.classId === 'CA' && i.controls.some(c => c.id === 'CA-4')).length, 0,
    'CA-4 не має бути мандований БПБ-профілем для цього тесту');
  assert.equal(doc.additional_controls.length, 1);
  assert.equal(doc.additional_controls[0].family, 'CA');
  assert.equal(doc.additional_controls[0].familyName, 'Оцінювання, акредитація та моніторинг безпеки');
});

test('additional_controls: контроль виключеної (excluded) дії не зникає безслідно, а зʼявляється тут', () => {
  const doc1 = buildProfile(baseState, catalogs);
  const item = doc1.items.find(i => i.status === 'Застосовується (автозаповнено)' && i.controls.length > 0);
  const controlId = item.controls[0].id;
  const state = { ...baseState, selected_assets: ['A-01'],
    profile: { ...baseState.profile, excluded: [item.key] },
    risks: { ...emptyRisksState, custom: [{ id: 'C-001', custom: true, asset_id: 'A-01',
      threat: 'Т', vulnerability: 'В', impact: 3, likelihood: 0.5, control_refs: [controlId] }] } };
  const doc = buildProfile(state, { ...catalogs, threatsRisks });
  assert.equal(doc.items.find(i => i.key === item.key).status, 'Не застосовується (вручну)');
  assert.ok(doc.additional_controls.some(ac => ac.id === controlId),
    'контроль виключеної дії має зʼявитися в additional_controls, а не зникнути');
});
