import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { buildAssessmentReference, parseSelection } from '../../tools/build-assessment-reference.js';

const fixture = JSON.parse(await readFile(new URL('../../data/ASSESSMENT_SOURCES/ndtzi36006(1).json', import.meta.url), 'utf8'));

test('parseSelection розбирає [ВИБІР: …]', () => {
  assert.deepEqual(parseSelection('[ВИБІР: Політика контролю доступу; план захисту інформації].'),
    ['Політика контролю доступу', 'план захисту інформації']);
  assert.deepEqual(parseSelection('просто текст'), ['просто текст']);
});

test('buildAssessmentReference: структура і нормативний текст без змін', () => {
  const ref = buildAssessmentReference(fixture);
  assert.equal(Object.keys(ref.families).length, 20);
  assert.equal(ref.families.AC.title, 'УПРАВЛІННЯ ДОСТУПОМ');
  assert.equal(ref.controls.length, 1192);
  const ac02 = ref.controls.find(c => c.control_id === 'AC-02');
  assert.equal(ac02.determinations.length, 36);
  const dsE = ac02.determinations.find(d => d.code === 'AC-02e');
  assert.equal(dsE.text, 'для запитів на створення облікових записів потрібні схвалення від <AC-02_ODP[03] персоналу або ролей>;');
  assert.equal(ac02.examine_objects[0], 'Політика контролю доступу');
  const total = ref.controls.reduce((n, c) => n + c.determinations.length, 0);
  assert.equal(total, 4238);
});

test('згенерований файл існує і збігається з builder-ом', async () => {
  const onDisk = JSON.parse(await readFile(new URL('../../data/assessment/assessment_reference.json', import.meta.url), 'utf8'));
  assert.deepEqual(onDisk.controls.find(c => c.control_id === 'AC-02'),
    buildAssessmentReference(fixture).controls.find(c => c.control_id === 'AC-02'));
});
