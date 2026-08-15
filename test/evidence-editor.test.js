import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nextEvidenceId } from '../public/js/assessment/evidence-editor.js';

test('nextEvidenceId генерує послідовний ID у межах item', () => {
  assert.equal(nextEvidenceId([]), 'EV-0001');
  assert.equal(nextEvidenceId([{ id: 'EV-0001' }, { id: 'EV-0002' }]), 'EV-0003');
});
