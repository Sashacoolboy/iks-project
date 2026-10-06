# Погодження плану оцінювання (чекліст перевірки) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a new `PLANNING` stage between CPB selection and assessment execution, where the assessor reviews/edits a generated verification-instruction checklist (one row per NIST ND TZI control/enhancement), excludes irrelevant rows, exports it to DOCX for customer sign-off, then approves it to start the actual assessment.

**Architecture:** New `plan.checklist[]` array (control/enhancement granularity) built by `buildAssessmentPlan` from a new hand-authored dictionary `data/assessment/checklist_reference.json`, resolved via a new placeholder resolver. New assessment status `PLANNING` precedes `IN_PROGRESS`. A new UI screen (`plan-review.js`) and two new server endpoints (`approve-plan`, `export/checklist-docx`) round out the feature. Existing `plan.items[]`/`results[]` execution model is unchanged except for exclusion-cascade filtering.

**Tech Stack:** Node.js ≥ 18, ES modules, vanilla JS (no frameworks), `node:test` + `node:assert/strict`, zero npm dependencies, custom DOCX writer (`core/docx/docx-writer.js`).

## Global Constraints

- Zero npm dependencies — no new packages, ever.
- 100% offline — no network calls anywhere in `core/`, `public/js/`, or `server.js`.
- UI renders only via `el()`/textContent from `public/js/render/dom.js` — `innerHTML` is forbidden.
- All UI copy and docx output is in Ukrainian.
- Reproducible DOCX output — never call `Date.now()`/`new Date()` with the current time inside a docx-writer; dates come from `projection.title.date`.
- Test command: `npm test` (= `node --test test/`), recurses `test/assessment/`.
- Never `rmSync` the whole `assessments/` directory in any test teardown — only the specific id the test created.
- Reference spec: [docs/superpowers/specs/2026-10-06-assessment-plan-checklist-design.md](../specs/2026-10-06-assessment-plan-checklist-design.md)

---

## File Structure

**Create:**
- `data/assessment/checklist_reference.json` — pilot dictionary (AT family, 15 entries), hand-authored verification instructions.
- `core/assessment/checklist-resolver.js` — resolves `{{ insert: param, ... }}` tokens in checklist templates using CPB-effective values.
- `core/assessment/checklist-projection.js` — pure projection from assessment → checklist-docx data (mirrors `report-projection.js`).
- `core/docx/checklist-docx-writer.js` — builds the checklist DOCX buffer.
- `public/js/assessment/plan-review.js` — new UI screen shown while `status === 'PLANNING'`.
- `test/assessment/checklist-reference.test.js`
- `test/assessment/checklist-resolver.test.js`
- `test/assessment/checklist-projection.test.js`
- `test/assessment/checklist-docx-writer.test.js`

**Modify:**
- `core/assessment/audit-trail.js` — add `PLAN_APPROVED`, `PLAN_EDITED` actions.
- `core/assessment/assessment-plan.js` — `buildAssessmentPlan` also returns `checklist[]`.
- `core/assessment/assessment-io.js` — `makeAssessment` starts at `PLANNING`; schema validation + migration backfill for `plan.checklist`.
- `core/assessment/assessment-run.js` — add `approvePlan()`; `finalizeAssessment` rejects `PLANNING`.
- `core/assessment/assessment-validator.js` — skip validation for results whose control is excluded via checklist.
- `core/assessment/report-projection.js` — `groupPlanItems` filters out excluded controls.
- `core/docx/assessment-docx-writer.js` — export `packAssessmentDocx` for reuse.
- `public/js/assessment/assessment-table.js` — `groupPlanItems` filters excluded controls + attaches checklist statement; `renderAssessmentTable` displays it.
- `public/js/assessment/assessment-app.js` — route to `plan-review.js` while `status === 'PLANNING'`.
- `server.js` — assessments start at `PLANNING`; new `approve-plan` and `export/checklist-docx` routes; `PUT` audit action branches on status.
- `tools/create-sample-assessment.js` — pass `checklistReference`/`checklist` through.
- `public/css/app.css` — styles for the plan-review screen.
- `test/assessment/audit-trail.test.js`, `test/assessment/assessment-plan.test.js`, `test/assessment/assessment-io.test.js`, `test/assessment/assessment-run.test.js`, `test/assessment/assessment-validator.test.js`, `test/assessment/assessment-table.test.js`, `test/assessment/report-projection.test.js`, `test/assessment/server-assessment.test.js` — new/updated assertions per task below.

---

### Task 1: Audit actions whitelist

**Files:**
- Modify: `core/assessment/audit-trail.js`
- Test: `test/assessment/audit-trail.test.js`

**Interfaces:**
- Produces: `AUDIT_ACTIONS` now includes `'PLAN_APPROVED'` and `'PLAN_EDITED'` (consumed by Task 6 and Task 11).

- [ ] **Step 1: Write the failing test**

In `test/assessment/audit-trail.test.js`, update the existing count assertion and add two new action checks:

```js
test('makeAuditEntry: структура і валідація action', () => {
  const e = makeAuditEntry({ actor: 'Оцінювач', action: 'RESULT_UPDATED', entity_id: 'AC-02e',
    before: { result: 'NOT_ASSESSED' }, after: { result: 'SATISFIED' } });
  assert.ok(e.timestamp);
  assert.equal(e.action, 'RESULT_UPDATED');
  assert.deepEqual(e.before, { result: 'NOT_ASSESSED' });
  assert.throws(() => makeAuditEntry({ actor: 'x', action: 'HACKED', entity_id: 'y' }), /action/i);
  assert.equal(AUDIT_ACTIONS.length, 11);
});

test('PLAN_APPROVED і PLAN_EDITED — валідні дії', () => {
  assert.equal(makeAuditEntry({ actor: 'x', action: 'PLAN_APPROVED', entity_id: 'ASSESS-2026-001' }).action, 'PLAN_APPROVED');
  assert.equal(makeAuditEntry({ actor: 'x', action: 'PLAN_EDITED', entity_id: 'ASSESS-2026-001' }).action, 'PLAN_EDITED');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/assessment/audit-trail.test.js`
Expected: FAIL — `AUDIT_ACTIONS.length` is `9`, not `11`; `PLAN_APPROVED`/`PLAN_EDITED` throw "невідомий audit action".

- [ ] **Step 3: Implement**

In `core/assessment/audit-trail.js`:

```js
export const AUDIT_ACTIONS = ['ASSESSMENT_CREATED', 'ASSESSMENT_STARTED', 'RESULT_UPDATED', 'EVIDENCE_ADDED',
  'EVIDENCE_REMOVED', 'FINDING_CREATED', 'FINDING_UPDATED', 'ASSESSMENT_FINALIZED', 'REPORT_GENERATED',
  'PLAN_APPROVED', 'PLAN_EDITED'];
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/assessment/audit-trail.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add core/assessment/audit-trail.js test/assessment/audit-trail.test.js
git commit -m "feat: add PLAN_APPROVED and PLAN_EDITED audit actions"
```

---

### Task 2: checklist-resolver.js

**Files:**
- Create: `core/assessment/checklist-resolver.js`
- Test: `test/assessment/checklist-resolver.test.js`

**Interfaces:**
- Consumes: `effectiveValueFor(localOdpId)` — existing closure signature already used inside `buildAssessmentPlan` (`core/assessment/assessment-plan.js`), returns `{ status: 'RESOLVED'|'UNRESOLVED', value: string|string[]|null }`.
- Produces: `resolveChecklistStatement({ template, effectiveValueFor }) => { resolved_statement: string, placeholders: Array<{ local_odp_id, resolution: 'SUBSTITUTED'|'UNRESOLVED_VALUE', value }> }` — consumed by Task 4.

- [ ] **Step 1: Write the failing test**

Create `test/assessment/checklist-resolver.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveChecklistStatement } from '../../core/assessment/checklist-resolver.js';

test('підставляє значення для {{ insert: param, ... }}', () => {
  const { resolved_statement, placeholders } = resolveChecklistStatement({
    template: 'Перевірити повторення навчання з періодичністю {{ insert: param, at-2_odp.01 }}.',
    effectiveValueFor: () => ({ status: 'RESOLVED', value: 'щороку' }),
  });
  assert.equal(resolved_statement, 'Перевірити повторення навчання з періодичністю щороку.');
  assert.deepEqual(placeholders, [{ local_odp_id: 'at-2_odp.01', resolution: 'SUBSTITUTED', value: 'щороку' }]);
});

test('нерозвʼязане значення → [НЕ ВИЗНАЧЕНО: local_odp_id]', () => {
  const { resolved_statement, placeholders } = resolveChecklistStatement({
    template: 'Періодичність {{ insert: param, at-2_odp.01 }}.',
    effectiveValueFor: () => ({ status: 'UNRESOLVED', value: null }),
  });
  assert.equal(resolved_statement, 'Періодичність [НЕ ВИЗНАЧЕНО: at-2_odp.01].');
  assert.equal(placeholders[0].resolution, 'UNRESOLVED_VALUE');
});

test('масив значень обʼєднується через "; "', () => {
  const { resolved_statement } = resolveChecklistStatement({
    template: '{{ insert: param, at-3_odp.01 }}',
    effectiveValueFor: () => ({ status: 'RESOLVED', value: ['Адміністратор', 'Оператор'] }),
  });
  assert.equal(resolved_statement, 'Адміністратор; Оператор');
});

test('текст без плейсхолдерів повертається як є', () => {
  const { resolved_statement, placeholders } = resolveChecklistStatement({
    template: 'Перевірити журнал.', effectiveValueFor: () => ({ status: 'RESOLVED', value: 'x' }),
  });
  assert.equal(resolved_statement, 'Перевірити журнал.');
  assert.deepEqual(placeholders, []);
});

test('null/undefined template → порожній рядок', () => {
  assert.equal(resolveChecklistStatement({ template: null, effectiveValueFor: () => ({}) }).resolved_statement, '');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/assessment/checklist-resolver.test.js`
Expected: FAIL — `Cannot find module '../../core/assessment/checklist-resolver.js'`

- [ ] **Step 3: Implement**

Create `core/assessment/checklist-resolver.js`:

```js
// core/assessment/checklist-resolver.js
// Токени НД ТЗІ: {{ insert: param, <local_odp_id> }} — той самий формат, що й у nd_tzi.json.
const PARAM_RE = /\{\{\s*insert:\s*param,\s*([\w.-]+)\s*\}\}/g;

const undefinedTag = (localOdpId) => `[НЕ ВИЗНАЧЕНО: ${localOdpId}]`;

export function resolveChecklistStatement({ template, effectiveValueFor }) {
  const placeholders = [];
  const resolved_statement = String(template ?? '').replace(PARAM_RE, (m, localOdpId) => {
    const ev = effectiveValueFor(localOdpId);
    if (ev?.status === 'RESOLVED') {
      const text = Array.isArray(ev.value) ? ev.value.join('; ') : ev.value;
      placeholders.push({ local_odp_id: localOdpId, resolution: 'SUBSTITUTED', value: text });
      return text;
    }
    placeholders.push({ local_odp_id: localOdpId, resolution: 'UNRESOLVED_VALUE', value: null });
    return undefinedTag(localOdpId);
  });
  return { resolved_statement, placeholders };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/assessment/checklist-resolver.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add core/assessment/checklist-resolver.js test/assessment/checklist-resolver.test.js
git commit -m "feat: add checklist-resolver for {{ insert: param, ... }} tokens"
```

---

### Task 3: Pilot content — `checklist_reference.json` (родина AT, 15 записів)

**Files:**
- Create: `data/assessment/checklist_reference.json`
- Test: `test/assessment/checklist-reference.test.js`

**Interfaces:**
- Produces: `{ entries: { [canonical_id]: { control_title, verification_statement, source_requirement_text, status } } }` — consumed by Task 4.

- [ ] **Step 1: Write the failing test**

Create `test/assessment/checklist-reference.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const ref = JSON.parse(await readFile(new URL('../../data/assessment/checklist_reference.json', import.meta.url), 'utf8'));

const AT_IDS = ['AT-1', 'AT-2', 'AT-2(1)', 'AT-2(2)', 'AT-2(3)', 'AT-2(4)', 'AT-2(5)', 'AT-2(6)',
  'AT-3', 'AT-3(1)', 'AT-3(2)', 'AT-3(3)', 'AT-3(5)', 'AT-4', 'AT-6'];

test('довідник містить рівно 15 записів родини AT (AT-3(4) і AT-5 вилучені з НД ТЗІ — пропущені навмисно)', () => {
  assert.equal(Object.keys(ref.entries).length, 15);
  assert.deepEqual(Object.keys(ref.entries).sort(), [...AT_IDS].sort());
});

test('кожен запис має непорожню verification_statement, control_title і статус DRAFT_HEURISTIC', () => {
  for (const id of AT_IDS) {
    const e = ref.entries[id];
    assert.ok(e, `${id} має бути в довіднику`);
    assert.ok(e.control_title?.length > 0, `${id}: control_title`);
    assert.ok(e.verification_statement?.length > 20, `${id}: verification_statement має бути змістовним`);
    assert.ok(e.source_requirement_text?.length > 0, `${id}: source_requirement_text`);
    assert.equal(e.status, 'DRAFT_HEURISTIC');
  }
});

test('плейсхолдери {{ insert: param, ... }} у verification_statement — лише ті, що реально є в НД ТЗІ для цього заходу', () => {
  assert.ok(ref.entries['AT-2'].verification_statement.includes('{{ insert: param, at-2_odp.01 }}'));
  assert.ok(ref.entries['AT-2(4)'].verification_statement.includes('{{ insert: param, at-2.4_odp.01 }}'));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/assessment/checklist-reference.test.js`
Expected: FAIL — `ENOENT: no such file or directory, open '.../data/assessment/checklist_reference.json'`

- [ ] **Step 3: Implement**

Create `data/assessment/checklist_reference.json` (content below is the full pilot dictionary — родина AT, validated with the user on 2026-10-06):

```json
{
  "entries": {
    "AT-1": {
      "control_title": "ПОЛІТИКА ТА ПРОЦЕДУРИ ПІДВИЩЕННЯ ОБІЗНАНОСТІ ТА НАВЧАННЯ",
      "verification_statement": "Перевірити документовану політику та процедури підвищення обізнаності та навчання: запросити затверджений документ політики {{ insert: param, at-1_odp.01 }} та процедури {{ insert: param, at-1_odp.02 }}. Переконатися, що документ політики містить мету, сферу застосування, ролі, обов'язки, відповідальність керівництва, координацію між підрозділами та механізм контролю відповідності, а також узгоджений із чинними нормативними вимогами. Перевірити призначення відповідального/підрозділу {{ insert: param, at-1_odp.03 }} за управління політикою (наказ про призначення). Звірити дату останнього перегляду політики з установленою періодичністю {{ insert: param, at-1_odp.04 }} та {{ insert: param, at-1_odp.05 }}, а процедур — з {{ insert: param, at-1_odp.06 }} та {{ insert: param, at-1_odp.07 }}. Дата останнього перегляду не повинна перевищувати встановлену періодичність.",
      "source_requirement_text": "a. Розробити, задокументувати та поширити {{ insert: param, at-1_odp.01 }}: 1. {{ insert: param, at-1_odp.02 }} політики обізнаності та навчання у сфері забезпечення безпеки та приватності; 2. Процедури, що сприяють реалізації політики. b. Призначити {{ insert: param, at-1_odp.03 }} для управління політикою та процедурами. c. Переглядати та оновлювати: 1. Поточну політику {{ insert: param, at-1_odp.04 }} і наступне {{ insert: param, at-1_odp.05 }}; 2. Процедури {{ insert: param, at-1_odp.06 }} та наступні {{ insert: param, at-1_odp.07 }}.",
      "status": "DRAFT_HEURISTIC"
    },
    "AT-2": {
      "control_title": "НАВЧАННЯ З ПІДВИЩЕННЯ ОБІЗНАНОСТІ",
      "verification_statement": "Перевірити програму навчання з підвищення обізнаності: запросити затверджену програму/план навчання та журнал проведення тренінгів. Переконатися, що: (1) кожен новий користувач (включно з менеджерами, керівниками та підрядниками) пройшов початкове навчання до надання доступу до системи — звірити дату допуску користувача з датою проходження навчання в журналі; (2) навчання повторюється з періодичністю {{ insert: param, at-2_odp.01 }} — звірити дати повторних тренінгів кожного користувача з цією періодичністю; (3) позапланове навчання проводилось після {{ insert: param, at-2_odp.02 }} — перевірити наявність записів про такі сесії; (4) застосовуються методи підвищення обізнаності {{ insert: param, at-2_odp.03 }} — запросити матеріали/розсилки, що підтверджують їх використання; (5) зміст навчання оновлювався з періодичністю {{ insert: param, at-2_odp.04 }} та після {{ insert: param, at-2_odp.05 }} — звірити версії матеріалів і дати оновлення; (6) матеріали містять розділ з уроками з реальних інцидентів безпеки. Кількість користувачів, що пройшли навчання, має дорівнювати кількості користувачів з активним доступом до системи на дату перевірки.",
      "source_requirement_text": "a. Забезпечити навчання грамотності з питань безпеки та конфіденційності для користувачів системи: 1. як частину початкового навчання для нових користувачів і {{ insert: param, at-2_odp.01 }} після цього; 2. якщо цього потребують системні зміни або наступні {{ insert: param, at-2_odp.02 }}. b. Використовувати методи підвищення обізнаності {{ insert: param, at-2_odp.03 }}; c. Оновлювати навчання {{ insert: param, at-2_odp.04 }} і наступні {{ insert: param, at-2_odp.05 }}; d. Включити уроки з реальних інцидентів безпеки.",
      "status": "DRAFT_HEURISTIC"
    },
    "AT-2(1)": {
      "control_title": "НАВЧАННЯ З ПІДВИЩЕННЯ ОБІЗНАНОСТІ - ПРАКТИЧНІ ЗАНЯТТЯ",
      "verification_statement": "Перевірити наявність практичних занять (симуляцій) з тренування обізнаності — запросити сценарії вправ, що імітують інциденти безпеки/приватності, та журнал проведення з переліком учасників і датами.",
      "source_requirement_text": "Ввести до програми навчання практичні заняття (вправи) з тренування обізнаності, які імітують інциденти в області безпеки та приватності.",
      "status": "DRAFT_HEURISTIC"
    },
    "AT-2(2)": {
      "control_title": "НАВЧАННЯ З ПІДВИЩЕННЯ ОБІЗНАНОСТІ - ВНУТРІШНІ ЗАГРОЗИ",
      "verification_statement": "Перевірити наявність у програмі навчання вправ з розпізнавання індикаторів внутрішніх загроз — запросити матеріали курсу з переліком індикаторів (поведінкових, технічних) та підтвердження проходження модуля учасниками.",
      "source_requirement_text": "Ввести до програми навчання вправи з розпізнавання та виявлення потенційних індикаторів внутрішніх загроз.",
      "status": "DRAFT_HEURISTIC"
    },
    "AT-2(3)": {
      "control_title": "НАВЧАННЯ З ПІДВИЩЕННЯ ОБІЗНАНОСТІ - СОЦІАЛЬНА ІНЖЕНЕРІЯ ТА СОЦІАЛЬНИЙ ІНТЕЛЕКТУАЛЬНИЙ АНАЛІЗ ДАНИХ",
      "verification_statement": "Перевірити наявність модуля з розпізнавання соціальної інженерії та методів аналізу соціальних даних — запросити матеріали модуля та підтвердження проходження користувачами (дати, список учасників).",
      "source_requirement_text": "Ввести до програми навчання вправи з підвищення обізнаності щодо розпізнавання та повідомлення про потенційні та фактичні атаки, з використанням методів соціальної інженерії та інтелектуального аналізу соціальних даних.",
      "status": "DRAFT_HEURISTIC"
    },
    "AT-2(4)": {
      "control_title": "НАВЧАННЯ З ПІДВИЩЕННЯ ОБІЗНАНОСТІ - ПІДОЗРІЛІ ПОВІДОМЛЕННЯ ТА АНОМАЛЬНА ПОВЕДІНКА СИСТЕМИ",
      "verification_statement": "Перевірити проведення навчання щодо розпізнавання підозрілих повідомлень і аномальної поведінки системи за допомогою {{ insert: param, at-2.4_odp.01 }} — запросити матеріали модуля (приклади індикаторів) та журнал проходження.",
      "source_requirement_text": "Провести навчання грамотності щодо розпізнавання підозрілих комунікацій і аномальної поведінки в системах організації за допомогою {{ insert: param, at-2.4_odp.01 }}.",
      "status": "DRAFT_HEURISTIC"
    },
    "AT-2(5)": {
      "control_title": "НАВЧАННЯ З ПІДВИЩЕННЯ ОБІЗНАНОСТІ - ВДОСКОНАЛЕНА СТІЙКА ЗАГРОЗА",
      "verification_statement": "Перевірити наявність окремого модуля навчання щодо вдосконаленої стійкої загрози (APT) — запросити матеріали й підтвердження проходження відповідальними користувачами (адміністратори, керівництво ІБ).",
      "source_requirement_text": "Забезпечити навчання грамотності щодо стійкої постійної загрози.",
      "status": "DRAFT_HEURISTIC"
    },
    "AT-2(6)": {
      "control_title": "НАВЧАННЯ З ПІДВИЩЕННЯ ОБІЗНАНОСТІ - СЕРЕДОВИЩЕ КІБЕРЗАГРОЗ",
      "verification_statement": "Перевірити: (a) наявність модуля щодо поточного середовища кіберзагроз — матеріали, дата останнього оновлення; (b) механізм доведення актуальної інформації про кіберзагрози до персоналу під час експлуатації (розсилки, бюлетені) — запросити приклади за останній період і звірити дату останнього повідомлення з поточною актуальністю загроз.",
      "source_requirement_text": "a. Забезпечити навчання грамотності щодо середовища кіберзагроз; і b. Відображати поточну інформацію про кіберзагрози в операціях системи.",
      "status": "DRAFT_HEURISTIC"
    },
    "AT-3": {
      "control_title": "РОЛЬОВЕ НАВЧАННЯ",
      "verification_statement": "Перевірити програму рольового навчання: запросити перелік ролей/посад {{ insert: param, at-3_odp.01 }}, для яких передбачене рольове навчання, та журнал проходження. Переконатися, що: (1) кожен працівник із зазначеною роллю пройшов навчання до авторизації доступу/виконання обов'язків і повторно з періодичністю {{ insert: param, at-3_odp.02 }} — звірити дату призначення на посаду з датою навчання; (2) навчальний контент оновлювався з періодичністю {{ insert: param, at-3_odp.03 }} та після {{ insert: param, at-3_odp.04 }}; (3) матеріали містять інформацію з реальних інцидентів/порушень безпеки. Кількість працівників із зазначеними ролями, що пройшли навчання, має дорівнювати кількості працівників, які фактично обіймають ці ролі на дату перевірки.",
      "source_requirement_text": "a. Забезпечити проведення навчання з питань безпеки та приватності на основі ролей для працівників з ролями та обов'язками: {{ insert: param, at-3_odp.01 }}: 1. перед авторизацією доступу і {{ insert: param, at-3_odp.02 }} після цього; 2. коли цього потребують системні зміни. b. Оновити навчальний контент {{ insert: param, at-3_odp.03 }} і наступні {{ insert: param, at-3_odp.04 }}; c. Включити інформацію з реальних інцидентів та порушень безпеки.",
      "status": "DRAFT_HEURISTIC"
    },
    "AT-3(1)": {
      "control_title": "РОЛЬОВЕ НАВЧАННЯ - ЗАХОДИ ЗАХИСТУ РОБОЧОГО СЕРЕДОВИЩА",
      "verification_statement": "Перевірити проведення підготовки з питань застосування заходів захисту робочого середовища — запросити журнал проходження з датою початку роботи кожного працівника і датами повторної підготовки з періодичністю {{ insert: param, at-3.1_odp.02 }}; звірити дату початку роботи з датою першої підготовки {{ insert: param, at-3.1_odp.01 }}.",
      "source_requirement_text": "Надати {{ insert: param, at-3.1_odp.01 }} з початку роботи та з {{ insert: param, at-3.1_odp.02 }} підготовку з питань застосування заходів захисту робочого середовища.",
      "status": "DRAFT_HEURISTIC"
    },
    "AT-3(2)": {
      "control_title": "РОЛЬОВЕ НАВЧАННЯ - ФІЗИЧНІ ЗАХОДИ БЕЗПЕКИ",
      "verification_statement": "Перевірити проведення підготовки з питань застосування та експлуатації заходів фізичної безпеки — запросити журнал проходження з датою початку роботи {{ insert: param, at-3.2_odp.01 }} кожного працівника і датами повторної підготовки з періодичністю {{ insert: param, at-3.2_odp.02 }}.",
      "source_requirement_text": "Надати {{ insert: param, at-3.2_odp.01 }} з початку роботи та з {{ insert: param, at-3.2_odp.02 }} підготовку з питань застосування та експлуатації заходів фізичної безпеки.",
      "status": "DRAFT_HEURISTIC"
    },
    "AT-3(3)": {
      "control_title": "РОЛЬОВЕ НАВЧАННЯ - ПРАКТИЧНІ ЗАНЯТТЯ",
      "verification_statement": "Перевірити наявність практичних занять з безпеки та приватності в програмі рольового навчання — запросити сценарії/матеріали практичних занять і журнал проведення з переліком учасників та датами.",
      "source_requirement_text": "Ввести до програми навчання практичні заняття з безпеки та приватності, які мають підкріпити досягнення цілей навчання.",
      "status": "DRAFT_HEURISTIC"
    },
    "AT-3(5)": {
      "control_title": "РОЛЬОВЕ НАВЧАННЯ - ОБРОБКА ПЕРСОНАЛЬНИХ ДАНИХ",
      "verification_statement": "Перевірити навчання з використання та управління обробкою персональних даних і контролю прозорості — запросити журнал проходження початкового навчання {{ insert: param, at-3.5_odp.01 }} для працівників, що обробляють персональні дані, та повторного навчання з періодичністю {{ insert: param, at-3.5_odp.02 }}.",
      "source_requirement_text": "Забезпечити {{ insert: param, at-3.5_odp.01 }} початкове та {{ insert: param, at-3.5_odp.02 }} навчання з використання та управління обробкою персональних даних та контролю прозорості.",
      "status": "DRAFT_HEURISTIC"
    },
    "AT-4": {
      "control_title": "НАВЧАЛЬНІ ЗАПИСИ",
      "verification_statement": "Перевірити ведення навчальних записів: запросити журнал обліку індивідуальних навчальних заходів (базова підготовка з безпеки/приватності та спеціальна підготовка визначених посадових осіб) та підтвердити термін зберігання записів не менше {{ insert: param, at-4_odp.01 }}. Звірити найстарший запис у журналі — дата видалення/архівації не повинна настати раніше встановленого терміну зберігання.",
      "source_requirement_text": "a. Документувати та відстежувати індивідуальні навчальні заходи із забезпечення безпеки та приватності. b. Зберігати індивідуальні записи про навчання впродовж {{ insert: param, at-4_odp.01 }}.",
      "status": "DRAFT_HEURISTIC"
    },
    "AT-6": {
      "control_title": "ВІДГУКИ ПРО ПРОВЕДЕНІ НАВЧАННЯ",
      "verification_statement": "Перевірити надання відгуку про результати організаційного навчання визначеному персоналу {{ insert: param, at-6_odp.01 }} — запросити звіт/розсилку з результатами навчання (статистика проходження, виявлені прогалини) та підтвердження отримання відповідальними особами (лист розсилки, підпис про ознайомлення).",
      "source_requirement_text": "Надати відгук про результати організаційного навчання наступному персоналу {{ insert: param, at-6_odp.01 }}.",
      "status": "DRAFT_HEURISTIC"
    }
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/assessment/checklist-reference.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add data/assessment/checklist_reference.json test/assessment/checklist-reference.test.js
git commit -m "feat: pilot checklist_reference.json for AT family (15 entries)"
```

---

### Task 4: `buildAssessmentPlan` builds `plan.checklist[]`

**Files:**
- Modify: `core/assessment/assessment-plan.js`
- Test: `test/assessment/assessment-plan.test.js`

**Interfaces:**
- Consumes: `resolveChecklistStatement` from Task 2; `checklist_reference.json` shape from Task 3.
- Produces: `buildAssessmentPlan({ approvedState, catalogs, assessmentCatalog, adapter, checklistReference }) => { items, checklist, warnings }`. `checklistReference` is optional (defaults to `{ entries: {} }` — backward compatible with all existing callers that don't pass it). Each `checklist[]` entry: `{ canonical_control_id, control_id, family, family_title, control_title, verification_statement: string|null, source_status: 'GENERATED'|'MANUAL_REQUIRED', included: true, exclusion_reason: null }`. Consumed by Task 5 (server.js call site), Task 8 (UI/report filtering), Task 9 (docx projection).

- [ ] **Step 1: Write the failing test**

Add to `test/assessment/assessment-plan.test.js` (after existing imports, load the new fixture and extend the `buildAssessmentPlan` call):

```js
import { readFile } from 'node:fs/promises';
// ...existing imports stay above...
const checklistReference = JSON.parse(await readFile(new URL('../../data/assessment/checklist_reference.json', import.meta.url), 'utf8'));

const { items, checklist, warnings } = buildAssessmentPlan({ approvedState, catalogs, assessmentCatalog, adapter, checklistReference });

test('plan.checklist: один запис на APPLIED control/enhancement, не на statement_path', () => {
  assert.ok(checklist.length > 0);
  const ids = checklist.map(c => c.canonical_control_id);
  assert.equal(new Set(ids).size, ids.length, 'без дублікатів control/enhancement');
  // AT-2 застосовний в АС-2 фікстурі — має прийти з довідника як GENERATED
  const at2 = checklist.find(c => c.canonical_control_id === 'AT-2');
  assert.ok(at2, 'AT-2 має бути в чеклісті (застосовний в АС-2)');
  assert.equal(at2.source_status, 'GENERATED');
  assert.ok(at2.verification_statement.includes('Перевірити програму навчання'));
  assert.equal(at2.included, true);
  assert.equal(at2.exclusion_reason, null);
});

test('plan.checklist: заходи без запису в довіднику → MANUAL_REQUIRED, verification_statement null', () => {
  const noRef = checklist.find(c => c.source_status === 'MANUAL_REQUIRED');
  assert.ok(noRef, 'мають бути заходи поза пілотним довідником (поки лише AT покрито)');
  assert.equal(noRef.verification_statement, null);
});

test('buildAssessmentPlan без checklistReference (backward-compat) — усі MANUAL_REQUIRED', () => {
  const { checklist: c2 } = buildAssessmentPlan({ approvedState, catalogs, assessmentCatalog, adapter });
  assert.ok(c2.length > 0);
  assert.ok(c2.every(c => c.source_status === 'MANUAL_REQUIRED' && c.verification_statement === null));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/assessment/assessment-plan.test.js`
Expected: FAIL — `checklist` is `undefined` (buildAssessmentPlan doesn't return it yet).

- [ ] **Step 3: Implement**

In `core/assessment/assessment-plan.js`, add the import and a node-indexing helper near the top (after existing imports):

```js
import { STATUS } from '../profile-engine.js';
import { normalizeControlId, denormalizeControlId } from './control-id.js';
import { indexAdapter } from './odp-adapter.js';
import { resolveEffectiveValue, baselineValue } from './effective-value-resolver.js';
import { resolveAssessmentObjective } from './objective-resolver.js';
import { resolveChecklistStatement } from './checklist-resolver.js';
```

Add this function near `indexNdStatements` (same file, before `buildAssessmentPlan`):

```js
// canonical_id (базовий захід АБО посилення) → { family, family_title, control_title } — для plan.checklist
function indexNdNodes(ndTzi) {
  const map = new Map();
  for (const fam of ndTzi.document.security_families)
    for (const c of fam.controls) {
      map.set(c.canonical_id, { family: c.family, family_title: fam.title, control_title: c.title });
      for (const ch of c.children ?? [])
        map.set(ch.canonical_id, { family: c.family, family_title: fam.title, control_title: ch.title });
    }
  return map;
}
```

Update the `buildAssessmentPlan` signature and add checklist-building logic (edit the existing function):

```js
export function buildAssessmentPlan({ approvedState, catalogs, assessmentCatalog, adapter, checklistReference = { entries: {} } }) {
  const items = [];
  const warnings = [];
  const adapterIndex = indexAdapter(adapter);
  const ndStatements = indexNdStatements(catalogs.ndTzi);
  const ndNodes = indexNdNodes(catalogs.ndTzi);
  const cpb = { info_type: approvedState.info_type, profile: approvedState.profile };
  const genericDefaults = catalogs.genericDefaults;
  const applicable = cpbApplicableControlIds(approvedState, catalogs);
```

(the rest of the existing function body up to the `effectiveValueFor` definition is unchanged). Immediately after the existing `effectiveValueFor` closure definition (right before the `for (const [controlId, statusKey] of applicable) {` loop that builds `items`), insert the checklist-building loop:

```js
  const checklistEntries = checklistReference.entries ?? {};
  const checklist = [];
  for (const [controlId, statusKey] of applicable) {
    if (CPB_STATUS_MAP[statusKey] !== 'APPLIED') continue;
    const canonicalId = normalizeControlId(controlId);
    const ndNode = ndNodes.get(canonicalId);
    if (!ndNode) continue; // не знайдено в НД ТЗІ — не повинно траплятись для застосовних заходів
    const refEntry = checklistEntries[canonicalId];
    let verification_statement = null;
    let source_status = 'MANUAL_REQUIRED';
    if (refEntry) {
      const { resolved_statement } = resolveChecklistStatement({
        template: refEntry.verification_statement,
        effectiveValueFor: (localOdpId) => effectiveValueFor(localOdpId),
      });
      verification_statement = resolved_statement;
      source_status = 'GENERATED';
    }
    checklist.push({
      canonical_control_id: canonicalId,
      control_id: denormalizeControlId(canonicalId),
      family: ndNode.family,
      family_title: ndNode.family_title,
      control_title: ndNode.control_title,
      verification_statement,
      source_status,
      included: true,
      exclusion_reason: null,
    });
  }
```

Finally, update the function's return statement:

```js
  return { items, checklist, warnings: dedup };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/assessment/assessment-plan.test.js`
Expected: PASS. Also run the full assessment suite to confirm no regression: `node --test test/assessment/`

- [ ] **Step 5: Commit**

```bash
git add core/assessment/assessment-plan.js test/assessment/assessment-plan.test.js
git commit -m "feat: buildAssessmentPlan returns plan.checklist[] (control/enhancement granularity)"
```

---

### Task 5: `assessment-io.js` — статус `PLANNING`, схема, міграція

**Files:**
- Modify: `core/assessment/assessment-io.js`
- Test: `test/assessment/assessment-io.test.js`

**Interfaces:**
- Consumes: `plan.checklist` from Task 4 (passed in by caller as `plan: { items, checklist }`).
- Produces: `makeAssessment(...)` now sets `status: 'PLANNING'` and `plan.checklist` (defaults `[]` if caller omits it); `validateAssessmentSchema` requires `plan.checklist` to be an array; `migrateAssessment` backfills `plan.checklist: []` for both v1→v3 and already-v3 objects missing it.

- [ ] **Step 1: Write the failing test**

Add to `test/assessment/assessment-io.test.js`:

```js
test('makeAssessment v3: статус PLANNING (не IN_PROGRESS), plan.checklist присутній', () => {
  const a = makeAssessment({ approvedRecord, approvedName: 'test', plan, warnings: [], id: 'ASSESS-2026-004' });
  assert.equal(a.status, 'PLANNING');
  assert.deepEqual(a.plan.checklist, []);
});

test('makeAssessment: передає checklist, якщо наданий', () => {
  const planWithChecklist = { ...plan, checklist: [{ canonical_control_id: 'AT-2', control_id: 'AT-02', family: 'AT',
    family_title: 'Обізнаність', control_title: 'X', verification_statement: 'текст', source_status: 'GENERATED',
    included: true, exclusion_reason: null }] };
  const a = makeAssessment({ approvedRecord, approvedName: 'test', plan: planWithChecklist, warnings: [], id: 'ASSESS-2026-005' });
  assert.equal(a.plan.checklist.length, 1);
  assert.equal(validateAssessmentSchema(a).length, 0);
});

test('validateAssessmentSchema: вимагає plan.checklist як масив', () => {
  const a = makeAssessment({ approvedRecord, approvedName: 'test', plan, warnings: [], id: 'ASSESS-2026-006' });
  a.plan.checklist = 'не масив';
  assert.ok(validateAssessmentSchema(a).some(e => e.includes('plan.checklist')));
});

test('migrateAssessment: v3-об\u02BCєкт без plan.checklist отримує backfill []', () => {
  const a = makeAssessment({ approvedRecord, approvedName: 'test', plan, warnings: [], id: 'ASSESS-2026-007' });
  delete a.plan.checklist;
  const migrated = migrateAssessment(a);
  assert.deepEqual(migrated.plan.checklist, []);
  assert.notEqual(migrated, a, 'має повернути новий обʼєкт при backfill');
});

test('migrateAssessment: v3-об\u02BCєкт з наявним plan.checklist — identity (без змін)', () => {
  const a = makeAssessment({ approvedRecord, approvedName: 'test', plan, warnings: [], id: 'ASSESS-2026-008' });
  assert.equal(migrateAssessment(a), a);
});
```

Also update the existing v1-migration test's assertion block to check the backfilled checklist:

```js
  const planItem = a.plan.items.find(i => i.assessment_source_id === 'AC-02.e');
  assert.equal(planItem.resolved_objective, 'текст');
  assert.deepEqual(a.plan.checklist, [], 'v1→v3 міграція додає порожній plan.checklist');
  // v3 проходить без змін
  assert.equal(migrateAssessment(a), a);
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/assessment/assessment-io.test.js`
Expected: FAIL — `a.status` is `'IN_PROGRESS'`, `a.plan.checklist` is `undefined`, schema validation doesn't flag non-array checklist.

- [ ] **Step 3: Implement**

In `core/assessment/assessment-io.js`, update `makeAssessment`:

```js
export function makeAssessment({ approvedRecord, approvedName, plan, warnings, id, startedBy = '' }) {
  const now = new Date().toISOString();
  return {
    kind: 'assessment',
    schema_version: '3.0.0',
    id: id ?? nextAssessmentId([]),
    created_at: now,
    updated_at: now,
    status: 'PLANNING',
    started_by: startedBy,
    finalized_at: null,
    finalized_by: null,
```

(metadata/cpb_snapshot block stays unchanged). Update the `plan`/`results` assignment at the bottom of the same object literal:

```js
    warnings: warnings ?? [],
    plan: { items: plan.items, checklist: plan.checklist ?? [] },
    results: plan.items.map(i => emptyResult(i.assessment_source_id)),
```

Update `migrateAssessment`'s v3 short-circuit:

```js
export function migrateAssessment(obj) {
  if (obj?.schema_version?.startsWith('3.')) {
    if (Array.isArray(obj.plan?.checklist)) return obj;
    return { ...obj, plan: { ...obj.plan, checklist: [] } };
  }
  const now = new Date().toISOString();
```

Update the v1→v3 migration's return statement:

```js
  return {
    ...obj,
    schema_version: '3.0.0',
    started_by: obj.started_by ?? '',
    finalized_at: obj.finalized_at ?? null,
    finalized_by: obj.finalized_by ?? null,
    plan: { items: planItems, checklist: [] },
    results,
    evidence,
    findings,
    items: undefined,
  };
```

Update `validateAssessmentSchema`:

```js
  if (!Array.isArray(obj.plan?.items)) errs.push('plan.items має бути масивом');
  if (!Array.isArray(obj.plan?.checklist)) errs.push('plan.checklist має бути масивом');
  if (!Array.isArray(obj.results)) errs.push('results має бути масивом');
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/assessment/assessment-io.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add core/assessment/assessment-io.js test/assessment/assessment-io.test.js
git commit -m "feat: assessments start in PLANNING status with plan.checklist"
```

---

### Task 6: `approvePlan()` + фіналізація блокується до погодження плану

**Files:**
- Modify: `core/assessment/assessment-run.js`
- Test: `test/assessment/assessment-run.test.js`

**Interfaces:**
- Produces: `approvePlan(assessment) => assessment` (throws if `status !== 'PLANNING'`) — consumed by Task 11 (server route). `finalizeAssessment` now also throws if `status === 'PLANNING'`.

- [ ] **Step 1: Write the failing test**

Update `test/assessment/assessment-run.test.js` — the existing `finalizeAssessment` test must first call `approvePlan` (since `base()` now starts at `PLANNING`, per Task 5), and add new tests:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeAssessment } from '../../core/assessment/assessment-io.js';
import { updateResult, finalizeAssessment, approvePlan, RESULT_VALUES } from '../../core/assessment/assessment-run.js';

const plan = { items: [{ assessment_source_id: 'AC-02e', control_id: 'AC-02', available_methods: ['EXAMINE', 'TEST'], odp_values: [] }] };
const approvedRecord = { state: { passport: {}, info_type: 'open_confidential' } };
const base = () => makeAssessment({ approvedRecord, approvedName: 'x', plan, warnings: [], id: 'ASSESS-2026-009' });

test('updateResult: enum, методи, immutability, before/after', () => {
  const a = approvePlan(base());
  const { assessment, before, after } = updateResult(a, 'AC-02e', { result: 'SATISFIED', methods_used: ['EXAMINE'] });
  assert.equal(after.result, 'SATISFIED');
  assert.equal(before.result, 'NOT_ASSESSED');
  assert.equal(a.results[0].result, 'NOT_ASSESSED'); // вихідний не мутований
  assert.equal(assessment.results[0].result, 'SATISFIED');
  assert.throws(() => updateResult(a, 'AC-02e', { result: 'POSITIVE' }), /result/);
  assert.throws(() => updateResult(a, 'AC-02e', { methods_used: ['OBSERVE'] }), /метод/i);
  assert.throws(() => updateResult(a, 'нема', {}), /не знайдено/i);
  assert.deepEqual(RESULT_VALUES, ['NOT_ASSESSED', 'SATISFIED', 'PARTIALLY_SATISFIED', 'NOT_SATISFIED', 'NOT_APPLICABLE']);
});

test('approvePlan: PLANNING → IN_PROGRESS, інакше — помилка', () => {
  const a = base();
  assert.equal(a.status, 'PLANNING');
  const approved = approvePlan(a);
  assert.equal(approved.status, 'IN_PROGRESS');
  assert.equal(a.status, 'PLANNING', 'вихідний не мутований');
  assert.throws(() => approvePlan(approved), /PLANNING/);
});

test('finalizeAssessment: заборонено, поки план не погоджено (PLANNING)', () => {
  assert.throws(() => finalizeAssessment(base(), { finalizedBy: 'x' }), /план|PLANNING/i);
});

test('finalizeAssessment: read-only після FINALIZED', () => {
  const a = finalizeAssessment(approvePlan(base()), { finalizedBy: 'Оцінювач' });
  assert.equal(a.status, 'FINALIZED');
  assert.ok(a.finalized_at);
  assert.throws(() => updateResult(a, 'AC-02e', { result: 'SATISFIED' }), /finalized|фіналізован/i);
  assert.throws(() => finalizeAssessment(a, { finalizedBy: 'x' }), /finalized|фіналізован/i);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/assessment/assessment-run.test.js`
Expected: FAIL — `approvePlan` is not exported; `finalizeAssessment(base())` doesn't throw for `PLANNING`.

- [ ] **Step 3: Implement**

In `core/assessment/assessment-run.js`, update `assertMutable` and `finalizeAssessment`, and add `approvePlan`:

```js
function assertMutable(assessment) {
  if (assessment.status === 'FINALIZED') throw new Error('оцінювання фіналізовано — зміни заборонені');
}

export function approvePlan(assessment) {
  if (assessment.status !== 'PLANNING') throw new Error('план можна погодити лише зі статусу PLANNING');
  return { ...assessment, status: 'IN_PROGRESS', updated_at: new Date().toISOString() };
}

export function updateResult(assessment, assessmentSourceId, patch) {
  assertMutable(assessment);
  // ...existing body unchanged...
```

Update `finalizeAssessment`:

```js
export function finalizeAssessment(assessment, { finalizedBy = '' } = {}) {
  assertMutable(assessment);
  if (assessment.status === 'PLANNING') throw new Error('план ще не погоджено (PLANNING) — спершу розпочніть оцінювання');
  const now = new Date().toISOString();
  return { ...assessment, status: 'FINALIZED', finalized_at: now, finalized_by: finalizedBy, updated_at: now };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/assessment/assessment-run.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add core/assessment/assessment-run.js test/assessment/assessment-run.test.js
git commit -m "feat: approvePlan transitions PLANNING to IN_PROGRESS; finalize requires approved plan"
```

---

### Task 7: Каскадне виключення у валідації фіналізації

**Files:**
- Modify: `core/assessment/assessment-validator.js`
- Test: `test/assessment/assessment-validator.test.js`

**Interfaces:**
- Produces: `validateAssessment(assessment)` now skips per-result validation for any result whose `plan.items[].control_id` matches a `plan.checklist[]` entry with `included === false`.

- [ ] **Step 1: Write the failing test**

Add to `test/assessment/assessment-validator.test.js`:

```js
test('validateAssessment: виключений на рівні чекліста control_id звільняє результат від валідації', () => {
  const a = {
    plan: {
      items: [{ assessment_source_id: 'x', control_id: 'AT-02' }],
      checklist: [{ control_id: 'AT-02', included: false }],
    },
    results: [{ assessment_source_id: 'x', result: 'SATISFIED', evidence_ids: [], finding_ids: [], assessor_comment: '' }],
    evidence: [], findings: [],
  };
  assert.deepEqual(validateAssessment(a), [], 'SATISFIED без evidence мало б падати, але control_id виключено');
});

test('validateAssessment: не-виключені результати валідуються як і раніше', () => {
  const a = {
    plan: {
      items: [{ assessment_source_id: 'x', control_id: 'AT-02' }],
      checklist: [{ control_id: 'AT-02', included: true }],
    },
    results: [{ assessment_source_id: 'x', result: 'SATISFIED', evidence_ids: [], finding_ids: [], assessor_comment: '' }],
    evidence: [], findings: [],
  };
  assert.ok(validateAssessment(a).length > 0);
});

test('validateAssessment: без plan.checklist (старі записи) — поведінка як і раніше', () => {
  const a = { results: [{ assessment_source_id: 'x', result: 'NOT_ASSESSED', evidence_ids: ['EV-404'], finding_ids: [], assessor_comment: '' }],
    evidence: [], findings: [] };
  assert.ok(validateAssessment(a).some(e => e.includes('EV-404')));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/assessment/assessment-validator.test.js`
Expected: FAIL — exclusion test produces validation errors (cascade not implemented yet).

- [ ] **Step 3: Implement**

In `core/assessment/assessment-validator.js`, update `validateAssessment`:

```js
export function validateAssessment(assessment) {
  const errs = [];
  const evidenceIds = new Set((assessment.evidence ?? []).map(e => e.evidence_id));
  const findingIds = new Set((assessment.findings ?? []).map(f => f.finding_id));
  const excludedControlIds = new Set(
    (assessment.plan?.checklist ?? []).filter(c => c.included === false).map(c => c.control_id)
  );
  const controlIdBySourceId = new Map((assessment.plan?.items ?? []).map(i => [i.assessment_source_id, i.control_id]));
  for (const r of assessment.results ?? []) {
    if (excludedControlIds.has(controlIdBySourceId.get(r.assessment_source_id))) continue;
    errs.push(...validateResult(r, { findings: assessment.findings ?? [] }));
    for (const id of r.evidence_ids) if (!evidenceIds.has(id)) errs.push(`${r.assessment_source_id}: посилання на неіснуючий доказ ${id}`);
    for (const id of r.finding_ids) if (!findingIds.has(id)) errs.push(`${r.assessment_source_id}: посилання на неіснуючий недолік ${id}`);
  }
  return errs;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/assessment/assessment-validator.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add core/assessment/assessment-validator.js test/assessment/assessment-validator.test.js
git commit -m "feat: validateAssessment skips results excluded via plan.checklist"
```

---

### Task 8: Виключення прихованих заходів + показ узгодженої інструкції на дашборді

**Files:**
- Modify: `public/js/assessment/assessment-table.js`
- Modify: `core/assessment/report-projection.js`
- Test: `test/assessment/assessment-table.test.js`
- Test: `test/assessment/report-projection.test.js`

**Interfaces:**
- Produces (client `groupPlanItems`): each `controlGroup` gains `checklist_statement: string|null`; groups/controls whose `control_id` has an `included === false` checklist entry are omitted entirely.
- Produces (server `groupPlanItems` in report-projection.js): same omission behavior (no `checklist_statement` field needed there — not used in the DOCX report body).

- [ ] **Step 1: Write the failing test**

Add to `test/assessment/assessment-table.test.js`:

```js
test('groupPlanItems: виключений control_id (plan.checklist included:false) приховується повністю', () => {
  const assessment = {
    plan: {
      items: [
        { assessment_source_id: 'a1', control_id: 'AT-02', family: 'AT', family_title: 'Обізнаність', control_title: 'X' },
        { assessment_source_id: 'a2', control_id: 'AT-03', family: 'AT', family_title: 'Обізнаність', control_title: 'Y' },
      ],
      checklist: [
        { control_id: 'AT-02', included: false, verification_statement: 'текст AT-02' },
        { control_id: 'AT-03', included: true, verification_statement: 'текст AT-03' },
      ],
    },
    results: [],
  };
  const groups = groupPlanItems(assessment);
  const controlIds = groups.flatMap(g => g.controls.map(c => c.control_id));
  assert.deepEqual(controlIds, ['AT-03']);
});

test('groupPlanItems: приєднує узгоджену інструкцію перевірки (checklist_statement) до control-групи', () => {
  const assessment = {
    plan: {
      items: [{ assessment_source_id: 'a1', control_id: 'AT-02', family: 'AT', family_title: 'Обізнаність', control_title: 'X' }],
      checklist: [{ control_id: 'AT-02', included: true, verification_statement: 'Перевірити журнал навчання' }],
    },
    results: [],
  };
  const [group] = groupPlanItems(assessment);
  assert.equal(group.controls[0].checklist_statement, 'Перевірити журнал навчання');
});

test('groupPlanItems: без plan.checklist (старі записи) — нічого не приховується, checklist_statement null', () => {
  const assessment = { plan: { items: [{ assessment_source_id: 'a1', control_id: 'AT-02', family: 'AT', family_title: 'X', control_title: 'Y' }] }, results: [] };
  const [group] = groupPlanItems(assessment);
  assert.equal(group.controls[0].control_id, 'AT-02');
  assert.equal(group.controls[0].checklist_statement, null);
});
```

Add to `test/assessment/report-projection.test.js`:

```js
test('buildReportProjection: виключений control_id (plan.checklist included:false) не потрапляє у звіт', () => {
  const excludedAssessment = {
    ...assessment,
    plan: { ...assessment.plan, checklist: [{ control_id: 'AC-02', included: false }] },
  };
  const p = buildReportProjection({ assessment: excludedAssessment, cpbSnapshot: { state: {} } });
  assert.equal(p.families.length, 0, 'AC-02 — єдиний контроль у фікстурі — має зникнути повністю');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/assessment/assessment-table.test.js test/assessment/report-projection.test.js`
Expected: FAIL — no filtering/attachment logic exists yet.

- [ ] **Step 3: Implement**

In `public/js/assessment/assessment-table.js`, update `groupPlanItems`:

```js
export function groupPlanItems(assessment) {
  const resultsById = new Map((assessment.results ?? []).map(r => [r.assessment_source_id, r]));
  const checklistByControlId = new Map((assessment.plan?.checklist ?? []).map(c => [c.control_id, c]));
  const groups = [];
  const groupByFamily = new Map();

  for (const planItem of assessment.plan?.items ?? []) {
    const checklistEntry = checklistByControlId.get(planItem.control_id);
    if (checklistEntry?.included === false) continue;

    let familyGroup = groupByFamily.get(planItem.family);
    if (!familyGroup) {
      familyGroup = {
        family: planItem.family,
        family_title: planItem.family_title,
        controls: [],
        _byControl: new Map()
      };
      groupByFamily.set(planItem.family, familyGroup);
      groups.push(familyGroup);
    }

    let controlGroup = familyGroup._byControl.get(planItem.control_id);
    if (!controlGroup) {
      controlGroup = {
        control_id: planItem.control_id,
        control_title: planItem.control_title,
        checklist_statement: checklistEntry?.verification_statement ?? null,
        items: []
      };
      familyGroup._byControl.set(planItem.control_id, controlGroup);
      familyGroup.controls.push(controlGroup);
    }

    controlGroup.items.push({
      planItem,
      result: resultsById.get(planItem.assessment_source_id)
    });
  }

  // Clean up temporary _byControl maps
  for (const group of groups) {
    delete group._byControl;
  }

  return groups;
}
```

In `renderAssessmentTable` (same file), insert a context row right after the control header row block:

```js
      // Control header row — клік розгортає/згортає документ-в'ю
      tbody.append(
        el('tr', {
          class: 'group-row control',
          onclick: () => {
            if (isDocExpanded) expandedControlDocs.delete(controlKey);
            else expandedControlDocs.add(controlKey);
            rerender();
          }
        },
          el('td', { colspan: '5' },
            `${controlGroup.control_id} — ${controlGroup.control_title} `,
            el('span', { class: 'collapse-mark' }, isDocExpanded ? '▲' : '▼'))
        )
      );

      if (controlGroup.checklist_statement) {
        tbody.append(
          el('tr', { class: 'checklist-statement-row' },
            el('td', { colspan: '5' }, el('em', {}, controlGroup.checklist_statement)))
        );
      }

      if (isDocExpanded) {
```

In `core/assessment/report-projection.js`, update the internal `groupPlanItems` function (same filtering, no statement attachment needed):

```js
function groupPlanItems(assessment) {
  const resultsById = new Map((assessment.results ?? []).map(r => [r.assessment_source_id, r]));
  const excludedControlIds = new Set(
    (assessment.plan?.checklist ?? []).filter(c => c.included === false).map(c => c.control_id)
  );
  const groups = [];
  const groupByFamily = new Map();

  for (const planItem of assessment.plan?.items ?? []) {
    if (excludedControlIds.has(planItem.control_id)) continue;

    let familyGroup = groupByFamily.get(planItem.family);
```

(the rest of the function body is unchanged).

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/assessment/assessment-table.test.js test/assessment/report-projection.test.js`
Expected: PASS. Then run the full suite: `npm test`

- [ ] **Step 5: Commit**

```bash
git add public/js/assessment/assessment-table.js core/assessment/report-projection.js test/assessment/assessment-table.test.js test/assessment/report-projection.test.js
git commit -m "feat: hide checklist-excluded controls from dashboard/report; show agreed verification statement"
```

Add minimal CSS for the new row in `public/css/app.css` (append near the existing `.assessment-table` rules, after the `.assessment-table .group-row.control { cursor: pointer; }` line):

```css
.assessment-table .checklist-statement-row td { background: var(--color-muted); font-size: 0.85rem; padding: var(--space-2) var(--space-3); }
```

Commit this CSS addition together with the same commit above (amend the `git add` to include `public/css/app.css`).

---

### Task 9: `checklist-projection.js`

**Files:**
- Create: `core/assessment/checklist-projection.js`
- Test: `test/assessment/checklist-projection.test.js`

**Interfaces:**
- Produces: `buildChecklistProjection({ assessment, cpbSnapshot }) => { title: { ics_name, assessment_id, date }, system_info: { ics_name, as_class, info_type }, families: [{ family, family_title, rows: [{ control_id, control_title, verification_statement }] }] }` — consumed by Task 10.

- [ ] **Step 1: Write the failing test**

Create `test/assessment/checklist-projection.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildChecklistProjection } from '../../core/assessment/checklist-projection.js';

const assessment = {
  id: 'ASSESS-2026-010',
  metadata: { ics_name: 'АС-2', as_class: 2, info_type: 'open_confidential', assessment_start_date: '2026-10-06' },
  plan: {
    checklist: [
      { control_id: 'AT-02', control_title: 'НАВЧАННЯ', family: 'AT', family_title: 'Обізнаність', verification_statement: 'Перевірити журнал', included: true },
      { control_id: 'AT-03', control_title: 'РОЛЬОВЕ', family: 'AT', family_title: 'Обізнаність', verification_statement: null, included: true },
      { control_id: 'AC-02', control_title: 'ОБЛІК', family: 'AC', family_title: 'Доступ', verification_statement: 'текст', included: false },
    ],
  },
};

test('buildChecklistProjection: групує за родиною, виключає included:false', () => {
  const p = buildChecklistProjection({ assessment, cpbSnapshot: { state: {} } });
  assert.equal(p.title.assessment_id, 'ASSESS-2026-010');
  assert.equal(p.system_info.as_class, 2);
  assert.equal(p.families.length, 1, 'лише AT — AC-02 виключено');
  assert.equal(p.families[0].family, 'AT');
  assert.equal(p.families[0].rows.length, 2);
  assert.equal(p.items_total, 2);
});

test('buildChecklistProjection: null verification_statement → заглушка для ручного заповнення', () => {
  const p = buildChecklistProjection({ assessment, cpbSnapshot: { state: {} } });
  const row = p.families[0].rows.find(r => r.control_id === 'AT-03');
  assert.equal(row.verification_statement, '[немає згенерованої інструкції — заповніть вручну]');
});

test('buildChecklistProjection: без plan.checklist → порожні families', () => {
  const p = buildChecklistProjection({ assessment: { ...assessment, plan: {} }, cpbSnapshot: { state: {} } });
  assert.deepEqual(p.families, []);
  assert.equal(p.items_total, 0);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/assessment/checklist-projection.test.js`
Expected: FAIL — module doesn't exist.

- [ ] **Step 3: Implement**

Create `core/assessment/checklist-projection.js`:

```js
// core/assessment/checklist-projection.js
// Pure projection from assessment.plan.checklist to checklist-docx data.
// No fs imports, no Date.now().

const NO_STATEMENT_PLACEHOLDER = '[немає згенерованої інструкції — заповніть вручну]';

export function buildChecklistProjection({ assessment }) {
  const title = {
    ics_name: assessment.metadata?.ics_name ?? '',
    assessment_id: assessment.id,
    date: assessment.metadata?.assessment_start_date ?? '',
  };
  const system_info = {
    ics_name: assessment.metadata?.ics_name ?? '',
    as_class: assessment.metadata?.as_class ?? 0,
    info_type: assessment.metadata?.info_type ?? '',
  };

  const included = (assessment.plan?.checklist ?? []).filter(c => c.included !== false);
  const groupByFamily = new Map();
  const families = [];
  for (const entry of included) {
    let group = groupByFamily.get(entry.family);
    if (!group) {
      group = { family: entry.family, family_title: entry.family_title, rows: [] };
      groupByFamily.set(entry.family, group);
      families.push(group);
    }
    group.rows.push({
      control_id: entry.control_id,
      control_title: entry.control_title,
      verification_statement: entry.verification_statement ?? NO_STATEMENT_PLACEHOLDER,
    });
  }

  return { title, system_info, families, items_total: included.length };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/assessment/checklist-projection.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add core/assessment/checklist-projection.js test/assessment/checklist-projection.test.js
git commit -m "feat: buildChecklistProjection for checklist DOCX export"
```

---

### Task 10: `checklist-docx-writer.js`

**Files:**
- Modify: `core/docx/assessment-docx-writer.js` (export `packAssessmentDocx`)
- Create: `core/docx/checklist-docx-writer.js`
- Test: `test/assessment/checklist-docx-writer.test.js`

**Interfaces:**
- Consumes: `buildChecklistProjection` output from Task 9; `par`, `table`, `row`, `cell` from `core/docx/docx-writer.js`.
- Produces: `buildChecklistDocx({ projection }) => Buffer` — consumed by Task 11.

- [ ] **Step 1: Write the failing test**

Create `test/assessment/checklist-docx-writer.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { buildChecklistDocx } from '../../core/docx/checklist-docx-writer.js';
import { buildChecklistProjection } from '../../core/assessment/checklist-projection.js';

const assessment = {
  id: 'ASSESS-2026-011',
  metadata: { ics_name: 'АС-2', as_class: 2, info_type: 'open_confidential', assessment_start_date: '2026-10-06' },
  plan: { checklist: [
    { control_id: 'AT-02', control_title: 'НАВЧАННЯ З ПІДВИЩЕННЯ ОБІЗНАНОСТІ', family: 'AT', family_title: 'Обізнаність та навчання',
      verification_statement: 'Перевірити журнал проведення тренінгів.', included: true },
  ] },
};

test('DOCX проходить unzip -t валідацію', () => {
  const projection = buildChecklistProjection({ assessment });
  const buf = buildChecklistDocx({ projection });
  const file = join(mkdtempSync(join(tmpdir(), 'checklist-docx-')), 'test.docx');
  writeFileSync(file, buf);
  const out = execFileSync('unzip', ['-t', file], { encoding: 'utf8' });
  assert.match(out, /No errors detected/);
});

test('document.xml містить назву ІКС, родину і текст інструкції', () => {
  const projection = buildChecklistProjection({ assessment });
  const buf = buildChecklistDocx({ projection });
  const file = join(mkdtempSync(join(tmpdir(), 'checklist-docx-')), 'test.docx');
  writeFileSync(file, buf);
  const xml = execFileSync('unzip', ['-p', file, 'word/document.xml'], { encoding: 'utf8' });
  assert.match(xml, /АС-2/);
  assert.match(xml, /Обізнаність та навчання/);
  assert.match(xml, /Перевірити журнал проведення тренінгів/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/assessment/checklist-docx-writer.test.js`
Expected: FAIL — `core/docx/checklist-docx-writer.js` doesn't exist.

- [ ] **Step 3: Implement**

In `core/docx/assessment-docx-writer.js`, add `export` to the existing `packAssessmentDocx` function declaration:

```js
export function packAssessmentDocx(documentXml, dateStr) {
```

Create `core/docx/checklist-docx-writer.js`:

```js
// core/docx/checklist-docx-writer.js
import { par, table, row, cell } from './docx-writer.js';
import { packAssessmentDocx } from './assessment-docx-writer.js';

export function buildChecklistDocx({ projection }) {
  const sections = [];

  sections.push(par('Чекліст перевірки ІКС', { bold: true, sz: 32, align: 'center' }));
  sections.push(par('(для погодження плану оцінювання)', { align: 'center' }));
  sections.push(par(''));
  sections.push(par(`«${projection.title.ics_name}»`, { bold: true, align: 'center' }));
  sections.push(par(''));
  sections.push(par(`Номер оцінювання: ${projection.title.assessment_id}`));
  sections.push(par(`Дата: ${projection.title.date}`));
  sections.push(par(`Клас автоматизованої системи: ${projection.system_info.as_class}`));
  sections.push(par(`Тип інформації: ${projection.system_info.info_type}`));
  sections.push(par(''));

  for (const group of projection.families) {
    sections.push(par(`${group.family} — ${group.family_title}`, { bold: true, sz: 28 }));
    const rows = [
      row([cell('Захід', { header: true }), cell('Інструкція перевірки', { header: true })], { header: true }),
      ...group.rows.map(r => row([
        cell(`${r.control_id} — ${r.control_title}`, {}),
        cell(r.verification_statement, {}),
      ])),
    ];
    sections.push(table(rows));
    sections.push(par(''));
  }

  const documentXml = sections.join('');
  return packAssessmentDocx(documentXml, projection.title.date);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/assessment/checklist-docx-writer.test.js`
Expected: PASS. Also re-run `node --test test/assessment/assessment-docx-writer.test.js` to confirm exporting `packAssessmentDocx` didn't break the existing report writer.

- [ ] **Step 5: Commit**

```bash
git add core/docx/assessment-docx-writer.js core/docx/checklist-docx-writer.js test/assessment/checklist-docx-writer.test.js
git commit -m "feat: buildChecklistDocx for checklist export"
```

---

### Task 11: Серверні маршрути — `approve-plan`, `export/checklist-docx`, PLANNING на створенні

**Files:**
- Modify: `server.js`
- Test: `test/assessment/server-assessment.test.js`

**Interfaces:**
- Produces: `POST /api/assessments/:id/approve-plan` (200/404/409), `POST /api/assessments/:id/export/checklist-docx` (200, any status), `POST /api/assessments` now creates with `status: 'PLANNING'` and a populated `plan.checklist`, `PUT /api/assessments/:id` logs `PLAN_EDITED` instead of `RESULT_UPDATED` while `status === 'PLANNING'`.

- [ ] **Step 1: Write the failing test**

In `test/assessment/server-assessment.test.js`, update the first test's assertions and insert a new test immediately after it (before the `GET .../ мігрує v1→v3` test):

```js
test('POST /api/assessments створює v3 assessment з snapshot hash, catalog-version.json, audit ASSESSMENT_CREATED', async () => {
  const r = await fetch(BASE + '/api/assessments', {
    method: 'POST',
    body: JSON.stringify({ approved_name: 'тест-v3-джерело', actor: 'Тестувальник' })
  });
  assert.equal(r.status, 201);
  const body = await r.json();
  assert.match(body.id, /^ASSESS-\d{4}-\d{3,4}$/);
  createdId = body.id;

  // Перевірка файлів на диску
  const dir = join(ROOT, 'assessments', createdId);
  assert.ok(existsSync(join(dir, 'assessment.json')), 'assessment.json має існувати');
  assert.ok(existsSync(join(dir, 'cpb-snapshot.json')), 'cpb-snapshot.json має існувати');
  assert.ok(existsSync(join(dir, 'catalog-version.json')), 'catalog-version.json має існувати');
  assert.ok(existsSync(join(dir, 'audit-log.json')), 'audit-log.json має існувати');

  // Перевірка assessment v3
  const a = JSON.parse(readFileSync(join(dir, 'assessment.json'), 'utf8'));
  assert.equal(a.schema_version, '3.0.0');
  assert.equal(a.status, 'PLANNING', 'нові оцінювання стартують у статусі PLANNING');
  assert.ok(Array.isArray(a.plan.checklist) && a.plan.checklist.length > 0, 'plan.checklist має бути заповнений');
  assert.ok(a.cpb_snapshot.hash, 'cpb_snapshot.hash має бути встановлено');

  // Перевірка catalog-version.json
  const catVer = JSON.parse(readFileSync(join(dir, 'catalog-version.json'), 'utf8'));
  assert.ok(catVer.hashes['nd_tzi.json'], 'має містити хеш nd_tzi.json');
  assert.ok(catVer.hashes['assessment_odp_adapter.json'], 'має містити хеш assessment_odp_adapter.json');
  assert.ok(catVer.hashes['assessment_catalog.json'], 'має містити хеш assessment_catalog.json');
  assert.ok(catVer.hashes['assessment_reference.json'], 'має містити хеш assessment_reference.json');
  assert.ok(catVer.hashes['generic_parameter_defaults.json'], 'має містити хеш generic_parameter_defaults.json');
  assert.ok(catVer.hashes['checklist_reference.json'], 'має містити хеш checklist_reference.json');

  // Перевірка audit-log
  const audit = JSON.parse(readFileSync(join(dir, 'audit-log.json'), 'utf8'));
  assert.ok(Array.isArray(audit), 'audit-log має бути масивом');
  assert.equal(audit.length, 1, 'має бути 1 запис');
  assert.equal(audit[0].action, 'ASSESSMENT_CREATED');
  assert.equal(audit[0].entity_id, createdId);
  assert.equal(audit[0].actor, 'Тестувальник');
});

test('POST /api/assessments/:id/approve-plan переводить PLANNING → IN_PROGRESS (необхідно перед усіма подальшими тестами в цьому файлі)', async () => {
  const before = await (await fetch(BASE + '/api/assessments/' + createdId)).json();
  assert.equal(before.status, 'PLANNING');

  const r = await fetch(BASE + '/api/assessments/' + createdId + '/approve-plan', { method: 'POST', body: '{}' });
  assert.equal(r.status, 200);

  const after = await (await fetch(BASE + '/api/assessments/' + createdId)).json();
  assert.equal(after.status, 'IN_PROGRESS');

  const audit = JSON.parse(readFileSync(join(ROOT, 'assessments', createdId, 'audit-log.json'), 'utf8'));
  assert.ok(audit.some(e => e.action === 'PLAN_APPROVED'));

  // Повторний виклик → 409
  const r2 = await fetch(BASE + '/api/assessments/' + createdId + '/approve-plan', { method: 'POST', body: '{}' });
  assert.equal(r2.status, 409);
});

test('POST /api/assessments/:id/export/checklist-docx доступний у будь-якому статусі', async () => {
  const r = await fetch(BASE + '/api/assessments/' + createdId + '/export/checklist-docx', { method: 'POST' });
  assert.equal(r.status, 200);
  assert.equal(r.headers.get('content-type'), 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/assessment/server-assessment.test.js`
Expected: FAIL — `a.status` is not `'PLANNING'`; `approve-plan`/`export/checklist-docx` routes return 404.

- [ ] **Step 3: Implement**

In `server.js`, add imports (near the existing assessment-related imports):

```js
import { buildAssessmentDocx } from './core/docx/assessment-docx-writer.js';
import { buildReportProjection } from './core/assessment/report-projection.js';
import { buildChecklistProjection } from './core/assessment/checklist-projection.js';
import { buildChecklistDocx } from './core/docx/checklist-docx-writer.js';
import { finalizeAssessment, approvePlan } from './core/assessment/assessment-run.js';
```

(Note: `finalizeAssessment` is already imported from `assessment-run.js` — just add `approvePlan` to that same import line instead of duplicating the import.)

Update the `POST /api/assessments` handler to load and pass the checklist reference, and to hash it into `catalog-version.json`:

```js
          const catalogs = await catalogsPromise;
          const assessmentCatalog = JSON.parse(await readFile(join(ROOT, 'data', 'assessment', 'assessment_catalog.json'), 'utf8'));
          const adapter = JSON.parse(await readFile(join(ROOT, 'data', 'assessment', 'assessment_odp_adapter.json'), 'utf8'));
          const checklistReferenceText = await readFile(join(ROOT, 'data', 'assessment', 'checklist_reference.json'), 'utf8');
          const checklistReference = JSON.parse(checklistReferenceText);
          const { items, checklist, warnings } = buildAssessmentPlan({ approvedState: approvedRecord.state, catalogs, assessmentCatalog, adapter, checklistReference });
          await mkdir(assessDir, { recursive: true });
          const existing = (await readdir(assessDir, { withFileTypes: true })).filter(d => d.isDirectory()).map(d => d.name);
          const id = nextAssessmentId(existing);
          const assessment = makeAssessment({ approvedRecord, approvedName, plan: { items, checklist }, warnings, id });
          const dir = join(assessDir, id);
          await mkdir(join(dir, 'evidence'), { recursive: true });
          const snapshotText = JSON.stringify(approvedRecord, null, 2);
          assessment.cpb_snapshot.hash = sha256(snapshotText);
          const dataFiles = {
            'nd_tzi.json': await readFile(join(ROOT, 'data', 'nd_tzi.json'), 'utf8'),
            'assessment_odp_adapter.json': await readFile(join(ROOT, 'data', 'assessment', 'assessment_odp_adapter.json'), 'utf8'),
            'assessment_catalog.json': await readFile(join(ROOT, 'data', 'assessment', 'assessment_catalog.json'), 'utf8'),
            'assessment_reference.json': await readFile(join(ROOT, 'data', 'assessment', 'assessment_reference.json'), 'utf8'),
            'generic_parameter_defaults.json': await readFile(join(ROOT, 'data', 'generic_parameter_defaults.json'), 'utf8'),
            'checklist_reference.json': checklistReferenceText,
          };
```

Add the `approve-plan` route — insert it right after the `parts[3] === 'finalize'` block (same `if` chain, before the `parts[3] === 'audit'` block):

```js
        if (parts[3] === 'approve-plan' && parts.length === 4 && req.method === 'POST') {
          const a = await readAssessmentGuarded(dir);
          if (a.status !== 'PLANNING') return json(res, 409, { error: 'план можна погодити лише зі статусу PLANNING' });
          const body = JSON.parse((await readBody(req)).toString('utf8') || '{}');
          const approved = approvePlan(a);
          await writeFile(join(dir, 'assessment.json'), serializeAssessment(approved));
          await appendAudit(dir, makeAuditEntry({ actor: body.actor ?? '', action: 'PLAN_APPROVED', entity_id: a.id }));
          return json(res, 200, { ok: true });
        }
```

Add the `export/checklist-docx` route — insert it right after the existing `parts[3] === 'export' && parts[4] === 'docx'` block (before the closing `return json(res, 404, { error: 'not found' });` of the `assessments` section):

```js
        if (parts[3] === 'export' && parts[4] === 'checklist-docx' && req.method === 'POST') {
          let assessment;
          try { assessment = JSON.parse(await readFile(join(dir, 'assessment.json'), 'utf8')); }
          catch { return json(res, 404, { error: 'оцінювання не знайдено' }); }
          const projection = buildChecklistProjection({ assessment });
          const buf = buildChecklistDocx({ projection });
          res.writeHead(200, {
            'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(assessment.id + '-checklist.docx')}`,
          });
          return res.end(buf);
        }
```

Update the `PUT /api/assessments/:id` handler's audit call to branch on status:

```js
          await writeFile(join(dir, 'assessment.json'), serializeAssessment(body));
          await appendAudit(dir, makeAuditEntry({ actor: body.actor_name ?? '', action: existing.status === 'PLANNING' ? 'PLAN_EDITED' : 'RESULT_UPDATED', entity_id: body.id,
            before: { updated_at: existing.updated_at }, after: { updated_at: body.updated_at } }));
          return json(res, 200, { ok: true });
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/assessment/server-assessment.test.js`
Expected: PASS. Then run the full suite: `npm test`

- [ ] **Step 5: Commit**

```bash
git add server.js test/assessment/server-assessment.test.js
git commit -m "feat: approve-plan and checklist-docx export routes; assessments created in PLANNING"
```

---

### Task 12: `tools/create-sample-assessment.js` — pass checklist through

**Files:**
- Modify: `tools/create-sample-assessment.js`

**Interfaces:**
- Consumes: updated `buildAssessmentPlan`/`makeAssessment` signatures from Tasks 4–5. No new interfaces produced (dev tool only).

- [ ] **Step 1: Update the tool**

In `tools/create-sample-assessment.js`, add the checklist reference load and pass `checklist` through:

```js
const assessmentCatalog = await read('data/assessment/assessment_catalog.json');
const adapter = await read('data/assessment/assessment_odp_adapter.json');
const checklistReference = await read('data/assessment/checklist_reference.json');

const { items, checklist, warnings } = buildAssessmentPlan({
  approvedState: approvedRecord.state,
  catalogs,
  assessmentCatalog,
  adapter,
  checklistReference
});

const id = 'ASSESS-2026-900'; // сумісний з ASSESSMENT_ID_RE сервера
const assessment = makeAssessment({
  approvedRecord,
  approvedName: 'as2-fixture',
  plan: { items, checklist },
  warnings,
  id,
  startedBy: 'sample-generator'
});
```

- [ ] **Step 2: Run the tool to verify it still works**

Run: `node tools/create-sample-assessment.js`
Expected: completes without error; inspect `assessments/ASSESS-2026-900/assessment.json` manually — `status` is `"PLANNING"` and `plan.checklist` is a non-empty array. Clean up the generated sample afterward: `rm -rf assessments/ASSESS-2026-900`

- [ ] **Step 3: Commit**

```bash
git add tools/create-sample-assessment.js
git commit -m "chore: create-sample-assessment.js passes checklist through buildAssessmentPlan"
```

---

### Task 13: UI — екран погодження плану (`plan-review.js`) + маршрутизація

**Files:**
- Create: `public/js/assessment/plan-review.js`
- Modify: `public/js/assessment/assessment-app.js`
- Modify: `public/css/app.css`

**Interfaces:**
- Consumes: `getAssessment`, `setAssessment`, `subscribe`, `loadAssessment` from `public/js/assessment/assessment-state.js` (existing, auto-debounced PUT save — no manual save button needed); `el` from `public/js/render/dom.js`.
- Produces: `renderPlanReview(container, { onApproved }) => void` — consumed by `assessment-app.js`.

This task is UI-only (no `node --test` coverage — there is no browser test harness in this repo). Verify manually via the dev server at the end of Step 2.

- [ ] **Step 1: Implement `plan-review.js`**

Create `public/js/assessment/plan-review.js`:

```js
// public/js/assessment/plan-review.js
import { el } from '../render/dom.js';
import { getAssessment, setAssessment, subscribe } from './assessment-state.js';

let isSubscribed = false;
let currentRerender = null;

function groupChecklist(assessment) {
  const groups = [];
  const byFamily = new Map();
  for (const entry of assessment.plan?.checklist ?? []) {
    let group = byFamily.get(entry.family);
    if (!group) {
      group = { family: entry.family, family_title: entry.family_title, entries: [] };
      byFamily.set(entry.family, group);
      groups.push(group);
    }
    group.entries.push(entry);
  }
  return groups;
}

function patchChecklistEntry(controlId, patch) {
  setAssessment((assessment) => ({
    ...assessment,
    plan: {
      ...assessment.plan,
      checklist: assessment.plan.checklist.map(e => e.control_id === controlId ? { ...e, ...patch } : e),
    },
  }));
}

function renderRow(entry) {
  const textarea = el('textarea', {
    rows: '3',
    oninput: (e) => patchChecklistEntry(entry.control_id, { verification_statement: e.target.value }),
  }, entry.verification_statement ?? '');

  const includeCheckbox = el('input', {
    type: 'checkbox',
    ...(entry.included !== false ? { checked: '' } : {}),
    onchange: (e) => patchChecklistEntry(entry.control_id, { included: e.target.checked }),
  });

  const sourceBadge = entry.source_status === 'MANUAL_REQUIRED'
    ? el('span', { class: 'badge badge-exempt' }, 'немає згенерованої інструкції — заповніть вручну')
    : null;

  return el('div', { class: 'checklist-row' },
    el('header', {},
      el('strong', {}, `${entry.control_id} — ${entry.control_title}`),
      ' ',
      el('label', {}, includeCheckbox, ' включити в оцінювання')),
    sourceBadge,
    el('label', { class: 'field' }, 'Інструкція перевірки', textarea));
}

export function renderPlanReview(container, { onApproved }) {
  const assessment = getAssessment();

  if (!isSubscribed) {
    subscribe(() => { if (currentRerender) currentRerender(); });
    isSubscribed = true;
  }
  currentRerender = () => renderPlanReview(container, { onApproved });

  const groups = groupChecklist(assessment);

  const exportBtn = el('button', { type: 'button', onclick: async () => {
    const r = await fetch(`/api/assessments/${encodeURIComponent(assessment.id)}/export/checklist-docx`, { method: 'POST' });
    if (!r.ok) { alert('Помилка експорту чекліста'); return; }
    const blob = await r.blob();
    const url = URL.createObjectURL(blob);
    const a = el('a', { href: url, download: `${assessment.id}-checklist.docx` });
    document.body.append(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  } }, 'Експортувати чекліст (DOCX)');

  const approveBtn = el('button', { type: 'button', class: 'primary', onclick: async () => {
    const r = await fetch(`/api/assessments/${encodeURIComponent(assessment.id)}/approve-plan`, { method: 'POST', body: '{}' });
    if (!r.ok) { alert((await r.json()).error ?? 'помилка погодження плану'); return; }
    onApproved();
  } }, 'Погодити план і розпочати оцінювання');

  const sections = groups.map(group => el('section', { class: 'checklist-family' },
    el('h3', {}, `${group.family} — ${group.family_title}`),
    ...group.entries.map(renderRow)));

  container.replaceChildren(
    el('section', { class: 'assessment-header' },
      el('h2', {}, `План оцінювання «${assessment.metadata.ics_name}» (${assessment.id})`),
      el('p', {}, el('span', { class: 'badge badge-planning' }, 'План')),
      el('div', { class: 'actions' }, exportBtn, approveBtn)),
    ...sections);
}
```

- [ ] **Step 2: Wire routing and verify manually**

In `public/js/assessment/assessment-app.js`, update `mountAssessmentApp`:

```js
import { el } from '../render/dom.js';
import { loadAssessment } from './assessment-state.js';
import { renderLanding } from './assessment-dashboard.js';

export function mountAssessmentApp(rootEl) {
  const view = (id) => {
    rootEl.replaceChildren();
    if (!id) return renderLanding(rootEl, { onOpen: (openedId) => view(openedId) });
    loadAssessment(id).then((assessment) => {
      if (assessment.status === 'PLANNING') {
        return import('./plan-review.js').then(({ renderPlanReview }) =>
          renderPlanReview(rootEl, { onApproved: () => view(id) }));
      }
      return import('./assessment-item.js').then(({ renderDashboard }) =>
        renderDashboard(rootEl, { onBack: () => view(null) }));
    });
  };
  view(null);
}
```

Verify manually: start the dev server (`npm start`), open `http://127.0.0.1:3000`, go to the assessment module, create a new assessment from an approved CPB. Confirm: (1) the plan-review screen appears (not the execution dashboard); (2) editing a textarea auto-saves (reload the page — the edit persists); (3) unchecking "включити в оцінювання" and reloading keeps it unchecked; (4) "Експортувати чекліст (DOCX)" downloads a valid docx (open it); (5) "Погодити план і розпочати оцінювання" switches to the normal execution dashboard, and reloading the page stays on the execution dashboard (status is now `IN_PROGRESS`).

- [ ] **Step 3: Add CSS**

Append to `public/css/app.css`:

```css
.badge-planning { background: #0369a1; color: #fff; }
.checklist-row { border: 1px solid var(--color-border); border-radius: var(--radius-sm); padding: var(--space-3); margin: var(--space-3) 0; }
.checklist-row header { display: flex; align-items: center; gap: var(--space-2); margin-bottom: var(--space-2); }
.checklist-row textarea { width: 100%; min-height: 4rem; padding: var(--space-2); border: 1px solid var(--color-border); border-radius: var(--radius-sm); font-family: inherit; }
.checklist-family { margin: var(--space-4) 0; }
```

- [ ] **Step 4: Commit**

```bash
git add public/js/assessment/plan-review.js public/js/assessment/assessment-app.js public/css/app.css
git commit -m "feat: plan-review UI screen for PLANNING-status assessments"
```

---

### Task 14: Повний прогін тестів і наскрізна перевірка

**Files:** none (verification only)

- [ ] **Step 1: Run the full test suite**

Run: `npm test`
Expected: all tests pass, including every file touched in Tasks 1–11.

- [ ] **Step 2: Check for stray dirty files**

Run: `git status --porcelain`
Expected: clean (nothing beyond what was committed in each task). If `assessments/ASSESS-2026-900` or any other test/sample artifact is present, remove it (`rm -rf`) — it must never be committed.

- [ ] **Step 3: Manual e2e walkthrough (per spec section 2)**

With `npm start` running, walk through the full flow once end-to-end: select an approved CPB → new assessment lands in `PLANNING` → edit a statement and exclude one row → export checklist DOCX and open it → approve plan → confirm execution dashboard shows the agreed statement above its control group and the excluded control is absent → enter a result requiring evidence → finalize → confirm the excluded control is absent from the exported assessment report DOCX too.

- [ ] **Step 4: Commit (if any fixups were needed)**

```bash
git add -A
git status --porcelain  # review before committing — never blanket-commit unexpected files
git commit -m "fix: address issues found in end-to-end verification"
```

(Skip this step if no fixups were needed.)
