import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { indexAdapter } from '../../core/assessment/odp-adapter.js';
import { resolveAssessmentObjective } from '../../core/assessment/objective-resolver.js';

const adapter = JSON.parse(await readFile(new URL('../../data/assessment/assessment_odp_adapter.json', import.meta.url), 'utf8'));
const adapterIndex = indexAdapter(adapter);
const TPL = 'для запитів на створення облікових записів потрібні схвалення від <AC-02_ODP[03] персоналу або ролей>;';

test('VERIFIED + resolved → підстановка effective value', () => {
  const { resolved_objective, placeholders } = resolveAssessmentObjective({
    objectiveTemplate: TPL, adapterIndex,
    effectiveValueFor: () => ({ status: 'RESOLVED', value: 'Начальника служби захисту інформації' }),
  });
  assert.equal(resolved_objective, 'для запитів на створення облікових записів потрібні схвалення від Начальника служби захисту інформації;');
  assert.deepEqual(placeholders, [{ ref: 'AC-02_ODP[03]', label: 'персоналу або ролей', resolution: 'SUBSTITUTED',
    local_odp_id: 'ac-2_odp.01', assessment_odp_id: 'AC-02_ODP[01]', value: 'Начальника служби захисту інформації' }]);
});

test('VERIFIED + unresolved → [НЕ ВИЗНАЧЕНО]', () => {
  const { resolved_objective, placeholders } = resolveAssessmentObjective({
    objectiveTemplate: TPL, adapterIndex,
    effectiveValueFor: () => ({ status: 'UNRESOLVED', value: null }),
  });
  assert.equal(resolved_objective, 'для запитів на створення облікових записів потрібні схвалення від [НЕ ВИЗНАЧЕНО];');
  assert.equal(placeholders[0].resolution, 'UNRESOLVED_VALUE');
});

test('без VERIFIED-зв\u02BCязку → нормативний текст як є (REFERENCE_ONLY)', () => {
  const tpl = 'визначено <AC-01_ODP[99] персонал або ролі>;';
  const { resolved_objective, placeholders } = resolveAssessmentObjective({
    objectiveTemplate: tpl, adapterIndex, effectiveValueFor: () => ({ status: 'RESOLVED', value: 'x' }),
  });
  assert.equal(resolved_objective, 'визначено персонал або ролі;');
  assert.deepEqual(placeholders, [{ ref: 'AC-01_ODP[99]', label: 'персонал або ролі', resolution: 'REFERENCE_ONLY',
    local_odp_id: null, assessment_odp_id: null, value: null }]);
});

test('текст без плейсхолдерів проходить без змін', () => {
  const r = resolveAssessmentObjective({ objectiveTemplate: 'звичайний текст;', adapterIndex, effectiveValueFor: () => null });
  assert.equal(r.resolved_objective, 'звичайний текст;');
  assert.deepEqual(r.placeholders, []);
});
