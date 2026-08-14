import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('assessment_catalog.json існує та має контроль AC-02 з 16 ODP і 33 entries', () => {
  const cat = JSON.parse(readFileSync('data/assessment_catalog.json', 'utf8'));
  assert.equal(cat.schema.id, 'ua.ics.assessment.catalog');
  const ac02 = cat.controls.find(c => c.control_id === 'AC-02');
  assert.ok(ac02, 'AC-02 має бути присутній');
  assert.equal(ac02.odp_registry.length, 16);
  assert.equal(ac02.entries.length, 33);
  assert.equal(ac02.withdrawn[0].control_id, 'AC-02(10)');
});
