// test/assessment-state.test.js
// Note: assessment-state.js runs in browser (uses fetch/localStorage-free debounce logic extracted here for testability)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeDebounceDelay } from '../public/js/assessment/assessment-state.js';

test('computeDebounceDelay повертає 500мс за замовчуванням', () => {
  assert.equal(computeDebounceDelay(), 500);
});
