import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { filterAssetsByClass, groupByCategory } from '../core/asset-catalog.js';

const { assets } = JSON.parse(readFileSync(new URL('../data/assets_catalog.json', import.meta.url)));

test('АС-1 бачить лише активи класу 1 (14 із 24)', () => {
  const r = filterAssetsByClass(assets, 1);
  assert.equal(r.length, 14);
  assert.ok(r.every(a => a.min_as_class === 1));
});

test('АС-2 бачить активи класів 1-2 (22 із 24)', () => {
  assert.equal(filterAssetsByClass(assets, 2).length, 22);
});

test('АС-3 бачить усі 24', () => {
  assert.equal(filterAssetsByClass(assets, 3).length, 24);
});

test('групування за категоріями зберігає порядок', () => {
  const g = groupByCategory(filterAssetsByClass(assets, 3));
  assert.deepEqual([...g.keys()], ['Апаратне забезпечення', 'Програмне забезпечення', 'Комунікаційна система',
    'Носії інформації', 'Персонал', 'Сторонні сервіси', 'Канали зв\'язку', 'Фізичне середовище']);
  assert.equal(g.get('Апаратне забезпечення').length, 3);
  assert.equal(g.get('Персонал').length, 4);
});
