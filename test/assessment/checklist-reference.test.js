import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const ref = JSON.parse(await readFile(new URL('../../data/assessment/checklist_reference.json', import.meta.url), 'utf8'));

const AT_IDS = ['AT-1', 'AT-2', 'AT-2(1)', 'AT-2(2)', 'AT-2(3)', 'AT-2(4)', 'AT-2(5)', 'AT-2(6)',
  'AT-3', 'AT-3(1)', 'AT-3(2)', 'AT-3(3)', 'AT-3(5)', 'AT-4', 'AT-6'];

// Вилучені/об'єднані в НД ТЗІ заходи родини AC — не повинні мати запису в довіднику
const AC_WITHDRAWN = ['AC-2(10)', 'AC-3(1)', 'AC-3(6)', 'AC-4(16)', 'AC-4(18)', 'AC-7(1)', 'AC-13',
  'AC-15', 'AC-17(5)', 'AC-17(7)', 'AC-17(8)', 'AC-18(2)', 'AC-19(1)', 'AC-19(2)', 'AC-19(3)'];

// Вилучені/об'єднані в НД ТЗІ заходи родини IA (джерело позначає їх і "Вилучено", і "Виключено" —
// обидва варіанти написання трапляються в nd_tzi.json) — не повинні мати запису в довіднику
const IA_WITHDRAWN = ['IA-2(3)', 'IA-2(4)', 'IA-2(7)', 'IA-2(9)', 'IA-2(11)', 'IA-3(2)', 'IA-4(2)',
  'IA-4(3)', 'IA-4(7)', 'IA-5(3)', 'IA-5(4)', 'IA-5(11)', 'IA-8(3)', 'IA-9(1)', 'IA-9(2)'];

test('довідник містить точно 190 записів: 15 AT + 120 AC + 55 IA', () => {
  assert.equal(Object.keys(ref.entries).length, 190);
});

test('родина AT: точно 15 записів, без змін (AT-3(4) і AT-5 вилучені з НД ТЗІ — пропущені навмисно)', () => {
  const atIds = Object.keys(ref.entries).filter(id => id.startsWith('AT-'));
  assert.deepEqual(atIds.sort(), [...AT_IDS].sort());
});

test('родина AC: точно 120 записів (15 вилучених НД ТЗІ заходів відсутні навмисно)', () => {
  const acIds = Object.keys(ref.entries).filter(id => id.startsWith('AC-'));
  assert.equal(acIds.length, 120);
  for (const w of AC_WITHDRAWN) assert.ok(!ref.entries[w], `${w} вилучений з НД ТЗІ — не повинен бути в довіднику`);
});

test('родина IA: точно 55 записів (15 вилучених НД ТЗІ заходів відсутні навмисно)', () => {
  const iaIds = Object.keys(ref.entries).filter(id => id.startsWith('IA-'));
  assert.equal(iaIds.length, 55);
  for (const w of IA_WITHDRAWN) assert.ok(!ref.entries[w], `${w} вилучений з НД ТЗІ — не повинен бути в довіднику`);
});

test('кожен запис (усіх родин) має непорожній масив statements, control_title і статус DRAFT_HEURISTIC', () => {
  for (const [id, e] of Object.entries(ref.entries)) {
    assert.ok(e.control_title?.length > 0, `${id}: control_title`);
    assert.ok(Array.isArray(e.statements) && e.statements.length > 0, `${id}: statements має бути непорожнім масивом`);
    for (const s of e.statements) assert.ok(s.length > 10, `${id}: кожен пункт перевірки має бути змістовним`);
    assert.ok(e.source_requirement_text?.length > 0, `${id}: source_requirement_text`);
    assert.equal(e.status, 'DRAFT_HEURISTIC', `${id}: status`);
  }
});

test('плейсхолдери {{ insert: param, ... }} у statements — лише ті, що реально є в НД ТЗІ для цього заходу', () => {
  assert.ok(ref.entries['AT-2'].statements.some(s => s.includes('{{ insert: param, at-2_odp.01 }}')));
  assert.ok(ref.entries['AT-2(4)'].statements.some(s => s.includes('{{ insert: param, at-2.4_odp.01 }}')));
  assert.ok(ref.entries['AC-2'].statements.some(s => s.includes('{{ insert: param, ac-2_odp.01 }}')));
  assert.ok(ref.entries['IA-5(1)'].statements.some(s => s.includes('{{ insert: param, ia-5.1_odp.01 }}')));
});

test('AT-2, AC-2 і IA-5(1) розбито на кілька окремих пунктів перевірки (не один суцільний текст)', () => {
  assert.ok(ref.entries['AT-2'].statements.length >= 4);
  assert.ok(ref.entries['AC-2'].statements.length >= 4);
  assert.ok(ref.entries['IA-5(1)'].statements.length >= 4);
});

test('жоден плейсхолдер з source_requirement_text не загублено при розбитті на statements (усі родини)', () => {
  const PLACEHOLDER_RE = /\{\{\s*insert:\s*param,\s*([\w.-]+)\s*\}\}/g;
  for (const [id, e] of Object.entries(ref.entries)) {
    const sourceTokens = new Set([...e.source_requirement_text.matchAll(PLACEHOLDER_RE)].map(m => m[1]));
    const statementsText = e.statements.join(' ');
    for (const token of sourceTokens) {
      assert.ok(statementsText.includes(token), `${id}: плейсхолдер ${token} загублено при розбитті на statements`);
    }
  }
});

