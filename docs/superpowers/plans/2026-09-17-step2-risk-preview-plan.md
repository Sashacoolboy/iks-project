# Step-2 Risk Preview & Manual Threat Entry Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show catalog risks per selected asset directly on Крок 2, let the user decide which of them go into the working set on Крок 3, and allow adding a risk that has no catalog entry (assessed later).

**Architecture:** A new shared module `public/js/risk-form.js` extracts and extends the existing "Додати ризик" modal (from `step3-base-risks.js`) with two modes — catalog-linked (now auto-filling every field from the matching catalog record) and manual free-text (creates an unassessed draft risk). Both `step2-assets.js` and `step3-base-risks.js` call this shared modal. Крок 2 gains a live risk-preview panel per selected asset with inclusion checkboxes bound to `state.risks.accepted_base` — the array that previously auto-filled itself on every Крок 3 render now becomes user-controlled from Крок 2. `core/risk-engine.js` and `core/docx/docx-writer.js` get small additive tolerance fixes for risks that don't have `impact`/`likelihood` yet.

**Tech Stack:** Vanilla JS (ESM), `node:test`, zero npm runtime deps.

## Global Constraints

- Zero npm runtime dependencies — no new packages.
- UI renders only via the existing `el()`/`option()`/`showModal()` helpers in `public/js/render/dom.js` — no `innerHTML`.
- `npm test` (`node --test test/`) must stay green; only 2 pre-existing, unrelated failures are allowed (`assessment-table.test.js` Ukrainian labels test, `dictionary-integrity.test.js` PS-01 placeholder-leak test) — do not try to fix those.
- No `confirm()` prompt for the new inclusion checkboxes (only for permanent delete, which already exists and is untouched).
- Follow existing code style: 2-space indent, `el(tag, attrs, ...children)` builder pattern, `setState(s => ({ ...s, ... }))` immutable updates.

---

## Task 1: `core/risk-engine.js` — tolerate risks without impact/likelihood + catalog lookup helper

**Files:**
- Modify: `core/risk-engine.js` (function `annotateRisk`, ~line 10; add new function after `threatDirectory`, ~line 46)
- Test: `test/risk-engine.test.js`

**Interfaces:**
- Produces: `annotateRisk(risk, scale)` — now returns `{ ...risk, score: null, level: null }` when `risk.impact == null || risk.likelihood == null`, otherwise unchanged behavior.
- Produces: `findCatalogRisk(catalog, assetId, threat, vulnerability)` — returns the first `catalog.risks[]` entry matching `threat` + `vulnerability` (and `asset_id` if `assetId` is truthy), or `null`.

- [ ] **Step 1: Write the failing tests**

Add to `test/risk-engine.test.js` (update the import line at the top first):

```js
import { computeRiskScore, riskLevel, annotateRisk, baseRisksFor, threatDirectory, buildCustomRisk,
  applyBaseOverride, acceptedRisksFor, findCatalogRisk } from '../core/risk-engine.js';
```

Then append at the end of the file:

```js
test('annotateRisk: без impact/likelihood повертає level=null, score=null', () => {
  const r = annotateRisk({ id: 'C-999', threat: 'Т', vulnerability: 'В' }, tr.scale);
  assert.equal(r.level, null);
  assert.equal(r.score, null);
});

test('annotateRisk: з обома полями рахує як і раніше', () => {
  const r = annotateRisk({ id: 'C-998', threat: 'Т', vulnerability: 'В', impact: 4, likelihood: 0.5 }, tr.scale);
  assert.equal(r.level, 'Високий');
});

test('findCatalogRisk знаходить запис за активом і темою; без активу шукає серед усіх; без збігу — null', () => {
  const base = baseRisksFor(tr, ['A-01'], 1)[0];
  const foundWithAsset = findCatalogRisk(tr, base.asset_id, base.threat, base.vulnerability);
  assert.equal(foundWithAsset.id, base.id);
  const foundAnyAsset = findCatalogRisk(tr, null, base.threat, base.vulnerability);
  assert.equal(foundAnyAsset.id, base.id);
  assert.equal(findCatalogRisk(tr, 'A-99', base.threat, base.vulnerability), null);
  assert.equal(findCatalogRisk(tr, null, 'нема такої', 'теж нема'), null);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test test/risk-engine.test.js`
Expected: FAIL — `findCatalogRisk is not a function` (and the import line itself throws `SyntaxError` for the missing named export).

- [ ] **Step 3: Implement**

In `core/risk-engine.js`, replace:

```js
export function annotateRisk(risk, scale) {
  const score = computeRiskScore(risk.impact, risk.likelihood);
  return { ...risk, score, level: riskLevel(score, scale) };
}
```

with:

```js
export function annotateRisk(risk, scale) {
  if (risk.impact == null || risk.likelihood == null) return { ...risk, score: null, level: null };
  const score = computeRiskScore(risk.impact, risk.likelihood);
  return { ...risk, score, level: riskLevel(score, scale) };
}
```

Then, directly after the `threatDirectory` function (before `buildCustomRisk`), add:

```js
// Каталожний запис за парою загроза/вразливість (і, за потреби, активом) — джерело
// автозаповнення полів при додаванні ризику "з переліку" (public/js/risk-form.js)
export function findCatalogRisk(catalog, assetId, threat, vulnerability) {
  return catalog.risks.find(r =>
    r.threat === threat && r.vulnerability === vulnerability &&
    (assetId ? r.asset_id === assetId : true)) ?? null;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test test/risk-engine.test.js`
Expected: PASS (all tests in the file, including the 3 new ones).

- [ ] **Step 5: Commit**

```bash
git add core/risk-engine.js test/risk-engine.test.js
git commit -m "feat(risk-engine): tolerate unassessed risks + findCatalogRisk lookup"
```

---

## Task 2: `core/docx/docx-writer.js` — guard `buildRisksDocx` for unassessed risks

**Files:**
- Modify: `core/docx/docx-writer.js` (`buildRisksDocx`, ~line 223-234)
- Test: `test/docx-writer.test.js`

**Interfaces:**
- Consumes: nothing new (no signature change to `buildRisksDocx({ state, annotatedRisks, assets })`).
- Produces: same DOCX buffer, but cells for `impact`/`likelihood`/`level` render `—` / `Не оцінено` instead of the literal string `"undefined"` when those fields are absent.

**Why:** `cell(String(r.impact), ...)` turns a genuinely-missing `impact` into the literal text `"undefined"` in the exported document; `cell(r.level, ...)` is already safe (`cell()` does `String(text || '')`), but the impact/likelihood interpolations are not.

- [ ] **Step 1: Write the failing test**

Append to `test/docx-writer.test.js`:

```js
test('buildRisksDocx — ризик без оцінки показує «—»/«Не оцінено», не «undefined»', () => {
  const buf = buildRisksDocx({ state: input.state, assets: input.assets,
    annotatedRisks: [{ id: 'C-001', asset_id: 'A-01', threat: 'Власна загроза', vulnerability: 'Власна вразливість',
      impact: undefined, likelihood: undefined, likelihood_label: '', level: null,
      treatment_strategy: '', treatment_plan: '', responsible: '', residual_risk: '' }] });
  const dir = mkdtempSync(join(tmpdir(), 'riskstest2-'));
  const file = join(dir, 'r2.docx');
  writeFileSync(file, buf);
  const xml = execFileSync('unzip', ['-p', file, 'word/document.xml'], { encoding: 'utf8' });
  assert.doesNotMatch(xml, /undefined/);
  assert.match(xml, /Не оцінено/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/docx-writer.test.js`
Expected: FAIL — `assert.doesNotMatch` fails because the document contains the literal text `undefined`.

- [ ] **Step 3: Implement**

In `core/docx/docx-writer.js`, in `buildRisksDocx`, replace:

```js
    ...annotatedRisks.map(r => row([
      cell(r.id), cell(assetName(r.asset_id)), cell(r.threat), cell(r.vulnerability),
      cell(String(r.impact), { align: 'center' }), cell(`${r.likelihood_label} / ${r.likelihood}`),
      cell(r.level, { align: 'center' }), cell(r.treatment_strategy), cell(r.treatment_plan),
      cell(r.responsible), cell(r.residual_risk ?? ''),
    ])),
```

with:

```js
    ...annotatedRisks.map(r => row([
      cell(r.id), cell(assetName(r.asset_id)), cell(r.threat), cell(r.vulnerability),
      cell(r.impact != null ? String(r.impact) : '—', { align: 'center' }),
      cell(r.likelihood != null ? `${r.likelihood_label} / ${r.likelihood}` : '—'),
      cell(r.level ?? 'Не оцінено', { align: 'center' }), cell(r.treatment_strategy), cell(r.treatment_plan),
      cell(r.responsible), cell(r.residual_risk ?? ''),
    ])),
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/docx-writer.test.js`
Expected: PASS (all tests in the file, including the new one).

- [ ] **Step 5: Commit**

```bash
git add core/docx/docx-writer.js test/docx-writer.test.js
git commit -m "fix(docx): render unassessed risk fields as em-dash, not the literal 'undefined'"
```

---

## Task 3: `public/js/risk-form.js` — shared "Додати ризик" modal (catalog + manual modes)

**Files:**
- Create: `public/js/risk-form.js`

**Interfaces:**
- Consumes: `el`, `option`, `showModal` from `./render/dom.js`; `getState`, `setState` from `./state.js`; `catalogs` from `./app.js`; `threatDirectory`, `buildCustomRisk`, `computeRiskScore`, `riskLevel`, `findCatalogRisk` from `/core/risk-engine.js`.
- Produces: `openRiskFormModal({ presetAssetId, onSaved } = {})` — opens the modal; `presetAssetId` (optional string) pre-selects that asset in both modes; `onSaved` (optional function) is called after a risk is successfully added (before that, the modal is already closed). No return value.

This task has no automated test (it's DOM-manipulating UI with no jsdom in this project, consistent with every other `step*.js` file) — it's verified manually together with Tasks 4 and 5 in Task 6.

- [ ] **Step 1: Create the file**

```js
import { el, option, showModal } from './render/dom.js';
import { getState, setState } from './state.js';
import { catalogs } from './app.js';
import { threatDirectory, buildCustomRisk, computeRiskScore, riskLevel, findCatalogRisk } from '/core/risk-engine.js';

const assetName = (id) => catalogs.assets.find(a => a.id === id)?.name ?? id;

// Спільний модал додавання ризику — викликається і з Кроку 2 (для конкретного активу),
// і з Кроку 3 (без прив'язки до активу). Два режими: "З переліку" (вибір із каталогу,
// повне автозаповнення полів) і "Власна загроза" (вільний текст, без оцінки — користувач
// довизначає вплив/ймовірність пізніше через модал редагування на Кроці 3).
export function openRiskFormModal({ presetAssetId, onSaved } = {}) {
  const state = getState();
  const scale = catalogs.threatsRisks.scale;
  const assetIds = state.selected_assets;

  // --- Режим 1: "З переліку" ---
  const assetSel = el('select', {}, ...assetIds.map(id => option(id, assetName(id), id === presetAssetId)));
  const allThreatsChk = el('input', { type: 'checkbox' });
  const threatSel = el('select', {});
  let dir = [];
  const refreshThreats = () => {
    dir = threatDirectory(catalogs.threatsRisks, allThreatsChk.checked ? null : assetSel.value);
    threatSel.replaceChildren(...dir.map((t, i) => option(String(i), `${t.threat} / ${t.vulnerability}`)));
  };
  assetSel.addEventListener('change', refreshThreats);
  allThreatsChk.addEventListener('change', refreshThreats);
  refreshThreats();
  const likSel = el('select', {}, ...scale.likelihood_options.map(o => option(String(o.value), `${o.label} / ${o.value}`)));
  const impSel = el('select', {}, ...scale.impact_options.map(o => option(String(o.value), `${o.value} (${o.label})`)));
  const preview = el('span', { class: 'badge' }, '—');
  const updatePreview = () => {
    const score = computeRiskScore(Number(impSel.value), Number(likSel.value));
    preview.textContent = `${riskLevel(score, scale)} (${score})`;
  };
  likSel.addEventListener('change', updatePreview);
  impSel.addEventListener('change', updatePreview);
  updatePreview();

  const addFromCatalogBtn = el('button', { type: 'button', class: 'primary', onclick: () => {
    const t = dir[Number(threatSel.value)];
    if (!t) return;
    const existing = [...getState().risks.custom.map(r => r.id)];
    const matched = findCatalogRisk(catalogs.threatsRisks, assetSel.value, t.threat, t.vulnerability)
      ?? findCatalogRisk(catalogs.threatsRisks, null, t.threat, t.vulnerability);
    const likelihood = Number(likSel.value);
    const risk = buildCustomRisk({
      asset_id: assetSel.value, threat: t.threat, vulnerability: t.vulnerability,
      impact: Number(impSel.value), likelihood,
      likelihood_label: scale.likelihood_options.find(o => o.value === likelihood).label,
      treatment_strategy: matched?.treatment_strategy, treatment_plan: matched?.treatment_plan,
      responsible: matched?.responsible, residual_risk: matched?.residual_risk,
      control_refs: matched?.control_refs ?? [], enhancement_suggestions: matched?.enhancement_suggestions ?? [],
    }, existing, scale);
    setState(s => ({ ...s, risks: { ...s.risks, custom: [...s.risks.custom, risk] } }));
    modal.close();
    onSaved?.();
  } }, 'Додати до переліку');

  const catalogBody = el('div', { class: 'field-grid' },
    el('label', {}, 'Актив: ', assetSel), el('label', {}, 'Загроза: ', threatSel),
    el('label', { class: 'checkbox' }, allThreatsChk, 'усі загрози'),
    el('label', {}, 'Ймовірність: ', likSel), el('label', {}, 'Вплив: ', impSel),
    el('label', {}, 'Рівень: ', preview),
    el('div', { class: 'actions' }, addFromCatalogBtn,
      el('button', { type: 'button', onclick: () => modal.close() }, 'Скасувати')));

  // --- Режим 2: "Власна загроза" (немає в довіднику) ---
  const manualAssetSel = el('select', {}, ...assetIds.map(id => option(id, assetName(id), id === presetAssetId)));
  const manualThreatInput = el('input', { type: 'text', placeholder: 'опишіть загрозу…' });
  const manualVulnInput = el('input', { type: 'text', placeholder: 'опишіть вразливість…' });
  const addManualBtn = el('button', { type: 'button', class: 'primary', onclick: () => {
    if (!manualThreatInput.value.trim()) { alert('Вкажіть загрозу'); return; }
    const existing = [...getState().risks.custom.map(r => r.id)];
    const risk = buildCustomRisk({
      asset_id: manualAssetSel.value, threat: manualThreatInput.value.trim(),
      vulnerability: manualVulnInput.value.trim(), likelihood_label: '',
    }, existing, scale);
    setState(s => ({ ...s, risks: { ...s.risks, custom: [...s.risks.custom, risk] } }));
    modal.close();
    onSaved?.();
  } }, 'Додати без оцінки');

  const manualBody = el('div', { class: 'field-grid', hidden: '' },
    el('label', {}, 'Актив: ', manualAssetSel),
    el('label', {}, 'Загроза: ', manualThreatInput),
    el('label', {}, 'Вразливість: ', manualVulnInput),
    el('p', { class: 'hint' }, 'Вплив і ймовірність можна буде задати пізніше, редагуючи цей ризик на Кроці 3.'),
    el('div', { class: 'actions' }, addManualBtn,
      el('button', { type: 'button', onclick: () => modal.close() }, 'Скасувати')));

  const tabCatalog = el('button', { type: 'button', class: 'active', onclick: () => {
    tabCatalog.classList.add('active'); tabManual.classList.remove('active');
    catalogBody.hidden = false; manualBody.hidden = true;
  } }, 'З переліку');
  const tabManual = el('button', { type: 'button', onclick: () => {
    tabManual.classList.add('active'); tabCatalog.classList.remove('active');
    manualBody.hidden = false; catalogBody.hidden = true;
  } }, 'Власна загроза');

  const modal = showModal(el('div', {},
    el('div', { class: 'mode-switch' }, tabCatalog, tabManual),
    catalogBody, manualBody),
    { title: 'Додати ризик' });
}
```

- [ ] **Step 2: Verify the file has no syntax errors**

Run: `node --check public/js/risk-form.js`
Expected: no output (exit code 0).

- [ ] **Step 3: Commit**

```bash
git add public/js/risk-form.js
git commit -m "feat(risks): extract shared Додати-ризик modal with catalog auto-fill + manual mode"
```

---

## Task 4: `step3-base-risks.js` — use the shared modal, respect Крок-2 inclusion, show unassessed risks

**Files:**
- Modify: `public/js/steps/step3-base-risks.js`

**Interfaces:**
- Consumes: `openRiskFormModal({ onSaved })` from `../risk-form.js` (Task 3).
- Produces: no exported changes — `step` object shape (`id`, `title`, `validate`, `render`) unchanged.

- [ ] **Step 1: Update imports**

Replace the top of the file:

```js
import { el, option, showModal } from '../render/dom.js';
import { getState, setState } from '../state.js';
import { catalogs } from '../app.js';
import { baseRisksFor, threatDirectory, buildCustomRisk, computeRiskScore, riskLevel, applyBaseOverride, annotateRisk } from '/core/risk-engine.js';
```

with:

```js
import { el, option, showModal } from '../render/dom.js';
import { getState, setState } from '../state.js';
import { catalogs } from '../app.js';
import { baseRisksFor, applyBaseOverride, annotateRisk } from '/core/risk-engine.js';
import { openRiskFormModal } from '../risk-form.js';
```

- [ ] **Step 2: Make Крок 3 show only Крок-2-included base risks**

Replace:

```js
    const hidden = new Set(state.risks.hidden_base ?? []);
    const baseRisks = baseRisksFor(catalogs.threatsRisks, state.selected_assets, state.passport.as_class)
      .filter(r => !hidden.has(r.id));
    // Чекбокс "прийняти" прибрано з UI — видалення ризику (кнопка "Видалити") тепер єдиний спосіб
    // виключити базовий ризик, тож усі видимі базові ризики вважаються прийнятими автоматично
    const baseRiskIds = baseRisks.map(r => r.id);
    if (state.risks.accepted_base.length !== baseRiskIds.length || baseRiskIds.some(id => !state.risks.accepted_base.includes(id))) {
      setState(s => ({ ...s, risks: { ...s.risks, accepted_base: baseRiskIds } }));
    }
    const overrides = getState().risks.base_overrides ?? {};
```

with:

```js
    const hidden = new Set(state.risks.hidden_base ?? []);
    const accepted = new Set(state.risks.accepted_base);
    // Позначку "включити в роботу" тепер робить користувач на Кроці 2 (чекбокси в
    // панелі перегляду ризиків активу) — тут просто показуємо те, що вже позначено.
    const baseRisks = baseRisksFor(catalogs.threatsRisks, state.selected_assets, state.passport.as_class)
      .filter(r => !hidden.has(r.id) && accepted.has(r.id));
    const overrides = getState().risks.base_overrides ?? {};
```

- [ ] **Step 3: Replace the local "Додати ризик" modal with the shared one**

Delete the entire `openAddRiskModal` function and its trailing `addRiskBtn` line —
replace this exact block:

```js
    // Конструктор нового (кастомного) ризику — відкривається в модальному вікні,
    // додана карта потрапляє в той самий перелік нижче
    const openAddRiskModal = () => {
      const assetSel = el('select', {}, ...state.selected_assets.map(id => option(id, assetName(id))));
      const allThreatsChk = el('input', { type: 'checkbox' });
      const threatSel = el('select', {});
      let dir = [];
      const refreshThreats = () => {
        dir = threatDirectory(catalogs.threatsRisks, allThreatsChk.checked ? null : assetSel.value);
        threatSel.replaceChildren(...dir.map((t, i) => option(String(i), `${t.threat} / ${t.vulnerability}`)));
      };
      assetSel.addEventListener('change', refreshThreats);
      allThreatsChk.addEventListener('change', refreshThreats);
      refreshThreats();
      const likSel = el('select', {}, ...scale.likelihood_options.map(o => option(String(o.value), `${o.label} / ${o.value}`)));
      const impSel = el('select', {}, ...scale.impact_options.map(o => option(String(o.value), `${o.value} (${o.label})`)));
      const preview = el('span', { class: 'badge' }, '—');
      const updatePreview = () => {
        const score = computeRiskScore(Number(impSel.value), Number(likSel.value));
        preview.textContent = `${riskLevel(score, scale)} (${score})`;
      };
      likSel.addEventListener('change', updatePreview);
      impSel.addEventListener('change', updatePreview);
      updatePreview();
      const addBtn = el('button', { type: 'button', class: 'primary', onclick: () => {
        const t = dir[Number(threatSel.value)];
        if (!t) return;
        const existing = [...getState().risks.custom.map(r => r.id)];
        const risk = buildCustomRisk({ asset_id: assetSel.value, threat: t.threat, vulnerability: t.vulnerability,
          impact: Number(impSel.value), likelihood: Number(likSel.value),
          likelihood_label: scale.likelihood_options.find(o => o.value === Number(likSel.value)).label }, existing, scale);
        setState(s => ({ ...s, risks: { ...s.risks, custom: [...s.risks.custom, risk] } }));
        modal.close();
        rerender();
      } }, 'Додати до переліку');
      const modal = showModal(el('div', { class: 'field-grid' },
        el('label', {}, 'Актив: ', assetSel), el('label', {}, 'Загроза: ', threatSel),
        el('label', { class: 'checkbox' }, allThreatsChk, 'усі загрози'),
        el('label', {}, 'Ймовірність: ', likSel), el('label', {}, 'Вплив: ', impSel),
        el('label', {}, 'Рівень: ', preview),
        el('div', { class: 'actions' }, addBtn,
          el('button', { type: 'button', onclick: () => modal.close() }, 'Скасувати'))),
        { title: 'Додати ризик' });
    };
    const addRiskBtn = el('button', { type: 'button', onclick: openAddRiskModal }, '+ Додати ризик');
```

with:

```js
    const addRiskBtn = el('button', { type: 'button', onclick: () => openRiskFormModal({ onSaved: rerender }) }, '+ Додати ризик');
```

- [ ] **Step 4: Show "Не оцінено" for custom risks without a level**

Replace, in the `customRows` mapping:

```js
      el('td', {}, r.id), el('td', {}, assetName(r.asset_id)),
      el('td', {}, el('span', { title: r.vulnerability }, r.threat)),
      el('td', {}, r.vulnerability), el('td', {}, String(r.impact)),
      el('td', {}, `${r.likelihood_label} / ${r.likelihood}`),
      el('td', {}, el('span', { class: `badge lvl-${r.level.replace(/ /g, '-')}` }, r.level)),
```

with:

```js
      el('td', {}, r.id), el('td', {}, assetName(r.asset_id)),
      el('td', {}, el('span', { title: r.vulnerability }, r.threat)),
      el('td', {}, r.vulnerability), el('td', {}, r.impact != null ? String(r.impact) : '—'),
      el('td', {}, r.likelihood != null ? `${r.likelihood_label} / ${r.likelihood}` : '—'),
      el('td', {}, r.level
        ? el('span', { class: `badge lvl-${r.level.replace(/ /g, '-')}` }, r.level)
        : el('span', { class: 'badge' }, 'Не оцінено')),
```

- [ ] **Step 5: Verify no syntax errors and no stray references**

Run: `node --check public/js/steps/step3-base-risks.js`
Expected: no output (exit code 0).

Run: `grep -n "openAddRiskModal\|threatDirectory\|buildCustomRisk\|computeRiskScore\|riskLevel" public/js/steps/step3-base-risks.js`
Expected: no matches (everything moved to `risk-form.js`).

- [ ] **Step 6: Run the full test suite**

Run: `npm test`
Expected: same pass/fail count as before this task (157 pass / 2 known pre-existing fails / 159 total) — this task touches no file with automated tests.

- [ ] **Step 7: Commit**

```bash
git add public/js/steps/step3-base-risks.js
git commit -m "refactor(risks): Крок 3 shows Крок-2-selected base risks, uses shared add-risk modal"
```

---

## Task 5: `step2-assets.js` — risk preview panel per selected asset

**Files:**
- Modify: `public/js/steps/step2-assets.js`

**Interfaces:**
- Consumes: `baseRisksFor(catalog, selectedAssetIds, asClass)` from `/core/risk-engine.js`; `openRiskFormModal({ presetAssetId, onSaved })` from `../risk-form.js` (Task 3).
- Produces: no exported changes — `step` object shape unchanged. `state.risks.accepted_base` gains entries whenever an asset is newly checked (see Step 2 below); Крок 3 (Task 4) reads this array.

- [ ] **Step 1: Replace the whole file**

```js
import { el, option } from '../render/dom.js';
import { getState, setState } from '../state.js';
import { catalogs } from '../app.js';
import { filterAssetsByClass, groupByCategory } from '/core/asset-catalog.js';
import { baseRisksFor } from '/core/risk-engine.js';
import { openRiskFormModal } from '../risk-form.js';

const assetName = (id) => catalogs.assets.find(a => a.id === id)?.name ?? id;

export const step = {
  id: 'assets', title: 'Активи',
  validate(state) { return state.selected_assets.length ? [] : ['Оберіть щонайменше один актив']; },
  render(container) {
    const state = getState();
    const rerender = () => { container.replaceChildren(); step.render(container); };
    const visible = filterAssetsByClass(catalogs.assets, state.passport.as_class);
    const groups = groupByCategory(visible);
    const hidden = new Set(state.risks.hidden_base ?? []);
    const risksForAsset = (assetId, asClass) =>
      baseRisksFor(catalogs.threatsRisks, [assetId], asClass).filter(r => !hidden.has(r.id));

    // При першому виборі активу його (ще не приховані) базові ризики за замовчуванням
    // включаються в роботу на Кроці 3 (accepted_base) — далі користувач сам знімає
    // чекбокси на непотрібних. При знятті активу accepted_base не чіпаємо: ризики
    // просто перестають з'являтись (бо їх активу немає серед selected_assets), а
    // попередній вибір користувача відновлюється, якщо актив обрати знову.
    const toggleAsset = (assetId, checked) => setState(s => {
      if (!checked) return { ...s, selected_assets: s.selected_assets.filter(x => x !== assetId) };
      const toAdd = risksForAsset(assetId, s.passport.as_class)
        .map(r => r.id).filter(id => !s.risks.accepted_base.includes(id));
      return { ...s, selected_assets: [...s.selected_assets, assetId],
        risks: { ...s.risks, accepted_base: [...s.risks.accepted_base, ...toAdd] } };
    });

    const sections = [...groups.entries()].map(([category, assets]) =>
      el('fieldset', {}, el('legend', {}, category),
        ...assets.map(a => el('label', { class: 'checkbox' },
          el('input', { type: 'checkbox', value: a.id,
            ...(state.selected_assets.includes(a.id) ? { checked: '' } : {}),
            onchange: (e) => { toggleAsset(a.id, e.target.checked); rerender(); } }),
          `${a.id}. ${a.name}`))));

    const riskPanel = state.selected_assets.length
      ? el('div', { class: 'risk-preview' },
          el('h3', {}, `Ризики обраних активів (${state.selected_assets.reduce((n, id) =>
            n + risksForAsset(id, state.passport.as_class).length, 0)})`),
          ...state.selected_assets.map(assetId => {
            const risks = risksForAsset(assetId, state.passport.as_class);
            return el('fieldset', {}, el('legend', {}, assetName(assetId)),
              risks.length
                ? el('div', {}, ...risks.map(r => el('label', { class: 'checkbox' },
                    el('input', { type: 'checkbox',
                      ...(state.risks.accepted_base.includes(r.id) ? { checked: '' } : {}),
                      onchange: (e) => setState(s => ({ ...s, risks: { ...s.risks,
                        accepted_base: e.target.checked
                          ? [...s.risks.accepted_base, r.id]
                          : s.risks.accepted_base.filter(x => x !== r.id) } })) }),
                    `${r.threat} — ${r.vulnerability}`,
                    el('span', { class: `badge lvl-${r.level.replace(/ /g, '-')}` }, r.level))))
                : el('p', { class: 'hint' }, 'Немає готових загроз у довіднику для цього активу.'),
              el('button', { type: 'button',
                onclick: () => openRiskFormModal({ presetAssetId: assetId, onSaved: rerender }) },
                '+ Додати свій ризик до цього активу'));
          }))
      : null;

    container.replaceChildren(
      el('section', {},
        el('h2', {}, `Крок 2. Вибір активів (доступно для АС-${state.passport.as_class}: ${visible.length} із ${catalogs.assets.length})`),
        ...sections,
        riskPanel));
  },
};
```

- [ ] **Step 2: Verify no syntax errors**

Run: `node --check public/js/steps/step2-assets.js`
Expected: no output (exit code 0).

- [ ] **Step 3: Run the full test suite**

Run: `npm test`
Expected: same pass/fail count as before this task — no automated test covers this file.

- [ ] **Step 4: Commit**

```bash
git add public/js/steps/step2-assets.js
git commit -m "feat(assets): show per-asset risk preview on Крок 2 with inclusion checkboxes"
```

---

## Task 6: CSS polish + end-to-end manual verification

**Files:**
- Modify: `public/css/app.css`

- [ ] **Step 1: Add minimal styling for the new panel**

Add after the existing `.constructor label { … }` rule (near the other risk-related rules):

```css
.risk-preview { margin-top: var(--space-4); }
.risk-preview .checkbox { justify-content: space-between; width: 100%; }
```

(`.checkbox` and `fieldset .checkbox` overrides already exist and give bordered-pill vs.
plain-row styling depending on context — this just makes each risk row's level badge
align to the right edge instead of hugging the text.)

- [ ] **Step 2: Run the full automated test suite**

Run: `npm test`
Expected: `# tests 163`, `# pass 161`, `# fail 2` (the same 2 known pre-existing failures; 159 baseline + 3 new tests from Task 1 + 1 new test from Task 2 = 163).

- [ ] **Step 3: Manual verification in the browser**

Start the server: `npm start` (or use the already-running dev server).

1. Крок 1: fill `Назва ІКС`, `Орган сертифікації`, pick "Клас ІКС" = АС-1, pick "Тип інформації" = Відкрита/Конфіденційна.
2. Крок 2: check asset **A-01 Автоматизовані робочі місця**. Confirm a "Ризики обраних активів" panel appears below the categories, with a fieldset for A-01 listing its catalog risks (threat — vulnerability, level badge), all pre-checked.
3. Uncheck one risk under A-01 (e.g., R-005). Go to Крок 3. Confirm that risk is **absent** from the table, and all other A-01 risks are present.
4. Go back to Крок 2. Click "+ Додати свій ризик до цього активу" under A-01. In the "З переліку" tab, pick any threat, choose impact/likelihood, click "Додати до переліку". Go to Крок 3 — confirm the new custom risk row shows a real level badge (not "Не оцінено") and, via its ✎ edit button, that `Стратегія`/`Заходи обробки`/`Відповідальний`/`Залишковий` are pre-filled (not empty) — evidence the catalog auto-fill worked.
5. Repeat step 4 but switch to the "Власна загроза" tab, type a new threat/vulnerability, click "Додати без оцінки". On Крок 3, confirm the row shows a **"Не оцінено"** badge and `—` for Вплив/Ймовірність. Open its ✎ edit modal, pick impact + likelihood, save — confirm the badge now shows a real level.
6. Крок 4: confirm the page still renders without errors (risk-chips for the auto-filled custom risk should appear on its `control_refs`' controls; the still-unassessed one won't have any, which is expected since it has no `control_refs`).
7. Uncheck asset A-01 entirely on Крок 2, then re-check it — confirm the risk-preview panel restores the same checked/unchecked state you left it in (not reset back to all-checked).

- [ ] **Step 4: Clean up any test artifacts created during manual verification**

Run: `git status --porcelain templates/ assessments/`
Expected: empty (no new files). If the manual walkthrough went all the way to approving a profile, delete the resulting `templates/{ics,cpb,approved}/<name>.json` test files before committing.

- [ ] **Step 5: Commit**

```bash
git add public/css/app.css
git commit -m "style(assets): align risk-preview badges to the row edge"
```
