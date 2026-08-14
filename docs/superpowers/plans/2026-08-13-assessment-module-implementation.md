# Assessment Module (Оцінювання ІКС) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a second top-level mode "Оцінювання ІКС" to the existing «Офлайн-Профіль» app that lets an assessor build an Assessment Plan from an approved ЦПБ record, collect evidence/conclusions/findings per Assessment Item, persist to `assessment.json`, and export a DOCX report — fully offline, zero npm deps.

**Architecture:** Pure `core/assessment/*` modules (no DOM/fs/http) consume an immutable snapshot of an approved record + `data/assessment_catalog.json` (AC-02 reference fixture, schema v2) to build an Assessment Plan (list of Assessment Items with resolved statements). `server.js` gains `/api/assessments*` routes for CRUD + evidence file storage + DOCX export, mirroring the existing template routes. `public/js/assessment/*` is a second vanilla-JS mini-app mounted from a landing page that lets the user pick "Формування ЦПБ" vs "Оцінювання ІКС".

**Tech Stack:** Node.js ≥18, ES modules, vanilla JS, zero npm dependencies, `node:http`/`node:fs`/`node:crypto`, existing `core/docx/zip-writer.js` OOXML writer, `node --test`.

## Global Constraints

- Node.js ≥ 18, ES modules, vanilla JavaScript, zero npm dependencies.
- Server listens on `127.0.0.1` only (loopback).
- `core/` modules must not import `node:http`, `node:fs`, or reference `document`/`window`.
- UI renders only via `textContent`/`createElement`/`el()` helper — never `innerHTML` with data.
- All UI copy is Ukrainian.
- DOCX output uses the existing hand-rolled OOXML + `core/docx/zip-writer.js` — no third-party DOCX library.
- Input artifact for assessment is an **approved record** (`templates/approved/*.json`, `kind === "approved"`) — never a bare cpb template.
- Never silently fabricate ODP values; unresolved values render as `[НЕ ВИЗНАЧЕНО: <param_id>]` and register a warning.
- Evidence binary attachments are stored as files under `assessments/<id>/evidence/`, never base64 in JSON.
- Path/name sanitization (existing `NAME_RE` pattern) and directory containment must be reused for every new file-writing route.

---

## File Structure

```text
core/assessment/
  assessment-resolver.js     — statement placeholder resolution against approved-record ODP values
  assessment-plan.js         — buildAssessmentPlan(): approved state + nd_tzi + assessment_catalog → items
  assessment-validator.js    — conclusion/finding validation rules
  assessment-summary.js      — counts by conclusion/status
  assessment-io.js           — serialize/deserialize/validate assessment.json
data/
  assessment_catalog.json    — copied from docs/superpowers/plans/assessment_catalog_ac02_reference.json (schema v2)
core/docx/
  assessment-docx-writer.js  — buildAssessmentDocx({assessment}) reusing zip-writer.js primitives
server.js                    — add /api/assessments* routes
public/js/assessment/
  assessment-app.js          — mounts assessment mini-app into #step-container-like root
  assessment-state.js        — getState/setState/subscribe for one open assessment (mirrors public/js/state.js)
  assessment-dashboard.js    — landing + list + filters + summary badges
  assessment-item.js         — item detail view (read-only fields + editable evidence/conclusion/finding)
  evidence-editor.js         — evidence CRUD list/form for one item
public/index.html            — add mode switcher (Формування ЦПБ / Оцінювання ІКС)
test/
  assessment-plan.test.js
  assessment-resolver.test.js
  assessment-validator.test.js
  assessment-summary.test.js
  assessment-io.test.js
  assessment-docx-writer.test.js
  server-assessment.test.js
```

---

## Task 1: Load AC-02 assessment catalog fixture into `data/`

**Files:**
- Create: `data/assessment_catalog.json` (copy of `docs/superpowers/plans/assessment_catalog_ac02_reference.json`)
- Test: `test/assessment-catalog-fixture.test.js`

**Interfaces:**
- Consumes: nothing.
- Produces: `data/assessment_catalog.json` with shape `{ schema, provenance, enums: {methods, evidence_types, interview_roles, odp_types}, controls: [{ control_id, canonical_control_id, family, title, odp_registry: [{id, owner_control_id, owner_statement_path, type, label}], entries: [{id, control_id, enhancement, statement_path, odp_refs, methods, potential_evidence, interview_roles?}], withdrawn: [{control_id, reason}], coverage }] }`. This is what `assessment-plan.js` (Task 3) reads.

- [ ] **Step 1: Write the failing test**

```js
// test/assessment-catalog-fixture.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('assessment_catalog.json існує та має контроль AC-02 з 16 ODP і 33 entries', () => {
  const cat = JSON.parse(readFileSync('data/assessment_catalog.json', 'utf8'));
  assert.equal(cat.schema.id, 'ua.ics.assessment.catalog');
  const ac02 = cat.controls.find(c => c.control_id === 'AC-02');
  assert.ok(ac02, 'AC-02 має бути присутній');
  assert.equal(ac02.odp_registry.length, 16);
  assert.equal(ac02.entries.length, 33);
  assert.equal(ac02.withdrawn[0].control_id, 'AC-02(10)');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/assessment-catalog-fixture.test.js`
Expected: FAIL — `ENOENT: no such file or directory, open 'data/assessment_catalog.json'`

- [ ] **Step 3: Copy the fixture into `data/`**

```bash
cp docs/superpowers/plans/assessment_catalog_ac02_reference.json data/assessment_catalog.json
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/assessment-catalog-fixture.test.js`
Expected: PASS (1 passing)

- [ ] **Step 5: Commit**

```bash
git add data/assessment_catalog.json test/assessment-catalog-fixture.test.js
git commit -m "feat(assessment): add AC-02 reference assessment catalog to data/"
```

---

## Task 2: `core/assessment/assessment-resolver.js` — statement placeholder resolution

**Files:**
- Create: `core/assessment/assessment-resolver.js`
- Test: `test/assessment-resolver.test.js`

**Interfaces:**
- Consumes: `PARAM_RE` and `renderText` pattern already in `core/policy-autofill.js` (reuse `PARAM_RE`, do not duplicate the regex); `resolveParamValue` shape `{value, source}`.
- Produces (used by Task 3 `assessment-plan.js` and Task 8 `assessment-docx-writer.js`):
  ```js
  export function collectControlOdpValues(approvedState, catalogs, controlId) // -> Map<paramId, string>
  export function resolveStatement(text, odpValues) // -> { text: string, unresolved: string[] }
  ```
  - `collectControlOdpValues(approvedState, catalogs, controlId)` builds a `buildProfile`-equivalent resolver scoped to one control/enhancement id and returns a `Map` of `paramId -> resolved value string` (empty string excluded — only params that have a non-empty resolved value are included; callers treat missing keys as unresolved).
  - `resolveStatement(text, odpValues)` scans `text` for `{{ insert: param, X }}` occurrences using the shared `PARAM_RE`; if `odpValues.has(X)` substitutes the value, else substitutes `[НЕ ВИЗНАЧЕНО: X]` and adds `X` to `unresolved`.

- [ ] **Step 1: Write the failing test**

```js
// test/assessment-resolver.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveStatement, collectControlOdpValues } from '../core/assessment/assessment-resolver.js';

test('resolveStatement підставляє відоме значення', () => {
  const odpValues = new Map([['ac-2_odp.01', 'керівник СЗІ']]);
  const r = resolveStatement('Вимагати схвалення {{ insert: param, ac-2_odp.01 }} запитів.', odpValues);
  assert.equal(r.text, 'Вимагати схвалення керівник СЗІ запитів.');
  assert.deepEqual(r.unresolved, []);
});

test('resolveStatement позначає невідоме значення явно', () => {
  const r = resolveStatement('Період {{ insert: param, ac-2_odp.03 }}.', new Map());
  assert.equal(r.text, 'Період [НЕ ВИЗНАЧЕНО: ac-2_odp.03].');
  assert.deepEqual(r.unresolved, ['ac-2_odp.03']);
});

test('collectControlOdpValues повертає лише resolved (непорожні) значення контролю', () => {
  const approvedState = {
    passport: { as_class: 1 },
    info_type: 'service',
    global_constants: {},
    profile: { param_overrides: { 'ac-2_odp.01': 'керівник СЗІ' } },
  };
  const catalogs = {
    ndTzi: JSON.parse(require('node:fs').readFileSync('data/nd_tzi.json', 'utf8')),
    bpb: {
      service: JSON.parse(require('node:fs').readFileSync('data/bpb_service.json', 'utf8')),
      open_confidential: JSON.parse(require('node:fs').readFileSync('data/bpb_open_confidential.json', 'utf8')),
    },
    policyMapping: JSON.parse(require('node:fs').readFileSync('data/policy_mapping.json', 'utf8')),
    genericDefaults: JSON.parse(require('node:fs').readFileSync('data/generic_parameter_defaults.json', 'utf8')),
    exemptions: JSON.parse(require('node:fs').readFileSync('data/as_class_exemptions.json', 'utf8')),
  };
  const values = collectControlOdpValues(approvedState, catalogs, 'AC-02');
  assert.equal(values.get('ac-2_odp.01'), 'керівник СЗІ');
});
```

Note: use `import { readFileSync } from 'node:fs'` at the top instead of `require` (ESM) — write it that way in the real file.

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/assessment-resolver.test.js`
Expected: FAIL — module not found `core/assessment/assessment-resolver.js`

- [ ] **Step 3: Write minimal implementation**

```js
// core/assessment/assessment-resolver.js
import { PARAM_RE, buildPolicyParamIndex, resolveParamValue } from '../policy-autofill.js';
import { indexNdParams, bpbValuesFor } from '../profile-engine.js';

const EMPTY_TEXT_TAG = (paramId) => `[НЕ ВИЗНАЧЕНО: ${paramId}]`;

export function resolveStatement(text, odpValues) {
  const unresolved = [];
  const out = String(text ?? '').replace(PARAM_RE, (match, paramId) => {
    if (odpValues.has(paramId)) return odpValues.get(paramId);
    unresolved.push(paramId);
    return EMPTY_TEXT_TAG(paramId);
  });
  return { text: out, unresolved };
}

function indexNdControls(ndTzi) {
  const map = new Map();
  for (const fam of ndTzi.document.security_families)
    for (const c of fam.controls) {
      map.set(c.canonical_id, c);
      for (const ch of c.children ?? []) map.set(ch.canonical_id, ch);
    }
  return map;
}

// Знаходить nd_tzi control за canonical_id ("AC-2", "AC-2(2)") незалежно від формату дужок
function findNdControl(ndControls, controlId) {
  return ndControls.get(controlId) ?? ndControls.get(controlId.replace(/^([A-Z]+-\d+)\((\d+)\)$/, '$1($2)'));
}

export function collectControlOdpValues(approvedState, catalogs, controlId) {
  const bpbKey = approvedState.info_type;
  const bpb = catalogs.bpb[bpbKey];
  const ndControls = indexNdControls(catalogs.ndTzi);
  const ndControl = findNdControl(ndControls, controlId);
  const values = new Map();
  if (!ndControl) return values;

  const policyIndex = buildPolicyParamIndex(catalogs.policyMapping, approvedState.global_constants ?? {});

  // Знайти bpb security_action(s), що відповідають цьому control id, щоб зібрати bpb-locator значення
  const bpbValues = new Map();
  if (bpb) {
    for (const sc of bpb.security_classes)
      for (const action of sc.actions)
        for (const sa of action.security_actions)
          if (sa.control.id === controlId)
            for (const [k, v] of bpbValuesFor(ndControl, sa)) bpbValues.set(k, v);
  }

  const paramIds = new Set();
  const collect = (items) => {
    for (const it of items ?? []) {
      for (const m of String(it.text ?? '').matchAll(PARAM_RE)) paramIds.add(m[1]);
      collect(it.children);
    }
  };
  collect(ndControl.catalog?.statement?.items);

  for (const paramId of paramIds) {
    const r = resolveParamValue(paramId, {
      overrides: approvedState.profile?.param_overrides ?? {},
      policyIndex,
      bpbValues,
      genericDefaults: catalogs.genericDefaults ?? {},
    });
    if (r.source !== 'empty') values.set(paramId, r.value);
  }
  return values;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/assessment-resolver.test.js`
Expected: PASS (3 passing)

- [ ] **Step 5: Commit**

```bash
git add core/assessment/assessment-resolver.js test/assessment-resolver.test.js
git commit -m "feat(assessment): add assessment-resolver — resolves nd_tzi statement placeholders from approved-state ODP values"
```

---

## Task 3: `core/assessment/assessment-plan.js` — build the Assessment Plan

**Files:**
- Create: `core/assessment/assessment-plan.js`
- Test: `test/assessment-plan.test.js`

**Interfaces:**
- Consumes: `collectControlOdpValues`, `resolveStatement` from Task 2; `data/assessment_catalog.json` shape from Task 1.
- Produces (used by Task 7 server route and Task 9/10 UI):
  ```js
  export function buildAssessmentPlan({ approvedState, catalogs, assessmentCatalog }) // -> { items: AssessmentItem[], warnings: Warning[] }
  ```
  Where `AssessmentItem` matches spec §15:
  ```js
  {
    id, control_id, canonical_control_id, family, control_title, enhancement,
    statement_path, source_statement, resolved_statement, odp_refs, odp_values,
    cpb_status, // 'APPLIED' | 'EXEMPT' | 'EXCLUDED' | 'NOT_IN_CPB'
    catalog_missing, // true for UNMAPPED_CONTROL fallback items
    assessment_status: 'NOT_STARTED', recommended_methods, evidence: [], conclusion: null,
    assessor_comment: '', finding: null,
  }
  ```
  and `Warning` is `{ code: 'ODP_UNRESOLVED', assessment_item_id, param_id }` or `{ code: 'CATALOG_MISSING', control_id }`.

- [ ] **Step 1: Write the failing test**

```js
// test/assessment-plan.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildAssessmentPlan } from '../core/assessment/assessment-plan.js';

const read = (p) => JSON.parse(readFileSync(p, 'utf8'));
const catalogs = {
  ndTzi: read('data/nd_tzi.json'),
  bpb: { service: read('data/bpb_service.json'), open_confidential: read('data/bpb_open_confidential.json') },
  policyMapping: read('data/policy_mapping.json'),
  genericDefaults: read('data/generic_parameter_defaults.json'),
  exemptions: read('data/as_class_exemptions.json'),
};
const assessmentCatalog = read('data/assessment_catalog.json');

function approvedStateFixture() {
  return {
    passport: { ics_name: 'Тест АС', as_class: 1 },
    info_type: 'service',
    global_constants: {},
    selected_assets: ['A-01'],
    risks: { accepted_base: [], custom: [] },
    profile: { param_overrides: { 'ac-2_odp.01': 'керівник СЗІ' }, enhancements: [], excluded: [], exemption_overrides: [], exemption_note_overrides: {} },
  };
}

test('buildAssessmentPlan створює items для AC-02 base statements з assessment_catalog', () => {
  const plan = buildAssessmentPlan({ approvedState: approvedStateFixture(), catalogs, assessmentCatalog });
  const item = plan.items.find(i => i.id === 'AC-02.e');
  assert.ok(item, 'AC-02.e має бути в плані');
  assert.equal(item.canonical_control_id, 'AC-2');
  assert.match(item.resolved_statement, /керівник СЗІ/);
  assert.deepEqual(item.odp_refs, ['ac-2_odp.01']);
});

test('unresolved ODP формує warning і явний плейсхолдер у тексті', () => {
  const state = approvedStateFixture();
  state.profile.param_overrides = {}; // прибрати override -> ac-2_odp.01 нерозв'язаний
  const plan = buildAssessmentPlan({ approvedState: state, catalogs, assessmentCatalog });
  const item = plan.items.find(i => i.id === 'AC-02.e');
  assert.match(item.resolved_statement, /НЕ ВИЗНАЧЕНО: ac-2_odp\.01/);
  assert.ok(plan.warnings.some(w => w.code === 'ODP_UNRESOLVED' && w.param_id === 'ac-2_odp.01'));
});

test('посилення не потрапляє в план, якщо його немає у profile.enhancements', () => {
  const plan = buildAssessmentPlan({ approvedState: approvedStateFixture(), catalogs, assessmentCatalog });
  assert.equal(plan.items.some(i => i.control_id === 'AC-02(02)'), false);
});

test('посилення потрапляє в план, якщо воно включене', () => {
  const state = approvedStateFixture();
  state.profile.enhancements = ['AC-2(2)'];
  const plan = buildAssessmentPlan({ approvedState: state, catalogs, assessmentCatalog });
  assert.ok(plan.items.some(i => i.control_id === 'AC-02(02)'));
});

test('control без запису в assessment_catalog отримує UNMAPPED_CONTROL fallback', () => {
  const plan = buildAssessmentPlan({ approvedState: approvedStateFixture(), catalogs, assessmentCatalog });
  const unmapped = plan.items.filter(i => i.catalog_missing);
  assert.ok(unmapped.length > 0, 'мають існувати непокриті каталогом контролі (лише AC-02 має методику)');
  assert.ok(unmapped.every(i => i.assessment_status === 'NOT_STARTED'));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/assessment-plan.test.js`
Expected: FAIL — module not found

- [ ] **Step 3: Write minimal implementation**

```js
// core/assessment/assessment-plan.js
import { collectControlOdpValues, resolveStatement } from './assessment-resolver.js';
import { STATUS } from '../profile-engine.js';

function normSeg(s) {
  return String(s ?? '').replace(/[^\p{L}\p{N}.]/gu, '').replace(/\.+$/, '');
}

// Плоский перелік statement-рядків контролю з locator-шляхом ("h.1") та власним текстом
function flattenStatementForCatalog(items, prefix = []) {
  const out = [];
  for (const it of items ?? []) {
    const seg = normSeg(it.label);
    const path = [...prefix, seg].filter(Boolean);
    out.push({ path: path.join('.'), text: it.text ?? '' });
    out.push(...flattenStatementForCatalog(it.children, path));
  }
  return out;
}

function indexNdControls(ndTzi) {
  const map = new Map();
  for (const fam of ndTzi.document.security_families)
    for (const c of fam.controls) {
      map.set(c.canonical_id, c);
      for (const ch of c.children ?? []) map.set(ch.canonical_id, ch);
    }
  return map;
}

function cpbApplicableControlIds(approvedState, catalogs) {
  const bpb = catalogs.bpb[approvedState.info_type];
  const ids = new Map(); // controlId -> 'APPLIED' | 'EXEMPT' | 'EXCLUDED'
  if (!bpb) return ids;
  const exemptByControl = new Map();
  for (const e of catalogs.exemptions.exemptions)
    if (e.applies_to_classes.includes(approvedState.passport.as_class)) exemptByControl.set(e.control_ref, e);
  for (const sc of bpb.security_classes) {
    for (const action of sc.actions) {
      const key = `${sc.security_class.class_id}:${action.number}`;
      let status = STATUS.APPLIED;
      const mandatedBaseIds = new Set(action.security_actions.map(sa => sa.control.base_id));
      if ((approvedState.profile.excluded ?? []).includes(key)) status = STATUS.EXCLUDED;
      else if ([...mandatedBaseIds].some(id => exemptByControl.has(id))
        && !(approvedState.profile.exemption_overrides ?? []).includes(key)) status = STATUS.EXEMPT;
      for (const sa of action.security_actions) ids.set(sa.control.id, status);
    }
  }
  for (const enhId of approvedState.profile.enhancements ?? [])
    if (!ids.has(enhId)) ids.set(enhId, STATUS.APPLIED);
  return ids;
}

const CPB_STATUS_MAP = { [STATUS.APPLIED]: 'APPLIED', [STATUS.EXEMPT]: 'EXEMPT', [STATUS.EXCLUDED]: 'EXCLUDED' };

export function buildAssessmentPlan({ approvedState, catalogs, assessmentCatalog }) {
  const items = [];
  const warnings = [];
  const ndControls = indexNdControls(catalogs.ndTzi);
  const applicable = cpbApplicableControlIds(approvedState, catalogs);
  const catalogByControlId = new Map();
  for (const ctrl of assessmentCatalog.controls)
    for (const entry of ctrl.entries) {
      if (!catalogByControlId.has(entry.control_id)) catalogByControlId.set(entry.control_id, []);
      catalogByControlId.get(entry.control_id).push({ ...entry, family: ctrl.family, canonical_control_id: ctrl.canonical_control_id, control_title: ctrl.title });
    }

  for (const [controlId, statusKey] of applicable) {
    const cpb_status = CPB_STATUS_MAP[statusKey];
    const entries = catalogByControlId.get(controlId);
    const ndControl = ndControls.get(controlId);
    if (!entries) {
      warnings.push({ code: 'CATALOG_MISSING', control_id: controlId });
      items.push({
        id: controlId, control_id: controlId, canonical_control_id: ndControl?.canonical_id ?? controlId,
        family: ndControl?.family ?? controlId.slice(0, 2), control_title: ndControl?.title ?? '',
        enhancement: controlId.includes('('), statement_path: null,
        source_statement: '', resolved_statement: '', odp_refs: [], odp_values: {},
        cpb_status, catalog_missing: true, assessment_status: 'NOT_STARTED',
        recommended_methods: [], evidence: [], conclusion: null, assessor_comment: '', finding: null,
      });
      continue;
    }
    const flat = ndControl ? flattenStatementForCatalog(ndControl.catalog?.statement?.items) : [];
    const odpValues = collectControlOdpValues(approvedState, catalogs, controlId);
    for (const entry of entries) {
      const flatLine = entry.statement_path ? flat.find(l => l.path === entry.statement_path) : null;
      const sourceStatement = flatLine ? flatLine.text : (ndControl?.catalog?.statement?.items?.[0]?.text ?? '');
      const { text: resolved, unresolved } = resolveStatement(sourceStatement, odpValues);
      for (const paramId of unresolved) warnings.push({ code: 'ODP_UNRESOLVED', assessment_item_id: entry.id, param_id: paramId });
      const odp_values = {};
      for (const ref of entry.odp_refs) if (odpValues.has(ref)) odp_values[ref] = odpValues.get(ref);
      items.push({
        id: entry.id, control_id: entry.control_id, canonical_control_id: entry.canonical_control_id,
        family: entry.family, control_title: entry.control_title, enhancement: entry.enhancement,
        statement_path: entry.statement_path, source_statement: sourceStatement, resolved_statement: resolved,
        odp_refs: entry.odp_refs, odp_values, cpb_status, catalog_missing: false,
        assessment_status: 'NOT_STARTED', recommended_methods: entry.methods,
        evidence: [], conclusion: null, assessor_comment: '', finding: null,
      });
    }
  }
  return { items, warnings };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/assessment-plan.test.js`
Expected: PASS (5 passing)

- [ ] **Step 5: Commit**

```bash
git add core/assessment/assessment-plan.js test/assessment-plan.test.js
git commit -m "feat(assessment): add buildAssessmentPlan — derives Assessment Items from approved state + assessment catalog"
```

---

## Task 4: `core/assessment/assessment-validator.js` — conclusion/finding validation

**Files:**
- Create: `core/assessment/assessment-validator.js`
- Test: `test/assessment-validator.test.js`

**Interfaces:**
- Consumes: `AssessmentItem` shape from Task 3 (`conclusion`, `evidence`, `finding`, `assessor_comment`).
- Produces (used by Task 5 io and Task 10 UI):
  ```js
  export function validateAssessmentItem(item) // -> string[] (validation error messages, [] if valid)
  export function validateAssessment(assessment) // -> string[] (aggregated errors across all items + top-level schema)
  ```

- [ ] **Step 1: Write the failing test**

```js
// test/assessment-validator.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateAssessmentItem, validateAssessment } from '../core/assessment/assessment-validator.js';

function baseItem(overrides = {}) {
  return { id: 'AC-02.e', conclusion: null, evidence: [], finding: null, assessor_comment: '', ...overrides };
}

test('POSITIVE вимагає щонайменше один доказ', () => {
  const errs = validateAssessmentItem(baseItem({ conclusion: 'POSITIVE', evidence: [] }));
  assert.ok(errs.some(e => /доказ/i.test(e)));
});

test('POSITIVE з доказом — валідний', () => {
  const errs = validateAssessmentItem(baseItem({ conclusion: 'POSITIVE', evidence: [{ id: 'EV-0001' }] }));
  assert.deepEqual(errs, []);
});

test('PARTIALLY_POSITIVE вимагає finding.description', () => {
  const errs = validateAssessmentItem(baseItem({ conclusion: 'PARTIALLY_POSITIVE', evidence: [{ id: 'EV-0001' }], finding: null }));
  assert.ok(errs.some(e => /finding/i.test(e)));
});

test('NEGATIVE вимагає finding.description', () => {
  const errs = validateAssessmentItem(baseItem({ conclusion: 'NEGATIVE', evidence: [{ id: 'EV-0001' }], finding: { description: '' } }));
  assert.ok(errs.some(e => /finding/i.test(e)));
});

test('NOT_APPLICABLE вимагає коментар-обґрунтування', () => {
  const errs = validateAssessmentItem(baseItem({ conclusion: 'NOT_APPLICABLE', assessor_comment: '' }));
  assert.ok(errs.some(e => /обґрунтування|коментар/i.test(e)));
});

test('NOT_ASSESSED не вимагає доказів', () => {
  const errs = validateAssessmentItem(baseItem({ conclusion: 'NOT_ASSESSED' }));
  assert.deepEqual(errs, []);
});

test('validateAssessment агрегує помилки по всіх items', () => {
  const assessment = { kind: 'assessment', items: [baseItem({ conclusion: 'POSITIVE', evidence: [] })] };
  const errs = validateAssessment(assessment);
  assert.equal(errs.length, 1);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/assessment-validator.test.js`
Expected: FAIL — module not found

- [ ] **Step 3: Write minimal implementation**

```js
// core/assessment/assessment-validator.js
export function validateAssessmentItem(item) {
  const errs = [];
  const hasEvidence = Array.isArray(item.evidence) && item.evidence.length > 0;
  switch (item.conclusion) {
    case 'POSITIVE':
      if (!hasEvidence) errs.push(`${item.id}: POSITIVE потребує щонайменше одного доказу`);
      break;
    case 'PARTIALLY_POSITIVE':
      if (!hasEvidence) errs.push(`${item.id}: PARTIALLY_POSITIVE потребує щонайменше одного доказу`);
      if (!item.finding?.description?.trim()) errs.push(`${item.id}: PARTIALLY_POSITIVE потребує finding.description`);
      break;
    case 'NEGATIVE':
      if (!hasEvidence) errs.push(`${item.id}: NEGATIVE потребує щонайменше одного доказу`);
      if (!item.finding?.description?.trim()) errs.push(`${item.id}: NEGATIVE потребує finding.description`);
      break;
    case 'NOT_APPLICABLE':
      if (!item.assessor_comment?.trim()) errs.push(`${item.id}: NOT_APPLICABLE потребує обґрунтування у коментарі`);
      break;
    case 'NOT_ASSESSED':
    case null:
    case undefined:
      break;
    default:
      errs.push(`${item.id}: невідомий conclusion "${item.conclusion}"`);
  }
  return errs;
}

export function validateAssessment(assessment) {
  const errs = [];
  if (assessment.kind !== 'assessment') errs.push('kind має бути "assessment"');
  for (const item of assessment.items ?? []) errs.push(...validateAssessmentItem(item));
  return errs;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/assessment-validator.test.js`
Expected: PASS (7 passing)

- [ ] **Step 5: Commit**

```bash
git add core/assessment/assessment-validator.js test/assessment-validator.test.js
git commit -m "feat(assessment): add assessment-validator — conclusion/finding validation rules"
```

---

## Task 5: `core/assessment/assessment-summary.js` — progress counters

**Files:**
- Create: `core/assessment/assessment-summary.js`
- Test: `test/assessment-summary.test.js`

**Interfaces:**
- Consumes: `assessment.items[]` shape from Task 3.
- Produces (used by Task 9 dashboard and Task 8 DOCX):
  ```js
  export function buildAssessmentSummary(assessment)
  // -> { total, positive, partially_positive, negative, not_applicable, not_assessed, unmapped, has_finding }
  ```

- [ ] **Step 1: Write the failing test**

```js
// test/assessment-summary.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildAssessmentSummary } from '../core/assessment/assessment-summary.js';

test('buildAssessmentSummary рахує за conclusion та unmapped', () => {
  const assessment = {
    items: [
      { conclusion: 'POSITIVE', catalog_missing: false, finding: null },
      { conclusion: 'NEGATIVE', catalog_missing: false, finding: { description: 'x' } },
      { conclusion: null, catalog_missing: true, finding: null },
      { conclusion: null, catalog_missing: false, finding: null },
    ],
  };
  const s = buildAssessmentSummary(assessment);
  assert.equal(s.total, 4);
  assert.equal(s.positive, 1);
  assert.equal(s.negative, 1);
  assert.equal(s.not_assessed, 2);
  assert.equal(s.unmapped, 1);
  assert.equal(s.has_finding, 1);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/assessment-summary.test.js`
Expected: FAIL — module not found

- [ ] **Step 3: Write minimal implementation**

```js
// core/assessment/assessment-summary.js
export function buildAssessmentSummary(assessment) {
  const items = assessment.items ?? [];
  const count = (pred) => items.filter(pred).length;
  return {
    total: items.length,
    positive: count(i => i.conclusion === 'POSITIVE'),
    partially_positive: count(i => i.conclusion === 'PARTIALLY_POSITIVE'),
    negative: count(i => i.conclusion === 'NEGATIVE'),
    not_applicable: count(i => i.conclusion === 'NOT_APPLICABLE'),
    not_assessed: count(i => !i.conclusion),
    unmapped: count(i => i.catalog_missing),
    has_finding: count(i => i.finding?.description?.trim()),
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/assessment-summary.test.js`
Expected: PASS (1 passing)

- [ ] **Step 5: Commit**

```bash
git add core/assessment/assessment-summary.js test/assessment-summary.test.js
git commit -m "feat(assessment): add buildAssessmentSummary — progress counters by conclusion"
```

---

## Task 6: `core/assessment/assessment-io.js` — serialize/deserialize/validate

**Files:**
- Create: `core/assessment/assessment-io.js`
- Test: `test/assessment-io.test.js`

**Interfaces:**
- Consumes: `validateAssessment` from Task 4.
- Produces (used by Task 7 server routes):
  ```js
  export function makeAssessment({ approvedRecord, approvedName, items, warnings }) // -> full assessment.json object
  export function serializeAssessment(assessment) // -> JSON string (pretty, 2-space)
  export function deserializeAssessment(jsonText) // -> object (throws on invalid JSON)
  export function validateAssessmentSchema(obj) // -> string[] (structural checks, delegates conclusion rules to validateAssessment)
  export function nextAssessmentId(existingIds) // -> "ASSESS-<year>-NNN", zero-padded 3 digits, per-year sequence
  ```

- [ ] **Step 1: Write the failing test**

```js
// test/assessment-io.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeAssessment, serializeAssessment, deserializeAssessment, validateAssessmentSchema, nextAssessmentId } from '../core/assessment/assessment-io.js';

test('nextAssessmentId генерує послідовний ID за роком', () => {
  const year = new Date().getFullYear();
  assert.equal(nextAssessmentId([]), `ASSESS-${year}-001`);
  assert.equal(nextAssessmentId([`ASSESS-${year}-001`, `ASSESS-${year}-002`]), `ASSESS-${year}-003`);
  assert.equal(nextAssessmentId([`ASSESS-${year - 1}-005`]), `ASSESS-${year}-001`);
});

test('makeAssessment/serialize/deserialize round-trip', () => {
  const approvedRecord = { kind: 'approved', approved_at: '2026-01-01T00:00:00.000Z',
    state: { passport: { ics_name: 'Т', as_class: 1 }, info_type: 'service' }, summary: {} };
  const assessment = makeAssessment({ approvedRecord, approvedName: 'тест', items: [], warnings: [] });
  assert.equal(assessment.kind, 'assessment');
  assert.equal(assessment.metadata.ics_name, 'Т');
  assert.equal(assessment.cpb_snapshot.source_approved_name, 'тест');
  const json = serializeAssessment(assessment);
  const back = deserializeAssessment(json);
  assert.deepEqual(back, assessment);
});

test('validateAssessmentSchema виявляє відсутній kind', () => {
  const errs = validateAssessmentSchema({ items: [] });
  assert.ok(errs.some(e => /kind/i.test(e)));
});

test('deserializeAssessment кидає на биту JSON', () => {
  assert.throws(() => deserializeAssessment('{ not json'));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/assessment-io.test.js`
Expected: FAIL — module not found

- [ ] **Step 3: Write minimal implementation**

```js
// core/assessment/assessment-io.js
import { validateAssessment } from './assessment-validator.js';

export function nextAssessmentId(existingIds) {
  const year = new Date().getFullYear();
  const nums = existingIds
    .map(id => id.match(new RegExp(`^ASSESS-${year}-(\\d+)$`)))
    .filter(Boolean)
    .map(m => Number(m[1]));
  const next = (nums.length ? Math.max(...nums) : 0) + 1;
  return `ASSESS-${year}-${String(next).padStart(3, '0')}`;
}

export function makeAssessment({ approvedRecord, approvedName, items, warnings, id }) {
  const now = new Date().toISOString();
  return {
    kind: 'assessment',
    schema_version: '1.0.0',
    id: id ?? nextAssessmentId([]),
    created_at: now,
    updated_at: now,
    status: 'IN_PROGRESS',
    metadata: {
      ics_name: approvedRecord.state.passport?.ics_name ?? '',
      as_class: approvedRecord.state.passport?.as_class ?? null,
      info_type: approvedRecord.state.info_type ?? null,
      assessment_body: '',
      assessor_name: '',
      assessor_position: '',
      assessment_start_date: now.slice(0, 10),
      assessment_end_date: '',
    },
    cpb_snapshot: {
      source_approved_name: approvedName,
      relative_path: 'cpb-snapshot.json',
      hash: '',
    },
    warnings: warnings ?? [],
    items,
  };
}

export function serializeAssessment(assessment) {
  return JSON.stringify(assessment, null, 2);
}

export function deserializeAssessment(jsonText) {
  return JSON.parse(jsonText);
}

export function validateAssessmentSchema(obj) {
  const errs = [];
  if (!obj || typeof obj !== 'object') return ['assessment має бути об\u02BCєктом'];
  if (obj.kind !== 'assessment') errs.push('Відсутній або невірний kind (очікується "assessment")');
  if (!obj.id) errs.push('Відсутній id');
  if (!Array.isArray(obj.items)) errs.push('items має бути масивом');
  else errs.push(...validateAssessment(obj));
  return errs;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/assessment-io.test.js`
Expected: PASS (4 passing)

- [ ] **Step 5: Commit**

```bash
git add core/assessment/assessment-io.js test/assessment-io.test.js
git commit -m "feat(assessment): add assessment-io — assessment.json creation, serialization, schema validation"
```

---

## Task 7: `core/docx/assessment-docx-writer.js` — DOCX report

**Files:**
- Create: `core/docx/assessment-docx-writer.js`
- Test: `test/assessment-docx-writer.test.js`

**Interfaces:**
- Consumes: `escapeXml, run, par, parRuns, cell, cellXml, row, table` from `core/docx/docx-writer.js` (exported already); `createZip` from `core/docx/zip-writer.js` (via docx-writer's existing `packDocx`-style pattern — duplicate the minimal packaging here since `packDocx` is not exported, following the same structure as `buildDocx`).
- Produces (used by Task 8 server route):
  ```js
  export function buildAssessmentDocx({ assessment }) // -> Buffer (valid .docx/.zip)
  ```

- [ ] **Step 1: Write the failing test**

```js
// test/assessment-docx-writer.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildAssessmentDocx } from '../core/docx/assessment-docx-writer.js';

function sampleAssessment() {
  return {
    id: 'ASSESS-2026-001',
    metadata: { ics_name: 'Тест АС', as_class: 1, info_type: 'service', assessor_name: 'Іванов І.І.' },
    items: [
      {
        id: 'AC-02.e', control_id: 'AC-02', family: 'AC', catalog_missing: false,
        resolved_statement: 'Вимагати схвалення керівником СЗІ запитів.',
        conclusion: 'POSITIVE', assessor_comment: 'Перевірено',
        evidence: [{ method: 'EXAMINE', source_type: 'POLICY', title: 'Політика ІБ', reference: 'п.4.2', observation: 'Відповідає', comment: '' }],
        finding: null,
      },
      {
        id: 'AC-99.z', control_id: 'AC-99', family: 'AC', catalog_missing: true,
        resolved_statement: '', conclusion: null, assessor_comment: '', evidence: [], finding: null,
      },
    ],
  };
}

test('buildAssessmentDocx повертає валідний ZIP/DOCX, що проходить unzip -t', () => {
  const buf = buildAssessmentDocx({ assessment: sampleAssessment() });
  const dir = mkdtempSync(join(tmpdir(), 'assess-docx-'));
  const file = join(dir, 'a.docx');
  writeFileSync(file, buf);
  assert.match(execFileSync('unzip', ['-t', file], { encoding: 'utf8' }), /No errors detected/);
});

test('document.xml містить control id, resolved statement, висновок та докази', () => {
  const buf = buildAssessmentDocx({ assessment: sampleAssessment() });
  const dir = mkdtempSync(join(tmpdir(), 'assess-docx-'));
  const file = join(dir, 'a.docx');
  writeFileSync(file, buf);
  const xml = execFileSync('unzip', ['-p', file, 'word/document.xml'], { encoding: 'utf8' });
  assert.match(xml, /AC-02\.e/);
  assert.match(xml, /Вимагати схвалення керівником СЗІ запитів/);
  assert.match(xml, /Позитивно/);
  assert.match(xml, /Дослідження/);
  assert.match(xml, /Політика ІБ/);
});

test('UNMAPPED_CONTROL item друкує попередження замість resolved_statement', () => {
  const buf = buildAssessmentDocx({ assessment: sampleAssessment() });
  const dir = mkdtempSync(join(tmpdir(), 'assess-docx-'));
  const file = join(dir, 'a.docx');
  writeFileSync(file, buf);
  const xml = execFileSync('unzip', ['-p', file, 'word/document.xml'], { encoding: 'utf8' });
  assert.match(xml, /AC-99\.z/);
  assert.match(xml, /Методика оцінювання для цього заходу не визначена у локальному каталозі/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/assessment-docx-writer.test.js`
Expected: FAIL — module not found

- [ ] **Step 3: Write minimal implementation**

```js
// core/docx/assessment-docx-writer.js
import { createZip } from './zip-writer.js';
import { escapeXml, run, par, parRuns, cell, cellXml, row, table } from './docx-writer.js';

const METHOD_LABELS = { EXAMINE: 'Дослідження', INTERVIEW: 'Опитування', TEST: 'Випробування', OBSERVE: 'Спостереження' };
const CONCLUSION_LABELS = {
  POSITIVE: 'Позитивно', PARTIALLY_POSITIVE: 'Частково позитивно', NEGATIVE: 'Негативно',
  NOT_APPLICABLE: 'Не застосовується', NOT_ASSESSED: 'Не оцінено',
};

function evidenceBlockText(item) {
  const byMethod = new Map();
  for (const ev of item.evidence ?? []) {
    if (!byMethod.has(ev.method)) byMethod.set(ev.method, []);
    byMethod.get(ev.method).push(ev);
  }
  const blocks = [];
  for (const [method, list] of byMethod) {
    const lines = list.map(ev => [ev.title, ev.reference, ev.observation].filter(Boolean).join(' — ')).join('\n');
    blocks.push(`${METHOD_LABELS[method] ?? method}:\n${lines}`);
  }
  if (item.assessor_comment?.trim()) blocks.push(`Коментар оцінювача:\n${item.assessor_comment.trim()}`);
  return blocks.join('\n\n');
}

function itemRow(item) {
  const reqText = item.catalog_missing
    ? `${item.id}\n\nМетодика оцінювання для цього заходу не визначена у локальному каталозі.`
    : `${item.id}\n\n${item.resolved_statement ?? ''}`;
  const conclusionText = item.conclusion ? (CONCLUSION_LABELS[item.conclusion] ?? item.conclusion) : 'Не оцінено';
  return row([
    cell(item.control_id, {}),
    cell(reqText, {}),
    cell(conclusionText, {}),
    cell(evidenceBlockText(item), {}),
  ]);
}

function packAssessmentDocx(documentXml) {
  return createZip([
    { path: '[Content_Types].xml', content:
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
      `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
      `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
      `<Default Extension="xml" ContentType="application/xml"/>` +
      `<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>` },
    { path: '_rels/.rels', content:
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
      `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
      `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>` },
    { path: 'word/_rels/document.xml.rels', content:
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
      `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"></Relationships>` },
    { path: 'word/document.xml', content:
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
      `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" ` +
      `xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">` +
      `<w:body>${documentXml}</w:body></w:document>` },
  ]);
}

export function buildAssessmentDocx({ assessment }) {
  const title = par(`Звіт з оцінювання ІКС «${assessment.metadata?.ics_name ?? ''}»`, { bold: true });
  const meta = par(`Оцінювач: ${assessment.metadata?.assessor_name ?? ''}  Клас АС: ${assessment.metadata?.as_class ?? ''}`);
  const header = row([
    cell('№ заходу захисту', { header: true }),
    cell('Оцінювання', { header: true }),
    cell('Висновок з оцінювання', { header: true }),
    cell('Докази, джерела отримання відомостей, коментарі оцінювача', { header: true }),
  ], { header: true });
  const rows = [header, ...assessment.items.map(itemRow)];
  const body = title + meta + table(rows);
  return packAssessmentDocx(body);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/assessment-docx-writer.test.js`
Expected: PASS (3 passing)

- [ ] **Step 5: Commit**

```bash
git add core/docx/assessment-docx-writer.js test/assessment-docx-writer.test.js
git commit -m "feat(assessment): add assessment-docx-writer — generates Assessment Report DOCX from assessment.json"
```

---

## Task 8: Server API — `/api/assessments*` routes

**Files:**
- Modify: `server.js`
- Test: `test/server-assessment.test.js`

**Interfaces:**
- Consumes: `buildAssessmentPlan` (Task 3), `makeAssessment`/`serializeAssessment`/`deserializeAssessment`/`validateAssessmentSchema`/`nextAssessmentId` (Task 6), `validateAssessment`/`validateAssessmentItem` (Task 4), `buildAssessmentDocx` (Task 7), existing `validateTemplate` (already imported), existing `NAME_RE`/`readBody`/`json` helpers.
- Produces (used by Task 9-11 UI):
  ```text
  GET    /api/assessments                       -> { items: [{id, ics_name, as_class, info_type, status, created_at, updated_at, summary}] }
  POST   /api/assessments                        body: { approved_name } -> creates assessment from templates/approved/<approved_name>.json, 201 { id }
  GET    /api/assessments/:id                    -> full assessment.json
  PUT    /api/assessments/:id                    body: full assessment object -> validates schema, 400 on invalid, else saves + updated_at, 200 {ok:true}
  POST   /api/assessments/:id/evidence           body: raw bytes, query ?filename=EV-0001.pdf&item_id=AC-02.e -> saves to assessments/<id>/evidence/, 200 {ok:true, filename}
  DELETE /api/assessments/:id/evidence/:file      -> removes file, 200 {ok:true}
  POST   /api/assessments/:id/export/docx        -> streams DOCX (Content-Disposition attachment), also writes to exports/assessments/
  ```
  All routes reuse `NAME_RE` for `:id` and `:file` (assessment ids follow `ASSESS-YYYY-NNN`, matched by a dedicated `ASSESSMENT_ID_RE`), reject path traversal, and are loopback-only (inherited from existing server bind).

- [ ] **Step 1: Write the failing test**

```js
// test/server-assessment.test.js
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { rmSync, mkdirSync, writeFileSync } from 'node:fs';

let proc;
const BASE = 'http://127.0.0.1:34568';

before(async () => {
  mkdirSync('templates/approved', { recursive: true });
  writeFileSync('templates/approved/тест-оцінка-джерело.json', JSON.stringify({
    kind: 'approved', approved_at: '2026-01-01T00:00:00.000Z',
    summary: {}, state: {
      passport: { ics_name: 'Тест АС', as_class: 1 }, info_type: 'service',
      global_constants: {}, selected_assets: ['A-01'], risks: { accepted_base: [], custom: [] },
      profile: { param_overrides: {}, enhancements: [], excluded: [], exemption_overrides: [], exemption_note_overrides: {} },
    },
  }));
  proc = spawn('node', ['server.js'], { env: { ...process.env, PORT: '34568' } });
  await new Promise((res) => proc.stdout.on('data', (d) => d.toString().includes('listening') && res()));
});
after(() => {
  proc.kill();
  rmSync('templates/approved/тест-оцінка-джерело.json', { force: true });
  rmSync('assessments', { recursive: true, force: true });
  rmSync('exports/assessments', { recursive: true, force: true });
});

let createdId;

test('POST /api/assessments створює оцінювання зі затвердженого запису', async () => {
  const r = await fetch(BASE + '/api/assessments', { method: 'POST', body: JSON.stringify({ approved_name: 'тест-оцінка-джерело' }) });
  assert.equal(r.status, 201);
  const body = await r.json();
  assert.match(body.id, /^ASSESS-\d{4}-\d{3}$/);
  createdId = body.id;
});

test('GET /api/assessments/:id повертає повний assessment зі знімком items', async () => {
  const r = await fetch(BASE + '/api/assessments/' + createdId);
  assert.equal(r.status, 200);
  const a = await r.json();
  assert.equal(a.kind, 'assessment');
  assert.ok(a.items.length > 0);
});

test('GET /api/assessments містить створений запис у списку', async () => {
  const r = await fetch(BASE + '/api/assessments');
  const { items } = await r.json();
  assert.ok(items.some(i => i.id === createdId));
});

test('PUT /api/assessments/:id зберігає зміни', async () => {
  const got = await (await fetch(BASE + '/api/assessments/' + createdId)).json();
  got.metadata.assessor_name = 'Петренко П.П.';
  const r = await fetch(BASE + '/api/assessments/' + createdId, { method: 'PUT', body: JSON.stringify(got) });
  assert.equal(r.status, 200);
  const reGot = await (await fetch(BASE + '/api/assessments/' + createdId)).json();
  assert.equal(reGot.metadata.assessor_name, 'Петренко П.П.');
});

test('PUT відхиляє некоректний assessment (400)', async () => {
  const r = await fetch(BASE + '/api/assessments/' + createdId, { method: 'PUT', body: JSON.stringify({ kind: 'wrong' }) });
  assert.equal(r.status, 400);
});

test('POST evidence зберігає файл, DELETE прибирає', async () => {
  const up = await fetch(BASE + '/api/assessments/' + createdId + '/evidence?filename=EV-0001.txt', {
    method: 'POST', body: 'доказ' });
  assert.equal(up.status, 200);
  const del = await fetch(BASE + '/api/assessments/' + createdId + '/evidence/EV-0001.txt', { method: 'DELETE' });
  assert.equal(del.status, 200);
});

test('POST evidence відхиляє заборонене розширення', async () => {
  const r = await fetch(BASE + '/api/assessments/' + createdId + '/evidence?filename=evil.exe', { method: 'POST', body: 'x' });
  assert.equal(r.status, 400);
});

test('POST evidence відхиляє path traversal у імені файлу', async () => {
  const r = await fetch(BASE + '/api/assessments/' + createdId + '/evidence?filename=..%2F..%2Fevil.txt', { method: 'POST', body: 'x' });
  assert.equal(r.status, 400);
});

test('POST export/docx повертає DOCX', async () => {
  const r = await fetch(BASE + '/api/assessments/' + createdId + '/export/docx', { method: 'POST' });
  assert.equal(r.status, 200);
  assert.match(r.headers.get('content-type'), /wordprocessingml/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/server-assessment.test.js`
Expected: FAIL — 404s (routes don't exist yet)

- [ ] **Step 3: Write minimal implementation**

Add near the top of `server.js` (after existing imports):

```js
import { buildAssessmentPlan } from './core/assessment/assessment-plan.js';
import { makeAssessment, serializeAssessment, deserializeAssessment, validateAssessmentSchema, nextAssessmentId } from './core/assessment/assessment-io.js';
import { buildAssessmentDocx } from './core/docx/assessment-docx-writer.js';
```

Add a constant near `NAME_RE`:

```js
const ASSESSMENT_ID_RE = /^ASSESS-\d{4}-\d{3}$/;
const EVIDENCE_EXT_ALLOWLIST = new Set(['.pdf', '.png', '.jpg', '.jpeg', '.txt', '.log', '.json']);
```

Insert a new branch inside the `if (parts[0] === 'api')` block, after the existing `templates` branch and before `export`:

```js
      if (parts[1] === 'assessments') {
        const assessDir = join(ROOT, 'assessments');
        if (parts.length === 2 && req.method === 'GET') {
          await mkdir(assessDir, { recursive: true });
          const dirs = await readdir(assessDir, { withFileTypes: true });
          const items = [];
          for (const d of dirs) {
            if (!d.isDirectory()) continue;
            try {
              const a = JSON.parse(await readFile(join(assessDir, d.name, 'assessment.json'), 'utf8'));
              items.push({ id: a.id, ics_name: a.metadata?.ics_name, as_class: a.metadata?.as_class,
                info_type: a.metadata?.info_type, status: a.status, created_at: a.created_at, updated_at: a.updated_at });
            } catch { /* пошкоджений запис — пропустити */ }
          }
          return json(res, 200, { items });
        }
        if (parts.length === 2 && req.method === 'POST') {
          const body = JSON.parse((await readBody(req)).toString('utf8'));
          const approvedName = body.approved_name;
          if (!approvedName || !NAME_RE.test(approvedName)) return json(res, 400, { error: 'некоректне ім\u02BCя затвердженого запису' });
          let approvedRecord;
          try { approvedRecord = JSON.parse(await readFile(join(ROOT, 'templates', 'approved', approvedName + '.json'), 'utf8')); }
          catch { return json(res, 404, { error: 'затверджений запис не знайдено' }); }
          if (validateTemplate('approved', approvedRecord).length) return json(res, 400, { error: 'затверджений запис пошкоджено' });
          const catalogs = await catalogsPromise;
          const assessmentCatalog = JSON.parse(await readFile(join(ROOT, 'data', 'assessment_catalog.json'), 'utf8'));
          const { items, warnings } = buildAssessmentPlan({ approvedState: approvedRecord.state, catalogs, assessmentCatalog });
          await mkdir(assessDir, { recursive: true });
          const existing = (await readdir(assessDir, { withFileTypes: true })).filter(d => d.isDirectory()).map(d => d.name);
          const id = nextAssessmentId(existing);
          const assessment = makeAssessment({ approvedRecord, approvedName, items, warnings, id });
          const dir = join(assessDir, id);
          await mkdir(join(dir, 'evidence'), { recursive: true });
          await writeFile(join(dir, 'assessment.json'), serializeAssessment(assessment));
          await writeFile(join(dir, 'cpb-snapshot.json'), JSON.stringify(approvedRecord, null, 2));
          return json(res, 201, { id });
        }
        const id = parts[2];
        if (id && !ASSESSMENT_ID_RE.test(id)) return json(res, 400, { error: 'некоректний assessment id' });
        const dir = id ? join(assessDir, id) : null;
        if (parts.length === 3 && req.method === 'GET') {
          try { return json(res, 200, JSON.parse(await readFile(join(dir, 'assessment.json'), 'utf8'))); }
          catch { return json(res, 404, { error: 'оцінювання не знайдено' }); }
        }
        if (parts.length === 3 && req.method === 'PUT') {
          let body;
          try { body = deserializeAssessment((await readBody(req)).toString('utf8')); }
          catch { return json(res, 400, { error: 'некоректний JSON' }); }
          const errors = validateAssessmentSchema(body);
          if (errors.length) return json(res, 400, { error: errors.join('; ') });
          body.updated_at = new Date().toISOString();
          await writeFile(join(dir, 'assessment.json'), serializeAssessment(body));
          return json(res, 200, { ok: true });
        }
        if (parts[3] === 'evidence' && parts.length === 4 && req.method === 'POST') {
          const filename = url.searchParams.get('filename');
          if (!filename || filename.includes('/') || filename.includes('..'))
            return json(res, 400, { error: 'некоректне ім\u02BCя файлу' });
          if (!EVIDENCE_EXT_ALLOWLIST.has(extname(filename).toLowerCase()))
            return json(res, 400, { error: 'заборонене розширення файлу' });
          const buf = await readBody(req, 20_000_000);
          const evDir = join(dir, 'evidence');
          await mkdir(evDir, { recursive: true });
          await writeFile(join(evDir, filename), buf);
          return json(res, 200, { ok: true, filename });
        }
        if (parts[3] === 'evidence' && parts.length === 5 && req.method === 'DELETE') {
          const filename = parts[4];
          if (filename.includes('/') || filename.includes('..')) return json(res, 400, { error: 'некоректне ім\u02BCя файлу' });
          try { await (await import('node:fs/promises')).unlink(join(dir, 'evidence', filename)); return json(res, 200, { ok: true }); }
          catch { return json(res, 404, { error: 'файл не знайдено' }); }
        }
        if (parts[3] === 'export' && parts[4] === 'docx' && req.method === 'POST') {
          let assessment;
          try { assessment = JSON.parse(await readFile(join(dir, 'assessment.json'), 'utf8')); }
          catch { return json(res, 404, { error: 'оцінювання не знайдено' }); }
          const buf = buildAssessmentDocx({ assessment });
          await mkdir(join(ROOT, 'exports', 'assessments'), { recursive: true });
          await writeFile(join(ROOT, 'exports', 'assessments', `${assessment.id}.docx`), buf);
          res.writeHead(200, {
            'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(assessment.id + '.docx')}`,
          });
          return res.end(buf);
        }
        return json(res, 404, { error: 'not found' });
      }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/server-assessment.test.js`
Expected: PASS (9 passing)

- [ ] **Step 5: Run the full existing test suite to check for regressions**

Run: `npm test`
Expected: all suites (including pre-existing `server.test.js`) still PASS

- [ ] **Step 6: Commit**

```bash
git add server.js test/server-assessment.test.js
git commit -m "feat(assessment): add /api/assessments routes — create from approved record, CRUD, evidence upload/delete, DOCX export"
```

---

## Task 9: Public UI — mode switcher + assessment landing/dashboard

**Files:**
- Modify: `public/index.html`
- Modify: `public/js/app.js`
- Create: `public/js/assessment/assessment-state.js`
- Create: `public/js/assessment/assessment-app.js`
- Create: `public/js/assessment/assessment-dashboard.js`
- Modify: `public/css/app.css`

**Interfaces:**
- Consumes: `/api/assessments`, `/api/templates/approved` (existing), `/api/assessments` POST (Task 8).
- Produces (used by Task 10):
  ```js
  // assessment-state.js
  export const getAssessment = () => assessment; // current loaded assessment.json or null
  export function setAssessment(patch) // function or object merge, same pattern as public/js/state.js
  export async function loadAssessment(id)
  export async function saveAssessment() // PUT with debounce, exported for manual "Зберегти" if needed
  export function subscribe(fn)

  // assessment-app.js
  export function mountAssessmentApp(rootEl) // renders landing/dashboard/item views, owns its own tiny router
  ```

- [ ] **Step 1: Write the failing test**

Given this is primarily DOM wiring without a virtual DOM test harness in this codebase (existing UI steps are tested only indirectly via `test/*.test.js` for core logic — see `test/profile-engine.test.js` pattern of testing `core/` not `public/js/steps/*`), write a `node --test` unit test for the state module only (the part with pure logic):

```js
// test/assessment-state.test.js
// Note: assessment-state.js runs in browser (uses fetch/localStorage-free debounce logic extracted here for testability)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeDebounceDelay } from '../public/js/assessment/assessment-state.js';

test('computeDebounceDelay повертає 500мс за замовчуванням', () => {
  assert.equal(computeDebounceDelay(), 500);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/assessment-state.test.js`
Expected: FAIL — module not found

- [ ] **Step 3: Write minimal implementation**

```js
// public/js/assessment/assessment-state.js
let assessment = null;
const listeners = new Set();
let saveTimer = null;

export const computeDebounceDelay = () => 500;

export const getAssessment = () => assessment;

export function setAssessment(patch) {
  assessment = typeof patch === 'function' ? patch(assessment) : { ...assessment, ...patch };
  for (const fn of listeners) fn(assessment);
  scheduleSave();
}

export function subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); }

export async function loadAssessment(id) {
  const r = await fetch(`/api/assessments/${encodeURIComponent(id)}`);
  if (!r.ok) throw new Error((await r.json()).error ?? 'не вдалося завантажити оцінювання');
  assessment = await r.json();
  for (const fn of listeners) fn(assessment);
  return assessment;
}

function scheduleSave() {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(saveAssessment, computeDebounceDelay());
}

export async function saveAssessment() {
  if (!assessment) return;
  await fetch(`/api/assessments/${encodeURIComponent(assessment.id)}`, { method: 'PUT', body: JSON.stringify(assessment) });
}
```

```js
// public/js/assessment/assessment-dashboard.js
import { el } from '../render/dom.js';

export function renderLanding(container, { onOpen }) {
  const listBox = el('div', { class: 'approved-panel' }, el('p', {}, 'Завантаження…'));
  (async () => {
    const { items } = await (await fetch('/api/assessments')).json();
    if (!items.length) { listBox.replaceChildren(el('p', {}, 'Оцінювань ще немає.')); }
    else listBox.replaceChildren(...items.map(it => el('article', { class: 'approved-item' },
      el('header', {},
        el('strong', {}, `${it.ics_name} (${it.id})`),
        el('span', { class: 'badge' }, it.status),
        el('button', { type: 'button', onclick: () => onOpen(it.id) }, 'Відкрити')))));
  })();

  const approvedSelect = el('select', {});
  (async () => {
    const { items } = await (await fetch('/api/templates/approved')).json();
    approvedSelect.replaceChildren(
      el('option', { value: '' }, '— оберіть затверджений запис —'),
      ...items.map(it => el('option', { value: it.name }, `${it.ics_name} (${it.name})`)));
  })();
  const newBtn = el('button', { type: 'button', class: 'primary', onclick: async () => {
    if (!approvedSelect.value) return;
    const r = await fetch('/api/assessments', { method: 'POST', body: JSON.stringify({ approved_name: approvedSelect.value }) });
    if (!r.ok) { alert((await r.json()).error); return; }
    const { id } = await r.json();
    onOpen(id);
  } }, 'Нове оцінювання');

  container.replaceChildren(el('section', {},
    el('h2', {}, 'Оцінювання ІКС'),
    el('div', { class: 'actions' }, approvedSelect, newBtn),
    el('h3', {}, 'Наявні оцінювання'),
    listBox));
}
```

```js
// public/js/assessment/assessment-app.js
import { el } from '../render/dom.js';
import { loadAssessment } from './assessment-state.js';
import { renderLanding } from './assessment-dashboard.js';

export function mountAssessmentApp(rootEl) {
  const view = (id) => {
    rootEl.replaceChildren();
    if (!id) return renderLanding(rootEl, { onOpen: (openedId) => view(openedId) });
    loadAssessment(id).then(() => import('./assessment-item.js')).then(({ renderDashboard }) =>
      renderDashboard(rootEl, { onBack: () => view(null) }));
  };
  view(null);
}
```

Add a mode switcher in `public/index.html` (replace the `<main id="step-container"></main>` line):

```html
  <nav class="mode-switch">
    <button id="mode-cpb" type="button" class="active">Формування ЦПБ</button>
    <button id="mode-assessment" type="button">Оцінювання ІКС</button>
  </nav>
  <main id="step-container"></main>
  <main id="assessment-container" hidden></main>
```

In `public/js/app.js`, at the bottom of the file after the existing IIFE, wire the switch:

```js
document.getElementById('mode-assessment').addEventListener('click', async () => {
  document.getElementById('mode-assessment').classList.add('active');
  document.getElementById('mode-cpb').classList.remove('active');
  document.getElementById('step-container').hidden = true;
  document.getElementById('stepper').hidden = true;
  document.querySelector('footer').hidden = true;
  const assessContainer = document.getElementById('assessment-container');
  assessContainer.hidden = false;
  const { mountAssessmentApp } = await import('./assessment/assessment-app.js');
  mountAssessmentApp(assessContainer);
});
document.getElementById('mode-cpb').addEventListener('click', () => {
  document.getElementById('mode-cpb').classList.add('active');
  document.getElementById('mode-assessment').classList.remove('active');
  document.getElementById('step-container').hidden = false;
  document.getElementById('stepper').hidden = false;
  document.querySelector('footer').hidden = false;
  document.getElementById('assessment-container').hidden = true;
});
```

Add minimal CSS to `public/css/app.css`:

```css
.mode-switch { display: flex; gap: 0.5rem; padding: 0.5rem 1rem; background: #edf2f7; }
.mode-switch button.active { background: #2c5282; color: #fff; }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/assessment-state.test.js`
Expected: PASS (1 passing)

- [ ] **Step 5: Commit**

```bash
git add public/index.html public/js/app.js public/js/assessment/assessment-state.js public/js/assessment/assessment-app.js public/js/assessment/assessment-dashboard.js public/css/app.css test/assessment-state.test.js
git commit -m "feat(assessment): add mode switcher and Assessment landing/dashboard — create assessment from approved record, list existing"
```

---

## Task 10: Assessment Item UI + Evidence CRUD

**Files:**
- Create: `public/js/assessment/assessment-item.js`
- Create: `public/js/assessment/evidence-editor.js`
- Modify: `public/css/app.css`

**Interfaces:**
- Consumes: `getAssessment/setAssessment/subscribe` from Task 9's `assessment-state.js`; `validateAssessmentItem` from Task 4 (import directly from `/core/assessment/assessment-validator.js`, same cross-origin-free pattern as existing `import { buildProfile } from '/core/profile-engine.js'` in `public/js/steps/step6-verify.js`).
- Produces:
  ```js
  // assessment-item.js
  export function renderDashboard(container, { onBack }) // family/control/objective tree navigation + summary badges + item detail panel
  // evidence-editor.js
  export function renderEvidenceEditor(container, item, onChange) // list + add-evidence form (EXAMINE/INTERVIEW/TEST/OBSERVE fields per spec §21)
  ```

- [ ] **Step 1: Write the failing test**

The evidence id-generation logic is pure and testable:

```js
// test/evidence-editor.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nextEvidenceId } from '../public/js/assessment/evidence-editor.js';

test('nextEvidenceId генерує послідовний ID у межах item', () => {
  assert.equal(nextEvidenceId([]), 'EV-0001');
  assert.equal(nextEvidenceId([{ id: 'EV-0001' }, { id: 'EV-0002' }]), 'EV-0003');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/evidence-editor.test.js`
Expected: FAIL — module not found

- [ ] **Step 3: Write minimal implementation**

```js
// public/js/assessment/evidence-editor.js
import { el } from '../render/dom.js';

export function nextEvidenceId(existing) {
  const nums = existing.map(e => Number((e.id ?? '').replace('EV-', ''))).filter(n => !Number.isNaN(n));
  return `EV-${String((nums.length ? Math.max(...nums) : 0) + 1).padStart(4, '0')}`;
}

const METHOD_LABELS = { EXAMINE: 'Дослідження', INTERVIEW: 'Опитування', TEST: 'Випробування', OBSERVE: 'Спостереження' };
const EVIDENCE_TYPES = ['POLICY', 'PROCEDURE', 'ORDER', 'DOCUMENT', 'REGISTER', 'LIST', 'ROLE_MATRIX',
  'ACCESS_REQUEST', 'LOG', 'SYSTEM_CONFIGURATION', 'SCREENSHOT', 'INTERVIEW', 'TEST_RESULT', 'PHYSICAL_INSPECTION', 'OTHER'];

export function renderEvidenceEditor(container, item, onChange) {
  const list = el('ul', { class: 'custom-list' },
    ...item.evidence.map(ev => el('li', {},
      `${METHOD_LABELS[ev.method] ?? ev.method} — ${ev.title || ev.source_type}: ${ev.observation || ''}`,
      el('button', { type: 'button', class: 'link-btn', onclick: () => {
        item.evidence = item.evidence.filter(e => e.id !== ev.id);
        onChange();
      } }, '✕'))));

  const methodSel = el('select', {}, ...Object.entries(METHOD_LABELS).map(([v, label]) => el('option', { value: v }, label)));
  const typeSel = el('select', {}, ...EVIDENCE_TYPES.map(t => el('option', { value: t }, t)));
  const titleInput = el('input', { type: 'text', placeholder: 'Назва / джерело' });
  const refInput = el('input', { type: 'text', placeholder: 'Реквізити (розділ, пункт)' });
  const obsInput = el('textarea', { rows: '2', placeholder: 'Результат дослідження/опитування/випробування/спостереження' });
  const addBtn = el('button', { type: 'button', onclick: () => {
    item.evidence.push({
      id: nextEvidenceId(item.evidence), method: methodSel.value, source_type: typeSel.value,
      title: titleInput.value, reference: refInput.value, source_date: '', observation: obsInput.value,
      comment: '', attachment: null,
    });
    titleInput.value = ''; refInput.value = ''; obsInput.value = '';
    onChange();
  } }, '+ Додати доказ');

  container.replaceChildren(list, el('div', { class: 'evidence-form' }, methodSel, typeSel, titleInput, refInput, obsInput, addBtn));
}
```

```js
// public/js/assessment/assessment-item.js
import { el } from '../render/dom.js';
import { getAssessment, setAssessment } from './assessment-state.js';
import { renderEvidenceEditor } from './evidence-editor.js';

const CONCLUSIONS = [
  ['', '— оберіть —'], ['POSITIVE', 'Позитивно'], ['PARTIALLY_POSITIVE', 'Частково позитивно'],
  ['NEGATIVE', 'Негативно'], ['NOT_APPLICABLE', 'Не застосовується'], ['NOT_ASSESSED', 'Не оцінено'],
];

function itemDetail(item, rerender) {
  const conclusionSel = el('select', {}, ...CONCLUSIONS.map(([v, l]) => el('option', { value: v, ...(item.conclusion === v ? { selected: '' } : {}) }, l)));
  conclusionSel.addEventListener('change', () => {
    setAssessment(a => { item.conclusion = conclusionSel.value || null; return { ...a }; });
    rerender();
  });
  const commentArea = el('textarea', { rows: '2' }, item.assessor_comment ?? '');
  commentArea.addEventListener('blur', () => setAssessment(a => { item.assessor_comment = commentArea.value; return { ...a }; }));
  const findingDesc = el('textarea', { rows: '2', placeholder: 'Опис невідповідності' }, item.finding?.description ?? '');
  findingDesc.addEventListener('blur', () => setAssessment(a => {
    item.finding = { ...(item.finding ?? {}), description: findingDesc.value };
    return { ...a };
  }));
  const evidenceBox = el('div', {});
  renderEvidenceEditor(evidenceBox, item, () => { setAssessment(a => ({ ...a })); rerender(); });

  return el('article', { class: 'profile-item' },
    el('header', {}, el('strong', {}, item.id), item.catalog_missing
      ? el('span', { class: 'badge badge-excluded' }, 'Методика не визначена')
      : el('span', { class: 'badge' }, item.cpb_status)),
    el('p', { class: 'stmt' }, item.resolved_statement || item.control_title),
    el('label', { class: 'field' }, 'Висновок з оцінювання', conclusionSel),
    el('label', { class: 'field' }, 'Коментар оцінювача', commentArea),
    el('label', { class: 'field' }, 'Finding (опис невідповідності)', findingDesc),
    el('h4', {}, 'Докази'), evidenceBox);
}

export function renderDashboard(container, { onBack }) {
  const rerender = () => { container.replaceChildren(); renderDashboard(container, { onBack }); };
  const assessment = getAssessment();
  const backBtn = el('button', { type: 'button', onclick: onBack }, '← До реєстру оцінювань');
  const byFamily = new Map();
  for (const item of assessment.items) {
    if (!byFamily.has(item.family)) byFamily.set(item.family, []);
    byFamily.get(item.family).push(item);
  }
  const groups = [...byFamily.entries()].map(([family, items]) =>
    el('section', {}, el('h3', {}, family), ...items.map(item => itemDetail(item, rerender))));
  container.replaceChildren(el('section', {},
    el('h2', {}, `Оцінювання «${assessment.metadata.ics_name}» (${assessment.id})`),
    backBtn, ...groups));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/evidence-editor.test.js`
Expected: PASS (1 passing)

- [ ] **Step 5: Commit**

```bash
git add public/js/assessment/assessment-item.js public/js/assessment/evidence-editor.js test/evidence-editor.test.js
git commit -m "feat(assessment): add Assessment Item UI and Evidence CRUD editor"
```

---

## Task 11: Integration pass — manual e2e verification and regression check

**Files:**
- No new files; verification only. If bugs found, fix in the files from Tasks 1-10.

- [ ] **Step 1: Run the full test suite**

Run: `npm test`
Expected: all suites pass, including the 8 new assessment suites and the pre-existing suites (server, profile-engine, docx-writer, etc.)

- [ ] **Step 2: Manual smoke test via running server**

```bash
PORT=3210 node server.js &
```

- Open `http://127.0.0.1:3210/`, click «Оцінювання ІКС», confirm the mode switch shows the landing page with a dropdown of approved records and an empty assessments list.
- Select an approved record (e.g. an АС-2 record created earlier in this project), click «Нове оцінювання», confirm it opens the dashboard with Assessment Items grouped by family, AC-02 items showing resolved statements (not raw `{{ insert: param, ... }}` placeholders), and non-AC-02 controls showing the "Методика не визначена" badge.
- Add an EXAMINE evidence entry to an AC-02 item, set conclusion to POSITIVE, confirm autosave persists (reload the page, re-open the same assessment id, confirm evidence/conclusion survived).
- Trigger DOCX export from the assessment (via a manual `fetch` in the browser console or a temporary export button, since Task 9/10 scope did not include a dedicated export button — if missing, add one calling `POST /api/assessments/:id/export/docx` and downloading the blob, mirroring the pattern in `public/js/steps/step7-export.js`).
- Confirm the downloaded `.docx` opens in a text/zip inspection (`unzip -l`) without corruption.

- [ ] **Step 3: Fix any discovered issues, re-run affected test suites, commit fixes**

```bash
git add -A
git commit -m "fix(assessment): address issues found during e2e smoke test"
```

- [ ] **Step 4: Final full regression run and commit**

Run: `npm test`
Expected: all suites green, 0 npm dependencies, no network calls made during the run.

```bash
git add -A
git commit -m "chore(assessment): finalize Assessment Module v1 — AC-02 reference control fully supported end-to-end"
```
