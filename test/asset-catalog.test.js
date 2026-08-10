import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { filterAssetsByClass, groupByCategory } from '../core/asset-catalog.js';

const { assets } = JSON.parse(readFileSync(new URL('../data/assets_catalog.json', import.meta.url)));

test('АС-1 бачить лише активи 1-7', () => {
  const r = filterAssetsByClass(assets, 1);
  assert.equal(r.length, 7);
  assert.ok(r.every(a => a.min_as_class === 1));
});

test('АС-2 бачить активи 1-10', () => {
  assert.equal(filterAssetsByClass(assets, 2).length, 10);
});

test('АС-3 бачить усі 13', () => {
  assert.equal(filterAssetsByClass(assets, 3).length, 13);
});

test('групування за категоріями зберігає порядок', () => {
  const g = groupByCategory(filterAssetsByClass(assets, 1));
  assert.deepEqual([...g.keys()], ['Фізичні активи', 'Людські ресурси', 'Засоби захисту', 'Інформаційне', 'Середовище']);
  assert.equal(g.get('Фізичні активи').length, 3);
});
