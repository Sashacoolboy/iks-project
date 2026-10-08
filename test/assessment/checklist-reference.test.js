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

// Родина "AU" в nd_tzi.json об'єднує і AU-*, і CA-* канонічні id (так є у джерелі, не помилка).
const AU_WITHDRAWN = ['AU-2(1)', 'AU-2(2)', 'AU-2(3)', 'AU-2(4)', 'AU-3(2)', 'AU-6(2)', 'AU-6(10)',
  'AU-7(2)', 'AU-10(5)', 'AU-14(2)', 'AU-15', 'CA-3(1)', 'CA-3(2)', 'CA-3(3)', 'CA-3(4)', 'CA-3(5)',
  'CA-4', 'CA-7(2)'];

// НЕ: SC-7(4), SC-15, SC-42 виключені з цього списку — вони містять звичайне слово "виключення"/"виключеннями" (виняток) у
// змістовному тексті, а НЕ справжній маркер вилучення/об'єднання (слова «Вилучено»/«Виключено»
// в точній формі відсутні) — це справжні контролі і повинні мати записи в довіднику.
const SC_WITHDRAWN = ['SC-4(1)', 'SC-7(1)', 'SC-7(2)', 'SC-7(6)', 'SC-9', 'SC-12(4)', 'SC-12(5)',
  'SC-13(1)', 'SC-13(2)', 'SC-13(3)', 'SC-13(4)', 'SC-14', 'SC-19', 'SC-20(1)', 'SC-26(1)', 'SC-30(1)', 'SC-33'];

const SI_WITHDRAWN = ['SI-2(1)', 'SI-3(1)', 'SI-3(2)', 'SI-3(3)', 'SI-3(5)', 'SI-3(7)', 'SI-3(9)',
  'SI-4(6)', 'SI-4(8)', 'SI-7(4)', 'SI-7(13)', 'SI-7(14)', 'SI-9', 'SI-13(2)'];

const SA_WITHDRAWN = ['SA-4(4)', 'SA-5(1)', 'SA-5(2)', 'SA-5(3)', 'SA-5(4)', 'SA-5(5)', 'SA-6', 'SA-7',
  'SA-12', 'SA-13', 'SA-14', 'SA-14(1)', 'SA-15(4)', 'SA-15(9)', 'SA-18', 'SA-19', 'SA-21(1)'];

const CM_WITHDRAWN = ['CM-2(1)', 'CM-2(4)', 'CM-2(5)', 'CM-5(2)', 'CM-5(3)', 'CM-5(7)', 'CM-6(3)',
  'CM-6(4)', 'CM-8(5)', 'CM-11(1)'];

// Джерело також використовує третій корінь для маркера вилучення/об'єднання: "відкликати" (точне слово «Відкликано»).
// CP-2(4) = "[Відкликано: включено до CP-2(3)]" — справжній маркер, не помилка.
const CP_WITHDRAWN = ['CP-2(4)', 'CP-5', 'CP-7(5)', 'CP-9(4)', 'CP-10(1)', 'CP-10(3)', 'CP-10(5)'];

const IR_WITHDRAWN = ['IR-9(1)', 'IR-10'];

const PE_WITHDRAWN = ['PE-3(6)', 'PE-7'];

test('довідник містить точно 783 записи: 15 AT + 120 AC + 55 IA + 81 AU/CA + 102 SC + 87 SI + 106 SA + 56 CM + 49 CP + 39 IR + 38 PE + 35 PM', () => {
  assert.equal(Object.keys(ref.entries).length, 783);
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

test('родина AU: точно 81 запис (AU-*+CA-*, 18 вилучених НД ТЗІ заходів відсутні навмисно)', () => {
  const auIds = Object.keys(ref.entries).filter(id => id.startsWith('AU-') || id.startsWith('CA-'));
  assert.equal(auIds.length, 81);
  for (const w of AU_WITHDRAWN) assert.ok(!ref.entries[w], `${w} вилучений з НД ТЗІ — не повинен бути в довіднику`);
});

test('родина SC: точно 102 записи (17 справжніх вилучених НД ТЗІ заходів відсутні навмисно; SC-7(4)/SC-15/SC-42 — реальні контролі, не вилучені, незважаючи на слово «виключення» у тексті)', () => {
  const scIds = Object.keys(ref.entries).filter(id => id.startsWith('SC-'));
  assert.equal(scIds.length, 102);
  for (const w of SC_WITHDRAWN) assert.ok(!ref.entries[w], `${w} вилучений з НД ТЗІ — не повинен бути в довіднику`);
  for (const id of ['SC-7(4)', 'SC-15', 'SC-42']) assert.ok(ref.entries[id], `${id} — реальний контроль, має бути в довіднику`);
});

test('родина SI: точно 87 записів (14 вилучених НД ТЗІ заходів відсутні навмисно)', () => {
  const siIds = Object.keys(ref.entries).filter(id => id.startsWith('SI-'));
  assert.equal(siIds.length, 87);
  for (const w of SI_WITHDRAWN) assert.ok(!ref.entries[w], `${w} вилучений з НД ТЗІ — не повинен бути в довіднику`);
});

test('родина SA: точно 106 записів (17 вилучених НД ТЗІ заходів відсутні навмисно)', () => {
  const saIds = Object.keys(ref.entries).filter(id => id.startsWith('SA-'));
  assert.equal(saIds.length, 106);
  for (const w of SA_WITHDRAWN) assert.ok(!ref.entries[w], `${w} вилучений з НД ТЗІ — не повинен бути в довіднику`);
});

test('родина CM: точно 56 записів (10 вилучених НД ТЗІ заходів відсутні навмисно)', () => {
  const cmIds = Object.keys(ref.entries).filter(id => id.startsWith('CM-'));
  assert.equal(cmIds.length, 56);
  for (const w of CM_WITHDRAWN) assert.ok(!ref.entries[w], `${w} вилучений з НД ТЗІ — не повинен бути в довіднику`);
});

test('родина CP: точно 49 записів (7 вилучених НД ТЗІ заходів відсутні навмисно, зокрема з маркером «Відкликано»)', () => {
  const cpIds = Object.keys(ref.entries).filter(id => id.startsWith('CP-'));
  assert.equal(cpIds.length, 49);
  for (const w of CP_WITHDRAWN) assert.ok(!ref.entries[w], `${w} вилучений з НД ТЗІ — не повинен бути в довіднику`);
});

test('родина IR: точно 39 записів (2 вилучених НД ТЗІ заходів відсутні навмисно)', () => {
  const irIds = Object.keys(ref.entries).filter(id => id.startsWith('IR-'));
  assert.equal(irIds.length, 39);
  for (const w of IR_WITHDRAWN) assert.ok(!ref.entries[w], `${w} вилучений з НД ТЗІ — не повинен бути в довіднику`);
});

test('родина PE: точно 38 записів (2 вилучених НД ТЗІ заходів відсутні навмисно)', () => {
  const peIds = Object.keys(ref.entries).filter(id => id.startsWith('PE-'));
  assert.equal(peIds.length, 38);
  for (const w of PE_WITHDRAWN) assert.ok(!ref.entries[w], `${w} вилучений з НД ТЗІ — не повинен бути в довіднику`);
});

test('родина PM: точно 35 записів (вилучених заходів немає)', () => {
  const pmIds = Object.keys(ref.entries).filter(id => id.startsWith('PM-'));
  assert.equal(pmIds.length, 35);
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
  assert.ok(ref.entries['AU-6'].statements.some(s => s.includes('{{ insert: param, au-6_odp.01 }}')));
  assert.ok(ref.entries['SI-4'].statements.some(s => s.includes('{{ insert: param, si-4_odp.02 }}')));
  assert.ok(ref.entries['SA-9'].statements.some(s => s.includes('{{ insert: param, sa-9_odp.01 }}')));
  assert.ok(ref.entries['CM-6'].statements.some(s => s.includes('{{ insert: param, cm-6_odp.01 }}')));
  assert.ok(ref.entries['CP-9'].statements.some(s => s.includes('{{ insert: param, cp-9_odp.01 }}')));
  assert.ok(ref.entries['IR-6'].statements.some(s => s.includes('{{ insert: param, ir-6_odp.01 }}')));
  assert.ok(ref.entries['PE-3'].statements.some(s => s.includes('{{ insert: param, pe-3_odp.01 }}')));
  assert.ok(ref.entries['PM-9'].statements.some(s => s.includes('{{ insert: param, pm-9_odp.01 }}')));
});

test('AT-2, AC-2, IA-5(1), AU-6, SC-7(4), SI-4, SA-9, CM-6, CP-9, IR-4, PE-3 і PM-1 розбито на кілька окремих пунктів перевірки (не один суцільний текст)', () => {
  assert.ok(ref.entries['AT-2'].statements.length >= 4);
  assert.ok(ref.entries['AC-2'].statements.length >= 4);
  assert.ok(ref.entries['IA-5(1)'].statements.length >= 4);
  assert.ok(ref.entries['AU-6'].statements.length >= 2);
  assert.ok(ref.entries['SC-7(4)'].statements.length >= 4);
  assert.ok(ref.entries['SI-4'].statements.length >= 3);
  assert.ok(ref.entries['SA-9'].statements.length >= 2);
  assert.ok(ref.entries['CM-6'].statements.length >= 3);
  assert.ok(ref.entries['CP-9'].statements.length >= 3);
  assert.ok(ref.entries['IR-4'].statements.length >= 3);
  assert.ok(ref.entries['PE-3'].statements.length >= 4);
  assert.ok(ref.entries['PM-1'].statements.length >= 2);
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

