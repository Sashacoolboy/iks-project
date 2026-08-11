import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { computeRiskScore, riskLevel, annotateRisk, baseRisksFor, threatDirectory, buildCustomRisk } from '../core/risk-engine.js';

const tr = JSON.parse(readFileSync(new URL('../data/threats_risks.json', import.meta.url)));

test('калібрування рівнів за еталонними ризиками', () => {
  assert.equal(riskLevel(computeRiskScore(4, 0.8), tr.scale), 'Критичний');   // R-003
  assert.equal(riskLevel(computeRiskScore(4, 0.5), tr.scale), 'Високий');     // R-001
  assert.equal(riskLevel(computeRiskScore(2, 0.4), tr.scale), 'Середній');    // R-004
  assert.equal(riskLevel(computeRiskScore(4, 0.1), tr.scale), 'Низький');     // R-005
  assert.equal(riskLevel(computeRiskScore(5, 0.9), tr.scale), 'Критичний');   // R-008
});

test('baseRisksFor фільтрує за активами та класом', () => {
  const r = baseRisksFor(tr, ['A-01', 'A-08'], 1);
  assert.ok(r.every(x => x.asset_id === 'A-01'));          // A-08 недоступний на АС-1
  assert.ok(r.every(x => typeof x.level === 'string' && x.score > 0));
});

test('threatDirectory повертає унікальні пари', () => {
  const d = threatDirectory(tr);
  const keys = d.map(x => x.threat + '|' + x.vulnerability);
  assert.equal(new Set(keys).size, keys.length);
});

test('threatDirectory фільтрується за активом', () => {
  const all = threatDirectory(tr);
  const forA02 = threatDirectory(tr, 'A-02');
  assert.ok(forA02.length > 0 && forA02.length < all.length);
  const a02Threats = new Set(tr.risks.filter(r => r.asset_id === 'A-02').map(r => r.threat));
  assert.ok(forA02.every(t => a02Threats.has(t.threat)));
});

test('buildCustomRisk генерує послідовний id та обчислює рівень', () => {
  const c = buildCustomRisk(
    { asset_id: 'A-01', threat: 'Т', vulnerability: 'В', impact: 5, likelihood: 0.7 },
    ['C-001'], tr.scale);
  assert.equal(c.id, 'C-002');
  assert.equal(c.custom, true);
  assert.equal(c.level, 'Критичний');
});
