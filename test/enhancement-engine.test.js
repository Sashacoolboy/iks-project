import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { enhancementsForControl, suggestionsFromRisks } from '../core/enhancement-engine.js';

const nd = JSON.parse(readFileSync(new URL('../data/nd_tzi.json', import.meta.url)));
const tr = JSON.parse(readFileSync(new URL('../data/threats_risks.json', import.meta.url)));

test('AC-2 має посилення з id формату AC-2(N)', () => {
  const list = enhancementsForControl(nd, 'AC-2');
  assert.ok(list.length > 0);
  assert.ok(list.every(e => /^AC-2\(\d+\)$/.test(e.id)));
  assert.ok(list.every(e => e.title.length > 0));
});

test('невідомий контроль дає порожній список', () => {
  assert.deepEqual(enhancementsForControl(nd, 'XX-99'), []);
});

test('suggestionsFromRisks містить лише високі/критичні ризики', () => {
  const risks = [
    { id: 'R-A', level: 'Критичний', enhancement_suggestions: ['IA-2(1)'] },
    { id: 'R-B', level: 'Низький', enhancement_suggestions: ['SC-8(1)'] },
  ];
  const m = suggestionsFromRisks(risks);
  assert.deepEqual(m.get('IA-2'), [{ enhancementId: 'IA-2(1)', riskId: 'R-A', level: 'Критичний' }]);
  assert.equal(m.has('SC-8'), false);
});
