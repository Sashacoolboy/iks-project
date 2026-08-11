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
after(() => { proc.kill(); rmSync('templates/ics/тест-шаблон.json', { force: true }); });

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
