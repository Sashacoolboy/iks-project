import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { rmSync } from 'node:fs';

let proc;
const BASE = 'http://127.0.0.1:34567';

before(async () => {
  proc = spawn('node', ['server.js'], { env: { ...process.env, PORT: '34567' } });
  await new Promise((res) => proc.stdout.on('data', (d) => d.toString().includes('listening') && res()));
});
after(() => {
  proc.kill();
  rmSync('templates/ics/тест-шаблон.json', { force: true });
  rmSync('templates/cpb/тест-дск.json', { force: true });
  rmSync('templates/cpb/тест-відкрита.json', { force: true });
  rmSync('templates/approved/тест-затверджений.json', { force: true });
  rmSync('dictionary/odp_dictionary.json', { force: true });
});

test('віддає index.html', async () => {
  const r = await fetch(BASE + '/');
  assert.equal(r.status, 200);
  assert.match(await r.text(), /<html/i);
});

test('віддає каталог даних', async () => {
  const r = await fetch(BASE + '/data/assets_catalog.json');
  assert.equal((await r.json()).assets.length, 13);
});

test('шаблони: POST → список → GET', async () => {
  const tpl = { kind: 'ics', passport: { ics_name: 'Т', cert_body: '', as_class: 1 }, global_constants: {}, selected_assets: [] };
  const p = await fetch(BASE + '/api/templates/ics/тест-шаблон', { method: 'POST', body: JSON.stringify(tpl) });
  assert.equal(p.status, 200);
  const list = await (await fetch(BASE + '/api/templates/ics')).json();
  assert.ok(list.names.includes('тест-шаблон'));
  const got = await (await fetch(BASE + '/api/templates/ics/тест-шаблон')).json();
  assert.equal(got.passport.ics_name, 'Т');
});

test('відхиляє небезпечні імена', async () => {
  const r = await fetch(BASE + '/api/templates/ics/..%2Fevil', { method: 'POST', body: '{}' });
  assert.equal(r.status, 400);
});

test('список cpb-шаблонів містить info_type для фільтрації', async () => {
  const mk = (info_type) => ({ kind: 'cpb', info_type, profile: { param_overrides: {}, enhancements: [], excluded: [], exemption_overrides: [] } });
  await fetch(BASE + '/api/templates/cpb/тест-дск', { method: 'POST', body: JSON.stringify(mk('service')) });
  await fetch(BASE + '/api/templates/cpb/тест-відкрита', { method: 'POST', body: JSON.stringify(mk('open_confidential')) });
  const list = await (await fetch(BASE + '/api/templates/cpb')).json();
  const byName = Object.fromEntries(list.items.map(i => [i.name, i.info_type]));
  assert.equal(byName['тест-дск'], 'service');
  assert.equal(byName['тест-відкрита'], 'open_confidential');
});

test('словник ODP: record → GET накопичує значення', async () => {
  const rec = { paramId: 'test_odp.01', label: 'тестова частота', source_text: '[П]', value: 'щорічно' };
  const p1 = await fetch(BASE + '/api/dictionary/record', { method: 'POST', body: JSON.stringify(rec) });
  assert.equal(p1.status, 200);
  await fetch(BASE + '/api/dictionary/record', { method: 'POST', body: JSON.stringify(rec) });
  const dict = await (await fetch(BASE + '/api/dictionary')).json();
  assert.equal(dict.entries['test_odp.01'].values[0].value, 'щорічно');
  assert.equal(dict.entries['test_odp.01'].values[0].count, 2);
  const bad = await fetch(BASE + '/api/dictionary/record', { method: 'POST', body: JSON.stringify({ value: 'x' }) });
  assert.equal(bad.status, 400);
});

test('словник ODP: verdict валідується (VALID/INVALID або відсутній)', async () => {
  const okRec = { paramId: 'test_odp.02', label: 'мітка', value: 'значення', verdict: 'VALID' };
  const ok = await fetch(BASE + '/api/dictionary/record', { method: 'POST', body: JSON.stringify(okRec) });
  assert.equal(ok.status, 200);
  const dict = await (await fetch(BASE + '/api/dictionary')).json();
  assert.deepEqual(dict.entries['test_odp.02'].values[0].verdict_counts, { VALID: 1, INVALID: 0 });

  const badRec = { paramId: 'test_odp.03', label: 'мітка', value: 'значення', verdict: 'MAYBE' };
  const bad = await fetch(BASE + '/api/dictionary/record', { method: 'POST', body: JSON.stringify(badRec) });
  assert.equal(bad.status, 400);

  const invalidRec = { paramId: 'test_odp.04', label: 'мітка', value: 'значення', verdict: 'INVALID' };
  const invalidResp = await fetch(BASE + '/api/dictionary/record', { method: 'POST', body: JSON.stringify(invalidRec) });
  assert.equal(invalidResp.status, 200);
  const dict2 = await (await fetch(BASE + '/api/dictionary')).json();
  assert.equal(dict2.entries['test_odp.04'].values[0].verdict_counts.INVALID, 1);
});

test('затверджені профілі: POST → список з метаданими', async () => {
  const rec = { kind: 'approved', approved_at: '2026-08-11T10:00:00Z',
    summary: { total: 100, autofilled: 40, risks_count: 9 },
    state: { passport: { ics_name: 'ІКС-Затв', cert_body: 'X', as_class: 2 }, global_constants: {},
      selected_assets: ['A-01'], risks: { accepted_base: [], custom: [] }, info_type: 'service',
      profile: { param_overrides: {}, enhancements: [], excluded: [], exemption_overrides: [] } } };
  const p = await fetch(BASE + '/api/templates/approved/тест-затверджений', { method: 'POST', body: JSON.stringify(rec) });
  assert.equal(p.status, 200);
  const list = await (await fetch(BASE + '/api/templates/approved')).json();
  const it = list.items.find(i => i.name === 'тест-затверджений');
  assert.equal(it.ics_name, 'ІКС-Затв');
  assert.equal(it.as_class, 2);
  assert.equal(it.info_type, 'service');
  assert.equal(it.summary.total, 100);
});
