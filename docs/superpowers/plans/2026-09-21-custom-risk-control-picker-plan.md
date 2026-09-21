# Заходи захисту для ризиків: вибір з НД ТЗІ + відображення в ЦПБ — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users pick ND ТЗІ base controls (`control_refs`) for any risk (base or custom) via a shared `controlPicker` UI component, and surface any picked control that is NOT already mandated by the BPB directly in the ЦПБ (Крок 4 screen + DOCX export), distributed under its own family/class.

**Architecture:** One new shared UI component (`controlPicker`) plus a lightweight modal (`openControlsOnlyModal`), both in `public/js/risk-form.js`, reused from three call sites (Крок 2 panel, Крок 3 base-risk edit modal, Крок 3 custom-risk edit modal). `core/profile-engine.js`'s `buildProfile()` gains a new `additional_controls` array computed from `acceptedRisksFor()` (all accepted risks, base+custom) minus whatever is already mandated by the BPB. `core/docx/docx-writer.js` and `public/js/steps/step6-verify.js` both render `additional_controls` distributed by family, appended after existing rows for a matching class, or as a new mini-class-card for families with zero BPB coverage.

**Tech Stack:** Node.js ≥18 ESM, zero npm runtime dependencies, `node:test` for `core/*.js`, vanilla DOM builder (`el`/`option`/`showModal` from `public/js/render/dom.js`) for `public/js/**` (no automated tests exist for `public/js/**` in this codebase — verified manually in the browser).

## Global Constraints

- Zero npm runtime dependencies — do not add any.
- ESM modules throughout (`import`/`export`), matching existing files exactly.
- `core/*.js` changes require `node:test` coverage in the matching `test/*.test.js` file; `public/js/**` changes are verified manually in the browser (no test harness exists for these files — do not invent one).
- All new UI text is in Ukrainian, matching the existing tone/style of surrounding strings.
- `control_refs` values are always BASE control ids (e.g. `"SC-28"`, never `"SC-28(1)"`) — no enhancement picking in this round.
- Previously accepted decision "Реєстр ризиків окремо, не в ЦПБ" stays true for normal (BPB-mandated) items — `additional_controls` only ever contains controls NOT already mandated by BPB.
- Must not regress the existing `npm test` baseline: all currently-passing tests must keep passing (2 pre-existing unrelated failures — `RESULT_LABELS: Ukrainian labels` in `assessment-table.test.js` and the PS-01 placeholder-leak test in `dictionary-integrity.test.js` — are expected and must NOT be touched).
- Commit messages containing embedded quote characters must be written via a temp file + `git commit -F` (never inline `-m "..."` with embedded quotes).

---

## File Structure

- **Modify** `public/js/risk-form.js` — add `controlPicker()` (shared picker widget), wire it into the existing "Власна загроза" manual-entry tab, add new `openControlsOnlyModal()` export (Крок 2's lightweight controls-only modal).
- **Modify** `core/profile-engine.js` — `buildProfile()` gains `additional_controls` in its return value.
- **Modify** `core/docx/docx-writer.js` — `buildDocx()` renders `additional_controls` rows distributed by family inside the existing profile table.
- **Modify** `public/js/steps/step3-base-risks.js` — new "Заходи захисту" table column (base + custom rows); `controlPicker` wired into both edit modals; `setBaseOverride` exported for reuse by Крок 2.
- **Modify** `public/js/steps/step2-assets.js` — each risk row in the per-asset panel gets a "Заходи: …" chip/button that opens `openControlsOnlyModal`.
- **Modify** `public/js/steps/step6-verify.js` — Крок 4 class-cards render `additional_controls` distributed by family (existing card gets an extra block; families with zero BPB coverage get a new mini-card).
- **Modify** `public/css/app.css` — styles for the picker, chips, and the new "Додатково, з реєстру ризиків" table rows.
- **Modify** `test/profile-engine.test.js` — new tests for `additional_controls`.
- **Modify** `test/docx-writer.test.js` — new tests for the DOCX rendering of `additional_controls`.

---

### Task 1: `controlPicker` shared component + wiring into manual risk entry + `openControlsOnlyModal`

**Files:**
- Modify: `public/js/risk-form.js`

**Interfaces:**
- Produces: `export function controlPicker(ndTzi, initialIds = [])` → `{ el: HTMLElement, getSelected(): string[] }`. `el` is a self-contained widget (search input + scrollable checkbox list + chips row of currently-selected ids, each chip has a ✕ remove button). `getSelected()` returns the current array of selected control ids, in order of selection.
- Produces: `export function openControlsOnlyModal(risk, { onSaved } = {})` → opens a modal containing ONLY a `controlPicker` (initialized from `getState().risks.base_overrides?.[risk.id]?.control_refs ?? risk.control_refs ?? []`) + Зберегти/Скасувати. Save merges into the existing override (does not replace other override fields) via `setState`, then calls `onSaved?.()`.
- Consumes: `catalogs.ndTzi` (already imported in this file via `catalogs` from `../app.js`... actually this file imports `catalogs` from `./app.js` — confirm import path below), `getState`/`setState` from `./state.js`, `el`/`option`/`showModal` from `./render/dom.js` (all already imported in this file).

- [ ] **Step 1: Add `controlPicker` at the end of `public/js/risk-form.js`**

```js
// Спільний UI-компонент вибору базових заходів захисту (без посилень) з НД ТЗІ —
// використовується і в модалі додавання ризику (нижче), і в Кроці 2/3 для редагування
// control_refs існуючого ризику (базового чи кастомного).
export function controlPicker(ndTzi, initialIds = []) {
  const controls = ndTzi.document.security_families
    .flatMap(fam => fam.controls.map(c => ({ id: c.canonical_id, title: c.title })))
    .sort((a, b) => a.id.localeCompare(b.id));
  let selected = [...initialIds];

  const chipsRow = el('div', { class: 'ctrl-chips' });
  const listBox = el('div', { class: 'ctrl-list' });
  const searchInput = el('input', { type: 'text', placeholder: 'пошук за ID або назвою…' });

  const renderChips = () => {
    chipsRow.replaceChildren(...selected.map(id => el('span', { class: 'badge ctrl-chip' }, id,
      el('button', { type: 'button', class: 'chip-remove', onclick: () => toggle(id, false) }, '✕'))));
  };

  const renderList = () => {
    const q = searchInput.value.trim().toLowerCase();
    const filtered = q
      ? controls.filter(c => c.id.toLowerCase().includes(q) || c.title.toLowerCase().includes(q))
      : controls;
    listBox.replaceChildren(...filtered.map(c => el('label', { class: 'checkbox' },
      el('input', { type: 'checkbox', ...(selected.includes(c.id) ? { checked: '' } : {}),
        onchange: (e) => toggle(c.id, e.target.checked) }),
      `${c.id} — ${c.title}`)));
  };

  function toggle(id, checked) {
    selected = checked ? [...selected, id] : selected.filter(x => x !== id);
    renderChips();
    renderList();
  }

  searchInput.addEventListener('input', renderList);
  renderChips();
  renderList();

  const pickerEl = el('div', { class: 'control-picker' }, chipsRow, searchInput, listBox);
  return { el: pickerEl, getSelected: () => [...selected] };
}

// Легкий модал редагування ЛИШЕ заходів захисту базового ризику — викликається з Кроку 2
// (панель перегляду ризиків активу), де повне редагування ризику не потрібне.
export function openControlsOnlyModal(risk, { onSaved } = {}) {
  const override = getState().risks.base_overrides?.[risk.id];
  const initialIds = override?.control_refs ?? risk.control_refs ?? [];
  const picker = controlPicker(catalogs.ndTzi, initialIds);
  const saveBtn = el('button', { type: 'button', class: 'primary', onclick: () => {
    setState(s => ({ ...s, risks: { ...s.risks, base_overrides: {
      ...s.risks.base_overrides,
      [risk.id]: { ...(s.risks.base_overrides[risk.id] ?? {}), control_refs: picker.getSelected() },
    } } }));
    modal.close();
    onSaved?.();
  } }, 'Зберегти');
  const modal = showModal(el('div', {}, picker.el,
    el('div', { class: 'actions' }, saveBtn,
      el('button', { type: 'button', onclick: () => modal.close() }, 'Скасувати'))),
    { title: `Заходи захисту — ${risk.id}` });
}
```

- [ ] **Step 2: Wire `controlPicker` into the "Власна загроза" manual-entry tab**

Replace the manual-mode block (Режим 2) with a version that includes the picker and passes its selection into `control_refs`:

```js
  // --- Режим 2: "Власна загроза" (немає в довіднику) ---
  const manualAssetSel = el('select', {}, ...assetIds.map(id => option(id, assetName(id), id === presetAssetId)));
  const manualThreatInput = el('input', { type: 'text', placeholder: 'опишіть загрозу…' });
  const manualVulnInput = el('input', { type: 'text', placeholder: 'опишіть вразливість…' });
  const manualPicker = controlPicker(catalogs.ndTzi, []);
  const addManualBtn = el('button', { type: 'button', class: 'primary', onclick: () => {
    if (!manualThreatInput.value.trim()) { alert('Вкажіть загрозу'); return; }
    const existing = [...getState().risks.custom.map(r => r.id)];
    const risk = buildCustomRisk({
      asset_id: manualAssetSel.value, threat: manualThreatInput.value.trim(),
      vulnerability: manualVulnInput.value.trim(), likelihood_label: '',
      control_refs: manualPicker.getSelected(),
    }, existing, scale);
    setState(s => ({ ...s, risks: { ...s.risks, custom: [...s.risks.custom, risk] } }));
    modal.close();
    onSaved?.();
  } }, 'Додати без оцінки');

  const manualBody = el('div', { class: 'field-grid', hidden: '' },
    el('label', {}, 'Актив: ', manualAssetSel),
    el('label', {}, 'Загроза: ', manualThreatInput),
    el('label', {}, 'Вразливість: ', manualVulnInput),
    el('label', {}, 'Заходи захисту (НД ТЗІ): ', manualPicker.el),
    el('p', { class: 'hint' }, 'Вплив і ймовірність можна буде задати пізніше, редагуючи цей ризик на Кроці 3.'),
    el('div', { class: 'actions' }, addManualBtn,
      el('button', { type: 'button', onclick: () => modal.close() }, 'Скасувати')));
```

This is the ONLY change inside `openRiskFormModal` — the "З переліку" (catalog) tab is untouched (it already auto-fills `control_refs` from the matched catalog entry).

- [ ] **Step 3: Manual verification (no automated test exists for this file)**

Run: `npm start` (or however the dev server is started — check `package.json` scripts), open the app in the browser, go to Крок 2, click "+ Додати свій ризик до цього активу", switch to "Власна загроза" tab.
Expected: a "Заходи захисту (НД ТЗІ):" field appears with a search box and scrollable checkbox list; typing filters the list; checking an item adds a chip above; clicking a chip's ✕ removes it; saving the risk and then opening its edit modal later (Task 4) should show the same `control_refs`.

- [ ] **Step 4: Commit**

```bash
git add public/js/risk-form.js
git commit -m "feat: add shared controlPicker + openControlsOnlyModal, wire into manual risk entry"
```

---

### Task 2: `core/profile-engine.js` — compute `additional_controls`

**Files:**
- Modify: `core/profile-engine.js`
- Test: `test/profile-engine.test.js`

**Interfaces:**
- Consumes: `acceptedRisksFor(catalog, selectedAssetIds, asClass, risksState)` from `./risk-engine.js` (existing, unchanged signature).
- Produces: `buildProfile(state, catalogs)` now returns `{ items, summary, additional_controls }` where each entry of `additional_controls` is `{ id, family, familyName, title, statementLines, risk_ids }` (`id` = base control canonical id, `family` = `nd_tzi.json` family id e.g. `"AC"`, `familyName` = family's display title, `risk_ids` = sorted array of contributing risk ids). If `catalogs.threatsRisks`, `state.risks`, or `state.selected_assets` are missing (backward compatibility with call sites/tests that don't pass them), `additional_controls` is `[]`.

- [ ] **Step 1: Write the failing tests**

Append to `test/profile-engine.test.js` (after the last existing test, using the same `catalogs`/`baseState`/`read` helpers already defined at the top of the file):

```js
const threatsRisks = read('threats_risks.json');
const emptyRisksState = { accepted_base: [], base_overrides: {}, hidden_base: [], defaulted_assets: [], custom: [] };

test('additional_controls: порожній, якщо risks/threatsRisks не передано (зворотна сумісність)', () => {
  const doc = buildProfile(baseState, catalogs);
  assert.deepEqual(doc.additional_controls, []);
});

test('additional_controls: кастомний ризик з control_ref поза БПБ зʼявляється окремо', () => {
  const state = { ...baseState, selected_assets: ['A-01'],
    risks: { ...emptyRisksState, custom: [{ id: 'C-001', custom: true, asset_id: 'A-01',
      threat: 'Т', vulnerability: 'В', impact: 3, likelihood: 0.5, control_refs: ['AC-9'] }] } };
  const doc = buildProfile(state, { ...catalogs, threatsRisks });
  assert.equal(doc.additional_controls.length, 1);
  assert.equal(doc.additional_controls[0].id, 'AC-9');
  assert.equal(doc.additional_controls[0].family, 'AC');
  assert.deepEqual(doc.additional_controls[0].risk_ids, ['C-001']);
});

test('additional_controls: control_ref, що вже мандований БПБ, не дублюється', () => {
  const state = { ...baseState, selected_assets: ['A-01'],
    risks: { ...emptyRisksState, custom: [{ id: 'C-001', custom: true, asset_id: 'A-01',
      threat: 'Т', vulnerability: 'В', impact: 3, likelihood: 0.5, control_refs: ['AC-2'] }] } };
  const doc = buildProfile(state, { ...catalogs, threatsRisks });
  assert.equal(doc.additional_controls.length, 0);
});

test('additional_controls: override базового ризику з control_ref поза БПБ зʼявляється окремо', () => {
  const r0 = threatsRisks.risks.find(r => r.asset_id === 'A-01');
  const state = { ...baseState, selected_assets: ['A-01'],
    risks: { ...emptyRisksState, accepted_base: [r0.id], base_overrides: { [r0.id]: { control_refs: ['AC-9'] } } } };
  const doc = buildProfile(state, { ...catalogs, threatsRisks });
  assert.equal(doc.additional_controls.length, 1);
  assert.equal(doc.additional_controls[0].id, 'AC-9');
  assert.deepEqual(doc.additional_controls[0].risk_ids, [r0.id]);
});

test('additional_controls: два ризики з однаковим позабпбшним control_ref обʼєднуються в один запис', () => {
  const r0 = threatsRisks.risks.find(r => r.asset_id === 'A-01');
  const state = { ...baseState, selected_assets: ['A-01'],
    risks: { ...emptyRisksState, accepted_base: [r0.id], base_overrides: { [r0.id]: { control_refs: ['AC-9'] } },
      custom: [{ id: 'C-001', custom: true, asset_id: 'A-01', threat: 'Т', vulnerability: 'В',
        impact: 3, likelihood: 0.5, control_refs: ['AC-9'] }] } };
  const doc = buildProfile(state, { ...catalogs, threatsRisks });
  assert.equal(doc.additional_controls.length, 1);
  assert.deepEqual(doc.additional_controls[0].risk_ids.sort(), [r0.id, 'C-001'].sort());
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test test/profile-engine.test.js`
Expected: FAIL — `doc.additional_controls` is `undefined` (property doesn't exist yet).

- [ ] **Step 3: Implement `additional_controls` in `core/profile-engine.js`**

Add the import at the top of the file:

```js
import { buildPolicyParamIndex, resolveParamValue, renderText, PARAM_RE } from './policy-autofill.js';
import { dynamicPolicyIndex } from './odp-dictionary.js';
import { acceptedRisksFor } from './risk-engine.js';
```

Replace the tail of `buildProfile` (from the `const summary = {` line to the final `return { items, summary };`) with:

```js
  const summary = {
    total: items.length,
    exempted: items.filter(i => i.status === STATUS.EXEMPT).length,
    excluded: items.filter(i => i.status === STATUS.EXCLUDED).length,
    empty: items.filter(i => i.status === STATUS.APPLIED && i.controls.some(c => c.emptyParams.length)).length,
    autofilled: items.filter(i => i.status === STATUS.APPLIED && i.controls.every(c => c.emptyParams.length === 0)).length,
  };

  // Заходи, обрані для прийнятих ризиків (базових з урахуванням override + кастомних),
  // яких ще немає в мандованому БПБ профілі — Крок 4/DOCX показують їх окремо, розподілено по родинах.
  let additional_controls = [];
  if (catalogs.threatsRisks && state.risks && state.selected_assets) {
    const mandatedControlIds = new Set(items.flatMap(i => i.controls.map(c => c.id)));
    const familyTitle = new Map(catalogs.ndTzi.document.security_families.map(f => [f.id, f.title]));
    const controlMeta = new Map();
    for (const fam of catalogs.ndTzi.document.security_families)
      for (const c of fam.controls) controlMeta.set(c.canonical_id, { title: c.title, family: fam.id });

    const accepted = acceptedRisksFor(catalogs.threatsRisks, state.selected_assets, state.passport.as_class, state.risks);
    const contributingRisks = new Map(); // controlId -> Set<riskId>
    for (const r of accepted)
      for (const ref of r.control_refs ?? [])
        if (!mandatedControlIds.has(ref)) {
          if (!contributingRisks.has(ref)) contributingRisks.set(ref, new Set());
          contributingRisks.get(ref).add(r.id);
        }

    additional_controls = [...contributingRisks.entries()]
      .filter(([id]) => controlMeta.has(id))
      .map(([id, riskIds]) => {
        const meta = controlMeta.get(id);
        const ndControl = nd.get(id);
        const emptyParams = [];
        const resolve = makeResolver(new Map(), emptyParams);
        return {
          id, family: meta.family, familyName: familyTitle.get(meta.family) ?? meta.family,
          title: meta.title, statementLines: statementLinesFor(ndControl, resolve),
          risk_ids: [...riskIds].sort(),
        };
      })
      .sort((a, b) => a.id.localeCompare(b.id));
  }

  return { items, summary, additional_controls };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test test/profile-engine.test.js`
Expected: PASS (all tests, including all pre-existing ones).

- [ ] **Step 5: Run full suite to check for regressions**

Run: `npm test`
Expected: same pass/fail counts as baseline, plus the 5 new tests passing (no new failures beyond the 2 known pre-existing ones).

- [ ] **Step 6: Commit**

```bash
git add core/profile-engine.js test/profile-engine.test.js
git commit -m "feat: compute additional_controls in buildProfile from accepted risks"
```

---

### Task 3: `core/docx/docx-writer.js` — render `additional_controls` in `buildDocx`

**Files:**
- Modify: `core/docx/docx-writer.js`
- Test: `test/docx-writer.test.js`

**Interfaces:**
- Consumes: `profileDoc.additional_controls` (from Task 2), each entry `{ id, family, familyName, title, statementLines, risk_ids }`. `family` values match `item.classId` values used elsewhere in `buildDocx` (both come from the same family/class-id namespace — see `core/profile-engine.js`).
- Produces: no new exports — `buildDocx()`'s signature and behavior are unchanged when `profileDoc.additional_controls` is empty/absent (byte-for-byte identical XML to today).

- [ ] **Step 1: Write the failing tests**

Append to `test/docx-writer.test.js` (reusing the existing `input` fixture already defined at the top of the file):

```js
test('buildDocx: без additional_controls документ не змінюється (немає нового блоку)', () => {
  const buf = buildDocx(input);
  const dir = mkdtempSync(join(tmpdir(), 'docxtest-noextra-'));
  const file = join(dir, 't.docx');
  writeFileSync(file, buf);
  const xml = execFileSync('unzip', ['-p', file, 'word/document.xml'], { encoding: 'utf8' });
  assert.doesNotMatch(xml, /Додатково, з реєстру ризиків/);
});

test('buildDocx: additional_controls зʼявляються під своїм класом, коли клас уже присутній', () => {
  const withExtra = { ...input, profileDoc: { ...input.profileDoc,
    additional_controls: [
      { id: 'AC-9', family: 'AC', familyName: 'Управління доступом',
        title: 'Сповіщення про попередній вхід (доступ)',
        statementLines: [{ label: 'a.', depth: 0, text: 'Текст AC-9', parts: [{ type: 'text', value: 'Текст AC-9' }] }],
        risk_ids: ['R-013'] },
    ] } };
  const buf = buildDocx(withExtra);
  const dir = mkdtempSync(join(tmpdir(), 'docxtest-extra1-'));
  const file = join(dir, 't.docx');
  writeFileSync(file, buf);
  const xml = execFileSync('unzip', ['-p', file, 'word/document.xml'], { encoding: 'utf8' });
  assert.match(xml, /Додатково, з реєстру ризиків/);
  assert.match(xml, /AC-9/);
  assert.match(xml, /Ризики: R-013/);
});

test('buildDocx: родина, відсутня серед items, отримує новий міні-заголовок класу', () => {
  const withExtra = { ...input, profileDoc: { ...input.profileDoc,
    additional_controls: [
      { id: 'PM-1', family: 'PM', familyName: 'Менеджмент інформаційної безпеки',
        title: 'Програма (концепція) інформаційної безпеки',
        statementLines: [{ label: '', depth: 0, text: 'Текст PM-1', parts: [{ type: 'text', value: 'Текст PM-1' }] }],
        risk_ids: ['C-001'] },
    ] } };
  const buf = buildDocx(withExtra);
  const dir = mkdtempSync(join(tmpdir(), 'docxtest-extra2-'));
  const file = join(dir, 't.docx');
  writeFileSync(file, buf);
  const xml = execFileSync('unzip', ['-p', file, 'word/document.xml'], { encoding: 'utf8' });
  assert.match(xml, /МЕНЕДЖМЕНТ ІНФОРМАЦІЙНОЇ БЕЗПЕКИ \(PM\)/);
  assert.match(xml, /PM-1/);
  assert.match(xml, /Ризики: C-001/);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test test/docx-writer.test.js`
Expected: FAIL — new assertions (`Додатково, з реєстру ризиків`, `PM-1`, etc.) not found in the generated XML.

- [ ] **Step 3: Implement rendering in `buildDocx`**

Inside `buildDocx`, right before the `let currentClass = null;` line, add the grouping helper and a row-builder for a family's additional controls:

```js
  const additionalByFamily = new Map();
  for (const ac of profileDoc.additional_controls ?? []) {
    if (!additionalByFamily.has(ac.family)) additionalByFamily.set(ac.family, []);
    additionalByFamily.get(ac.family).push(ac);
  }
  const additionalRowsFor = (family) => {
    const list = additionalByFamily.get(family);
    if (!list?.length) return [];
    const rows = [row([cell('Додатково, з реєстру ризиків', { bold: true, italic: true, span: 5 })])];
    for (const ac of list) {
      const paragraphs = ac.statementLines.map(statementParXml).join('') || par(ac.title);
      const idParagraphs = par(ac.id, { align: 'center' }) + par(ac.title, { italic: true, align: 'center', sz: 20 });
      rows.push(row([
        cell('', { pct: w1 }), cell('', { pct: w2 }), cell('', { pct: w3 }),
        cellXml(idParagraphs, { pct: w4 }),
        cellXml(paragraphs + par(`Ризики: ${ac.risk_ids.join(', ')}`, { italic: true, sz: 20 }), { pct: w5 }),
      ]));
    }
    return rows;
  };
```

Replace the existing main loop (currently `let currentClass = null; for (const item of profileDoc.items) { if (item.classId !== currentClass) { ... } ... }`) with:

```js
  let currentClass = null;
  for (const item of profileDoc.items) {
    if (item.classId !== currentClass) {
      if (currentClass !== null) profileRows.push(...additionalRowsFor(currentClass));
      currentClass = item.classId;
      profileRows.push(row([
        cell(`${item.className.toUpperCase()} (${item.classId})`, { bold: true, align: 'center', span: 5 }),
      ]));
    }
    if (item.status !== 'Застосовується (автозаповнено)') {
      const note = item.exemptionNote ?? 'Не застосовується (вручну)';
      profileRows.push(row([
        cell(item.actionNumber, { align: 'center', pct: w1 }),
        cell(item.actionName, { pct: w2 }),
        cell(item.bpbRequirements ?? '', { pct: w3 }),
        cell('—', { align: 'center', pct: w4 }),
        cellXml(par(note), { pct: w5 }),
      ]));
      continue;
    }
    const entries = controlRowsFor(item);
    if (!entries.length) {
      profileRows.push(row([
        cell(item.actionNumber, { align: 'center', pct: w1 }),
        cell(item.actionName, { pct: w2 }),
        cell(item.bpbRequirements ?? '', { pct: w3 }),
        cell('—', { align: 'center', pct: w4 }), cell('—', { pct: w5 }),
      ]));
      continue;
    }
    entries.forEach((entry, i) => {
      const first = i === 0;
      const merge = entries.length > 1 ? (first ? 'restart' : 'continue') : undefined;
      const idParagraphs = par(entry.id, { align: 'center' }) +
        (entry.note ? par(entry.note, { italic: true, align: 'center', sz: 20 }) : '');
      profileRows.push(row([
        cell(first ? item.actionNumber : '', { align: 'center', pct: w1, merge }),
        cell(first ? item.actionName : '', { pct: w2, merge }),
        cell(first ? (item.bpbRequirements ?? '') : '', { pct: w3, merge }),
        cellXml(idParagraphs, { pct: w4 }),
        cellXml(entry.paragraphs, { pct: w5 }),
      ]));
    });
  }
  if (currentClass !== null) profileRows.push(...additionalRowsFor(currentClass));

  // Родини, для яких у profileDoc.items взагалі немає жодного рядка — новий міні-class-card
  const presentClassIds = new Set(profileDoc.items.map(i => i.classId));
  for (const [family, list] of additionalByFamily) {
    if (presentClassIds.has(family)) continue;
    const familyName = list[0]?.familyName ?? family;
    profileRows.push(row([
      cell(`${familyName.toUpperCase()} (${family})`, { bold: true, align: 'center', span: 5 }),
    ]));
    profileRows.push(...additionalRowsFor(family));
  }
```

(This replaces the entire previous loop body one-for-one — only the class-boundary handling and the two new blocks after/around it are new; the per-item row logic inside the loop is unchanged from the current file.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test test/docx-writer.test.js`
Expected: PASS (all tests, including all pre-existing ones — the "no additional_controls" test confirms zero regressions in the default case).

- [ ] **Step 5: Run full suite to check for regressions**

Run: `npm test`
Expected: same baseline pass/fail counts plus 3 new passing tests.

- [ ] **Step 6: Commit**

```bash
git add core/docx/docx-writer.js test/docx-writer.test.js
git commit -m "feat: render additional_controls distributed by family in buildDocx"
```

---

### Task 4: `public/js/steps/step3-base-risks.js` — "Заходи захисту" column + controlPicker in both edit modals

**Files:**
- Modify: `public/js/steps/step3-base-risks.js`

**Interfaces:**
- Consumes: `controlPicker` from `../risk-form.js` (Task 1).
- Produces: `export const setBaseOverride` (currently a local `const`, made exportable so Task 5's Крок 2 wiring reuses the exact same state-update logic — no duplicated merge logic across files).

- [ ] **Step 1: Export `setBaseOverride`**

Change:

```js
const setBaseOverride = (id, patch) =>
  setState(s => ({ ...s, risks: { ...s.risks, base_overrides: { ...s.risks.base_overrides, [id]: patch } } }));
```

to:

```js
export const setBaseOverride = (id, patch) =>
  setState(s => ({ ...s, risks: { ...s.risks, base_overrides: { ...s.risks.base_overrides, [id]: patch } } }));
```

- [ ] **Step 2: Import `controlPicker`**

Change:

```js
import { openRiskFormModal } from '../risk-form.js';
```

to:

```js
import { openRiskFormModal, controlPicker } from '../risk-form.js';
```

- [ ] **Step 3: Add the "Заходи захисту" column header**

Change:

```js
    const header = el('tr', {}, ...['ID', 'Актив', 'Загроза', 'Вразливість', 'Вплив', 'Ймовірність', 'Рівень', 'Стратегія', 'Заходи обробки', 'Відповідальний', 'Залишковий', 'Дії']
      .map(h => el('th', {}, h)));
```

to:

```js
    const header = el('tr', {}, ...['ID', 'Актив', 'Загроза', 'Вразливість', 'Вплив', 'Ймовірність', 'Рівень', 'Стратегія', 'Заходи обробки', 'Відповідальний', 'Залишковий', 'Заходи захисту', 'Дії']
      .map(h => el('th', {}, h)));
```

- [ ] **Step 4: Add the column cell to `baseRows`**

Change (add the new cell right before the `Дії` cell):

```js
        el('td', {}, eff.treatment_strategy), el('td', {}, eff.treatment_plan ?? ''),
        el('td', {}, eff.responsible), el('td', {}, eff.residual_risk ?? ''),
        el('td', {},
          el('div', { class: 'row-actions' },
```

to:

```js
        el('td', {}, eff.treatment_strategy), el('td', {}, eff.treatment_plan ?? ''),
        el('td', {}, eff.responsible), el('td', {}, eff.residual_risk ?? ''),
        el('td', {}, (eff.control_refs ?? []).join(', ') || '—'),
        el('td', {},
          el('div', { class: 'row-actions' },
```

- [ ] **Step 5: Add the column cell to `customRows`**

Change (add the new cell right before the final `Дії` cell — after the residual-risk `<select>` cell):

```js
      el('td', {}, el('select', { class: 'cell-edit',
        onchange: (e) => patchCustomRisk(r.id, { residual_risk: e.target.value }) },
        ...RESIDUAL_OPTIONS.map(v => option(v, v === '' ? '—' : v, v === (r.residual_risk ?? ''))))),
      el('td', {},
        el('div', { class: 'row-actions' },
```

to:

```js
      el('td', {}, el('select', { class: 'cell-edit',
        onchange: (e) => patchCustomRisk(r.id, { residual_risk: e.target.value }) },
        ...RESIDUAL_OPTIONS.map(v => option(v, v === '' ? '—' : v, v === (r.residual_risk ?? ''))))),
      el('td', {}, (r.control_refs ?? []).join(', ') || '—'),
      el('td', {},
        el('div', { class: 'row-actions' },
```

- [ ] **Step 6: Wire `controlPicker` into `openEditRiskModal` (base risks)**

Add the picker to the field list and include its selection in the saved patch. Change:

```js
      const residSel = el('select', {}, ...RESIDUAL_OPTIONS.map(v => option(v, v === '' ? '—' : v, v === (eff.residual_risk ?? ''))));
      const saveBtn = el('button', { type: 'button', class: 'primary', onclick: () => {
        const likelihood = Number(likSel.value);
        setBaseOverride(risk.id, {
          asset_id: assetSel.value, threat: threatInput.value, vulnerability: vulnInput.value,
          impact: Number(impSel.value), likelihood,
          likelihood_label: scale.likelihood_options.find(o => o.value === likelihood)?.label ?? '',
          treatment_strategy: stratSel.value, treatment_plan: planInput.value, responsible: respInput.value,
          residual_risk: residSel.value,
        });
        modal.close();
        rerender();
      } }, 'Зберегти');
      const deleteBtn = el('button', { type: 'button', class: 'link-btn', onclick: () => {
        if (!confirm(`Видалити загрозу «${eff.threat}» (${risk.id}) зі списку? Її не можна буде повернути.`)) return;
        deleteBaseRisk(risk.id);
        modal.close();
        rerender();
      } }, 'Видалити');
      const modal = showModal(el('div', { class: 'field-grid' },
        el('label', {}, 'Актив: ', assetSel), el('label', {}, 'Загроза: ', threatInput),
        el('label', {}, 'Вразливість: ', vulnInput), el('label', {}, 'Вплив: ', impSel),
        el('label', {}, 'Ймовірність: ', likSel), el('label', {}, 'Стратегія: ', stratSel),
        el('label', {}, 'Заходи обробки: ', planInput), el('label', {}, 'Відповідальний: ', respInput),
        el('label', {}, 'Залишковий ризик: ', residSel),
        el('div', { class: 'actions' }, saveBtn,
          el('button', { type: 'button', onclick: () => modal.close() }, 'Скасувати'), deleteBtn)),
        { title: `Редагування загрози ${risk.id}` });
```

to:

```js
      const residSel = el('select', {}, ...RESIDUAL_OPTIONS.map(v => option(v, v === '' ? '—' : v, v === (eff.residual_risk ?? ''))));
      const picker = controlPicker(catalogs.ndTzi, eff.control_refs ?? []);
      const saveBtn = el('button', { type: 'button', class: 'primary', onclick: () => {
        const likelihood = Number(likSel.value);
        setBaseOverride(risk.id, {
          asset_id: assetSel.value, threat: threatInput.value, vulnerability: vulnInput.value,
          impact: Number(impSel.value), likelihood,
          likelihood_label: scale.likelihood_options.find(o => o.value === likelihood)?.label ?? '',
          treatment_strategy: stratSel.value, treatment_plan: planInput.value, responsible: respInput.value,
          residual_risk: residSel.value, control_refs: picker.getSelected(),
        });
        modal.close();
        rerender();
      } }, 'Зберегти');
      const deleteBtn = el('button', { type: 'button', class: 'link-btn', onclick: () => {
        if (!confirm(`Видалити загрозу «${eff.threat}» (${risk.id}) зі списку? Її не можна буде повернути.`)) return;
        deleteBaseRisk(risk.id);
        modal.close();
        rerender();
      } }, 'Видалити');
      const modal = showModal(el('div', { class: 'field-grid' },
        el('label', {}, 'Актив: ', assetSel), el('label', {}, 'Загроза: ', threatInput),
        el('label', {}, 'Вразливість: ', vulnInput), el('label', {}, 'Вплив: ', impSel),
        el('label', {}, 'Ймовірність: ', likSel), el('label', {}, 'Стратегія: ', stratSel),
        el('label', {}, 'Заходи обробки: ', planInput), el('label', {}, 'Відповідальний: ', respInput),
        el('label', {}, 'Залишковий ризик: ', residSel),
        el('label', {}, 'Заходи захисту (НД ТЗІ): ', picker.el),
        el('div', { class: 'actions' }, saveBtn,
          el('button', { type: 'button', onclick: () => modal.close() }, 'Скасувати'), deleteBtn)),
        { title: `Редагування загрози ${risk.id}` });
```

- [ ] **Step 7: Wire `controlPicker` into `openEditCustomRiskModal`**

Apply the analogous change (same shape, custom-risk variant). Change:

```js
      const residSel = el('select', {}, ...RESIDUAL_OPTIONS.map(v => option(v, v === '' ? '—' : v, v === (risk.residual_risk ?? ''))));
      const saveBtn = el('button', { type: 'button', class: 'primary', onclick: () => {
        const likelihood = Number(likSel.value);
        saveCustomRiskEdit(risk.id, {
          asset_id: assetSel.value, threat: threatInput.value, vulnerability: vulnInput.value,
          impact: Number(impSel.value), likelihood,
          likelihood_label: scale.likelihood_options.find(o => o.value === likelihood)?.label ?? '',
          treatment_strategy: stratSel.value, treatment_plan: planInput.value, responsible: respInput.value,
          residual_risk: residSel.value,
        }, scale);
        modal.close();
        rerender();
      } }, 'Зберегти');
      const deleteBtn = el('button', { type: 'button', class: 'link-btn', onclick: () => {
        if (!confirm(`Видалити загрозу «${risk.threat}» (${risk.id}) зі списку?`)) return;
        setState(s => ({ ...s, risks: { ...s.risks, custom: s.risks.custom.filter(x => x.id !== risk.id) } }));
        modal.close();
        rerender();
      } }, 'Видалити');
      const modal = showModal(el('div', { class: 'field-grid' },
        el('label', {}, 'Актив: ', assetSel), el('label', {}, 'Загроза: ', threatInput),
        el('label', {}, 'Вразливість: ', vulnInput), el('label', {}, 'Вплив: ', impSel),
        el('label', {}, 'Ймовірність: ', likSel), el('label', {}, 'Стратегія: ', stratSel),
        el('label', {}, 'Заходи обробки: ', planInput), el('label', {}, 'Відповідальний: ', respInput),
        el('label', {}, 'Залишковий ризик: ', residSel),
        el('div', { class: 'actions' }, saveBtn,
          el('button', { type: 'button', onclick: () => modal.close() }, 'Скасувати'), deleteBtn)),
        { title: `Редагування загрози ${risk.id}` });
```

to:

```js
      const residSel = el('select', {}, ...RESIDUAL_OPTIONS.map(v => option(v, v === '' ? '—' : v, v === (risk.residual_risk ?? ''))));
      const picker = controlPicker(catalogs.ndTzi, risk.control_refs ?? []);
      const saveBtn = el('button', { type: 'button', class: 'primary', onclick: () => {
        const likelihood = Number(likSel.value);
        saveCustomRiskEdit(risk.id, {
          asset_id: assetSel.value, threat: threatInput.value, vulnerability: vulnInput.value,
          impact: Number(impSel.value), likelihood,
          likelihood_label: scale.likelihood_options.find(o => o.value === likelihood)?.label ?? '',
          treatment_strategy: stratSel.value, treatment_plan: planInput.value, responsible: respInput.value,
          residual_risk: residSel.value, control_refs: picker.getSelected(),
        }, scale);
        modal.close();
        rerender();
      } }, 'Зберегти');
      const deleteBtn = el('button', { type: 'button', class: 'link-btn', onclick: () => {
        if (!confirm(`Видалити загрозу «${risk.threat}» (${risk.id}) зі списку?`)) return;
        setState(s => ({ ...s, risks: { ...s.risks, custom: s.risks.custom.filter(x => x.id !== risk.id) } }));
        modal.close();
        rerender();
      } }, 'Видалити');
      const modal = showModal(el('div', { class: 'field-grid' },
        el('label', {}, 'Актив: ', assetSel), el('label', {}, 'Загроза: ', threatInput),
        el('label', {}, 'Вразливість: ', vulnInput), el('label', {}, 'Вплив: ', impSel),
        el('label', {}, 'Ймовірність: ', likSel), el('label', {}, 'Стратегія: ', stratSel),
        el('label', {}, 'Заходи обробки: ', planInput), el('label', {}, 'Відповідальний: ', respInput),
        el('label', {}, 'Залишковий ризик: ', residSel),
        el('label', {}, 'Заходи захисту (НД ТЗІ): ', picker.el),
        el('div', { class: 'actions' }, saveBtn,
          el('button', { type: 'button', onclick: () => modal.close() }, 'Скасувати'), deleteBtn)),
        { title: `Редагування загрози ${risk.id}` });
```

- [ ] **Step 8: Manual verification**

Open Крок 3 in the browser: confirm a new "Заходи захисту" column shows `—` for risks with no `control_refs` and a comma-separated list otherwise, for BOTH base and custom rows. Edit a base risk and a custom risk, add/remove controls via the picker, save, confirm the column updates.

- [ ] **Step 9: Commit**

```bash
git add public/js/steps/step3-base-risks.js
git commit -m "feat: add Заходи захисту column + controlPicker to step3 edit modals"
```

---

### Task 5: `public/js/steps/step2-assets.js` — per-risk "Заходи" chip/button

**Files:**
- Modify: `public/js/steps/step2-assets.js`

**Interfaces:**
- Consumes: `openControlsOnlyModal` from `../risk-form.js` (Task 1).

- [ ] **Step 1: Import `openControlsOnlyModal`**

Change:

```js
import { openRiskFormModal } from '../risk-form.js';
```

to:

```js
import { openRiskFormModal, openControlsOnlyModal } from '../risk-form.js';
```

- [ ] **Step 2: Restructure each risk row to add a "Заходи: …" button as a sibling of the checkbox label**

A `<button>` must NOT be nested inside the existing `<label class="checkbox">` (clicking it would also toggle the checkbox via native label behavior). Wrap each row in a flex container instead. Change:

```js
          const risks = risksForAsset(a.id, state.passport.as_class);
          const riskPanel = el('div', { class: 'risk-preview' },
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
              onclick: () => openRiskFormModal({ presetAssetId: a.id, onSaved: rerender }) },
              '+ Додати свій ризик до цього активу'));
          return [checkboxRow, riskPanel];
```

to:

```js
          const risks = risksForAsset(a.id, state.passport.as_class);
          const controlRefsFor = (r) => state.risks.base_overrides?.[r.id]?.control_refs ?? r.control_refs ?? [];
          const riskPanel = el('div', { class: 'risk-preview' },
            risks.length
              ? el('div', {}, ...risks.map(r => el('div', { class: 'risk-row' },
                  el('label', { class: 'checkbox' },
                    el('input', { type: 'checkbox',
                      ...(state.risks.accepted_base.includes(r.id) ? { checked: '' } : {}),
                      onchange: (e) => setState(s => ({ ...s, risks: { ...s.risks,
                        accepted_base: e.target.checked
                          ? [...s.risks.accepted_base, r.id]
                          : s.risks.accepted_base.filter(x => x !== r.id) } })) }),
                    `${r.threat} — ${r.vulnerability}`,
                    el('span', { class: `badge lvl-${r.level.replace(/ /g, '-')}` }, r.level)),
                  el('button', { type: 'button', class: 'link-btn ctrl-link', onclick: (e) => {
                    e.preventDefault();
                    openControlsOnlyModal(r, { onSaved: rerender });
                  } }, controlRefsFor(r).length ? `Заходи: ${controlRefsFor(r).join(', ')}` : 'Заходи: —'))))
              : el('p', { class: 'hint' }, 'Немає готових загроз у довіднику для цього активу.'),
            el('button', { type: 'button',
              onclick: () => openRiskFormModal({ presetAssetId: a.id, onSaved: rerender }) },
              '+ Додати свій ризик до цього активу'));
          return [checkboxRow, riskPanel];
```

- [ ] **Step 3: Manual verification**

Open Крок 2, expand a category with an asset checked that has catalog risks. Confirm each risk row shows a "Заходи: —" (or list) link next to the level badge, clicking it opens a modal with ONLY the control picker (no other risk fields), saving updates the chip text and does not toggle the risk's own accept-checkbox. Confirm this does not clobber other override fields (e.g., edit control_refs here, then open the full edit modal on Крок 3 — other fields like `treatment_strategy` must be untouched unless separately edited).

- [ ] **Step 4: Commit**

```bash
git add public/js/steps/step2-assets.js
git commit -m "feat: show/edit control_refs per risk in step2 asset risk panel"
```

---

### Task 6: `public/js/steps/step6-verify.js` — distributed `additional_controls` rendering (Крок 4)

**Files:**
- Modify: `public/js/steps/step6-verify.js`

**Interfaces:**
- Consumes: `doc.additional_controls` (from `buildProfile`, Task 2), `catalogs.ndTzi` (already available via `catalogs` import).

- [ ] **Step 1: Build the family→additional_controls grouping and a row-renderer**

Add this right after the `const byClass = new Map();` block (which groups `doc.items` by `classId`):

```js
    const byClass = new Map();
    for (const item of doc.items) {
      if (!byClass.has(item.classId)) byClass.set(item.classId, { className: item.className, items: [] });
      byClass.get(item.classId).items.push(item);
    }

    // Заходи з реєстру ризиків, яких немає в мандованому БПБ профілі — розподілено по родинах
    const additionalByFamily = new Map();
    for (const ac of doc.additional_controls ?? []) {
      if (!additionalByFamily.has(ac.family)) additionalByFamily.set(ac.family, []);
      additionalByFamily.get(ac.family).push(ac);
    }
    const additionalRowsFor = (family) => {
      const list = additionalByFamily.get(family);
      if (!list?.length) return [];
      const rows = [el('tr', { class: 'row-extra-header' },
        el('td', { colspan: '4' }, el('strong', {}, 'Додатково, з реєстру ризиків')))];
      for (const ac of list) {
        rows.push(el('tr', { class: 'row-extra' },
          el('td', {}, ''), el('td', {}, ''),
          el('td', { class: 'ctrl-cell' }, ac.id, el('div', { class: 'ctrl-note' }, ac.title)),
          el('td', {}, ...renderLines(ac.statementLines),
            el('p', { class: 'hint' }, `Ризики: ${ac.risk_ids.join(', ')}`))));
      }
      return rows;
    };
```

- [ ] **Step 2: Append the additional-controls block to each existing class-card's table**

Change:

```js
    const cards = [];
    for (const [classId, group] of byClass) {
      const tbl = el('table', { class: 'verify-table' },
        el('tr', {}, ...['№', 'Вимога', 'Захід', 'Налаштований зміст заходу захисту'].map(h => el('th', {}, h))),
        ...group.items.flatMap(itemRows));
```

to:

```js
    const cards = [];
    for (const [classId, group] of byClass) {
      const tbl = el('table', { class: 'verify-table' },
        el('tr', {}, ...['№', 'Вимога', 'Захід', 'Налаштований зміст заходу захисту'].map(h => el('th', {}, h))),
        ...group.items.flatMap(itemRows),
        ...additionalRowsFor(classId));
```

- [ ] **Step 3: Add new mini-cards for families with zero BPB coverage**

Right after the `for (const [classId, group] of byClass) { ... cards.push(...); }` loop (before `const summaryBar = ...`), add:

```js
    for (const [family, list] of additionalByFamily) {
      if (byClass.has(family)) continue;
      const tbl = el('table', { class: 'verify-table' },
        el('tr', {}, ...['№', 'Вимога', 'Захід', 'Налаштований зміст заходу захисту'].map(h => el('th', {}, h))),
        ...additionalRowsFor(family));
      const toggle = el('span', { class: 'collapse-mark' }, '▲');
      const header = el('header', { class: 'class-card-header', onclick: () => {
        tbl.hidden = !tbl.hidden;
        toggle.textContent = tbl.hidden ? '▼' : '▲';
      } },
        el('strong', {}, `${list[0]?.familyName ?? family} (${family})`),
        el('span', { class: 'req-count' }, `${list.length} заходів `, toggle));
      cards.push(el('div', { class: 'class-card' }, header, tbl));
    }
```

- [ ] **Step 4: Manual verification**

In the browser: on Крок 3, edit a risk whose asset is selected and pick a control not mandated by the current БПБ (e.g. `AC-9` for `service`/АС-1). Go to Крок 4: confirm the `AC` class-card now shows a "Додатково, з реєстру ризиків" block with `AC-9`, its rendered statement text, and "Ризики: …". Then pick a control from a family with zero coverage (e.g. `PM-1`) and confirm a brand-new mini-class-card appears for that family. Export DOCX (Task 3) and confirm the same block appears there too.

- [ ] **Step 5: Commit**

```bash
git add public/js/steps/step6-verify.js
git commit -m "feat: render additional_controls distributed by family on step6-verify"
```

---

### Task 7: CSS polish + end-to-end manual verification

**Files:**
- Modify: `public/css/app.css`

- [ ] **Step 1: Append new styles at the end of `public/css/app.css`**

```css

/* Control picker (заходи захисту НД ТЗІ для ризиків) */
.control-picker { display: flex; flex-direction: column; gap: 0.4rem; }
.ctrl-chips { display: flex; flex-wrap: wrap; gap: 0.3rem; min-height: 1.6rem; }
.ctrl-chip { display: inline-flex; align-items: center; gap: 0.3rem; }
.chip-remove { border: none; background: none; color: inherit; cursor: pointer; font-size: 0.7rem; padding: 0; line-height: 1; }
.ctrl-list { max-height: 12rem; overflow-y: auto; border: 1px solid var(--color-border); border-radius: var(--radius-sm); padding: 0.4rem 0.6rem; display: flex; flex-direction: column; gap: 0.15rem; }
.ctrl-list label.checkbox { font-weight: 400; font-size: 0.85rem; }

/* Крок 2: рядок ризику + кнопка «Заходи» поруч (не всередині чекбокс-лейбла) */
.risk-row { display: flex; align-items: center; justify-content: space-between; gap: 0.6rem; width: 100%; }
.risk-row .checkbox { flex: 1; }
.ctrl-link { flex-shrink: 0; white-space: nowrap; font-size: 0.75rem; }

/* Крок 4 / DOCX-паралельний блок "Додатково, з реєстру ризиків" */
.row-extra-header td { background: var(--color-muted); font-style: italic; font-weight: 600; }
.row-extra td { background: #faf5ff; }
```

- [ ] **Step 2: Run the full automated suite**

Run: `npm test`
Expected: all previously-passing tests still pass, plus the 8 new tests from Tasks 2-3, with exactly the same 2 known pre-existing failures as baseline (no more, no fewer).

- [ ] **Step 3: End-to-end manual verification in the browser**

1. Крок 1: pick `service` info type, АС-1.
2. Крок 2: select an asset with catalog risks; confirm the "Заходи: —" link appears per risk row; click it, pick `AC-9`, save; confirm the chip updates to "Заходи: AC-9" and the row's accept-checkbox state is untouched.
3. Крок 3: confirm the new "Заходи захисту" column shows `AC-9` for that risk; open the full edit modal, confirm the picker shows `AC-9` pre-checked, add another control, save, confirm the column updates.
4. Add a custom risk via "+ Додати ризик" → "Власна загроза", pick a control not mandated by БПБ (e.g. `PM-1`), save; confirm Крок 3's column shows it.
5. Крок 4: confirm `AC-9` appears as an extra block under the existing `AC` class-card, and `PM-1` produces a brand-new mini class-card for `PM`.
6. Export DOCX; unzip and confirm both blocks appear in `word/document.xml` with correct content and no `undefined`/`NaN` anywhere.
7. Reload the page (state persisted via localStorage) and confirm all of the above survives a reload.

- [ ] **Step 4: Commit**

```bash
git add public/css/app.css
git commit -m "style: add control-picker/risk-row/additional-controls CSS"
```

---

## Self-Review Notes (for the plan author, already applied above)

- **Spec coverage:** §1 → Task 1 Step 1. §2 (all four use sites) → Task 1 Steps 1-2, Task 4 Steps 6-7, Task 5. §3 → Task 2. §4 → Task 5. §5 → Task 4 Steps 3-5. §6 → Task 6. §7 → Task 3. Валідація's automated-test bullets → Task 2/3 tests; manual-verification bullets → Task 7 Step 3.
- **Placeholder scan:** no TBD/"add appropriate handling"/"similar to Task N" — every step has literal code or a literal manual-test script.
- **Type consistency:** `controlPicker(ndTzi, initialIds)` signature matches across Task 1 (definition), Task 4 (`controlPicker(catalogs.ndTzi, eff.control_refs ?? [])` / `controlPicker(catalogs.ndTzi, risk.control_refs ?? [])`). `openControlsOnlyModal(risk, { onSaved })` matches across Task 1 (definition) and Task 5 (call site). `additional_controls` entry shape `{ id, family, familyName, title, statementLines, risk_ids }` matches across Task 2 (producer), Task 3 and Task 6 (consumers). `setBaseOverride` export in Task 4 matches its merge-based call from Task 1's `openControlsOnlyModal`.
