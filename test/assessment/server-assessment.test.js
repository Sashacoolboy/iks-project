// test/assessment/server-assessment.test.js — v3 server routes (finalize, audit, read-only, migrate-on-read)
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { rmSync, mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

let proc;
const BASE = 'http://127.0.0.1:34569';
const ROOT = join(process.cwd());

before(async () => {
  mkdirSync('templates/approved', { recursive: true });
  writeFileSync('templates/approved/тест-v3-джерело.json', JSON.stringify({
    kind: 'approved', approved_at: '2026-01-01T00:00:00.000Z',
    summary: {}, state: {
      passport: { ics_name: 'Тест АС v3', as_class: 1 }, info_type: 'service',
      global_constants: {}, selected_assets: ['A-01'], risks: { accepted_base: [], custom: [] },
      profile: { param_overrides: {}, enhancements: [], excluded: [], exemption_overrides: [], exemption_note_overrides: {} },
    },
  }));
  proc = spawn('node', ['server.js'], { env: { ...process.env, PORT: '34569' } });
  await new Promise((res) => proc.stdout.on('data', (d) => d.toString().includes('listening') && res()));
});

after(() => {
  proc.kill();
  rmSync('templates/approved/тест-v3-джерело.json', { force: true });
  // Прибираємо лише те, що створив цей тест — НІКОЛИ не rmSync всієї assessments/
  if (createdId) {
    rmSync(join('assessments', createdId), { recursive: true, force: true });
    rmSync(join('exports/assessments', createdId + '.docx'), { force: true });
  }
  if (v1AssessmentId) {
    rmSync(join('assessments', v1AssessmentId), { recursive: true, force: true });
  }
});

let createdId;
let v1AssessmentId;

test('POST /api/assessments створює v3 assessment з snapshot hash, catalog-version.json, audit ASSESSMENT_CREATED', async () => {
  const r = await fetch(BASE + '/api/assessments', {
    method: 'POST',
    body: JSON.stringify({ approved_name: 'тест-v3-джерело', actor: 'Тестувальник' })
  });
  assert.equal(r.status, 201);
  const body = await r.json();
  assert.match(body.id, /^ASSESS-\d{4}-\d{3,4}$/);
  createdId = body.id;

  // Перевірка файлів на диску
  const dir = join(ROOT, 'assessments', createdId);
  assert.ok(existsSync(join(dir, 'assessment.json')), 'assessment.json має існувати');
  assert.ok(existsSync(join(dir, 'cpb-snapshot.json')), 'cpb-snapshot.json має існувати');
  assert.ok(existsSync(join(dir, 'catalog-version.json')), 'catalog-version.json має існувати');
  assert.ok(existsSync(join(dir, 'audit-log.json')), 'audit-log.json має існувати');

  // Перевірка assessment v3
  const a = JSON.parse(readFileSync(join(dir, 'assessment.json'), 'utf8'));
  assert.equal(a.schema_version, '3.0.0');
  assert.ok(a.cpb_snapshot.hash, 'cpb_snapshot.hash має бути встановлено');

  // Перевірка catalog-version.json
  const catVer = JSON.parse(readFileSync(join(dir, 'catalog-version.json'), 'utf8'));
  assert.ok(catVer.hashes['nd_tzi.json'], 'має містити хеш nd_tzi.json');
  assert.ok(catVer.hashes['assessment_odp_adapter.json'], 'має містити хеш assessment_odp_adapter.json');
  assert.ok(catVer.hashes['assessment_catalog.json'], 'має містити хеш assessment_catalog.json');
  assert.ok(catVer.hashes['assessment_reference.json'], 'має містити хеш assessment_reference.json');
  assert.ok(catVer.hashes['generic_parameter_defaults.json'], 'має містити хеш generic_parameter_defaults.json');

  // Перевірка audit-log
  const audit = JSON.parse(readFileSync(join(dir, 'audit-log.json'), 'utf8'));
  assert.ok(Array.isArray(audit), 'audit-log має бути масивом');
  assert.equal(audit.length, 1, 'має бути 1 запис');
  assert.equal(audit[0].action, 'ASSESSMENT_CREATED');
  assert.equal(audit[0].entity_id, createdId);
  assert.equal(audit[0].actor, 'Тестувальник');
});

test('GET /api/assessments/:id мігрує v1→v3 і перезаписує файл', async () => {
  // Створити вручну v1-файл
  v1AssessmentId = 'ASSESS-2026-999';
  const v1Dir = join(ROOT, 'assessments', v1AssessmentId);
  mkdirSync(join(v1Dir, 'evidence'), { recursive: true });

  const v1Assessment = {
    kind: 'assessment',
    id: v1AssessmentId,
    status: 'IN_PROGRESS',
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    metadata: { ics_name: 'v1 тест', as_class: 1, info_type: 'service', assessor_name: '' },
    cpb_snapshot: { approved_name: 'старе', state_hash: 'fake' },
    plan: { items: [] },
    results: [],
  };
  writeFileSync(join(v1Dir, 'assessment.json'), JSON.stringify(v1Assessment, null, 2));

  // GET має повернути v3
  const r = await fetch(BASE + '/api/assessments/' + v1AssessmentId);
  assert.equal(r.status, 200);
  const a = await r.json();
  assert.equal(a.schema_version, '3.0.0', 'GET має повернути v3');

  // Файл має бути перезаписано v3
  const reread = JSON.parse(readFileSync(join(v1Dir, 'assessment.json'), 'utf8'));
  assert.equal(reread.schema_version, '3.0.0', 'файл має бути перезаписано у v3');
});

test('PUT /api/assessments/:id оновлює результат і додає RESULT_UPDATED у audit', async () => {
  const a = await (await fetch(BASE + '/api/assessments/' + createdId)).json();
  // Оновити перший результат
  if (a.results.length > 0) {
    a.results[0].result = 'SATISFIED';
    a.results[0].implementation_narrative = 'Впроваджено';
    a.results[0].conclusion = 'Відповідає вимогам';
  }
  a.actor_name = 'Оцінювач';

  const r = await fetch(BASE + '/api/assessments/' + createdId, {
    method: 'PUT',
    body: JSON.stringify(a),
  });
  assert.equal(r.status, 200);

  // Перевірка audit-log
  const audit = JSON.parse(readFileSync(join(ROOT, 'assessments', createdId, 'audit-log.json'), 'utf8'));
  const resultUpdated = audit.filter(e => e.action === 'RESULT_UPDATED');
  assert.ok(resultUpdated.length > 0, 'має бути RESULT_UPDATED');
  assert.equal(resultUpdated[0].entity_id, createdId);
});

test('PUT server-owned fields: клієнт не може змінити status, cpb_snapshot тощо', async () => {
  const a = await (await fetch(BASE + '/api/assessments/' + createdId)).json();
  const originalStatus = a.status;
  const originalCpbHash = a.cpb_snapshot.hash;

  // Спроба змінити server-owned поля
  a.status = 'FINALIZED';
  a.cpb_snapshot.hash = 'fake-modified-hash';

  const r = await fetch(BASE + '/api/assessments/' + createdId, {
    method: 'PUT',
    body: JSON.stringify(a),
  });
  assert.equal(r.status, 200, 'PUT має пройти успішно');

  // GET і перевірити, що server-owned поля не змінилися
  const updated = await (await fetch(BASE + '/api/assessments/' + createdId)).json();
  assert.equal(updated.status, originalStatus, 'status має залишитися незмінним');
  assert.equal(updated.cpb_snapshot.hash, originalCpbHash, 'cpb_snapshot.hash має залишитися незмінним');
});

test('POST /api/assessments/:id/finalize з невалідними results → 400 з errors', async () => {
  // Встановити SATISFIED без evidence_ids — невалідно
  const a = await (await fetch(BASE + '/api/assessments/' + createdId)).json();
  if (a.results.length > 0) {
    a.results[0].result = 'SATISFIED';
    a.results[0].implementation_narrative = 'Реалізовано';
    a.results[0].evidence_ids = []; // Порожньо — невалідно для SATISFIED
  }
  await fetch(BASE + '/api/assessments/' + createdId, { method: 'PUT', body: JSON.stringify(a) });

  // Спроба фіналізації
  const r = await fetch(BASE + '/api/assessments/' + createdId + '/finalize', {
    method: 'POST',
    body: JSON.stringify({ finalized_by: 'Валідатор' }),
  });
  assert.equal(r.status, 400, 'має повернути 400');
  const body = await r.json();
  assert.ok(body.error, 'має містити error');
  assert.ok(Array.isArray(body.errors), 'має містити errors[]');
  assert.ok(body.errors.length > 0, 'має містити помилки валідації');
});

test('Валідний flow: додати evidence + finalize → 200', async () => {
  // Завантажити файл доказів
  const upR = await fetch(BASE + '/api/assessments/' + createdId + '/evidence?filename=EV-0001.txt', {
    method: 'POST',
    body: 'доказ реалізації',
  });
  assert.equal(upR.status, 200);

  // Оновити assessment — додати evidence у масив та evidence_id у результат
  const a = await (await fetch(BASE + '/api/assessments/' + createdId)).json();
  a.evidence.push({
    evidence_id: 'EV-0001',
    description: 'Доказ реалізації',
    artifacts: ['EV-0001.txt'],
  });
  if (a.results.length > 0) {
    a.results[0].result = 'SATISFIED';
    a.results[0].implementation_narrative = 'Впроваджено';
    a.results[0].evidence_ids = ['EV-0001'];
  }
  await fetch(BASE + '/api/assessments/' + createdId, { method: 'PUT', body: JSON.stringify(a) });

  // Фіналізація
  const finR = await fetch(BASE + '/api/assessments/' + createdId + '/finalize', {
    method: 'POST',
    body: JSON.stringify({ finalized_by: 'Головний оцінювач' }),
  });
  assert.equal(finR.status, 200, 'фіналізація має бути успішною');

  // Перевірка статусу
  const finalized = await (await fetch(BASE + '/api/assessments/' + createdId)).json();
  assert.equal(finalized.status, 'FINALIZED');
  assert.ok(finalized.finalized_at, 'finalized_at має бути встановлено');
  assert.equal(finalized.finalized_by, 'Головний оцінювач');

  // Перевірка audit
  const audit = JSON.parse(readFileSync(join(ROOT, 'assessments', createdId, 'audit-log.json'), 'utf8'));
  const finalizedEntry = audit.find(e => e.action === 'ASSESSMENT_FINALIZED');
  assert.ok(finalizedEntry, 'має бути ASSESSMENT_FINALIZED у audit');
  assert.equal(finalizedEntry.actor, 'Головний оцінювач');
});

test('Після finalize: PUT → 409, POST evidence → 409, DELETE evidence → 409', async () => {
  const a = await (await fetch(BASE + '/api/assessments/' + createdId)).json();

  // PUT → 409
  if (a.results && a.results.length > 0) {
    a.results[0].conclusion = 'Спроба зміни';
  }
  const putR = await fetch(BASE + '/api/assessments/' + createdId, { method: 'PUT', body: JSON.stringify(a) });
  assert.equal(putR.status, 409, 'PUT має бути заборонено');

  // POST evidence → 409
  const postR = await fetch(BASE + '/api/assessments/' + createdId + '/evidence?filename=NEW.txt', {
    method: 'POST', body: 'new',
  });
  assert.equal(postR.status, 409, 'POST evidence має бути заборонено');

  // DELETE evidence → 409
  const delR = await fetch(BASE + '/api/assessments/' + createdId + '/evidence/EV-0001.txt', { method: 'DELETE' });
  assert.equal(delR.status, 409, 'DELETE evidence має бути заборонено');
});

test('GET /api/assessments/:id/audit → entries у хронологічному порядку', async () => {
  const r = await fetch(BASE + '/api/assessments/' + createdId + '/audit');
  assert.equal(r.status, 200);
  const { entries } = await r.json();
  assert.ok(Array.isArray(entries), 'має повернути масив');
  assert.ok(entries.length >= 3, 'має бути принаймні 3 записи (CREATED, RESULT_UPDATED+, FINALIZED)');

  // Перевірка хронологічного порядку
  for (let i = 1; i < entries.length; i++) {
    assert.ok(entries[i - 1].timestamp <= entries[i].timestamp, 'має бути у хронологічному порядку');
  }

  // Перевірка наявності ключових дій
  const actions = entries.map(e => e.action);
  assert.ok(actions.includes('ASSESSMENT_CREATED'));
  assert.ok(actions.includes('ASSESSMENT_FINALIZED'));
});
