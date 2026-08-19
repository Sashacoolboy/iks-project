import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sha256, buildCatalogVersion } from '../../core/assessment/versioning.js';

test('sha256 детермінований', () => {
  assert.equal(sha256('abc'), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
});

test('buildCatalogVersion: hash + bytes на файл', () => {
  const v = buildCatalogVersion({ files: { 'nd_tzi.json': '{}', 'adapter.json': '{"a": 1}' } });
  assert.ok(v.generated_at);
  assert.equal(v.hashes['nd_tzi.json'].sha256, sha256('{}'));
  assert.equal(v.hashes['adapter.json'].bytes, 8);
});
