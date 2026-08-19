import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeAuditEntry, appendAuditEntry, AUDIT_ACTIONS } from '../../core/assessment/audit-trail.js';

test('makeAuditEntry: структура і валідація action', () => {
  const e = makeAuditEntry({ actor: 'Оцінювач', action: 'RESULT_UPDATED', entity_id: 'AC-02e',
    before: { result: 'NOT_ASSESSED' }, after: { result: 'SATISFIED' } });
  assert.ok(e.timestamp);
  assert.equal(e.action, 'RESULT_UPDATED');
  assert.deepEqual(e.before, { result: 'NOT_ASSESSED' });
  assert.throws(() => makeAuditEntry({ actor: 'x', action: 'HACKED', entity_id: 'y' }), /action/i);
  assert.equal(AUDIT_ACTIONS.length, 9);
});

test('appendAuditEntry не мутує вихідний масив', () => {
  const log = [];
  const out = appendAuditEntry(log, makeAuditEntry({ actor: 'x', action: 'ASSESSMENT_CREATED', entity_id: 'ASSESS-2026-001' }));
  assert.equal(log.length, 0);
  assert.equal(out.length, 1);
});
