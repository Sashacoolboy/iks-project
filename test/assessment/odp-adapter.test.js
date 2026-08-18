import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { indexAdapter, validateAdapter } from '../../core/assessment/odp-adapter.js';
import { normalizeControlId, denormalizeControlId } from '../../core/assessment/control-id.js';

const adapter = JSON.parse(await readFile(new URL('../../data/assessment/assessment_odp_adapter.json', import.meta.url), 'utf8'));
const ndTzi = JSON.parse(await readFile(new URL('../../data/nd_tzi.json', import.meta.url), 'utf8'));

test('normalizeControlId / denormalizeControlId', () => {
  assert.equal(normalizeControlId('AC-02'), 'AC-2');
  assert.equal(normalizeControlId('AC-02(05)'), 'AC-2(5)');
  assert.equal(denormalizeControlId('AC-2(5)'), 'AC-02(05)');
});

test('indexAdapter: 1026 entries, gold mapping, nist reverse index', () => {
  const idx = indexAdapter(adapter);
  assert.equal(idx.byAssessmentId.size, 1026);
  assert.equal(idx.duplicates.length, 0);
  assert.equal(idx.byAssessmentId.get('AC-02_ODP[01]').entry.local_odp_id, 'ac-2_odp.01');
  // зворотний VERIFIED-індекс: NIST AC-02_ODP[03] → локальний AC-02_ODP[01]
  assert.equal(idx.nistVerified.get('AC-02_ODP[03]').entry.assessment_odp_id, 'AC-02_ODP[01]');
  assert.equal(idx.nistVerified.get('AC-02_ODP[07]').entry.assessment_odp_id, 'AC-02_ODP[03]');
  assert.equal(idx.nistVerified.size, 6); // 1+1+3+1
});

test('validateAdapter: production adapter чистий', () => {
  const { errors } = validateAdapter(adapter, ndTzi);
  assert.deepEqual(errors, []);
});

test('validateAdapter: ловить дублікати, зламані binding, score', () => {
  const bad = { controls: [{ control_id: 'XX-01', assessment_odps: [
    { assessment_odp_id: 'XX-01_ODP[01]', local_odp_id: 'nope_odp.01', binding: { type: 'DIRECT_LOCAL_ODP', cpb_ref: 'nope_odp.01' }, nist_traceability: { status: 'UNRESOLVED', odp_ids: [] } },
    { assessment_odp_id: 'XX-01_ODP[01]', local_odp_id: 'ac-1_odp.01', binding: { type: 'DIRECT_LOCAL_ODP', cpb_ref: 'ac-1_odp.01' }, score: 0.93, nist_traceability: { status: 'UNRESOLVED', odp_ids: [] } },
  ] }] };
  const { errors } = validateAdapter(bad, ndTzi);
  assert.ok(errors.some(e => e.code === 'DUPLICATE_PRIMARY_BINDING'));
  assert.ok(errors.some(e => e.code === 'BROKEN_LOCAL_ODP_BINDING'));
  assert.ok(errors.some(e => e.code === 'SCORE_IN_PRODUCTION'));
});
