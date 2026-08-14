// test/server-assessment.test.js
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { rmSync, mkdirSync, writeFileSync } from 'node:fs';

let proc;
const BASE = 'http://127.0.0.1:34568';

before(async () => {
  mkdirSync('templates/approved', { recursive: true });
  writeFileSync('templates/approved/тест-оцінка-джерело.json', JSON.stringify({
    kind: 'approved', approved_at: '2026-01-01T00:00:00.000Z',
    summary: {}, state: {
      passport: { ics_name: 'Тест АС', as_class: 1 }, info_type: 'service',
      global_constants: {}, selected_assets: ['A-01'], risks: { accepted_base: [], custom: [] },
      profile: { param_overrides: {}, enhancements: [], excluded: [], exemption_overrides: [], exemption_note_overrides: {} },
    },
  }));
  proc = spawn('node', ['server.js'], { env: { ...process.env, PORT: '34568' } });
  await new Promise((res) => proc.stdout.on('data', (d) => d.toString().includes('listening') && res()));
});
after(() => {
  proc.kill();
  rmSync('templates/approved/тест-оцінка-джерело.json', { force: true });
  rmSync('assessments', { recursive: true, force: true });
  rmSync('exports/assessments', { recursive: true, force: true });
});

let createdId;

test('POST /api/assessments створює оцінювання зі затвердженого запису', async () => {
  const r = await fetch(BASE + '/api/assessments', { method: 'POST', body: JSON.stringify({ approved_name: 'тест-оцінка-джерело' }) });
  assert.equal(r.status, 201);
  const body = await r.json();
  assert.match(body.id, /^ASSESS-\d{4}-\d{3}$/);
  createdId = body.id;
});

test('GET /api/assessments/:id повертає повний assessment зі знімком items', async () => {
  const r = await fetch(BASE + '/api/assessments/' + createdId);
  assert.equal(r.status, 200);
  const a = await r.json();
  assert.equal(a.kind, 'assessment');
  assert.ok(a.items.length > 0);
});

test('GET /api/assessments містить створений запис у списку', async () => {
  const r = await fetch(BASE + '/api/assessments');
  const { items } = await r.json();
  assert.ok(items.some(i => i.id === createdId));
});

test('PUT /api/assessments/:id зберігає зміни', async () => {
  const got = await (await fetch(BASE + '/api/assessments/' + createdId)).json();
  got.metadata.assessor_name = 'Петренко П.П.';
  const r = await fetch(BASE + '/api/assessments/' + createdId, { method: 'PUT', body: JSON.stringify(got) });
  assert.equal(r.status, 200);
  const reGot = await (await fetch(BASE + '/api/assessments/' + createdId)).json();
  assert.equal(reGot.metadata.assessor_name, 'Петренко П.П.');
});

test('PUT відхиляє некоректний assessment (400)', async () => {
  const r = await fetch(BASE + '/api/assessments/' + createdId, { method: 'PUT', body: JSON.stringify({ kind: 'wrong' }) });
  assert.equal(r.status, 400);
});

test('POST evidence зберігає файл, DELETE прибирає', async () => {
  const up = await fetch(BASE + '/api/assessments/' + createdId + '/evidence?filename=EV-0001.txt', {
    method: 'POST', body: 'доказ' });
  assert.equal(up.status, 200);
  const del = await fetch(BASE + '/api/assessments/' + createdId + '/evidence/EV-0001.txt', { method: 'DELETE' });
  assert.equal(del.status, 200);
});

test('POST evidence відхиляє заборонене розширення', async () => {
  const r = await fetch(BASE + '/api/assessments/' + createdId + '/evidence?filename=evil.exe', { method: 'POST', body: 'x' });
  assert.equal(r.status, 400);
});

test('POST evidence відхиляє path traversal у імені файлу', async () => {
  const r = await fetch(BASE + '/api/assessments/' + createdId + '/evidence?filename=..%2F..%2Fevil.txt', { method: 'POST', body: 'x' });
  assert.equal(r.status, 400);
});

test('POST export/docx повертає DOCX', async () => {
  const r = await fetch(BASE + '/api/assessments/' + createdId + '/export/docx', { method: 'POST' });
  assert.equal(r.status, 200);
  assert.match(r.headers.get('content-type'), /wordprocessingml/);
});
