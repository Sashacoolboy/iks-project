// test/assessment/control-document-view.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildControlDocument } from '../../public/js/assessment/control-document-view.js';

const odpValues = [
  { local_odp_id: 'ac-2_odp.01', target_value: 'Начальник СЗІ', effective_source: 'CPB_OVERRIDE' },
  { local_odp_id: 'ac-2_odp.02', target_value: 'мінімум щоквартально', effective_source: 'BPB_INHERITED' },
  { local_odp_id: 'ac-2_odp.03', target_value: null, effective_source: null },
];

const items = [
  {
    planItem: {
      kind: 'STATEMENT',
      statement_path: 'a',
      statement_text: 'Призначити {{ insert: param, ac-2_odp.01 }} для управління обліковими записами.',
      odp_values: odpValues,
    },
  },
  {
    planItem: {
      kind: 'STATEMENT',
      statement_path: 'b',
      statement_text: 'Переглядати облікові записи {{ insert: param, ac-2_odp.02 }} та {{ insert: param, ac-2_odp.03 }}.',
      odp_values: odpValues,
    },
  },
  {
    planItem: {
      kind: 'ODP_DEFINITION',
      statement_path: null,
      statement_text: 'визначено персонал або ролі;',
      odp_values: odpValues,
    },
  },
];

test('buildControlDocument: фільтрує ODP_DEFINITION, залишає лише STATEMENT-рядки', () => {
  const { left, right } = buildControlDocument(items);
  assert.equal(left.length, 2);
  assert.equal(right.length, 2);
});

test('buildControlDocument: ліва колонка — плейсхолдери згорнуті в [id], без кольору', () => {
  const { left } = buildControlDocument(items);
  assert.deepEqual(left[0], {
    label: 'a',
    parts: [
      { type: 'text', text: 'Призначити ' },
      { type: 'param', text: '[ac-2_odp.01]' },
      { type: 'text', text: ' для управління обліковими записами.' },
    ],
  });
});

test('buildControlDocument: права колонка — реальне значення й клас за джерелом', () => {
  const { right } = buildControlDocument(items);
  assert.deepEqual(right[0], {
    label: 'a',
    parts: [
      { type: 'text', text: 'Призначити ' },
      { type: 'param', text: 'Начальник СЗІ', source: 'src-override' },
      { type: 'text', text: ' для управління обліковими записами.' },
    ],
  });
  assert.deepEqual(right[1].parts[1], { type: 'param', text: 'мінімум щоквартально', source: 'src-bpb' });
});

test('buildControlDocument: без значення (UNRESOLVED) — «не визначено», клас src-empty', () => {
  const { right } = buildControlDocument(items);
  assert.deepEqual(right[1].parts[3], { type: 'param', text: 'не визначено', source: 'src-empty' });
});

test('buildControlDocument: дедуплікує рядки з однаковою міткою пункту (кілька ODP-цілей в одному пункті)', () => {
  // Реальний випадок: пункт "d" каталогу оцінювання розбитий на кілька assessment-цілей
  // (по одній на кожен вбудований ODP-параметр), усі з однаковим statement_path-сегментом
  // і буквально ідентичним statement_text — документ-в'ю має показати пункт лише РАЗ.
  const dupItems = [
    { planItem: { kind: 'STATEMENT', statement_path: 'd.01', statement_text: 'Спільний текст пункту d.', odp_values: odpValues } },
    { planItem: { kind: 'STATEMENT', statement_path: 'd.02', statement_text: 'Спільний текст пункту d.', odp_values: odpValues } },
    { planItem: { kind: 'STATEMENT', statement_path: 'd.03[01]', statement_text: 'Спільний текст пункту d.', odp_values: odpValues } },
    { planItem: { kind: 'STATEMENT', statement_path: 'e', statement_text: 'Інший пункт e.', odp_values: odpValues } },
  ];
  const { left, right } = buildControlDocument(dupItems);
  assert.deepEqual(left.map(l => l.label), ['d', 'e']);
  assert.deepEqual(right.map(l => l.label), ['d', 'e']);
});

