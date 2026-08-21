# Assessment UI: 4 кроки, документ-в'ю по контролю, словник політик — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Реалізувати три погоджені спеки модуля оцінювання: (1) явні 4 кроки оцінювання без чекбоксів методів, (2) документ-в'ю по контролю (НД ТЗІ ↔ фактичний ЦПБ з підсвіткою джерела), (3) запис даних оцінювання у спільний словник політик.

**Architecture:** Зміни зосереджені в `core/assessment/assessment-plan.js` (два адитивних поля на plan items: `methods_reference`, `semantic_label`/`semantic_source_text`), `public/js/assessment/assessment-table.js` (видалення чекбоксів методів, нова секція документ-в'ю по контролю, тригер запису в словник), `public/js/assessment/assessment-item.js` (4-крокова структура деталь-панелі), `core/odp-dictionary.js` + `server.js` (вердикт у словнику), та прибирання метод-специфічного вмісту з `core/assessment/report-projection.js` + `core/docx/assessment-docx-writer.js`.

**Tech Stack:** Node.js ESM, zero npm deps, `node:test`, vanilla-JS UI (`el()` helper, без DOM-тестів — проєкт не має jsdom/happy-dom, DOM-рендер-функції тестуються лише вручну в браузері).

## Global Constraints

- Zero npm dependencies — тільки built-in Node.js модулі.
- `node:test` для всіх тестів; запуск через `npm test`.
- Жодних `Date.now()`/`new Date()` у детермінованих модулях (report-projection, docx-writer).
- Дані оцінювання (`result` enum, `assessor_comment`, `conclusion`, evidence) — без нових enum-значень.
- Поле `methods_used` лишається в схемі результату (для сумісності з міграцією v1→v3), але жодна дія в новому UI його не встановлює.
- Словник — той самий файл `dictionary/odp_dictionary.json` / `core/odp-dictionary.js`, розширення схеми лише адитивне.
- Перед кожним комітом: `npm test` має проходити повністю (базова лінія — 139/139 на момент написання плану).

---

### Task 1: `methods_reference` на plan items

**Files:**
- Modify: `core/assessment/assessment-plan.js`
- Test: `test/assessment/assessment-plan.test.js`

**Interfaces:**
- Produces: кожен plan item отримує нове поле `methods_reference: { EXAMINE?: string[], INTERVIEW?: string[], TEST?: string[] }` — копія `adapterCtrl.assessment_methods_reference` (чи `{}`, якщо в адаптері немає).

- [ ] **Step 1: Write the failing test**

Додати в кінець `test/assessment/assessment-plan.test.js`:

```js
test('methods_reference: копія assessment_methods_reference з адаптера', () => {
  const e = items.find(i => i.assessment_source_id === 'AC-02e');
  const adapterCtrl = adapter.controls.find(c => c.control_id === 'AC-02');
  assert.deepEqual(e.methods_reference, adapterCtrl.assessment_methods_reference);
  assert.ok(e.methods_reference.EXAMINE?.length > 0);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/assessment/assessment-plan.test.js`
Expected: FAIL — `e.methods_reference` is `undefined`, `assert.deepEqual` throws.

- [ ] **Step 3: Write minimal implementation**

У `core/assessment/assessment-plan.js`, в об'єкті, що `items.push(...)` (містить `assessment_source_id, control_id, ...`), додати нове поле одразу після `available_methods: Object.keys(item.methods),`:

```js
        available_methods: Object.keys(item.methods),
        methods_reference: adapterCtrl?.assessment_methods_reference ?? {},
      });
```

(`adapterCtrl` — вже наявна змінна в тій самій функції, `const adapterCtrl = adapterIndex.controls.get(catCtrl.control_id);`.)

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/assessment/assessment-plan.test.js`
Expected: PASS, усі тести файлу зелені.

- [ ] **Step 5: Commit**

```bash
git add core/assessment/assessment-plan.js test/assessment/assessment-plan.test.js
git commit -m "feat(assessment): додати methods_reference на plan items"
```

---

### Task 2: `semantic_label`/`semantic_source_text` на odp_values

**Files:**
- Modify: `core/assessment/assessment-plan.js`
- Test: `test/assessment/assessment-plan.test.js`

**Interfaces:**
- Produces: кожен елемент `item.odp_values[]` отримує `semantic_label: string|null`, `semantic_source_text: string|null` (з `entry.semantic.label`/`entry.semantic.source_text` адаптера).

- [ ] **Step 1: Write the failing test**

Додати в кінець `test/assessment/assessment-plan.test.js`:

```js
test('odp_values: semantic_label/semantic_source_text з адаптера', () => {
  const e = items.find(i => i.assessment_source_id === 'AC-02e');
  const odp1 = e.odp_values.find(v => v.local_odp_id === 'ac-2_odp.01');
  assert.equal(odp1.semantic_label, 'визначеною організацією відповідальною особою або роллю');
  assert.equal(odp1.semantic_source_text, '[Призначення: визначеною організацією відповідальною особою або роллю]');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/assessment/assessment-plan.test.js`
Expected: FAIL — `odp1.semantic_label` is `undefined`.

- [ ] **Step 3: Write minimal implementation**

У `core/assessment/assessment-plan.js`, в `odpValues.map(entry => { ... return { ... }; })`, додати два поля в кінець повертаного об'єкта:

```js
      return { 
        assessment_odp_id: entry.assessment_odp_id, 
        local_odp_id: entry.local_odp_id,
        statement_paths: (entry.statement_usage ?? []).map(u => u.statement_path),
        statement_usage: (entry.statement_usage ?? []).map(u => ({ statement_path: u.statement_path, text: u.text })),
        baseline_value: baselineValue({ adapterEntry: entry, infoType: cpb.info_type }),
        target_value: eff.value, 
        effective_source: eff.source, 
        status: eff.status,
        semantic_label: entry.semantic?.label ?? null,
        semantic_source_text: entry.semantic?.source_text ?? null,
      };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/assessment/assessment-plan.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add core/assessment/assessment-plan.js test/assessment/assessment-plan.test.js
git commit -m "feat(assessment): прокинути semantic_label/semantic_source_text в odp_values"
```

---

### Task 3: Прибрати чекбокси методів з головної таблиці

**Files:**
- Modify: `public/js/assessment/assessment-table.js`
- Modify: `public/css/app.css`

**Interfaces:**
- Consumes: нічого нового.
- Produces: `itemRow` більше не рендерить колонку методів; `patchResult` більше ніде в цьому файлі не викликається з `{ methods_used }`. Кількість колонок таблиці — 7 (було 8).

- [ ] **Step 1: Видалити блок чекбоксів і колонку в `itemRow`**

У `public/js/assessment/assessment-table.js`, видалити повністю цей блок (одразу після `resultSelect`):

```js
  // Methods checkboxes
  const methodsDiv = el('div', { class: 'methods' },
    ...(planItem.available_methods ?? []).map(method => {
      const isChecked = result?.methods_used?.includes(method) ?? false;
      return el('label', {},
        el('input', {
          type: 'checkbox',
          checked: isChecked ? '' : null,
          disabled: isFinalized ? '' : null,
          onchange: (e) => {
            const current = getAssessment();
            const currentResult = current.results.find(r => r.assessment_source_id === sourceId);
            const currentMethods = currentResult?.methods_used ?? [];
            const newMethods = e.target.checked
              ? [...currentMethods, method]
              : currentMethods.filter(m => m !== method);
            patchResult(sourceId, { methods_used: newMethods });
          }
        }),
        ` ${METHOD_LABELS[method] ?? method}`
      );
    })
  );

```

І в `row = el('tr', { class: 'assessment-item-row' }, ...)` видалити рядок `el('td', {}, methodsDiv),` з переліку дітей.

- [ ] **Step 2: Видалити колонку заголовка й перерахувати colspan**

У `renderAssessmentTable`, у `thead`, видалити `el('th', {}, 'Вибір типів дослідження'),`.

Замінити всі три місця з `colspan: '8'` на `colspan: '7'` (family-рядок і control-рядок групування):

```js
      el('tr', { class: 'group-row family' },
        el('td', { colspan: '7' }, `${familyGroup.family} — ${familyGroup.family_title}`)
      )
```

```js
        el('tr', { class: 'group-row control' },
          el('td', { colspan: '7' }, `${controlGroup.control_id} — ${controlGroup.control_title}`)
        )
```

У функції `odpSubrows`, змінити `el('td', { colspan: '7' }, ...)` на `el('td', { colspan: '6' }, ...)` (перша колонка ODP-рядка — окрема `td`, решта 6 з 7 залишку).

- [ ] **Step 3: Додати числові маркери «Крок 1» на заголовки БПБ/ЦПБ**

У `thead`, замінити:

```js
      el('th', {}, 'Значення з БПБ'),
      el('th', {}, 'Значення з ЦПБ'),
```

на:

```js
      el('th', {}, el('span', { class: 'step-badge' }, '1'), ' Значення з БПБ'),
      el('th', {}, el('span', { class: 'step-badge' }, '1'), ' Значення з ЦПБ'),
```

- [ ] **Step 4: Додати CSS для `.step-badge`, прибрати `.methods` стилі**

У `public/css/app.css`, видалити ці два рядки (більше не використовуються):

```css
.assessment-table .methods { display: flex; flex-direction: column; gap: 0.2rem; }
.assessment-table .methods label { display: flex; align-items: center; gap: 0.3rem; font-size: 0.8rem; }
```

Додати одразу після `.assessment-table .odp-meta { display: inline-block; margin-right: 1rem; }`:

```css
.step-badge { display: inline-block; background: #2c5282; color: #fff; border-radius: 999px;
  width: 1.1rem; height: 1.1rem; text-align: center; font-size: 0.65rem; line-height: 1.1rem; margin-right: 0.3rem; }
```

- [ ] **Step 5: Перевірити повний набір тестів**

Run: `npm test`
Expected: усі тести проходять (для цієї зміни автотестів немає — `assessment-table.js` рендер-функції не покриті DOM-тестами в цьому проєкті; ручна перевірка нижче).

- [ ] **Step 6: Ручна e2e-перевірка**

Запустити `npm start`, відкрити оцінювання в браузері, переконатись: колонки «Вибір типів дослідження» немає, заголовки БПБ/ЦПБ мають синій кружечок «1», таблиця не зламана (рядки ODP, розгортання — на місці).

- [ ] **Step 7: Commit**

```bash
git add public/js/assessment/assessment-table.js public/css/app.css
git commit -m "refactor(assessment-ui): прибрати чекбокси методів з таблиці, додати маркер кроку 1"
```

---

### Task 4: 4-крокова структура деталь-панелі

**Files:**
- Modify: `public/js/assessment/assessment-table.js` (експорт `collapsePlaceholders`)
- Modify: `public/js/assessment/assessment-item.js`
- Modify: `public/css/app.css`

**Interfaces:**
- Consumes: `collapsePlaceholders` з `assessment-table.js`; `planItem.methods_reference` (Task 1); `planItem.odp_values[].semantic_label` не потрібен тут (використовується лише в Task 6).
- Produces: деталь-панель має 4 нумеровані секції (Крок 1: валідність ЦПБ; Крок 2-4: гайд по методах, read-only) між блоком «Шаблон мети» і блоком «Коментар оцінювача».

- [ ] **Step 1: Експортувати `collapsePlaceholders`**

У `public/js/assessment/assessment-table.js` змінити:

```js
const collapsePlaceholders = (t) => String(t ?? '').replace(/\{\{\s*insert:\s*param,\s*([\w.-]+)\s*\}\}/g, '[$1]');
```

на:

```js
export const collapsePlaceholders = (t) => String(t ?? '').replace(/\{\{\s*insert:\s*param,\s*([\w.-]+)\s*\}\}/g, '[$1]');
```

- [ ] **Step 2: Імпортувати в `assessment-item.js`**

У `public/js/assessment/assessment-item.js`, замінити рядок:

```js
import { renderAssessmentTable } from './assessment-table.js';
```

на:

```js
import { renderAssessmentTable, collapsePlaceholders } from './assessment-table.js';
```

- [ ] **Step 3: Видалити стару секцію «Значення параметрів ODP», побудувати 4 кроки**

У `renderItemDetailPanel`, видалити секцію:

```js
    el('section', {},
      el('h4', {}, 'Значення параметрів ODP'),
      odpTable
    ),
```

Перед `return el('aside', ...)` додати побудову 4 кроків:

```js
  const step1Section = el('section', { class: 'assessment-item-step' },
    el('h4', {}, 'Крок 1. Валідність заповнення ЦПБ'),
    el('p', { class: 'resolved-objective' }, collapsePlaceholders(planItem.statement_text)),
    el('p', { class: 'note' }, 'Перевірте, чи трактування параметра в ЦПБ відповідає вимозі НД ТЗІ.'),
    odpTable
  );

  const methodStepSection = (method, title) => {
    const refs = planItem.methods_reference?.[method] ?? [];
    const text = refs.length ? refs.join('\n') : 'Підказка відсутня для цього заходу.';
    return el('section', { class: 'assessment-item-step' },
      el('h4', {}, title),
      el('p', { class: 'methods-guidance' }, text)
    );
  };
  const step2Section = methodStepSection('EXAMINE', 'Крок 2. Дослідження');
  const step3Section = methodStepSection('INTERVIEW', 'Крок 3. Опитування');
  const step4Section = methodStepSection('TEST', 'Крок 4. Тестування');
```

- [ ] **Step 4: Вставити секції в `return`**

Замінити фінальний `return el('aside', ...)`, вставивши 4 секції між блоком «Шаблон мети» і блоком «Коментар оцінювача»:

```js
  return el('aside', { class: 'item-detail-panel' },
    el('header', {},
      el('h3', {}, sourceId),
      closeBtn
    ),
    el('section', {},
      el('h4', {}, 'Шаблон мети'),
      el('p', { class: 'objective-template' }, planItem.objective_template ?? ''),
      el('h4', {}, 'Розв\'язана мета оцінювання'),
      el('p', { class: 'resolved-objective' }, planItem.resolved_objective ?? '')
    ),
    step1Section,
    step2Section,
    step3Section,
    step4Section,
    el('section', {},
      el('label', { class: 'field' },
        'Коментар оцінювача',
        commentArea
      )
    ),
    el('section', {},
      el('label', { class: 'field' },
        'Висновок',
        conclusionArea
      )
    ),
    evidenceSection,
    findingsSection,
    traceabilitySection
  );
```

- [ ] **Step 5: CSS для кроків**

У `public/css/app.css`, додати одразу після `.item-detail-panel .note { ... }`:

```css
.item-detail-panel .assessment-item-step { border-left: 3px solid #cbd5e0; padding-left: 0.75rem; }
.item-detail-panel .methods-guidance { font-size: 0.82rem; color: #4a5568; white-space: pre-line; }
```

- [ ] **Step 6: Перевірити тести й ручну e2e**

Run: `npm test` — має пройти без змін (немає DOM-тестів на цей файл).
Ручна перевірка в браузері: відкрити пункт, переконатись що бачите послідовно «Шаблон мети», «Крок 1» (з текстом вимоги, таблицею ODP, підказкою), «Крок 2/3/4» (текст-підказка з нормативних джерел або заглушка), потім «Коментар оцінювача»/«Висновок»/докази.

- [ ] **Step 7: Commit**

```bash
git add public/js/assessment/assessment-table.js public/js/assessment/assessment-item.js public/css/app.css
git commit -m "feat(assessment-ui): 4-крокова структура деталь-панелі (валідність ЦПБ + 3 методи)"
```

---

### Task 5: Прибрати методи зі звіту (report-projection.js)

**Files:**
- Modify: `core/assessment/report-projection.js`
- Modify: `test/assessment/report-projection.test.js`

**Interfaces:**
- Produces: `buildReportProjection(...)` більше не повертає поле `methods`; кожен item у `families[].controls[].items[]` більше не має `methods_used_labels`.

- [ ] **Step 1: Update the test (red first)**

У `test/assessment/report-projection.test.js`, замінити:

```js
  assert.deepEqual(p.families[0].controls[0].items[0].methods_used_labels, ['Дослідження', 'Співбесіда']);
```

на:

```js
  assert.equal(p.families[0].controls[0].items[0].methods_used_labels, undefined);
  assert.equal(p.methods, undefined);
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/assessment/report-projection.test.js`
Expected: FAIL — `p.methods` ще існує (масив), `methods_used_labels` ще існує.

- [ ] **Step 3: Видалити обчислення методів**

У `core/assessment/report-projection.js`, видалити повністю блок:

```js
  // Count method usage
  const methodCounts = {
    EXAMINE: 0,
    INTERVIEW: 0,
    TEST: 0
  };
  for (const result of assessment.results ?? []) {
    for (const method of result.methods_used ?? []) {
      if (methodCounts.hasOwnProperty(method)) {
        methodCounts[method]++;
      }
    }
  }

  const methods = Object.entries(methodCounts).map(([key, used_count]) => ({
    key,
    label: METHOD_LABELS[key],
    used_count
  }));

```

У мапінгу `families = groups.map(...)`, видалити рядок:

```js
          methods_used_labels: (result?.methods_used ?? []).map(m => METHOD_LABELS[m]),
```

У фінальному `return { ... }`, видалити рядок `methods,`.

Видалити тепер невикористаний експорт на початку файлу:

```js
export const METHOD_LABELS = {
  EXAMINE: 'Дослідження',
  INTERVIEW: 'Співбесіда',
  TEST: 'Перевірка'
};

```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/assessment/report-projection.test.js`
Expected: PASS, усі тести файлу зелені.

- [ ] **Step 5: Commit**

```bash
git add core/assessment/report-projection.js test/assessment/report-projection.test.js
git commit -m "refactor(report): прибрати methods/methods_used_labels з проєкції звіту"
```

---

### Task 6: Прибрати секцію методів і колонку з DOCX-звіту

**Files:**
- Modify: `core/docx/assessment-docx-writer.js`
- Modify: `test/assessment/assessment-docx-writer.test.js`

**Interfaces:**
- Consumes: `projection` без `methods`/`methods_used_labels` (Task 5).
- Produces: DOCX більше не містить секції «Методи оцінювання» й колонки «Методи»; секції перенумеровані 4-8 (було 5-9), додаток «9.1.» стає «8.1.».

- [ ] **Step 1: Update the test (red first)**

У `test/assessment/assessment-docx-writer.test.js`, у тесті `'document.xml містить обовʼязкові розділи та українські лейбли'`, видалити блок:

```js
  // Методи (українські лейбли)
  assert.match(xml, /Дослідження/, 'EXAMINE label');
  assert.match(xml, /Співбесіда/, 'INTERVIEW label');
  assert.match(xml, /Перевірка/, 'TEST label');

```

і додати замість нього перевірку нової нумерації:

```js
  // Секції перенумеровані після видалення «Методів оцінювання»
  assert.match(xml, /4\. Результати оцінювання за класами заходів захисту/, 'section 4 renumbered');
  assert.match(xml, /8\. Додатки/, 'section 8 renumbered');
  assert.ok(!xml.includes('Методи оцінювання'), 'методи-секція видалена');

```

Також у фікстурі `assessment.results[0]`, видалити рядок:

```js
      methods_used: ['EXAMINE', 'INTERVIEW', 'TEST'],
```

(поле лишається валідним у схемі результату — просто більше не потрібне в цій фікстурі, оскільки DOCX його не читає.)

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/assessment/assessment-docx-writer.test.js`
Expected: FAIL — секція «4. Методи оцінювання» ще існує, нумерація «5. Результати…» не збігається з очікуваною «4. Результати…».

- [ ] **Step 3: Видалити секцію методів, перенумерувати наступні**

У `core/docx/assessment-docx-writer.js`, видалити повністю:

```js
  // Section 5: Methods table
  sections.push(par('4. Методи оцінювання', { bold: true, sz: 32 }));
  sections.push(par(''));
  const methodRows = [
    row([cell('Метод', { header: true }), cell('Використано разів', { header: true })], { header: true }),
    ...projection.methods.map(m => row([cell(m.label, {}), cell(String(m.used_count), {})]))
  ];
  sections.push(table(methodRows));
  sections.push(par(''));

```

Замінити заголовки й видалити колонку «Методи» в таблиці item-рядків:

```js
  // Section 6: Results by families
  sections.push(par('5. Результати оцінювання за класами заходів захисту', { bold: true, sz: 32 }));
```
→
```js
  // Section 4: Results by families
  sections.push(par('4. Результати оцінювання за класами заходів захисту', { bold: true, sz: 32 }));
```

```js
      const itemRows = [
        row([
          cell('Позначення', { header: true }),
          cell('Мета оцінювання', { header: true }),
          cell('Оцінка', { header: true }),
          cell('Методи', { header: true }),
          cell('Висновок', { header: true })
        ], { header: true }),
        ...control.items.map(item => {
          const methodsText = item.methods_used_labels.join(', ');
          const evidenceText = item.evidence_ids.length > 0
            ? `Докази: ${item.evidence_ids.join(', ')}`
            : '';
          const conclusionFull = [item.conclusion, evidenceText].filter(Boolean).join('\n');
          return row([
            cell(item.assessment_source_id, {}),
            cell(item.resolved_objective, {}),
            cell(item.result_label, {}),
            cell(methodsText, {}),
            cell(conclusionFull, {})
          ]);
        })
      ];
```
→
```js
      const itemRows = [
        row([
          cell('Позначення', { header: true }),
          cell('Мета оцінювання', { header: true }),
          cell('Оцінка', { header: true }),
          cell('Висновок', { header: true })
        ], { header: true }),
        ...control.items.map(item => {
          const evidenceText = item.evidence_ids.length > 0
            ? `Докази: ${item.evidence_ids.join(', ')}`
            : '';
          const conclusionFull = [item.conclusion, evidenceText].filter(Boolean).join('\n');
          return row([
            cell(item.assessment_source_id, {}),
            cell(item.resolved_objective, {}),
            cell(item.result_label, {}),
            cell(conclusionFull, {})
          ]);
        })
      ];
```

Перенумерувати решту заголовків (кожен `par('N. ...')` зменшити на 1):

```js
  sections.push(par('6. Реєстр доказів', { bold: true, sz: 32 }));
```
→ `par('5. Реєстр доказів', ...)`

```js
  sections.push(par('7. Недоліки', { bold: true, sz: 32 }));
```
→ `par('6. Недоліки', ...)`

```js
  sections.push(par('8. Загальний висновок', { bold: true, sz: 32 }));
```
→ `par('7. Загальний висновок', ...)`

```js
  sections.push(par('9. Додатки', { bold: true, sz: 32 }));
  sections.push(par(''));
  sections.push(par('9.1. Нерозвʼязані параметри (ODP)', { bold: true }));
```
→
```js
  sections.push(par('8. Додатки', { bold: true, sz: 32 }));
  sections.push(par(''));
  sections.push(par('8.1. Нерозвʼязані параметри (ODP)', { bold: true }));
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/assessment/assessment-docx-writer.test.js`
Expected: PASS, усі тести файлу зелені (включно з «відтворюваність» і `unzip -t`).

- [ ] **Step 5: Full suite**

Run: `npm test`
Expected: усі тести зелені (перевірити, що жоден інший файл не посилається на видалені секції/поля).

- [ ] **Step 6: Commit**

```bash
git add core/docx/assessment-docx-writer.js test/assessment/assessment-docx-writer.test.js
git commit -m "refactor(docx): прибрати секцію та колонку методів, перенумерувати розділи звіту"
```

---

### Task 7: Експортувати `firstSegmentLabel`

**Files:**
- Modify: `public/js/assessment/assessment-table.js`

**Interfaces:**
- Produces: `firstSegmentLabel(path: string) → string` — доступний для імпорту з інших модулів UI.

- [ ] **Step 1: Додати `export`**

У `public/js/assessment/assessment-table.js` змінити:

```js
function firstSegmentLabel(path) {
  return String(path ?? '').split('.')[0].replace(/[\[(].*$/, '');
}
```

на:

```js
export function firstSegmentLabel(path) {
  return String(path ?? '').split('.')[0].replace(/[\[(].*$/, '');
}
```

- [ ] **Step 2: Run full suite**

Run: `npm test`
Expected: усі тести зелені (чиста адитивна зміна видимості).

- [ ] **Step 3: Commit**

```bash
git add public/js/assessment/assessment-table.js
git commit -m "refactor(assessment-table): експортувати firstSegmentLabel для повторного використання"
```

---

### Task 8: `buildControlDocument` — чиста функція документ-в'ю по контролю

**Files:**
- Create: `public/js/assessment/control-document-view.js`
- Test: `test/assessment/control-document-view.test.js`

**Interfaces:**
- Consumes: `firstSegmentLabel` з `assessment-table.js` (Task 7).
- Produces: `buildControlDocument(items) → { left: LineParts[], right: LineParts[] }`, де `LineParts = { label: string, parts: Array<{ type: 'text', text } | { type: 'param', text, source? }> }`. `items` — масив `{ planItem, result }` (як `controlGroup.items` з `groupPlanItems`).

- [ ] **Step 1: Write the failing test**

Створити `test/assessment/control-document-view.test.js`:

```js
// test/assessment/control-document-view.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildControlDocument } from '../../public/js/assessment/control-document-view.js';

const odpValues = [
  { local_odp_id: 'ac-2_odp.01', target_value: 'Начальник СЗІ', effective_source: 'CPB_OVERRIDE' },
  { local_odp_id: 'ac-2_odp.02', target_value: 'мінімум щоквартально', effective_source: 'BPB_INHERITED' },
  { local_odp_id: 'ac-2_odp.03', target_value: null, effective_source: null },
];

const items = [
  {
    planItem: {
      kind: 'STATEMENT',
      statement_path: 'a',
      statement_text: 'Призначити {{ insert: param, ac-2_odp.01 }} для управління обліковими записами.',
      odp_values: odpValues,
    },
  },
  {
    planItem: {
      kind: 'STATEMENT',
      statement_path: 'b',
      statement_text: 'Переглядати облікові записи {{ insert: param, ac-2_odp.02 }} та {{ insert: param, ac-2_odp.03 }}.',
      odp_values: odpValues,
    },
  },
  {
    planItem: {
      kind: 'ODP_DEFINITION',
      statement_path: null,
      statement_text: 'визначено персонал або ролі;',
      odp_values: odpValues,
    },
  },
];

test('buildControlDocument: фільтрує ODP_DEFINITION, залишає лише STATEMENT-рядки', () => {
  const { left, right } = buildControlDocument(items);
  assert.equal(left.length, 2);
  assert.equal(right.length, 2);
});

test('buildControlDocument: ліва колонка — плейсхолдери згорнуті в [id], без кольору', () => {
  const { left } = buildControlDocument(items);
  assert.deepEqual(left[0], {
    label: 'a',
    parts: [
      { type: 'text', text: 'Призначити ' },
      { type: 'param', text: '[ac-2_odp.01]' },
      { type: 'text', text: ' для управління обліковими записами.' },
    ],
  });
});

test('buildControlDocument: права колонка — реальне значення й клас за джерелом', () => {
  const { right } = buildControlDocument(items);
  assert.deepEqual(right[0], {
    label: 'a',
    parts: [
      { type: 'text', text: 'Призначити ' },
      { type: 'param', text: 'Начальник СЗІ', source: 'src-override' },
      { type: 'text', text: ' для управління обліковими записами.' },
    ],
  });
  assert.deepEqual(right[1].parts[1], { type: 'param', text: 'мінімум щоквартально', source: 'src-bpb' });
});

test('buildControlDocument: без значення (UNRESOLVED) — «не визначено», клас src-empty', () => {
  const { right } = buildControlDocument(items);
  assert.deepEqual(right[1].parts[3], { type: 'param', text: 'не визначено', source: 'src-empty' });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/assessment/control-document-view.test.js`
Expected: FAIL — `Cannot find module '../../public/js/assessment/control-document-view.js'`.

- [ ] **Step 3: Write minimal implementation**

Створити `public/js/assessment/control-document-view.js`:

```js
// public/js/assessment/control-document-view.js
import { firstSegmentLabel } from './assessment-table.js';

const PARAM_RE = /\{\{\s*insert:\s*param,\s*([\w.-]+)\s*\}\}/g;

const SOURCE_CLASS = {
  CPB_OVERRIDE: 'src-override',
  BPB_INHERITED: 'src-bpb',
  GENERIC_DEFAULT: 'src-generic',
};

function formatValue(value) {
  if (value === null || value === undefined) return null;
  return Array.isArray(value) ? value.join('; ') : String(value);
}

function splitStatement(text) {
  const segments = [];
  let last = 0;
  let m;
  PARAM_RE.lastIndex = 0;
  while ((m = PARAM_RE.exec(text)) !== null) {
    if (m.index > last) segments.push({ type: 'text', text: text.slice(last, m.index) });
    segments.push({ type: 'param', paramId: m[1] });
    last = m.index + m[0].length;
  }
  if (last < text.length) segments.push({ type: 'text', text: text.slice(last) });
  return segments;
}

/**
 * @param {Array<{planItem: object}>} items — controlGroup.items з groupPlanItems
 * @returns {{ left: Array, right: Array }}
 */
export function buildControlDocument(items) {
  const statementItems = (items ?? []).filter(({ planItem }) => planItem.kind === 'STATEMENT');
  const odpMap = new Map();
  for (const v of statementItems[0]?.planItem.odp_values ?? []) odpMap.set(v.local_odp_id, v);

  const left = [];
  const right = [];
  for (const { planItem } of statementItems) {
    const label = firstSegmentLabel(planItem.statement_path);
    const segments = splitStatement(planItem.statement_text ?? '');

    left.push({
      label,
      parts: segments.map(s => s.type === 'text'
        ? { type: 'text', text: s.text }
        : { type: 'param', text: `[${s.paramId}]` }),
    });

    right.push({
      label,
      parts: segments.map(s => {
        if (s.type === 'text') return { type: 'text', text: s.text };
        const odp = odpMap.get(s.paramId);
        const value = formatValue(odp?.target_value);
        if (value == null) return { type: 'param', text: 'не визначено', source: 'src-empty' };
        return { type: 'param', text: value, source: SOURCE_CLASS[odp?.effective_source] ?? 'src-empty' };
      }),
    });
  }

  return { left, right };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/assessment/control-document-view.test.js`
Expected: PASS, усі 4 тести зелені.

- [ ] **Step 5: Commit**

```bash
git add public/js/assessment/control-document-view.js test/assessment/control-document-view.test.js
git commit -m "feat(assessment-ui): buildControlDocument — чиста функція документ-в'ю по контролю"
```

---

### Task 9: Рендер і інтеграція документ-в'ю по контролю в таблицю

**Files:**
- Modify: `public/js/assessment/control-document-view.js` (додати `renderControlDocument`)
- Modify: `public/js/assessment/assessment-table.js`
- Modify: `public/css/app.css`

**Interfaces:**
- Consumes: `buildControlDocument` (Task 8).
- Produces: `renderControlDocument(container: HTMLElement, items) → void` — рендерить легенду + дві колонки; заголовок групи контролю в `renderAssessmentTable` стає клікабельним і розгортає/згортає цей блок.

- [ ] **Step 1: Додати `renderControlDocument` у `control-document-view.js`**

Додати в кінець `public/js/assessment/control-document-view.js` (новий імпорт `el` на початку файлу):

```js
import { el } from '../render/dom.js';
```

(додати цей рядок першим у файлі, перед `import { firstSegmentLabel } ...`)

І в кінець файлу:

```js
function renderLine(line) {
  return el('p', { class: 'control-doc-line' },
    line.label ? `${line.label}. ` : '',
    ...line.parts.map(p => p.type === 'param'
      ? el('span', { class: `param ${p.source ?? ''}` }, p.text)
      : p.text));
}

/**
 * @param {HTMLElement} container
 * @param {Array<{planItem: object}>} items — controlGroup.items
 */
export function renderControlDocument(container, items) {
  const { left, right } = buildControlDocument(items);

  const legend = el('div', { class: 'control-doc-legend' },
    el('span', { class: 'param src-override' }, '  '), ' введено вручну в ЦПБ   ',
    el('span', { class: 'param src-bpb' }, '  '), ' успадковано з БПБ / типове значення   ',
    el('span', { class: 'param src-empty' }, '  '), ' не визначено');

  const columns = el('div', { class: 'control-doc-columns' },
    el('div', { class: 'control-doc-col' },
      el('h5', {}, 'Трактування з НД ТЗІ'),
      ...left.map(renderLine)),
    el('div', { class: 'control-doc-col' },
      el('h5', {}, 'Фактичний ЦПБ'),
      ...right.map(renderLine)));

  container.replaceChildren(legend, columns);
}
```

- [ ] **Step 2: Інтегрувати toggle в `renderAssessmentTable`**

У `public/js/assessment/assessment-table.js`, додати імпорт (після `import { updateResult } ...`):

```js
import { renderControlDocument } from './control-document-view.js';
```

Додати новий module-level `Set` поруч з `expandedRows`:

```js
// Module-level state for expanded control document-view blocks (family::control_id)
const expandedControlDocs = new Set();
```

Замінити цикл побудови control-рядка в `renderAssessmentTable`:

```js
    for (const controlGroup of familyGroup.controls) {
      // Control header row
      tbody.append(
        el('tr', { class: 'group-row control' },
          el('td', { colspan: '7' }, `${controlGroup.control_id} — ${controlGroup.control_title}`)
        )
      );
```

на:

```js
    for (const controlGroup of familyGroup.controls) {
      const controlKey = `${familyGroup.family}::${controlGroup.control_id}`;
      const isDocExpanded = expandedControlDocs.has(controlKey);

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
          el('td', { colspan: '7' },
            `${controlGroup.control_id} — ${controlGroup.control_title} `,
            el('span', { class: 'collapse-mark' }, isDocExpanded ? '▲' : '▼'))
        )
      );

      if (isDocExpanded) {
        const docCell = el('td', { colspan: '7' });
        tbody.append(el('tr', { class: 'control-doc-row' }, docCell));
        renderControlDocument(docCell, controlGroup.items);
      }
```

(решта циклу — рядки items/subrows — лишається без змін, тільки закриваюча дужка `}` циклу `for (const controlGroup ...)` вже існує нижче.)

- [ ] **Step 3: CSS для документ-в'ю**

Додати в `public/css/app.css`, одразу після `.assessment-table .group-row.control { ... }`:

```css
.assessment-table .group-row.control { cursor: pointer; }
.assessment-table .control-doc-row td { background: #fffff0; padding: 0.75rem 1rem; }
.control-doc-legend { font-size: 0.75rem; color: #4a5568; margin-bottom: 0.6rem; }
.control-doc-legend .param { padding: 0 0.5rem; margin-right: 0.2rem; border-radius: 3px; }
.control-doc-columns { display: flex; gap: 1.5rem; }
.control-doc-col { flex: 1; min-width: 0; }
.control-doc-col h5 { margin: 0 0 0.4rem; font-size: 0.85rem; color: #2c5282; }
.control-doc-line { font-size: 0.82rem; margin: 0.3rem 0; line-height: 1.4; }
```

- [ ] **Step 4: Full suite + ручна перевірка**

Run: `npm test`
Expected: усі тести зелені (немає DOM-тестів на новий рендер, покриття — через `buildControlDocument` з Task 8).

Ручна перевірка в браузері: клік на заголовок контролю (напр. AC-02) розгортає блок з легендою і двома колонками; повторний клік згортає; кольори відповідають джерелам (синій/сірий/червоний).

- [ ] **Step 5: Commit**

```bash
git add public/js/assessment/control-document-view.js public/js/assessment/assessment-table.js public/css/app.css
git commit -m "feat(assessment-ui): інтегрувати документ-в'ю по контролю (розгортання за кліком)"
```

---

### Task 10: Вердикт у словнику політик (`core/odp-dictionary.js`)

**Files:**
- Modify: `core/odp-dictionary.js`
- Test: `test/odp-dictionary.test.js`

**Interfaces:**
- Produces: `mergeRecord(dict, { paramId, label, source_text, value, info_type, verdict })` — `verdict` необов'язковий (`'VALID'|'INVALID'`); на записі значення (`values[]`) з'являється `verdict_counts: { VALID, INVALID }` лише коли передано хоч один вердикт.

- [ ] **Step 1: Write the failing test**

Додати в кінець `test/odp-dictionary.test.js`:

```js
test('mergeRecord: verdict_counts накопичуються, без verdict — не з\'являються', () => {
  let d = emptyDictionary();
  d = mergeRecord(d, { paramId: 'v_odp.01', label: 'мітка', value: 'значення' }); // без verdict (v1)
  assert.equal(d.entries['v_odp.01'].values[0].verdict_counts, undefined);

  d = mergeRecord(d, { paramId: 'v_odp.01', label: 'мітка', value: 'значення', verdict: 'VALID' });
  d = mergeRecord(d, { paramId: 'v_odp.01', label: 'мітка', value: 'значення', verdict: 'VALID' });
  d = mergeRecord(d, { paramId: 'v_odp.01', label: 'мітка', value: 'значення', verdict: 'INVALID' });
  const entry = d.entries['v_odp.01'].values[0];
  assert.equal(entry.count, 4);
  assert.deepEqual(entry.verdict_counts, { VALID: 2, INVALID: 1 });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/odp-dictionary.test.js`
Expected: FAIL — `entry.verdict_counts` is `undefined` після записів з вердиктом.

- [ ] **Step 3: Write minimal implementation**

У `core/odp-dictionary.js`, замінити `mergeRecord`:

```js
/** Додає факт заповнення параметра (з типом інформації); повертає НОВИЙ словник */
export function mergeRecord(dict, { paramId, label, source_text, value, info_type }) {
  const v = (value ?? '').trim();
  if (!paramId || !v) return dict;
  const entries = { ...(dict?.entries ?? {}) };
  const prev = entries[paramId] ?? { label: label ?? '', source_text: source_text ?? '', values: [] };
  const values = [...prev.values];
  const hit = values.find(x => x.value === v && (x.info_type ?? null) === (info_type ?? null));
  if (hit) { hit.count += 1; hit.last_used = new Date().toISOString(); }
  else values.unshift({ value: v, count: 1, last_used: new Date().toISOString(), ...(info_type ? { info_type } : {}) });
  values.sort((a, b) => b.count - a.count);
  entries[paramId] = { label: prev.label || label || '', source_text: prev.source_text || source_text || '', values: values.slice(0, 15) };
  return { entries };
}
```

на:

```js
/** Додає факт заповнення параметра (з типом інформації, опційним вердиктом оцінювача); повертає НОВИЙ словник */
export function mergeRecord(dict, { paramId, label, source_text, value, info_type, verdict }) {
  const v = (value ?? '').trim();
  if (!paramId || !v) return dict;
  const entries = { ...(dict?.entries ?? {}) };
  const prev = entries[paramId] ?? { label: label ?? '', source_text: source_text ?? '', values: [] };
  const values = [...prev.values];
  const hit = values.find(x => x.value === v && (x.info_type ?? null) === (info_type ?? null));
  if (hit) {
    hit.count += 1;
    hit.last_used = new Date().toISOString();
    if (verdict) hit.verdict_counts = { VALID: 0, INVALID: 0, ...hit.verdict_counts, [verdict]: (hit.verdict_counts?.[verdict] ?? 0) + 1 };
  } else {
    values.unshift({
      value: v, count: 1, last_used: new Date().toISOString(),
      ...(info_type ? { info_type } : {}),
      ...(verdict ? { verdict_counts: { VALID: 0, INVALID: 0, [verdict]: 1 } } : {}),
    });
  }
  values.sort((a, b) => b.count - a.count);
  entries[paramId] = { label: prev.label || label || '', source_text: prev.source_text || source_text || '', values: values.slice(0, 15) };
  return { entries };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/odp-dictionary.test.js`
Expected: PASS, усі тести файлу зелені (включно з попередніми — перевірити, що жоден старий тест не очікує ВІДСУТНОСТІ `verdict_counts` через `deepEqual` повного об'єкта; попередні тести використовують `assert.equal(e.values[0].value, ...)` — точкові перевірки, не ламаються).

- [ ] **Step 5: Commit**

```bash
git add core/odp-dictionary.js test/odp-dictionary.test.js
git commit -m "feat(dictionary): вердикт оцінювача (VALID/INVALID) у verdict_counts"
```

---

### Task 11: Валідація вердикту в `/api/dictionary/record`

**Files:**
- Modify: `server.js`
- Test: `test/server.test.js`

**Interfaces:**
- Consumes: `mergeRecord` (Task 10).
- Produces: `POST /api/dictionary/record` приймає необов'язкове поле `verdict`; якщо присутнє й не `'VALID'`/`'INVALID'` — 400.

- [ ] **Step 1: Write the failing test**

Додати в кінець `test/server.test.js` (одразу після тесту `'словник ODP: record → GET накопичує значення'`):

```js
test('словник ODP: verdict валідується (VALID/INVALID або відсутній)', async () => {
  const okRec = { paramId: 'test_odp.02', label: 'мітка', value: 'значення', verdict: 'VALID' };
  const ok = await fetch(BASE + '/api/dictionary/record', { method: 'POST', body: JSON.stringify(okRec) });
  assert.equal(ok.status, 200);
  const dict = await (await fetch(BASE + '/api/dictionary')).json();
  assert.deepEqual(dict.entries['test_odp.02'].values[0].verdict_counts, { VALID: 1, INVALID: 0 });

  const badRec = { paramId: 'test_odp.03', label: 'мітка', value: 'значення', verdict: 'MAYBE' };
  const bad = await fetch(BASE + '/api/dictionary/record', { method: 'POST', body: JSON.stringify(badRec) });
  assert.equal(bad.status, 400);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/server.test.js`
Expected: FAIL — `badRec` з `verdict: 'MAYBE'` наразі повертає 200 (немає валідації).

- [ ] **Step 3: Write minimal implementation**

У `server.js`, у блоці `POST /api/dictionary/record`, додати перевірку одразу після `if (PARAM_ID_DENY.has(rec.paramId) || rec.paramId.length > 200) ...`:

```js
          if (PARAM_ID_DENY.has(rec.paramId) || rec.paramId.length > 200)
            return json(res, 400, { error: 'некоректний paramId' });
          if (rec.verdict !== undefined && rec.verdict !== 'VALID' && rec.verdict !== 'INVALID')
            return json(res, 400, { error: 'verdict має бути VALID або INVALID' });
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/server.test.js`
Expected: PASS.

- [ ] **Step 5: Full suite**

Run: `npm test`
Expected: усі тести зелені.

- [ ] **Step 6: Commit**

```bash
git add server.js test/server.test.js
git commit -m "feat(server): валідація verdict у POST /api/dictionary/record"
```

---

### Task 12: Клієнтський тригер — запис у словник при зміні result ODP_DEFINITION-рядка

**Files:**
- Modify: `public/js/assessment/assessment-table.js`
- Test: `test/assessment/assessment-table.test.js`

**Interfaces:**
- Consumes: `planItem.odp_values[].semantic_label`/`semantic_source_text` (Task 2); `assessment.metadata.info_type`.
- Produces: нова експортована чиста функція `buildDictionaryRecord(planItem, patch, infoType) → object|null`; `patchResult` викликає `fetch('/api/dictionary/record', ...)` (fire-and-forget) коли ця функція повертає не-`null`.

- [ ] **Step 1: Write the failing test**

Додати в кінець `test/assessment/assessment-table.test.js` (додати `buildDictionaryRecord` в імпорт на початку файлу):

```js
import { groupPlanItems, RESULT_LABELS, METHOD_LABELS, relevantOdpEntries, odpColumnTexts, odpColumnParts, usageTitle, statementTitle, buildDictionaryRecord } from '../../public/js/assessment/assessment-table.js';
```

```js
test('buildDictionaryRecord: ODP_DEFINITION + SATISFIED → VALID запис', () => {
  const planItem = {
    kind: 'ODP_DEFINITION',
    assessment_source_id: 'AC-02_ODP[01]',
    odp_values: [
      { assessment_odp_id: 'AC-02_ODP[01]', local_odp_id: 'ac-2_odp.01', target_value: 'Начальник СЗІ',
        semantic_label: 'відповідальна особа', semantic_source_text: '[Призначення: ...]' },
    ],
  };
  const rec = buildDictionaryRecord(planItem, { result: 'SATISFIED' }, 'open_confidential');
  assert.deepEqual(rec, {
    paramId: 'ac-2_odp.01', label: 'відповідальна особа', source_text: '[Призначення: ...]',
    value: 'Начальник СЗІ', info_type: 'open_confidential', verdict: 'VALID',
  });
});

test('buildDictionaryRecord: NOT_SATISFIED → INVALID; NOT_ASSESSED/без result/STATEMENT/без значення → null', () => {
  const planItem = {
    kind: 'ODP_DEFINITION', assessment_source_id: 'X',
    odp_values: [{ assessment_odp_id: 'X', local_odp_id: 'x.01', target_value: 'значення' }],
  };
  assert.equal(buildDictionaryRecord(planItem, { result: 'NOT_SATISFIED' }, null).verdict, 'INVALID');
  assert.equal(buildDictionaryRecord(planItem, { result: 'NOT_ASSESSED' }, null), null);
  assert.equal(buildDictionaryRecord(planItem, {}, null), null);
  assert.equal(buildDictionaryRecord({ ...planItem, kind: 'STATEMENT' }, { result: 'SATISFIED' }, null), null);
  const noValue = { kind: 'ODP_DEFINITION', assessment_source_id: 'Y', odp_values: [{ assessment_odp_id: 'Y', local_odp_id: 'y.01', target_value: null }] };
  assert.equal(buildDictionaryRecord(noValue, { result: 'SATISFIED' }, null), null);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/assessment/assessment-table.test.js`
Expected: FAIL — `buildDictionaryRecord` is not exported / not defined.

- [ ] **Step 3: Write minimal implementation**

У `public/js/assessment/assessment-table.js`, додати нову експортовану функцію одразу після `formatOdpValue`:

```js
function formatOdpValue(value) {
  if (value === null || value === undefined) return null;
  if (Array.isArray(value)) return value.join('; ');
  return String(value);
}

// Запис у словник політик: лише для ODP_DEFINITION-рядків (однозначний ODP), лише коли result дає вердикт
export function buildDictionaryRecord(planItem, patch, infoType) {
  if (planItem.kind !== 'ODP_DEFINITION') return null;
  const verdict = patch.result === 'SATISFIED' || patch.result === 'PARTIALLY_SATISFIED' ? 'VALID'
    : patch.result === 'NOT_SATISFIED' ? 'INVALID' : null;
  if (!verdict) return null;
  const own = (planItem.odp_values ?? []).find(v => v.assessment_odp_id === planItem.assessment_source_id);
  if (!own) return null;
  const value = formatOdpValue(own.target_value);
  if (!value) return null;
  return {
    paramId: own.local_odp_id,
    label: own.semantic_label ?? '',
    source_text: own.semantic_source_text ?? '',
    value,
    info_type: infoType ?? null,
    verdict,
  };
}
```

Змінити `patchResult`, щоб викликала цю функцію й fire-and-forget POST:

```js
function patchResult(sourceId, patch) {
  const current = getAssessment();
  const { assessment } = updateResult(current, sourceId, patch);
  setAssessment(assessment);
  const planItem = assessment.plan.items.find(p => p.assessment_source_id === sourceId);
  const rec = planItem ? buildDictionaryRecord(planItem, patch, assessment.metadata?.info_type) : null;
  if (rec) fetch('/api/dictionary/record', { method: 'POST', body: JSON.stringify(rec) }).catch(() => {});
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/assessment/assessment-table.test.js`
Expected: PASS, усі тести файлу зелені.

- [ ] **Step 5: Full suite + ручна перевірка**

Run: `npm test`
Expected: усі тести зелені.

Ручна перевірка в браузері: змінити «Вибір оцінки» на ODP_DEFINITION-рядку (напр. AC-02_ODP[01]) на «Відповідає», перевірити у DevTools Network запит `POST /api/dictionary/record` і вміст `dictionary/odp_dictionary.json` після цього.

- [ ] **Step 6: Commit**

```bash
git add public/js/assessment/assessment-table.js test/assessment/assessment-table.test.js
git commit -m "feat(assessment-ui): запис у словник політик при оцінці ODP_DEFINITION-рядка"
```

---

## Порядок виконання

Завдання впорядковані за залежностями: 1→2 (дані плану) незалежні один від одного, але обидва мають йти перед 3-4 (Task 1 потрібен для Task 4) та перед 8-9 (не залежать від 1-2 напряму) і 12 (залежить від Task 2). Рекомендована послідовність виконання: 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12.

Після Task 12 — фінальний прогін `npm test` і перевірка, що загальна кількість тестів зросла (139 → ~139 + ~13 нових тестів з Task 1,2,8,10,11,12), без жодного `fail`.
