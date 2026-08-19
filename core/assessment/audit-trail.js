export const AUDIT_ACTIONS = ['ASSESSMENT_CREATED', 'ASSESSMENT_STARTED', 'RESULT_UPDATED', 'EVIDENCE_ADDED',
  'EVIDENCE_REMOVED', 'FINDING_CREATED', 'FINDING_UPDATED', 'ASSESSMENT_FINALIZED', 'REPORT_GENERATED'];

export function makeAuditEntry({ actor = '', action, entity_id = '', before = {}, after = {} }) {
  if (!AUDIT_ACTIONS.includes(action)) throw new Error(`невідомий audit action: ${action}`);
  return { timestamp: new Date().toISOString(), actor, action, entity_id, before, after };
}

export function appendAuditEntry(logArray, entry) {
  return [...(logArray ?? []), entry];
}
