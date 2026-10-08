import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const ref = JSON.parse(await readFile(new URL('../../data/assessment/checklist_reference.json', import.meta.url), 'utf8'));

const AT_IDS = ['AT-1', 'AT-2', 'AT-2(1)', 'AT-2(2)', 'AT-2(3)', 'AT-2(4)', 'AT-2(5)', 'AT-2(6)',
  'AT-3', 'AT-3(1)', 'AT-3(2)', 'AT-3(3)', 'AT-3(5)', 'AT-4', 'AT-6'];

test('довідник містить рівно 15 записів родини AT (AT-3(4) і AT-5 вилучені з НД ТЗІ — пропущені навмисно)', () => {
  assert.equal(Object.keys(ref.entries).length, 15);
  assert.deepEqual(Object.keys(ref.entries).sort(), [...AT_IDS].sort());
});

test('кожен запис має непорожній масив statements, control_title і статус DRAFT_HEURISTIC', () => {
  for (const id of AT_IDS) {
    const e = ref.entries[id];
    assert.ok(e, `${id} має бути в довіднику`);
    assert.ok(e.control_title?.length > 0, `${id}: control_title`);
    assert.ok(Array.isArray(e.statements) && e.statements.length > 0, `${id}: statements має бути непорожнім масивом`);
    for (const s of e.statements) assert.ok(s.length > 10, `${id}: кожен пункт перевірки має бути змістовним`);
    assert.ok(e.source_requirement_text?.length > 0, `${id}: source_requirement_text`);
    assert.equal(e.status, 'DRAFT_HEURISTIC');
  }
});

test('плейсхолдери {{ insert: param, ... }} у statements — лише ті, що реально є в НД ТЗІ для цього заходу', () => {
  assert.ok(ref.entries['AT-2'].statements.some(s => s.includes('{{ insert: param, at-2_odp.01 }}')));
  assert.ok(ref.entries['AT-2(4)'].statements.some(s => s.includes('{{ insert: param, at-2.4_odp.01 }}')));
});

test('AT-2 розбито на кілька окремих пунктів перевірки (не один суцільний текст)', () => {
  assert.ok(ref.entries['AT-2'].statements.length >= 4);
});
