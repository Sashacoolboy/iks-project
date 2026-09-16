import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { computeRiskScore, riskLevel, annotateRisk, baseRisksFor, threatDirectory, buildCustomRisk,
  applyBaseOverride, acceptedRisksFor } from '../core/risk-engine.js';

const tr = JSON.parse(readFileSync(new URL('../data/threats_risks.json', import.meta.url)));

test('калібрування рівнів за еталонними ризиками', () => {
  assert.equal(riskLevel(computeRiskScore(4, 0.8), tr.scale), 'Критичний');   // R-003
  assert.equal(riskLevel(computeRiskScore(4, 0.5), tr.scale), 'Високий');     // R-001
  assert.equal(riskLevel(computeRiskScore(2, 0.4), tr.scale), 'Середній');    // R-004
  assert.equal(riskLevel(computeRiskScore(4, 0.1), tr.scale), 'Низький');     // R-005
  assert.equal(riskLevel(computeRiskScore(5, 0.9), tr.scale), 'Критичний');   // R-008
});

test('baseRisksFor фільтрує за активами та класом', () => {
  const r = baseRisksFor(tr, ['A-01', 'A-07'], 1);
  assert.ok(r.every(x => x.asset_id === 'A-01'));          // A-07 недоступний на АС-1
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

test('applyBaseOverride: без override повертає ризик як є; з override — перераховує score/level', () => {
  const risk = baseRisksFor(tr, ['A-01'], 1)[0];
  assert.equal(applyBaseOverride(risk, undefined, tr.scale), risk);
  const overridden = applyBaseOverride(risk, { impact: 5, likelihood: 0.9, responsible: 'Х' }, tr.scale);
  assert.equal(overridden.id, risk.id);
  assert.equal(overridden.responsible, 'Х');
  assert.equal(overridden.score, computeRiskScore(5, 0.9));
  assert.equal(overridden.level, riskLevel(computeRiskScore(5, 0.9), tr.scale));
});

test('acceptedRisksFor: прийняті базові (з overrides) + кастомні, невибрані базові відсутні', () => {
  const base = baseRisksFor(tr, ['A-01'], 1);
  const risksState = { accepted_base: [base[0].id], base_overrides: { [base[0].id]: { responsible: 'Перевизначено' } },
    custom: [{ id: 'C-001', custom: true, asset_id: 'A-01', threat: 'Т', vulnerability: 'В', impact: 3, likelihood: 0.5 }] };
  const r = acceptedRisksFor(tr, ['A-01'], 1, risksState);
  assert.equal(r.length, 2);
  assert.equal(r.find(x => x.id === base[0].id).responsible, 'Перевизначено');
  assert.ok(r.some(x => x.id === 'C-001'));
  assert.ok(!r.some(x => x.id === base[1]?.id));
});
