import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeAssessment } from '../../core/assessment/assessment-io.js';
import { finalizeAssessment, approvePlan } from '../../core/assessment/assessment-run.js';
import { conclusionTextFor, sourcesForConclusion, setConclusionText, linkSource, unlinkSource } from '../../core/assessment/conclusions.js';

const plan = { items: [
  { assessment_source_id: 'AC-02_ODP[01]', control_id: 'AC-02', available_methods: [], odp_values: [] },
  { assessment_source_id: 'AC-02_ODP[02]', control_id: 'AC-02', available_methods: [], odp_values: [] },
  { assessment_source_id: 'AC-02_ODP[03]', control_id: 'AC-02', available_methods: [], odp_values: [] },
] };
const base = () => makeAssessment({ approvedRecord: { state: { passport: {}, info_type: 'open_confidential' } }, approvedName: 'x', plan, warnings: [], id: 'ASSESS-2026-060' });

test('setConclusionText: перший виклик створює спільний висновок', () => {
  const { assessment, conclusion_id } = setConclusionText(base(), 'AC-02_ODP[01]', 'Впроваджено процедуру X');
  assert.equal(conclusion_id, 'CN-001');
  assert.equal(assessment.results[0].conclusion_id, 'CN-001');
  assert.deepEqual(assessment.conclusions, [{ conclusion_id: 'CN-001', text: 'Впроваджено процедуру X' }]);
  assert.equal(conclusionTextFor(assessment, assessment.results[0]), 'Впроваджено процедуру X');
});

test('setConclusionText: повторний виклик для того ж sourceId оновлює текст наявного висновку', () => {
  const a1 = setConclusionText(base(), 'AC-02_ODP[01]', 'перший текст').assessment;
  const { assessment } = setConclusionText(a1, 'AC-02_ODP[01]', 'оновлений текст');
  assert.equal(assessment.conclusions.length, 1);
  assert.equal(assessment.conclusions[0].text, 'оновлений текст');
});

test('linkSource: долучає інший ODP до спільного висновку; conclusionTextFor дає той самий текст', () => {
  const a1 = setConclusionText(base(), 'AC-02_ODP[01]', 'спільний текст').assessment;
  const { assessment } = linkSource(a1, 'CN-001', 'AC-02_ODP[02]');
  assert.equal(assessment.results[1].conclusion_id, 'CN-001');
  assert.deepEqual(sourcesForConclusion(assessment, 'CN-001').sort(), ['AC-02_ODP[01]', 'AC-02_ODP[02]']);
  assert.equal(conclusionTextFor(assessment, assessment.results[1]), 'спільний текст');
  assert.throws(() => linkSource(assessment, 'CN-999', 'AC-02_ODP[03]'), /не знайдено/i);
  assert.throws(() => linkSource(assessment, 'CN-001', 'нема'), /не знайдено/i);
});

test('linkSource: перенесення з іншого висновку прибирає осиротілий запис', () => {
  let a = setConclusionText(base(), 'AC-02_ODP[01]', 'висновок A').assessment;
  a = setConclusionText(a, 'AC-02_ODP[02]', 'висновок B').assessment; // CN-002, окремий від CN-001
  assert.equal(a.conclusions.length, 2);
  const { assessment } = linkSource(a, 'CN-001', 'AC-02_ODP[02]');
  assert.equal(assessment.conclusions.length, 1, 'CN-002 видалено, бо лишився без жодного ODP');
  assert.deepEqual(sourcesForConclusion(assessment, 'CN-001').sort(), ['AC-02_ODP[01]', 'AC-02_ODP[02]']);
});

test('unlinkSource: прибирає ODP зі спільного висновку; видаляє запис, якщо він був останнім', () => {
  let a = setConclusionText(base(), 'AC-02_ODP[01]', 'спільний').assessment;
  a = linkSource(a, 'CN-001', 'AC-02_ODP[02]').assessment;
  const { assessment: afterOne } = unlinkSource(a, 'AC-02_ODP[02]');
  assert.equal(afterOne.results[1].conclusion_id, null);
  assert.equal(afterOne.conclusions.length, 1, 'CN-001 лишається, бо ще покриває AC-02_ODP[01]');
  const { assessment: afterTwo } = unlinkSource(afterOne, 'AC-02_ODP[01]');
  assert.deepEqual(afterTwo.conclusions, [], 'останній ODP відв\'язано — запис висновку видалено');
});

test('setConclusionText: порожній текст без наявного висновку нічого не створює', () => {
  const { assessment, conclusion_id } = setConclusionText(base(), 'AC-02_ODP[01]', '   ');
  assert.equal(conclusion_id, null);
  assert.deepEqual(assessment.conclusions, []);
  assert.equal(assessment.results[0].conclusion_id, null);
});

test('setConclusionText: порожній текст, коли ODP був єдиним у групі, повністю прибирає висновок', () => {
  const a1 = setConclusionText(base(), 'AC-02_ODP[01]', 'текст').assessment;
  const { assessment, conclusion_id } = setConclusionText(a1, 'AC-02_ODP[01]', '');
  assert.equal(conclusion_id, null);
  assert.deepEqual(assessment.conclusions, []);
  assert.equal(assessment.results[0].conclusion_id, null);
});

test('setConclusionText: порожній текст, коли є ще інші ODP у групі, лише очищає текст (група лишається)', () => {
  let a = setConclusionText(base(), 'AC-02_ODP[01]', 'текст').assessment;
  a = linkSource(a, 'CN-001', 'AC-02_ODP[02]').assessment;
  const { assessment, conclusion_id } = setConclusionText(a, 'AC-02_ODP[01]', '');
  assert.equal(conclusion_id, 'CN-001');
  assert.equal(assessment.conclusions[0].text, '');
  assert.deepEqual(sourcesForConclusion(assessment, 'CN-001').sort(), ['AC-02_ODP[01]', 'AC-02_ODP[02]']);
});

test('conclusionTextFor: legacy result.conclusion лишається фолбеком без conclusion_id', () => {
  const a = base();
  a.results[0].conclusion = 'старий текстовий висновок';
  assert.equal(conclusionTextFor(a, a.results[0]), 'старий текстовий висновок');
});

test('setConclusionText/linkSource/unlinkSource заборонені для фіналізованого оцінювання', () => {
  const finalized = finalizeAssessment(approvePlan(base()));
  assert.throws(() => setConclusionText(finalized, 'AC-02_ODP[01]', 'x'), /фіналізован/i);
  const withConclusion = setConclusionText(base(), 'AC-02_ODP[01]', 'x').assessment;
  const finalizedWithConclusion = finalizeAssessment(approvePlan(withConclusion));
  assert.throws(() => linkSource(finalizedWithConclusion, 'CN-001', 'AC-02_ODP[02]'), /фіналізован/i);
  assert.throws(() => unlinkSource(finalizedWithConclusion, 'AC-02_ODP[01]'), /фіналізован/i);
});
