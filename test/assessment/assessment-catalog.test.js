import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { buildAssessmentCatalog, extractOdpRefs, splitStatementPath } from '../../tools/build-assessment-catalog.js';

const reference = JSON.parse(await readFile(new URL('../../data/assessment/assessment_reference.json', import.meta.url), 'utf8'));

test('splitStatementPath', () => {
  assert.deepEqual(splitStatementPath('AC-02', 'AC-02e'), { kind: 'STATEMENT', statement_path: 'e' });
  assert.deepEqual(splitStatementPath('AC-02', 'AC-02a.[01]'), { kind: 'STATEMENT', statement_path: 'a.[01]' });
  assert.deepEqual(splitStatementPath('AC-02', 'AC-02_ODP[01]'), { kind: 'ODP_DEFINITION', statement_path: null });
});

test('extractOdpRefs', () => {
  assert.deepEqual(extractOdpRefs('схвалення від <AC-02_ODP[03] персоналу або ролей>;'), ['AC-02_ODP[03]']);
  assert.deepEqual(extractOdpRefs('без плейсхолдерів'), []);
});

test('каталог: повне покриття, AC-02e item', () => {
  const cat = buildAssessmentCatalog(reference);
  assert.equal(cat.schema.version, '3.0.0');
  assert.equal(cat.controls.length, 1192);
  const totalItems = cat.controls.reduce((n, c) => n + c.items.length, 0);
  assert.equal(totalItems, 4213);
  const ac02 = cat.controls.find(c => c.control_id === 'AC-02');
  assert.equal(ac02.canonical_control_id, 'AC-2');
  assert.equal(ac02.family_title, 'УПРАВЛІННЯ ДОСТУПОМ');
  const e = ac02.items.find(i => i.assessment_source_id === 'AC-02e');
  assert.equal(e.statement_path, 'e');
  assert.deepEqual(e.assessment_odp_refs, ['AC-02_ODP[03]']);
  assert.ok(e.methods.EXAMINE.objects.includes('Політика контролю доступу'));
  assert.ok(e.methods.TEST.objects.length > 0);
});

test('згенерований файл на диску відповідає builder-у', async () => {
  const onDisk = JSON.parse(await readFile(new URL('../../data/assessment/assessment_catalog.json', import.meta.url), 'utf8'));
  assert.equal(onDisk.controls.reduce((n, c) => n + c.items.length, 0), 4213);
  assert.deepEqual(onDisk.methods_labels, { EXAMINE: 'Дослідження', INTERVIEW: 'Співбесіда', TEST: 'Перевірка' });
});
