# Множинні стейтменти перевірки на захід захисту Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the single `verification_statement` text per checklist entry with an array of independently addable/editable/removable verification statements, each edited via a modal dialog (not inline), with backward-compat migration for the old single-string shape.

**Architecture:** `plan.checklist[].verification_statement: string|null` + `source_status` become `plan.checklist[].statements: [{ id, text }]`. The resolver (`checklist-resolver.js`) is unchanged — it already resolves one template string at a time; `buildAssessmentPlan` now calls it once per entry in the reference's `statements[]` array. The export/execution-dashboard consumers join multiple statements into a numbered multi-line string. The UI (`plan-review.js`) renders each statement as read-only text with Edit/Delete buttons, plus an "Додати пункт перевірки" button that opens a modal (reusing the existing `showModal` component).

**Tech Stack:** Node.js ≥ 18, ES modules, vanilla JS (no frameworks), `node:test` + `node:assert/strict`, zero npm dependencies, `crypto.randomUUID()` (standard Web Crypto API, available in the browser on `http://127.0.0.1` as a secure context — not a new dependency).

## Global Constraints

- Zero npm dependencies — no new packages, ever.
- 100% offline — no network calls.
- UI renders only via `el()`/textContent from `public/js/render/dom.js` — `innerHTML` is forbidden.
- All UI copy and docx output is in Ukrainian.
- Reproducible DOCX output — dates come from `projection.title.date`, never current-time `Date.now()`/`new Date()`.
- Test command: `npm test` (= `node --test test/`).
- Reference spec: [docs/superpowers/specs/2026-10-07-checklist-multi-statement-design.md](../specs/2026-10-07-checklist-multi-statement-design.md)
- This builds directly on the already-merged [2026-10-06 plan-checklist feature](../specs/2026-10-06-assessment-plan-checklist-design.md) — `plan.checklist[]` already exists; this plan only changes how one field (`verification_statement`/`source_status`) is shaped and edited.

---

## File Structure

**Modify (no new files):**
- `data/assessment/checklist_reference.json` — `verification_statement: string` → `statements: string[]` per entry; pilot AT content split into natural multi-point instructions.
- `core/assessment/assessment-plan.js` — `buildAssessmentPlan`'s checklist loop builds `statements: [{id, text}]` instead of `verification_statement`/`source_status`.
- `core/assessment/checklist-projection.js` — joins `entry.statements[].text` into a numbered multi-line string for the DOCX row (no change needed in `checklist-docx-writer.js` itself).
- `public/js/assessment/assessment-table.js` — `groupPlanItems` attaches `checklist_statements: string[]` (was `checklist_statement: string|null`); `renderAssessmentTable` renders one line per statement.
- `core/assessment/assessment-io.js` — `migrateAssessment` normalizes old-shape checklist entries (`verification_statement`/`source_status`) into `statements[]` on read.
- `public/js/assessment/plan-review.js` — full rewrite: each checklist entry shows a read-only list of statements (Edit/Delete per item) + "Додати пункт перевірки" button opening a modal.
- `public/css/app.css` — replace the now-unused `.checklist-row textarea` rule with styles for the new statement-list UI.
- `test/assessment/checklist-reference.test.js`, `test/assessment/assessment-plan.test.js`, `test/assessment/checklist-projection.test.js`, `test/assessment/checklist-docx-writer.test.js`, `test/assessment/assessment-table.test.js`, `test/assessment/assessment-io.test.js` — updated fixtures/assertions per task below.

---

### Task 1: `checklist_reference.json` — `statements[]` зміст родини AT

**Files:**
- Modify: `data/assessment/checklist_reference.json`
- Test: `test/assessment/checklist-reference.test.js`

**Interfaces:**
- Produces: `{ entries: { [canonical_id]: { control_title, statements: string[], source_requirement_text, status } } }` — consumed by Task 2.

- [ ] **Step 1: Write the failing test**

Replace the two content-shape tests in `test/assessment/checklist-reference.test.js` (keep the first test — entry-count/ids — unchanged):

```js
test('кожен запис має непорожній масив statements, control_title і статус DRAFT_HEURISTIC', () => {
  for (const id of AT_IDS) {
    const e = ref.entries[id];
    assert.ok(e, `${id} має бути в довіднику`);
    assert.ok(e.control_title?.length > 0, `${id}: control_title`);
    assert.ok(Array.isArray(e.statements) && e.statements.length > 0, `${id}: statements має бути непорожнім масивом`);
    for (const s of e.statements) assert.ok(s.length > 10, `${id}: кожен пункт перевірки має бути змістовним`);
    assert.ok(e.source_requirement_text?.length > 0, `${id}: source_requirement_text`);
    assert.equal(e.status, 'DRAFT_HEURISTIC');
  }
});

test('плейсхолдери {{ insert: param, ... }} у statements — лише ті, що реально є в НД ТЗІ для цього заходу', () => {
  assert.ok(ref.entries['AT-2'].statements.some(s => s.includes('{{ insert: param, at-2_odp.01 }}')));
  assert.ok(ref.entries['AT-2(4)'].statements.some(s => s.includes('{{ insert: param, at-2.4_odp.01 }}')));
});

test('AT-2 розбито на кілька окремих пунктів перевірки (не один суцільний текст)', () => {
  assert.ok(ref.entries['AT-2'].statements.length >= 4);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/assessment/checklist-reference.test.js`
Expected: FAIL — `ref.entries['AT-2'].statements` is `undefined` (field doesn't exist yet, still `verification_statement`).

- [ ] **Step 3: Implement**

Replace the full content of `data/assessment/checklist_reference.json` with (every `verification_statement` string replaced by a `statements` array splitting the same content into natural individual checks; `control_title`/`source_requirement_text`/`status` unchanged per entry):

```json
{
  "entries": {
    "AT-1": {
      "control_title": "ПОЛІТИКА ТА ПРОЦЕДУРИ ПІДВИЩЕННЯ ОБІЗНАНОСТІ ТА НАВЧАННЯ",
      "statements": [
        "Запросити затверджений документ політики {{ insert: param, at-1_odp.01 }} та процедури {{ insert: param, at-1_odp.02 }}; переконатися, що документ політики містить мету, сферу застосування, ролі, обов'язки, відповідальність керівництва, координацію між підрозділами та механізм контролю відповідності, а також узгоджений із чинними нормативними вимогами.",
        "Перевірити призначення відповідального/підрозділу {{ insert: param, at-1_odp.03 }} за управління політикою (наказ про призначення).",
        "Звірити дату останнього перегляду політики з установленою періодичністю {{ insert: param, at-1_odp.04 }} та {{ insert: param, at-1_odp.05 }}, а процедур — з {{ insert: param, at-1_odp.06 }} та {{ insert: param, at-1_odp.07 }}; дата останнього перегляду не повинна перевищувати встановлену періодичність."
      ],
      "source_requirement_text": "a. Розробити, задокументувати та поширити {{ insert: param, at-1_odp.01 }}: 1. {{ insert: param, at-1_odp.02 }} політики обізнаності та навчання у сфері забезпечення безпеки та приватності; 2. Процедури, що сприяють реалізації політики. b. Призначити {{ insert: param, at-1_odp.03 }} для управління політикою та процедурами. c. Переглядати та оновлювати: 1. Поточну політику {{ insert: param, at-1_odp.04 }} і наступне {{ insert: param, at-1_odp.05 }}; 2. Процедури {{ insert: param, at-1_odp.06 }} та наступні {{ insert: param, at-1_odp.07 }}.",
      "status": "DRAFT_HEURISTIC"
    },
    "AT-2": {
      "control_title": "НАВЧАННЯ З ПІДВИЩЕННЯ ОБІЗНАНОСТІ",
      "statements": [
        "Перевірити, що кожен новий користувач (включно з менеджерами, керівниками та підрядниками) пройшов початкове навчання до надання доступу до системи — звірити дату допуску користувача з датою проходження навчання в журналі.",
        "Перевірити повторення навчання з періодичністю {{ insert: param, at-2_odp.01 }} — звірити дати повторних тренінгів кожного користувача з цією періодичністю.",
        "Перевірити проведення позапланового навчання після {{ insert: param, at-2_odp.02 }} — перевірити наявність записів про такі сесії.",
        "Перевірити застосування методів підвищення обізнаності {{ insert: param, at-2_odp.03 }} — запросити матеріали/розсилки, що підтверджують їх використання.",
        "Перевірити оновлення навчання з періодичністю {{ insert: param, at-2_odp.04 }} та після {{ insert: param, at-2_odp.05 }} — звірити версії матеріалів і дати оновлення.",
        "Перевірити, що матеріали навчання містять розділ з уроками з реальних інцидентів безпеки; кількість користувачів, що пройшли навчання, має дорівнювати кількості користувачів з активним доступом до системи на дату перевірки."
      ],
      "source_requirement_text": "a. Забезпечити навчання грамотності з питань безпеки та конфіденційності для користувачів системи: 1. як частину початкового навчання для нових користувачів і {{ insert: param, at-2_odp.01 }} після цього; 2. якщо цього потребують системні зміни або наступні {{ insert: param, at-2_odp.02 }}. b. Використовувати методи підвищення обізнаності {{ insert: param, at-2_odp.03 }}; c. Оновлювати навчання {{ insert: param, at-2_odp.04 }} і наступні {{ insert: param, at-2_odp.05 }}; d. Включити уроки з реальних інцидентів безпеки.",
      "status": "DRAFT_HEURISTIC"
    },
    "AT-2(1)": {
      "control_title": "НАВЧАННЯ З ПІДВИЩЕННЯ ОБІЗНАНОСТІ - ПРАКТИЧНІ ЗАНЯТТЯ",
      "statements": [
        "Перевірити наявність практичних занять (симуляцій) з тренування обізнаності — запросити сценарії вправ, що імітують інциденти безпеки/приватності, та журнал проведення з переліком учасників і датами."
      ],
      "source_requirement_text": "Ввести до програми навчання практичні заняття (вправи) з тренування обізнаності, які імітують інциденти в області безпеки та приватності.",
      "status": "DRAFT_HEURISTIC"
    },
    "AT-2(2)": {
      "control_title": "НАВЧАННЯ З ПІДВИЩЕННЯ ОБІЗНАНОСТІ - ВНУТРІШНІ ЗАГРОЗИ",
      "statements": [
        "Перевірити наявність у програмі навчання вправ з розпізнавання індикаторів внутрішніх загроз — запросити матеріали курсу з переліком індикаторів (поведінкових, технічних) та підтвердження проходження модуля учасниками."
      ],
      "source_requirement_text": "Ввести до програми навчання вправи з розпізнавання та виявлення потенційних індикаторів внутрішніх загроз.",
      "status": "DRAFT_HEURISTIC"
    },
    "AT-2(3)": {
      "control_title": "НАВЧАННЯ З ПІДВИЩЕННЯ ОБІЗНАНОСТІ - СОЦІАЛЬНА ІНЖЕНЕРІЯ ТА СОЦІАЛЬНИЙ ІНТЕЛЕКТУАЛЬНИЙ АНАЛІЗ ДАНИХ",
      "statements": [
        "Перевірити наявність модуля з розпізнавання соціальної інженерії та методів аналізу соціальних даних — запросити матеріали модуля та підтвердження проходження користувачами (дати, список учасників)."
      ],
      "source_requirement_text": "Ввести до програми навчання вправи з підвищення обізнаності щодо розпізнавання та повідомлення про потенційні та фактичні атаки, з використанням методів соціальної інженерії та інтелектуального аналізу соціальних даних.",
      "status": "DRAFT_HEURISTIC"
    },
    "AT-2(4)": {
      "control_title": "НАВЧАННЯ З ПІДВИЩЕННЯ ОБІЗНАНОСТІ - ПІДОЗРІЛІ ПОВІДОМЛЕННЯ ТА АНОМАЛЬНА ПОВЕДІНКА СИСТЕМИ",
      "statements": [
        "Перевірити проведення навчання щодо розпізнавання підозрілих повідомлень і аномальної поведінки системи за допомогою {{ insert: param, at-2.4_odp.01 }} — запросити матеріали модуля (приклади індикаторів) та журнал проходження."
      ],
      "source_requirement_text": "Провести навчання грамотності щодо розпізнавання підозрілих комунікацій і аномальної поведінки в системах організації за допомогою {{ insert: param, at-2.4_odp.01 }}.",
      "status": "DRAFT_HEURISTIC"
    },
    "AT-2(5)": {
      "control_title": "НАВЧАННЯ З ПІДВИЩЕННЯ ОБІЗНАНОСТІ - ВДОСКОНАЛЕНА СТІЙКА ЗАГРОЗА",
      "statements": [
        "Перевірити наявність окремого модуля навчання щодо вдосконаленої стійкої загрози (APT) — запросити матеріали й підтвердження проходження відповідальними користувачами (адміністратори, керівництво ІБ)."
      ],
      "source_requirement_text": "Забезпечити навчання грамотності щодо стійкої постійної загрози.",
      "status": "DRAFT_HEURISTIC"
    },
    "AT-2(6)": {
      "control_title": "НАВЧАННЯ З ПІДВИЩЕННЯ ОБІЗНАНОСТІ - СЕРЕДОВИЩЕ КІБЕРЗАГРОЗ",
      "statements": [
        "Перевірити наявність модуля щодо поточного середовища кіберзагроз — матеріали, дата останнього оновлення.",
        "Перевірити механізм доведення актуальної інформації про кіберзагрози до персоналу під час експлуатації (розсилки, бюлетені) — запросити приклади за останній період і звірити дату останнього повідомлення з поточною актуальністю загроз."
      ],
      "source_requirement_text": "a. Забезпечити навчання грамотності щодо середовища кіберзагроз; і b. Відображати поточну інформацію про кіберзагрози в операціях системи.",
      "status": "DRAFT_HEURISTIC"
    },
    "AT-3": {
      "control_title": "РОЛЬОВЕ НАВЧАННЯ",
      "statements": [
        "Запросити перелік ролей/посад {{ insert: param, at-3_odp.01 }}, для яких передбачене рольове навчання, та журнал проходження; перевірити, що кожен працівник із зазначеною роллю пройшов навчання до авторизації доступу/виконання обов'язків і повторно з періодичністю {{ insert: param, at-3_odp.02 }} — звірити дату призначення на посаду з датою навчання.",
        "Перевірити оновлення навчального контенту з періодичністю {{ insert: param, at-3_odp.03 }} та після {{ insert: param, at-3_odp.04 }}.",
        "Перевірити, що матеріали містять інформацію з реальних інцидентів/порушень безпеки; кількість працівників із зазначеними ролями, що пройшли навчання, має дорівнювати кількості працівників, які фактично обіймають ці ролі на дату перевірки."
      ],
      "source_requirement_text": "a. Забезпечити проведення навчання з питань безпеки та приватності на основі ролей для працівників з ролями та обов'язками: {{ insert: param, at-3_odp.01 }}: 1. перед авторизацією доступу і {{ insert: param, at-3_odp.02 }} після цього; 2. коли цього потребують системні зміни. b. Оновити навчальний контент {{ insert: param, at-3_odp.03 }} і наступні {{ insert: param, at-3_odp.04 }}; c. Включити інформацію з реальних інцидентів та порушень безпеки.",
      "status": "DRAFT_HEURISTIC"
    },
    "AT-3(1)": {
      "control_title": "РОЛЬОВЕ НАВЧАННЯ - ЗАХОДИ ЗАХИСТУ РОБОЧОГО СЕРЕДОВИЩА",
      "statements": [
        "Перевірити проведення підготовки з питань застосування заходів захисту робочого середовища — запросити журнал проходження з датою початку роботи кожного працівника і датами повторної підготовки з періодичністю {{ insert: param, at-3.1_odp.02 }}; звірити дату початку роботи з датою першої підготовки {{ insert: param, at-3.1_odp.01 }}."
      ],
      "source_requirement_text": "Надати {{ insert: param, at-3.1_odp.01 }} з початку роботи та з {{ insert: param, at-3.1_odp.02 }} підготовку з питань застосування заходів захисту робочого середовища.",
      "status": "DRAFT_HEURISTIC"
    },
    "AT-3(2)": {
      "control_title": "РОЛЬОВЕ НАВЧАННЯ - ФІЗИЧНІ ЗАХОДИ БЕЗПЕКИ",
      "statements": [
        "Перевірити проведення підготовки з питань застосування та експлуатації заходів фізичної безпеки — запросити журнал проходження з датою початку роботи {{ insert: param, at-3.2_odp.01 }} кожного працівника і датами повторної підготовки з періодичністю {{ insert: param, at-3.2_odp.02 }}."
      ],
      "source_requirement_text": "Надати {{ insert: param, at-3.2_odp.01 }} з початку роботи та з {{ insert: param, at-3.2_odp.02 }} підготовку з питань застосування та експлуатації заходів фізичної безпеки.",
      "status": "DRAFT_HEURISTIC"
    },
    "AT-3(3)": {
      "control_title": "РОЛЬОВЕ НАВЧАННЯ - ПРАКТИЧНІ ЗАНЯТТЯ",
      "statements": [
        "Перевірити наявність практичних занять з безпеки та приватності в програмі рольового навчання — запросити сценарії/матеріали практичних занять і журнал проведення з переліком учасників та датами."
      ],
      "source_requirement_text": "Ввести до програми навчання практичні заняття з безпеки та приватності, які мають підкріпити досягнення цілей навчання.",
      "status": "DRAFT_HEURISTIC"
    },
    "AT-3(5)": {
      "control_title": "РОЛЬОВЕ НАВЧАННЯ - ОБРОБКА ПЕРСОНАЛЬНИХ ДАНИХ",
      "statements": [
        "Перевірити навчання з використання та управління обробкою персональних даних і контролю прозорості — запросити журнал проходження початкового навчання {{ insert: param, at-3.5_odp.01 }} для працівників, що обробляють персональні дані, та повторного навчання з періодичністю {{ insert: param, at-3.5_odp.02 }}."
      ],
      "source_requirement_text": "Забезпечити {{ insert: param, at-3.5_odp.01 }} початкове та {{ insert: param, at-3.5_odp.02 }} навчання з використання та управління обробкою персональних даних та контролю прозорості.",
      "status": "DRAFT_HEURISTIC"
    },
    "AT-4": {
      "control_title": "НАВЧАЛЬНІ ЗАПИСИ",
      "statements": [
        "Перевірити журнал обліку індивідуальних навчальних заходів (базова підготовка з безпеки/приватності та спеціальна підготовка визначених посадових осіб).",
        "Перевірити термін зберігання записів — не менше {{ insert: param, at-4_odp.01 }}; звірити найстарший запис у журналі, дата видалення/архівації не повинна настати раніше встановленого терміну зберігання."
      ],
      "source_requirement_text": "a. Документувати та відстежувати індивідуальні навчальні заходи із забезпечення безпеки та приватності. b. Зберігати індивідуальні записи про навчання впродовж {{ insert: param, at-4_odp.01 }}.",
      "status": "DRAFT_HEURISTIC"
    },
    "AT-6": {
      "control_title": "ВІДГУКИ ПРО ПРОВЕДЕНІ НАВЧАННЯ",
      "statements": [
        "Перевірити надання відгуку про результати організаційного навчання визначеному персоналу {{ insert: param, at-6_odp.01 }} — запросити звіт/розсилку з результатами навчання (статистика проходження, виявлені прогалини) та підтвердження отримання відповідальними особами (лист розсилки, підпис про ознайомлення)."
      ],
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
git commit -m "feat: split checklist_reference.json AT content into statements[] arrays"
```

---

### Task 2: `buildAssessmentPlan` — будує `statements[]` замість `verification_statement`/`source_status`

**Files:**
- Modify: `core/assessment/assessment-plan.js`
- Test: `test/assessment/assessment-plan.test.js`

**Interfaces:**
- Consumes: `checklist_reference.json`'s `statements: string[]` shape from Task 1.
- Produces: each `plan.checklist[]` entry now has `statements: [{ id: string, text: string }]` (id format `${canonical_control_id}#${1-based index}`, e.g. `AT-2#1`) instead of `verification_statement`/`source_status`. Empty array when no reference entry exists. Consumed by Task 3 (projection) and Task 4 (table).

- [ ] **Step 1: Write the failing test**

In `test/assessment/assessment-plan.test.js`, replace the three `plan.checklist` tests:

```js
test('plan.checklist: один запис на APPLIED control/enhancement, не на statement_path', () => {
  assert.ok(checklist.length > 0);
  const ids = checklist.map(c => c.canonical_control_id);
  assert.equal(new Set(ids).size, ids.length, 'без дублікатів control/enhancement');
  // AT-2 застосовний в АС-2 фікстурі — має прийти з довідника з кількома пунктами перевірки
  const at2 = checklist.find(c => c.canonical_control_id === 'AT-2');
  assert.ok(at2, 'AT-2 має бути в чеклісті (застосовний в АС-2)');
  assert.ok(at2.statements.length > 1, 'AT-2 має кілька окремих пунктів перевірки');
  assert.equal(at2.statements[0].id, 'AT-2#1');
  assert.ok(at2.statements[0].text.includes('новий користувач'));
  assert.equal(at2.included, true);
  assert.equal(at2.exclusion_reason, null);
});

test('plan.checklist: заходи без запису в довіднику → statements порожній масив', () => {
  const noRef = checklist.find(c => c.statements.length === 0);
  assert.ok(noRef, 'мають бути заходи поза пілотним довідником (поки лише AT покрито)');
});

test('buildAssessmentPlan без checklistReference (backward-compat) — усі statements порожні', () => {
  const { checklist: c2 } = buildAssessmentPlan({ approvedState, catalogs, assessmentCatalog, adapter });
  assert.ok(c2.length > 0);
  assert.ok(c2.every(c => Array.isArray(c.statements) && c.statements.length === 0));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/assessment/assessment-plan.test.js`
Expected: FAIL — `at2.statements` is `undefined` (field doesn't exist yet).

- [ ] **Step 3: Implement**

In `core/assessment/assessment-plan.js`, replace the checklist-building loop body (keep the surrounding `for` loop and the `continue` for `!ndNode` unchanged):

```js
  const checklistEntries = checklistReference.entries ?? {};
  const checklist = [];
  for (const [controlId, statusKey] of applicable) {
    if (CPB_STATUS_MAP[statusKey] !== 'APPLIED') continue;
    const canonicalId = normalizeControlId(controlId);
    const ndNode = ndNodes.get(canonicalId);
    if (!ndNode) {
      warnings.push({ code: 'ND_NODE_MISSING', control_id: denormalizeControlId(controlId) });
      continue;
    }
    const refEntry = checklistEntries[canonicalId];
    const statements = (refEntry?.statements ?? []).map((template, i) => ({
      id: `${canonicalId}#${i + 1}`,
      text: resolveChecklistStatement({ template, effectiveValueFor }).resolved_statement,
    }));
    checklist.push({
      canonical_control_id: canonicalId,
      control_id: denormalizeControlId(canonicalId),
      family: ndNode.family,
      family_title: ndNode.family_title,
      control_title: ndNode.control_title,
      statements,
      included: true,
      exclusion_reason: null,
    });
  }
```

Also update the function's JSDoc (directly above `export function buildAssessmentPlan`):

```js
/**
 * buildAssessmentPlan (v3)
 * @param {object} params
 * @param {object} params.approvedState – { info_type, profile, passport }
 * @param {object} params.catalogs – { ndTzi, bpb, exemptions, genericDefaults }
 * @param {object} params.assessmentCatalog – v3 assessment catalog
 * @param {object} params.adapter – ODP adapter document
 * @param {object} [params.checklistReference] – { entries: { [canonical_id]: { statements: string[] } } }
 * @returns {{ items: Array, checklist: Array, warnings: Array }}
 */
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/assessment/assessment-plan.test.js`
Expected: PASS. Also run `node --test test/assessment/` to confirm no regression elsewhere (other files like `au11-parameter.test.js`/`ir08-parameter.test.js`/`dictionary-integrity.test.js` call `buildAssessmentPlan` without `checklistReference` and don't touch `checklist`/`statements` — unaffected by this change).

- [ ] **Step 5: Commit**

```bash
git add core/assessment/assessment-plan.js test/assessment/assessment-plan.test.js
git commit -m "feat: buildAssessmentPlan builds plan.checklist[].statements[] (multi-statement)"
```

---

### Task 3: Експорт — обʼєднання кількох statements у нумерований текст

**Files:**
- Modify: `core/assessment/checklist-projection.js`
- Test: `test/assessment/checklist-projection.test.js`
- Test: `test/assessment/checklist-docx-writer.test.js` (fixture update only, no production code change in `core/docx/checklist-docx-writer.js`)

**Interfaces:**
- Consumes: `entry.statements: [{id, text}]` from Task 2.
- Produces: `buildChecklistProjection` output's `families[].rows[].verification_statement` field (the DOCX cell content) — name unchanged, now holds a joined numbered multi-line string. `core/docx/checklist-docx-writer.js` is NOT modified — it already renders this field as-is.

- [ ] **Step 1: Write the failing test**

Replace the fixture and tests in `test/assessment/checklist-projection.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildChecklistProjection } from '../../core/assessment/checklist-projection.js';

const assessment = {
  id: 'ASSESS-2026-010',
  metadata: { ics_name: 'АС-2', as_class: 2, info_type: 'open_confidential', assessment_start_date: '2026-10-06' },
  plan: {
    checklist: [
      { control_id: 'AT-02', control_title: 'НАВЧАННЯ', family: 'AT', family_title: 'Обізнаність',
        statements: [{ id: 'AT-2#1', text: 'Перевірити журнал' }, { id: 'AT-2#2', text: 'Перевірити паролі' }], included: true },
      { control_id: 'AT-03', control_title: 'РОЛЬОВЕ', family: 'AT', family_title: 'Обізнаність', statements: [], included: true },
      { control_id: 'AC-02', control_title: 'ОБЛІК', family: 'AC', family_title: 'Доступ',
        statements: [{ id: 'AC-02#1', text: 'текст' }], included: false },
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

test('buildChecklistProjection: кілька statements обʼєднуються в нумерований текст', () => {
  const p = buildChecklistProjection({ assessment, cpbSnapshot: { state: {} } });
  const row = p.families[0].rows.find(r => r.control_id === 'AT-02');
  assert.equal(row.verification_statement, '1. Перевірити журнал\n2. Перевірити паролі');
});

test('buildChecklistProjection: порожній statements → заглушка для ручного заповнення', () => {
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

Also update the fixture in `test/assessment/checklist-docx-writer.test.js` (only the `plan.checklist` entry shape changes; the rest of both tests in that file stay exactly as-is since they assert substrings, not exact equality):

```js
const assessment = {
  id: 'ASSESS-2026-011',
  metadata: { ics_name: 'АС-2', as_class: 2, info_type: 'open_confidential', assessment_start_date: '2026-10-06' },
  plan: { checklist: [
    { control_id: 'AT-02', control_title: 'НАВЧАННЯ З ПІДВИЩЕННЯ ОБІЗНАНОСТІ', family: 'AT', family_title: 'Обізнаність та навчання',
      statements: [{ id: 'AT-2#1', text: 'Перевірити журнал проведення тренінгів.' }], included: true },
  ] },
};
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/assessment/checklist-projection.test.js test/assessment/checklist-docx-writer.test.js`
Expected: FAIL — `row.verification_statement` is `undefined` (code still reads the removed `entry.verification_statement` field).

- [ ] **Step 3: Implement**

In `core/assessment/checklist-projection.js`, replace the row-building block inside the `for (const entry of included)` loop:

```js
  for (const entry of included) {
    let group = groupByFamily.get(entry.family);
    if (!group) {
      group = { family: entry.family, family_title: entry.family_title, rows: [] };
      groupByFamily.set(entry.family, group);
      families.push(group);
    }
    const joined = (entry.statements ?? []).map((s, i) => `${i + 1}. ${s.text}`).join('\n');
    group.rows.push({
      control_id: entry.control_id,
      control_title: entry.control_title,
      verification_statement: joined || NO_STATEMENT_PLACEHOLDER,
    });
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/assessment/checklist-projection.test.js test/assessment/checklist-docx-writer.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add core/assessment/checklist-projection.js test/assessment/checklist-projection.test.js test/assessment/checklist-docx-writer.test.js
git commit -m "feat: checklist projection joins multiple statements into numbered text"
```

---

### Task 4: Дашборд виконання — показ кількох пунктів над контролем

**Files:**
- Modify: `public/js/assessment/assessment-table.js`
- Test: `test/assessment/assessment-table.test.js`

**Interfaces:**
- Consumes: `entry.statements: [{id, text}]` from Task 2.
- Produces: `groupPlanItems`'s `controlGroup.checklist_statements: string[]` (was `checklist_statement: string|null`) — one line per statement, rendered by `renderAssessmentTable`.

- [ ] **Step 1: Write the failing test**

Replace the relevant tests in `test/assessment/assessment-table.test.js`:

```js
test('groupPlanItems: виключений control_id (plan.checklist included:false) приховується повністю', () => {
  const assessment = {
    plan: {
      items: [
        { assessment_source_id: 'a1', control_id: 'AT-02', family: 'AT', family_title: 'Обізнаність', control_title: 'X' },
        { assessment_source_id: 'a2', control_id: 'AT-03', family: 'AT', family_title: 'Обізнаність', control_title: 'Y' },
      ],
      checklist: [
        { control_id: 'AT-02', included: false, statements: [{ id: 'AT-02#1', text: 'текст AT-02' }] },
        { control_id: 'AT-03', included: true, statements: [{ id: 'AT-03#1', text: 'текст AT-03' }] },
      ],
    },
    results: [],
  };
  const groups = groupPlanItems(assessment);
  const controlIds = groups.flatMap(g => g.controls.map(c => c.control_id));
  assert.deepEqual(controlIds, ['AT-03']);
});

test('groupPlanItems: приєднує список узгоджених пунктів перевірки (checklist_statements) до control-групи', () => {
  const assessment = {
    plan: {
      items: [{ assessment_source_id: 'a1', control_id: 'AT-02', family: 'AT', family_title: 'Обізнаність', control_title: 'X' }],
      checklist: [{ control_id: 'AT-02', included: true, statements: [
        { id: 'AT-02#1', text: 'Перевірити журнал навчання' },
        { id: 'AT-02#2', text: 'Перевірити журнал паролів' },
      ] }],
    },
    results: [],
  };
  const [group] = groupPlanItems(assessment);
  assert.deepEqual(group.controls[0].checklist_statements, ['Перевірити журнал навчання', 'Перевірити журнал паролів']);
});

test('groupPlanItems: без plan.checklist (старі записи) — нічого не приховується, checklist_statements порожній', () => {
  const assessment = { plan: { items: [{ assessment_source_id: 'a1', control_id: 'AT-02', family: 'AT', family_title: 'X', control_title: 'Y' }] }, results: [] };
  const [group] = groupPlanItems(assessment);
  assert.equal(group.controls[0].control_id, 'AT-02');
  assert.deepEqual(group.controls[0].checklist_statements, []);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/assessment/assessment-table.test.js`
Expected: FAIL — `group.controls[0].checklist_statements` is `undefined` (field still named `checklist_statement`, still reads removed `verification_statement`).

- [ ] **Step 3: Implement**

In `public/js/assessment/assessment-table.js`'s `groupPlanItems`, change the `controlGroup` initializer:

```js
    let controlGroup = familyGroup._byControl.get(planItem.control_id);
    if (!controlGroup) {
      controlGroup = {
        control_id: planItem.control_id,
        control_title: planItem.control_title,
        checklist_statements: (checklistEntry?.statements ?? []).map(s => s.text),
        items: []
      };
      familyGroup._byControl.set(planItem.control_id, controlGroup);
      familyGroup.controls.push(controlGroup);
    }
```

In `renderAssessmentTable`, replace the single-line context row with a multi-line one:

```js
      if (controlGroup.checklist_statements.length) {
        tbody.append(
          el('tr', { class: 'checklist-statement-row' },
            el('td', { colspan: '5' },
              ...controlGroup.checklist_statements.map((text, i) => el('div', {}, el('em', {}, `${i + 1}. ${text}`)))))
        );
      }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/assessment/assessment-table.test.js`
Expected: PASS. Also run `node --test test/assessment/report-projection.test.js` (unaffected, uses a separate `groupPlanItems` in `report-projection.js` that never read `verification_statement`) to confirm no regression.

- [ ] **Step 5: Commit**

```bash
git add public/js/assessment/assessment-table.js test/assessment/assessment-table.test.js
git commit -m "feat: execution dashboard shows multiple checklist statements per control"
```

---

### Task 5: Сумісність зі старим форматом (`migrateAssessment`)

**Files:**
- Modify: `core/assessment/assessment-io.js`
- Test: `test/assessment/assessment-io.test.js`

**Interfaces:**
- Produces: `migrateAssessment` normalizes any `plan.checklist[]` entry still using the old `verification_statement`/`source_status` shape into `statements: [{id, text}]`, removing the old fields. Preserves exact reference identity (`===`) when nothing needs normalizing (existing identity tests depend on this).

- [ ] **Step 1: Write the failing test**

Update the existing fixture in the `'makeAssessment: передає checklist, якщо наданий'` test (just the literal object, nothing else in that test changes):

```js
test('makeAssessment: передає checklist, якщо наданий', () => {
  const planWithChecklist = { ...plan, checklist: [{ canonical_control_id: 'AT-2', control_id: 'AT-02', family: 'AT',
    family_title: 'Обізнаність', control_title: 'X', statements: [{ id: 'AT-2#1', text: 'текст' }],
    included: true, exclusion_reason: null }] };
  const a = makeAssessment({ approvedRecord, approvedName: 'test', plan: planWithChecklist, warnings: [], id: 'ASSESS-2026-005' });
  assert.equal(a.plan.checklist.length, 1);
  assert.equal(validateAssessmentSchema(a).length, 0);
});
```

Add three new tests (anywhere after the existing `migrateAssessment` tests in the file):

```js
test('migrateAssessment: нормалізує старий формат verification_statement → statements[]', () => {
  const a = makeAssessment({ approvedRecord, approvedName: 'test', plan, warnings: [], id: 'ASSESS-2026-012' });
  a.plan.checklist = [{ control_id: 'AT-02', verification_statement: 'старий текст', source_status: 'GENERATED',
    included: true, exclusion_reason: null }];
  const migrated = migrateAssessment(a);
  assert.deepEqual(migrated.plan.checklist[0].statements, [{ id: 'AT-02#1', text: 'старий текст' }]);
  assert.equal(migrated.plan.checklist[0].verification_statement, undefined);
  assert.equal(migrated.plan.checklist[0].source_status, undefined);
});

test('migrateAssessment: старий формат з null verification_statement → statements []', () => {
  const a = makeAssessment({ approvedRecord, approvedName: 'test', plan, warnings: [], id: 'ASSESS-2026-013' });
  a.plan.checklist = [{ control_id: 'AT-02', verification_statement: null, source_status: 'MANUAL_REQUIRED',
    included: true, exclusion_reason: null }];
  const migrated = migrateAssessment(a);
  assert.deepEqual(migrated.plan.checklist[0].statements, []);
});

test('migrateAssessment: вже новий формат (statements присутній) — identity, без змін', () => {
  const a = makeAssessment({ approvedRecord, approvedName: 'test', plan, warnings: [], id: 'ASSESS-2026-014' });
  a.plan.checklist = [{ control_id: 'AT-02', statements: [{ id: 'AT-02#1', text: 'x' }], included: true, exclusion_reason: null }];
  assert.equal(migrateAssessment(a), a);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/assessment/assessment-io.test.js`
Expected: FAIL — old-shape entries still have `verification_statement` after `migrateAssessment`, no `statements` field created.

- [ ] **Step 3: Implement**

In `core/assessment/assessment-io.js`, add a helper function near the top (after imports, before `nextAssessmentId`):

```js
function normalizeChecklistEntry(entry) {
  if (Array.isArray(entry.statements)) return entry;
  const { verification_statement, source_status, ...rest } = entry;
  const statements = verification_statement ? [{ id: `${entry.control_id}#1`, text: verification_statement }] : [];
  return { ...rest, statements };
}
```

Update `migrateAssessment`'s v3 short-circuit:

```js
export function migrateAssessment(obj) {
  if (obj?.schema_version?.startsWith('3.')) {
    const hasChecklist = Array.isArray(obj.plan?.checklist);
    const normalizedChecklist = hasChecklist ? obj.plan.checklist.map(normalizeChecklistEntry) : [];
    const checklistChanged = !hasChecklist || normalizedChecklist.some((e, i) => e !== obj.plan.checklist[i]);
    if (!checklistChanged) return obj;
    return { ...obj, plan: { ...obj.plan, checklist: normalizedChecklist } };
  }
  const now = new Date().toISOString();
```

(the rest of the function — the v1→v3 migration path — is unchanged; it already sets `plan: { items: planItems, checklist: [] }`, which is already in the new shape since `[]` needs no normalization).

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/assessment/assessment-io.test.js`
Expected: PASS. Also run `node --test test/assessment/` (full suite) to confirm no regression.

- [ ] **Step 5: Commit**

```bash
git add core/assessment/assessment-io.js test/assessment/assessment-io.test.js
git commit -m "feat: migrateAssessment normalizes old verification_statement into statements[]"
```

---

### Task 6: UI — список стейтментів з редагуванням/видаленням через модалку

**Files:**
- Modify: `public/js/assessment/plan-review.js` (full rewrite)
- Modify: `public/css/app.css`

**Interfaces:**
- Consumes: `getAssessment`, `setAssessment`, `subscribe` from `assessment-state.js` (unchanged); `el`, `showModal` from `public/js/render/dom.js` (both already exported, confirm `showModal`'s signature by reading `public/js/render/dom.js` before editing — `showModal(contentEl, { title }) => { close }`).
- No `node --test` coverage for this file (no browser test harness in this repo, same as the original plan-review.js task). Verify manually via the dev server at the end.

- [ ] **Step 1: Implement `plan-review.js`**

Replace the full content of `public/js/assessment/plan-review.js`:

```js
// public/js/assessment/plan-review.js
import { el, showModal } from '../render/dom.js';
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

function addStatement(controlId, text) {
  const entry = getAssessment().plan.checklist.find(e => e.control_id === controlId);
  patchChecklistEntry(controlId, { statements: [...(entry.statements ?? []), { id: crypto.randomUUID(), text }] });
}

function updateStatement(controlId, statementId, text) {
  const entry = getAssessment().plan.checklist.find(e => e.control_id === controlId);
  patchChecklistEntry(controlId, { statements: entry.statements.map(s => s.id === statementId ? { ...s, text } : s) });
}

function removeStatement(controlId, statementId) {
  const entry = getAssessment().plan.checklist.find(e => e.control_id === controlId);
  patchChecklistEntry(controlId, { statements: entry.statements.filter(s => s.id !== statementId) });
}

function openStatementModal({ title, initialText, onSave, onDelete }) {
  const textarea = el('textarea', { rows: '4' }, initialText ?? '');
  const saveBtn = el('button', { type: 'button', class: 'primary', onclick: () => {
    const text = textarea.value.trim();
    if (!text) return;
    onSave(text);
    modal.close();
  } }, 'Зберегти');
  const cancelBtn = el('button', { type: 'button', onclick: () => modal.close() }, 'Скасувати');
  const deleteBtn = onDelete ? el('button', { type: 'button', class: 'link-btn', onclick: () => {
    if (!confirm('Видалити цей пункт перевірки?')) return;
    onDelete();
    modal.close();
  } }, 'Видалити') : null;

  const modal = showModal(el('div', { class: 'field-grid' },
    el('label', { class: 'field' }, 'Текст пункту перевірки', textarea),
    el('div', { class: 'actions' }, saveBtn, cancelBtn, deleteBtn)),
    { title });
  textarea.focus();
}

function renderStatement(entry, statement) {
  return el('div', { class: 'statement-item' },
    el('p', {}, statement.text),
    el('div', { class: 'statement-actions' },
      el('button', { type: 'button', class: 'link-btn', onclick: () => {
        openStatementModal({
          title: 'Редагувати пункт перевірки',
          initialText: statement.text,
          onSave: (text) => updateStatement(entry.control_id, statement.id, text),
          onDelete: () => removeStatement(entry.control_id, statement.id),
        });
      } }, 'Редагувати'),
      el('button', { type: 'button', class: 'link-btn', onclick: () => {
        if (!confirm('Видалити цей пункт перевірки?')) return;
        removeStatement(entry.control_id, statement.id);
      } }, 'Видалити')));
}

function renderRow(entry) {
  const statements = entry.statements ?? [];

  const includeCheckbox = el('input', {
    type: 'checkbox',
    ...(entry.included !== false ? { checked: '' } : {}),
    onchange: (e) => patchChecklistEntry(entry.control_id, { included: e.target.checked }),
  });

  const statementsList = statements.length
    ? el('div', { class: 'statements-list' }, ...statements.map(s => renderStatement(entry, s)))
    : el('p', { class: 'hint' }, 'Немає пунктів перевірки — додайте власний');

  const addBtn = el('button', { type: 'button', class: 'link-btn', onclick: () => {
    openStatementModal({
      title: 'Додати пункт перевірки',
      initialText: '',
      onSave: (text) => addStatement(entry.control_id, text),
    });
  } }, '+ Додати пункт перевірки');

  return el('div', { class: 'checklist-row' },
    el('header', {},
      el('strong', {}, `${entry.control_id} — ${entry.control_title}`),
      ' ',
      el('label', {}, includeCheckbox, ' включити в оцінювання')),
    statementsList,
    addBtn);
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

- [ ] **Step 2: Update CSS**

In `public/css/app.css`, replace this line (remove the now-unused inline-textarea rule):

```css
.checklist-row textarea { width: 100%; min-height: 4rem; padding: var(--space-2); border: 1px solid var(--color-border); border-radius: var(--radius-sm); font-family: inherit; }
```

with:

```css
.statements-list { margin: var(--space-2) 0; }
.statement-item { display: flex; align-items: flex-start; justify-content: space-between; gap: var(--space-2); padding: var(--space-2) 0; border-bottom: 1px solid var(--color-border); }
.statement-item:last-child { border-bottom: none; }
.statement-item p { margin: 0; flex: 1; }
.statement-actions { display: flex; gap: var(--space-2); flex-shrink: 0; white-space: nowrap; }
```

- [ ] **Step 3: Verify manually**

Start the dev server (`npm start`), open the assessment module, open an assessment in `PLANNING` status (create a new one from an approved CPB if none exists). Confirm:
1. Each checklist entry shows its statements as read-only text (no inline textarea).
2. Clicking "Редагувати" on a statement opens a modal pre-filled with its text; editing and clicking "Зберегти" updates the displayed text and persists after reload.
3. Clicking "Видалити" inside the edit modal (or the inline "Видалити" button) asks for confirmation and removes that one statement, leaving others intact.
4. Clicking "+ Додати пункт перевірки" opens an empty modal; saving adds a new statement to that control's list.
5. A control with zero statements shows "Немає пунктів перевірки — додайте власний" instead of a blank textarea.
6. Export checklist DOCX still works and shows all statements, numbered, under their control.
7. Approve plan still transitions to the execution dashboard, which now shows all statements (numbered) above each control's items.

Clean up any test assessment created during this manual check (`rm -rf assessments/<test-id>`, `rm -f exports/assessments/<test-id>*.docx`) and confirm `git status --porcelain` is clean before moving on.

- [ ] **Step 4: Commit**

```bash
git add public/js/assessment/plan-review.js public/css/app.css
git commit -m "feat: multi-statement checklist UI with modal add/edit/delete"
```

---

### Task 7: Прибирання застарілого тестового запису та повний прогін

**Files:** none (verification only)

- [ ] **Step 1: Remove the stale pre-feature test assessment**

The assessment `ASSESS-2026-1026` in the repo's `assessments/` directory was created manually during prior testing and uses the OLD single-`verification_statement` checklist shape pre-dating this plan (confirmed with the user: safe to delete, not real data). Remove it:

```bash
rm -rf assessments/ASSESS-2026-1026
git status --porcelain
```

Expected: `ASSESS-2026-1026` no longer appears in `git status` (it was untracked, so this is a plain filesystem cleanup, not a commit).

- [ ] **Step 2: Run the full test suite**

Run: `npm test`
Expected: all tests pass except the 2 known pre-existing, unrelated failures (`RESULT_LABELS: Ukrainian labels`, `план АС-2: без сирих плейсхолдерів і дужок у resolved_objective та statement_text`).

- [ ] **Step 3: Manual e2e walkthrough**

With `npm start` running, walk through once end-to-end: create an assessment from an approved CPB → plan-review screen shows AT-family controls with multiple generated statements each → edit one statement via modal → add a new custom statement via modal → delete a statement → export checklist DOCX and confirm all remaining statements appear, numbered → approve plan → confirm execution dashboard shows the same numbered statements above the control's items → finalize → confirm final report DOCX also shows them correctly (reuses the same `report-projection.js`/`assessment-docx-writer.js` path, unaffected by this plan, but worth a final visual confirmation since the execution dashboard changed).

- [ ] **Step 4: Final cleanup check**

```bash
git status --porcelain
```

Remove any stray test assessment/export artifacts created during Step 3 before finishing. Do not touch any file modified by the user outside this plan's scope (e.g. unrelated in-progress edits to other assessments).
