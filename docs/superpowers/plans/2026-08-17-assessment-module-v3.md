# Assessment Module v3 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Переробити assessment module під ТЗ v3 ([data/assessment_module_agent_task_v3.md](../../../data/assessment_module_agent_task_v3.md), spec: [2026-08-17-assessment-module-v3-design.md](../specs/2026-08-17-assessment-module-v3-design.md)): ODP-адаптер з локальною нумерацією НД ТЗІ, детермінований effective-value resolver, objective templates, повний Assessment Run lifecycle, згрупована таблиця UI, DOCX-звіт із report projection.

**Architecture:** Шість шарів даних (catalog → baseline → CPB → assessment catalog → ODP adapter → run). Adapter (`assessment_odp_adapter.json`) — єдиний міст assessment_odp_id → local_odp_id → значення ЦПБ/БПБ. NIST — лише VERIFIED traceability, ніколи не primary key. Каталог оцінювання деривується скриптами з `ndtzi36006(1).json`.

**Tech Stack:** Node.js ≥ 18, ES modules, vanilla JS, `node:http`, `node:test`, zero npm dependencies.

## Global Constraints

- 100% offline, loopback `127.0.0.1` only, no CDN/telemetry/external API.
- Zero npm dependencies; тільки node builtins; `"type": "module"`.
- UI рендеринг лише через `textContent` / `createElement` / `append` (helper `el` з `public/js/render/dom.js`); заборонено `innerHTML` з catalog/user data.
- Local ODP IDs (`ac-2_odp.01`) незмінні; NIST ODP не primary key; similarity score заборонено в production JSON.
- Не мутувати CPB після старту run — тільки snapshot. Не вигадувати значення: unresolved → `[НЕ ВИЗНАЧЕНО]`, ніколи не видаляти `<ODP …>` placeholder мовчки.
- Не редагувати нормативні тексти (no silent fix).
- Результат оцінки — enum `NOT_ASSESSED | SATISFIED | PARTIALLY_SATISFIED | NOT_SATISFIED | NOT_APPLICABLE`; методи `EXAMINE→Дослідження, INTERVIEW→Співбесіда, TEST→Перевірка`.
- Пріоритет resolver: `CPB_OVERRIDE → BPB_INHERITED → GENERIC_DEFAULT → UNRESOLVED`.
- Тести: `node --test`; наявні 20 тест-файлів у `test/` мають лишатися зеленими після кожного task.
- Тест-cleanup: видаляти ТІЛЬКИ створені самим тестом id/файли, ніколи не `rmSync` цілу спільну директорію (`assessments/`, `exports/`).

## Verified source schemas (довідка для всіх tasks)

**Adapter** `data/VALIDATED_ARTIFACTS/assessment_odp_adapter_full_document_v1_1_production.json`:
top keys `schema, model_decision, sources, statistics, controls[], rules`. `controls[]`:
`{control_id:"AC-01", canonical_control_id:"AC-1", family, family_title, title, enhancement, assessment_odp_count, assessment_odps[], assessment_methods_reference:{EXAMINE:[..], INTERVIEW:[..], TEST:[..]}}`.
`assessment_odps[]` entry:
```json
{ "assessment_odp_id": "AC-02_ODP[01]", "local_odp_id": "ac-2_odp.01", "ordinal": 1,
  "semantic": { "label": "...", "source_text": "[Призначення: ...]", "guideline": "..." },
  "statement_usage": [ { "statement_path": "e", "text": "... {{ insert: param, ac-2_odp.01 }} ...", "context": "..." } ],
  "binding": { "type": "DIRECT_LOCAL_ODP", "cpb_ref": "ac-2_odp.01" },
  "bpb_bindings": { "open_confidential": [ { "type": "ordinal_parameter|statement_path|free_text", "locator": "1", "value": "...", "source_text": "...", "reason": "..." } ], "service": [] },
  "nist_traceability": { "status": "VERIFIED|UNRESOLVED", "odp_ids": [], "verification_basis": "MANUALLY_VALIDATED_GOLD_STANDARD" } }
```
1026 entries, binding types всі `DIRECT_LOCAL_ODP`; bpb binding types: ordinal_parameter 67, statement_path 144, free_text 12. VERIFIED лише 4 (AC-02_ODP[01..04]).

**Reference source** `data/ASSESSMENT_SOURCES/ndtzi36006(1).json` — Django fixture (масив `{model, pk, fields}`):
`ndtzi36006.family` (20, `pk:"AC", fields:{title}`), `ndtzi36006.control` (1192, `pk:"AC-02"|"AC-02(01)", fields:{family, parent, title, enhancement}`), `ndtzi36006.determinationcontrol` (4213, `pk:"DS-AC-02e", fields:{code:"AC-02e", control:"AC-02", statement:null, text}`), `ndtzi36006.examinecontrol` (676, `pk:"E-AC-02", fields:{code, control, text:"[ВИБІР: a; b; c]."}`), `ndtzi36006.interviewcontrol` (674), `ndtzi36006.testcontrol` (590). Determination codes бувають: `AC-02_ODP[01]` (ODP-визначення, NIST-подібна нумерація), `AC-02a.[01]`, `AC-02b`, `AC-02d.01`, `AC-02e`. Плейсхолдери в text: `<AC-02_ODP[03] персоналу або ролей>`.

**Generic defaults** `data/generic_parameter_defaults.json`: `{schema, generated_at, description, form_groups, parameters:{ "ac-1_odp.01": {controlId:"AC-1", guideline, formGroup, defaultValue:"..."|null, requiresInput:bool, options} }}`. Правило: GENERIC_DEFAULT застосовний лише коли `defaultValue` non-null.

**CPB fixture** `data/FIXTURES/АС-2.json`: `{kind:"cpb", saved_at, info_type:"open_confidential", profile:{param_overrides(90 keys), enhancements:[], excluded:[], exemption_overrides:[], exemption_note_overrides:{}}}` (без passport).

**AS-2 sanity** `data/VALIDATED_ARTIFACTS/as2_full_odp_sanity_check_v1.json`: `{schema, cpb, resolver_order, summary:{profile_local_odp_rows:270, status_counts:{RESOLVED:231, UNRESOLVED:39}, source_counts:{CPB_OVERRIDE:90, BPB_INHERITED:83, GENERIC_DEFAULT:58, NONE:39}, resolution_rate:85.56}, rows[270]}`. Row: `{control_id, canonical_control_id, assessment_odp_id, local_odp_id, statement_paths[], nist_traceability[] (ЗАСТАРІЛЕ поле — НЕ порівнювати), effective_value:{status, source(null для UNRESOLVED), value, evidence[], requires_input?}}`.

**Наявний v1** (переробляється): `core/assessment/{assessment-io,assessment-plan,assessment-resolver,assessment-summary,assessment-validator}.js`, `core/docx/assessment-docx-writer.js`, `server.js` (маршрути `/api/assessments`), `public/js/assessment/{assessment-app,assessment-dashboard,assessment-item,assessment-state,evidence-editor}.js`, `data/assessment_catalog.json` (AC-02-only fixture, v2.0.0). v1 enum: `POSITIVE/PARTIALLY_POSITIVE/NEGATIVE/NOT_APPLICABLE/NOT_ASSESSED`. v1 item: `{id, control_id, ..., odp_refs[], odp_values{}, cpb_status, recommended_methods[], evidence[], conclusion, assessor_comment, finding}`.

**Помічники:** `core/profile-engine.js` → `indexNdParams(ndTzi)` (Map: paramId → {label, source_text}), `STATUS = {APPLIED:..., EXEMPT:..., EXCLUDED:...}`; `core/policy-autofill.js` → `PARAM_RE` (глобальний regex `{{ insert: param, X }}`); `public/js/render/dom.js` → `el(tag, attrs, ...children)`.

---

### Task 1: Shared control-id helpers + install ODP adapter + `odp-adapter.js`

**Files:**
- Create: `core/assessment/control-id.js`
- Create: `data/assessment/assessment_odp_adapter.json` (копія артефакту)
- Create: `core/assessment/odp-adapter.js`
- Test: `test/assessment/odp-adapter.test.js`

**Interfaces:**
- Consumes: `indexNdParams` з `core/profile-engine.js`.
- Produces:
  - `normalizeControlId(id: string): string` — `AC-02→AC-2`, `AC-02(05)→AC-2(5)`.
  - `denormalizeControlId(id: string): string` — зворотне.
  - `indexAdapter(adapterDoc) → { controls: Map<control_id, control>, byAssessmentId: Map<assessment_odp_id, {entry, control}>, byLocalId: Map<local_odp_id, Array<{entry, control}>>, nistVerified: Map<nistOdpId, {entry, control}>, duplicates: string[] }`
  - `validateAdapter(adapterDoc, ndTzi) → { errors: Array<{code, ...}>, warnings: [] }` — codes: `DUPLICATE_PRIMARY_BINDING`, `BROKEN_LOCAL_ODP_BINDING`, `BINDING_MISMATCH`, `SCORE_IN_PRODUCTION`.

- [ ] **Step 1: Скопіювати production adapter**

```bash
mkdir -p data/assessment
cp "data/VALIDATED_ARTIFACTS/assessment_odp_adapter_full_document_v1_1_production.json" data/assessment/assessment_odp_adapter.json
```

- [ ] **Step 2: Написати failing test**

```js
// test/assessment/odp-adapter.test.js
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
```

- [ ] **Step 3: Запустити — FAIL** — `node --test test/assessment/odp-adapter.test.js`, очікується `ERR_MODULE_NOT_FOUND`.

- [ ] **Step 4: Імплементація**

```js
// core/assessment/control-id.js
export function normalizeControlId(id) {
  return String(id ?? '')
    .replace(/^([A-Z]+-)0+(\d+)/, '$1$2')
    .replace(/\(0+(\d+)\)/, '($1)');
}

export function denormalizeControlId(id) {
  return String(id ?? '')
    .replace(/^([A-Z]+-)(\d+)/, (m, p, n) => p + n.padStart(2, '0'))
    .replace(/\((\d+)\)/, (m, n) => `(${n.padStart(2, '0')})`);
}
```

```js
// core/assessment/odp-adapter.js
import { indexNdParams } from '../profile-engine.js';

export function indexAdapter(adapterDoc) {
  const controls = new Map();
  const byAssessmentId = new Map();
  const byLocalId = new Map();
  const nistVerified = new Map();
  const duplicates = [];
  for (const ctrl of adapterDoc.controls ?? []) {
    controls.set(ctrl.control_id, ctrl);
    for (const entry of ctrl.assessment_odps ?? []) {
      if (byAssessmentId.has(entry.assessment_odp_id)) duplicates.push(entry.assessment_odp_id);
      byAssessmentId.set(entry.assessment_odp_id, { entry, control: ctrl });
      if (!byLocalId.has(entry.local_odp_id)) byLocalId.set(entry.local_odp_id, []);
      byLocalId.get(entry.local_odp_id).push({ entry, control: ctrl });
      if (entry.nist_traceability?.status === 'VERIFIED')
        for (const nid of entry.nist_traceability.odp_ids ?? []) nistVerified.set(nid, { entry, control: ctrl });
    }
  }
  return { controls, byAssessmentId, byLocalId, nistVerified, duplicates };
}

function collectScorePaths(node, path, out) {
  if (Array.isArray(node)) node.forEach((v, i) => collectScorePaths(v, `${path}[${i}]`, out));
  else if (node && typeof node === 'object')
    for (const [k, v] of Object.entries(node)) {
      if (k === 'score' || /similarity/i.test(k)) out.push(`${path}.${k}`);
      collectScorePaths(v, `${path}.${k}`, out);
    }
}

export function validateAdapter(adapterDoc, ndTzi) {
  const errors = [];
  const warnings = [];
  const idx = indexAdapter(adapterDoc);
  for (const d of idx.duplicates) errors.push({ code: 'DUPLICATE_PRIMARY_BINDING', assessment_odp_id: d });
  const ndParams = indexNdParams(ndTzi);
  for (const [aid, { entry }] of idx.byAssessmentId) {
    if (!ndParams.has(entry.local_odp_id))
      errors.push({ code: 'BROKEN_LOCAL_ODP_BINDING', assessment_odp_id: aid, local_odp_id: entry.local_odp_id });
    if (entry.binding?.type !== 'DIRECT_LOCAL_ODP' || entry.binding?.cpb_ref !== entry.local_odp_id)
      errors.push({ code: 'BINDING_MISMATCH', assessment_odp_id: aid });
  }
  const scorePaths = [];
  collectScorePaths(adapterDoc, '$', scorePaths);
  for (const p of scorePaths) errors.push({ code: 'SCORE_IN_PRODUCTION', path: p });
  return { errors, warnings };
}
```

- [ ] **Step 5: Запустити — PASS** — `node --test test/assessment/odp-adapter.test.js`. Якщо gold-числа (1026/6) не збігаються — НЕ підганяти тест, розібратися в даних.

- [ ] **Step 6: Перевірити discovery всієї сюїти** — `npm test`; всі старі тести зелені й нові підхоплені (Node рекурсивно сканує `test/`). Якщо піддиректорія не сканується — змінити script на `"test": "node --test test/ test/assessment/"`.

- [ ] **Step 7: Commit**

```bash
git add data/assessment/assessment_odp_adapter.json core/assessment/control-id.js core/assessment/odp-adapter.js test/assessment/odp-adapter.test.js package.json
git commit -m "feat(assessment): install production ODP adapter + odp-adapter core module"
```

---

### Task 2: `tools/build-assessment-reference.js` → `data/assessment/assessment_reference.json`

**Files:**
- Create: `tools/build-assessment-reference.js`
- Create: `data/assessment/assessment_reference.json` (генерується)
- Test: `test/assessment/assessment-reference.test.js`

**Interfaces:**
- Produces: `buildAssessmentReference(fixtureRecords: Array<{model,pk,fields}>) → referenceDoc`:

```json
{ "schema": { "id": "ua.ics.assessment-reference", "version": "1.0.0", "language": "uk", "source": "ndtzi36006(1).json" },
  "families": { "AC": { "title": "УПРАВЛІННЯ ДОСТУПОМ" } },
  "controls": [ { "control_id": "AC-02", "family": "AC", "title": "...", "enhancement": false, "parent": null,
    "determinations": [ { "code": "AC-02e", "text": "..." } ],
    "examine_objects": ["Політика контролю доступу", "..."],
    "interview_objects": ["..."], "test_objects": ["..."] } ] }
```
- `parseSelection(text: string) → string[]` — `"[ВИБІР: a; b; c]."` → `["a","b","c"]`; текст без обгортки → `[text]`.
- CLI: `node tools/build-assessment-reference.js` читає source, пише файл із стабільним порядком (порядок появи у fixture).

- [ ] **Step 1: Failing test**

```js
// test/assessment/assessment-reference.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { buildAssessmentReference, parseSelection } from '../../tools/build-assessment-reference.js';

const fixture = JSON.parse(await readFile(new URL('../../data/ASSESSMENT_SOURCES/ndtzi36006(1).json', import.meta.url), 'utf8'));

test('parseSelection розбирає [ВИБІР: …]', () => {
  assert.deepEqual(parseSelection('[ВИБІР: Політика контролю доступу; план захисту інформації].'),
    ['Політика контролю доступу', 'план захисту інформації']);
  assert.deepEqual(parseSelection('просто текст'), ['просто текст']);
});

test('buildAssessmentReference: структура і нормативний текст без змін', () => {
  const ref = buildAssessmentReference(fixture);
  assert.equal(Object.keys(ref.families).length, 20);
  assert.equal(ref.families.AC.title, 'УПРАВЛІННЯ ДОСТУПОМ');
  assert.equal(ref.controls.length, 1192);
  const ac02 = ref.controls.find(c => c.control_id === 'AC-02');
  assert.equal(ac02.determinations.length, 35);
  const dsE = ac02.determinations.find(d => d.code === 'AC-02e');
  assert.equal(dsE.text, 'для запитів на створення облікових записів потрібні схвалення від <AC-02_ODP[03] персоналу або ролей>;');
  assert.equal(ac02.examine_objects[0], 'Політика контролю доступу');
  const total = ref.controls.reduce((n, c) => n + c.determinations.length, 0);
  assert.equal(total, 4213);
});

test('згенерований файл існує і збігається з builder-ом', async () => {
  const onDisk = JSON.parse(await readFile(new URL('../../data/assessment/assessment_reference.json', import.meta.url), 'utf8'));
  assert.deepEqual(onDisk.controls.find(c => c.control_id === 'AC-02'),
    buildAssessmentReference(fixture).controls.find(c => c.control_id === 'AC-02'));
});
```

- [ ] **Step 2: Запустити — FAIL** (`ERR_MODULE_NOT_FOUND`).

- [ ] **Step 3: Імплементація**

```js
// tools/build-assessment-reference.js
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

export function parseSelection(text) {
  const m = String(text ?? '').trim().match(/^\[ВИБІР:\s*([\s\S]*?)\]\.?$/);
  if (!m) return text ? [String(text).trim()] : [];
  return m[1].split(';').map(s => s.trim()).filter(Boolean);
}

export function buildAssessmentReference(records) {
  const families = {};
  const byId = new Map();
  const order = [];
  for (const r of records) {
    if (r.model === 'ndtzi36006.family') families[r.pk] = { title: r.fields.title };
    if (r.model === 'ndtzi36006.control') {
      byId.set(r.pk, { control_id: r.pk, family: r.fields.family, title: r.fields.title,
        enhancement: !!r.fields.enhancement, parent: r.fields.parent ?? null,
        determinations: [], examine_objects: [], interview_objects: [], test_objects: [] });
      order.push(r.pk);
    }
  }
  for (const r of records) {
    const ctrl = byId.get(r.fields?.control);
    if (!ctrl) continue;
    if (r.model === 'ndtzi36006.determinationcontrol') ctrl.determinations.push({ code: r.fields.code, text: r.fields.text });
    if (r.model === 'ndtzi36006.examinecontrol') ctrl.examine_objects.push(...parseSelection(r.fields.text));
    if (r.model === 'ndtzi36006.interviewcontrol') ctrl.interview_objects.push(...parseSelection(r.fields.text));
    if (r.model === 'ndtzi36006.testcontrol') ctrl.test_objects.push(...parseSelection(r.fields.text));
  }
  return {
    schema: { id: 'ua.ics.assessment-reference', version: '1.0.0', language: 'uk', source: 'ndtzi36006(1).json' },
    families,
    controls: order.map(id => byId.get(id)),
  };
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  const ROOT = fileURLToPath(new URL('..', import.meta.url));
  const src = JSON.parse(await readFile(join(ROOT, 'data', 'ASSESSMENT_SOURCES', 'ndtzi36006(1).json'), 'utf8'));
  const out = buildAssessmentReference(src);
  await mkdir(join(ROOT, 'data', 'assessment'), { recursive: true });
  await writeFile(join(ROOT, 'data', 'assessment', 'assessment_reference.json'), JSON.stringify(out, null, 2));
  console.log(`controls: ${out.controls.length}, determinations: ${out.controls.reduce((n, c) => n + c.determinations.length, 0)}`);
}
```

- [ ] **Step 4: Згенерувати файл** — `node tools/build-assessment-reference.js`; очікується `controls: 1192, determinations: 4213`.

- [ ] **Step 5: Тести — PASS** — `node --test test/assessment/assessment-reference.test.js`.

- [ ] **Step 6: Commit**

```bash
git add tools/build-assessment-reference.js data/assessment/assessment_reference.json test/assessment/assessment-reference.test.js
git commit -m "feat(assessment): derive assessment reference from ndtzi36006 fixture"
```

---

### Task 3: `tools/build-assessment-catalog.js` → повний v3 `data/assessment/assessment_catalog.json`

**Files:**
- Create: `tools/build-assessment-catalog.js`
- Create: `data/assessment/assessment_catalog.json` (генерується; старий `data/assessment_catalog.json` НЕ чіпати до Task 8)
- Test: `test/assessment/assessment-catalog.test.js`

**Interfaces:**
- Produces: `buildAssessmentCatalog(referenceDoc) → catalogDoc`:

```json
{ "schema": { "id": "ua.ics.assessment-catalog", "version": "3.0.0", "language": "uk" },
  "methods_labels": { "EXAMINE": "Дослідження", "INTERVIEW": "Співбесіда", "TEST": "Перевірка" },
  "controls": [ { "control_id": "AC-02", "canonical_control_id": "AC-2", "family": "AC",
    "family_title": "УПРАВЛІННЯ ДОСТУПОМ", "title": "...", "enhancement": false,
    "items": [ { "assessment_source_id": "AC-02e", "control_id": "AC-02", "statement_path": "e",
      "kind": "STATEMENT", "objective_template": "для запитів ... <AC-02_ODP[03] персоналу або ролей>;",
      "assessment_odp_refs": ["AC-02_ODP[03]"],
      "methods": { "EXAMINE": { "objects": ["..."] }, "INTERVIEW": { "objects": ["..."] }, "TEST": { "objects": ["..."] } } } ] } ] }
```
- `kind`: `"ODP_DEFINITION"` якщо code-залишок починається з `_ODP` (тоді `statement_path: null`), інакше `"STATEMENT"` зі `statement_path` = залишок code після control_id (`"AC-02e"→"e"`, `"AC-02a.[01]"→"a.[01]"`).
- `assessment_odp_refs`: id-и з плейсхолдерів `<ID …>` у тексті, regex `/<([A-Z]{2}-\d{2}(?:\(\d{2}\))?_ODP(?:\[\d{2}\])?)\s/g` — це reference-нумерація (NIST-подібна).
- Method без objects у reference → у item методу немає (available_methods формується з наявних).

- [ ] **Step 1: Failing test**

```js
// test/assessment/assessment-catalog.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { buildAssessmentCatalog, extractOdpRefs, splitStatementPath } from '../../tools/build-assessment-catalog.js';

const reference = JSON.parse(await readFile(new URL('../../data/assessment/assessment_reference.json', import.meta.url), 'utf8'));

test('splitStatementPath', () => {
  assert.deepEqual(splitStatementPath('AC-02', 'AC-02e'), { kind: 'STATEMENT', statement_path: 'e' });
  assert.deepEqual(splitStatementPath('AC-02', 'AC-02a.[01]'), { kind: 'STATEMENT', statement_path: 'a.[01]' });
  assert.deepEqual(splitStatementPath('AC-02', 'AC-02_ODP[01]'), { kind: 'ODP_DEFINITION', statement_path: null });
});

test('extractOdpRefs', () => {
  assert.deepEqual(extractOdpRefs('схвалення від <AC-02_ODP[03] персоналу або ролей>;'), ['AC-02_ODP[03]']);
  assert.deepEqual(extractOdpRefs('без плейсхолдерів'), []);
});

test('каталог: повне покриття, AC-02e item', () => {
  const cat = buildAssessmentCatalog(reference);
  assert.equal(cat.schema.version, '3.0.0');
  assert.equal(cat.controls.length, 1192);
  const totalItems = cat.controls.reduce((n, c) => n + c.items.length, 0);
  assert.equal(totalItems, 4213);
  const ac02 = cat.controls.find(c => c.control_id === 'AC-02');
  assert.equal(ac02.canonical_control_id, 'AC-2');
  assert.equal(ac02.family_title, 'УПРАВЛІННЯ ДОСТУПОМ');
  const e = ac02.items.find(i => i.assessment_source_id === 'AC-02e');
  assert.equal(e.statement_path, 'e');
  assert.deepEqual(e.assessment_odp_refs, ['AC-02_ODP[03]']);
  assert.ok(e.methods.EXAMINE.objects.includes('Політика контролю доступу'));
  assert.ok(e.methods.TEST.objects.length > 0);
});

test('згенерований файл на диску відповідає builder-у', async () => {
  const onDisk = JSON.parse(await readFile(new URL('../../data/assessment/assessment_catalog.json', import.meta.url), 'utf8'));
  assert.equal(onDisk.controls.reduce((n, c) => n + c.items.length, 0), 4213);
  assert.deepEqual(onDisk.methods_labels, { EXAMINE: 'Дослідження', INTERVIEW: 'Співбесіда', TEST: 'Перевірка' });
});
```

- [ ] **Step 2: Запустити — FAIL.**

- [ ] **Step 3: Імплементація**

```js
// tools/build-assessment-catalog.js
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { normalizeControlId } from '../core/assessment/control-id.js';

const ODP_REF_RE = /<([A-Z]{2}-\d{2}(?:\(\d{2}\))?_ODP(?:\[\d{2}\])?)\s/g;

export function extractOdpRefs(text) {
  return [...String(text ?? '').matchAll(ODP_REF_RE)].map(m => m[1]);
}

export function splitStatementPath(controlId, code) {
  const rest = String(code ?? '').startsWith(controlId) ? String(code).slice(controlId.length) : String(code ?? '');
  if (rest.startsWith('_ODP')) return { kind: 'ODP_DEFINITION', statement_path: null };
  return { kind: 'STATEMENT', statement_path: rest || null };
}

export function buildAssessmentCatalog(reference) {
  const controls = reference.controls.map(ctrl => {
    const methodsFor = () => {
      const m = {};
      if (ctrl.examine_objects.length) m.EXAMINE = { objects: ctrl.examine_objects };
      if (ctrl.interview_objects.length) m.INTERVIEW = { objects: ctrl.interview_objects };
      if (ctrl.test_objects.length) m.TEST = { objects: ctrl.test_objects };
      return m;
    };
    return {
      control_id: ctrl.control_id,
      canonical_control_id: normalizeControlId(ctrl.control_id),
      family: ctrl.family,
      family_title: reference.families[ctrl.family]?.title ?? '',
      title: ctrl.title,
      enhancement: ctrl.enhancement,
      items: ctrl.determinations.map(d => ({
        assessment_source_id: d.code,
        control_id: ctrl.control_id,
        ...splitStatementPath(ctrl.control_id, d.code),
        objective_template: d.text,
        assessment_odp_refs: extractOdpRefs(d.text),
        methods: methodsFor(),
      })),
    };
  });
  return {
    schema: { id: 'ua.ics.assessment-catalog', version: '3.0.0', language: 'uk' },
    methods_labels: { EXAMINE: 'Дослідження', INTERVIEW: 'Співбесіда', TEST: 'Перевірка' },
    controls,
  };
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  const ROOT = fileURLToPath(new URL('..', import.meta.url));
  const ref = JSON.parse(await readFile(join(ROOT, 'data', 'assessment', 'assessment_reference.json'), 'utf8'));
  const out = buildAssessmentCatalog(ref);
  await mkdir(join(ROOT, 'data', 'assessment'), { recursive: true });
  await writeFile(join(ROOT, 'data', 'assessment', 'assessment_catalog.json'), JSON.stringify(out, null, 2));
  console.log(`controls: ${out.controls.length}, items: ${out.controls.reduce((n, c) => n + c.items.length, 0)}`);
}
```

- [ ] **Step 4: Згенерувати** — `node tools/build-assessment-catalog.js`; очікується `controls: 1192, items: 4213`.

- [ ] **Step 5: Тести — PASS**, потім повний `npm test` (старий каталог і v1-тести ще недоторкані — зелені).

- [ ] **Step 6: Commit**

```bash
git add tools/build-assessment-catalog.js data/assessment/assessment_catalog.json test/assessment/assessment-catalog.test.js
git commit -m "feat(assessment): build full v3 assessment catalog from reference (4213 items)"
```

---

### Task 4: `effective-value-resolver.js`

**Files:**
- Create: `core/assessment/effective-value-resolver.js`
- Test: `test/assessment/effective-value-resolver.test.js`

**Interfaces:**
- Consumes: adapter entry (Task 1), CPB `{info_type, profile:{param_overrides}}`, `genericDefaults` (весь файл із `.parameters`).
- Produces:
  - `resolveEffectiveValue({ adapterEntry, cpb, genericDefaults }) → { status: 'RESOLVED'|'UNRESOLVED', source: 'CPB_OVERRIDE'|'BPB_INHERITED'|'GENERIC_DEFAULT'|null, value: string|null, evidence: [], requires_input?: true }`
  - `baselineValue({ adapterEntry, infoType }) → string|null` — значення з БПБ незалежно від override (колонка «Значення з БПБ»).

- [ ] **Step 1: Failing test** (очікування взяті з validated AS-2 sanity rows)

```js
// test/assessment/effective-value-resolver.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { indexAdapter } from '../../core/assessment/odp-adapter.js';
import { resolveEffectiveValue, baselineValue } from '../../core/assessment/effective-value-resolver.js';

const adapter = JSON.parse(await readFile(new URL('../../data/assessment/assessment_odp_adapter.json', import.meta.url), 'utf8'));
const genericDefaults = JSON.parse(await readFile(new URL('../../data/generic_parameter_defaults.json', import.meta.url), 'utf8'));
const as2 = JSON.parse(await readFile(new URL('../../data/FIXTURES/АС-2.json', import.meta.url), 'utf8'));
const idx = indexAdapter(adapter);
const entry = (aid) => idx.byAssessmentId.get(aid).entry;

test('CPB_OVERRIDE перемагає все', () => {
  const r = resolveEffectiveValue({ adapterEntry: entry('AC-02_ODP[02]'), cpb: as2, genericDefaults });
  assert.equal(r.status, 'RESOLVED');
  assert.equal(r.source, 'CPB_OVERRIDE');
  assert.equal(r.value, as2.profile.param_overrides['ac-2_odp.02']);
});

test('BPB_INHERITED через explicit adapter binding (пріоритет над generic)', () => {
  // ac-2_odp.04 має і BPB binding, і generic default "щорічно" — перемагає БПБ
  const r = resolveEffectiveValue({ adapterEntry: entry('AC-02_ODP[04]'), cpb: as2, genericDefaults });
  assert.deepEqual([r.status, r.source, r.value], ['RESOLVED', 'BPB_INHERITED', 'мінімум щоквартально']);
});

test('GENERIC_DEFAULT коли немає override і БПБ', () => {
  const r = resolveEffectiveValue({ adapterEntry: entry('AC-01_ODP[03]'), cpb: as2, genericDefaults });
  assert.deepEqual([r.status, r.source, r.value], ['RESOLVED', 'GENERIC_DEFAULT', 'Адміністратор безпеки']);
});

test('UNRESOLVED: value null, ніколи не вигадувати; requires_input прокидається', () => {
  const r = resolveEffectiveValue({ adapterEntry: entry('AC-02_ODP[01]'), cpb: as2, genericDefaults });
  assert.deepEqual([r.status, r.source, r.value], ['UNRESOLVED', null, null]);
  assert.equal(r.requires_input, true); // generic_parameter_defaults: ac-2_odp.01 requiresInput=true, defaultValue=null
});

test('baselineValue не залежить від CPB override', () => {
  assert.equal(baselineValue({ adapterEntry: entry('AC-02_ODP[04]'), infoType: 'open_confidential' }), 'мінімум щоквартально');
  assert.equal(baselineValue({ adapterEntry: entry('AC-02_ODP[01]'), infoType: 'open_confidential' }), null);
});
```

- [ ] **Step 2: Запустити — FAIL.**

- [ ] **Step 3: Імплементація**

```js
// core/assessment/effective-value-resolver.js
// Пріоритет ТЗ §7: CPB_OVERRIDE → BPB_INHERITED → GENERIC_DEFAULT → UNRESOLVED
export function baselineValue({ adapterEntry, infoType }) {
  const bindings = adapterEntry.bpb_bindings?.[infoType] ?? [];
  const hit = bindings.find(b => b.value != null && b.value !== '');
  return hit ? hit.value : null;
}

export function resolveEffectiveValue({ adapterEntry, cpb, genericDefaults }) {
  const localOdpId = adapterEntry.binding?.cpb_ref ?? adapterEntry.local_odp_id;
  const override = cpb?.profile?.param_overrides?.[localOdpId];
  if (override != null && override !== '')
    return { status: 'RESOLVED', source: 'CPB_OVERRIDE', value: override, evidence: [] };

  const infoType = cpb?.info_type;
  const bindings = adapterEntry.bpb_bindings?.[infoType] ?? [];
  const bpbHit = bindings.find(b => b.value != null && b.value !== '');
  if (bpbHit)
    return { status: 'RESOLVED', source: 'BPB_INHERITED', value: bpbHit.value, evidence: bindings };

  const def = genericDefaults?.parameters?.[localOdpId];
  if (def && def.defaultValue != null && def.defaultValue !== '')
    return { status: 'RESOLVED', source: 'GENERIC_DEFAULT', value: def.defaultValue,
      evidence: [{ type: 'generic_default', locator: localOdpId, value: def.defaultValue }] };

  const out = { status: 'UNRESOLVED', source: null, value: null, evidence: [] };
  if (def?.requiresInput) out.requires_input = true;
  return out;
}
```

- [ ] **Step 4: Тести — PASS.**

- [ ] **Step 5: Commit**

```bash
git add core/assessment/effective-value-resolver.js test/assessment/effective-value-resolver.test.js
git commit -m "feat(assessment): effective value resolver with CPB>BPB>generic>unresolved priority"
```

---

### Task 5: `objective-resolver.js`

**Files:**
- Create: `core/assessment/objective-resolver.js`
- Test: `test/assessment/objective-resolver.test.js`

**Interfaces:**
- Consumes: `adapterIndex` (з `indexAdapter`), функція ефективних значень.
- Produces: `resolveAssessmentObjective({ objectiveTemplate, adapterIndex, effectiveValueFor }) → { resolved_objective: string, placeholders: Array<{ref, label, resolution: 'SUBSTITUTED'|'UNRESOLVED_VALUE'|'REFERENCE_ONLY', local_odp_id: string|null, assessment_odp_id: string|null, value: string|null }> }`
  - `effectiveValueFor(localOdpId) → {status, value}` — колбек (plan постачає з resolver-а).
  - Плейсхолдер `<REF label>` (REF — reference/NIST-подібний id): якщо `adapterIndex.nistVerified.has(REF)` → локальний entry: RESOLVED value → підстановка; UNRESOLVED → `[НЕ ВИЗНАЧЕНО]`. Без VERIFIED-зв'язку → REFERENCE_ONLY: лишити нормативний label як є (рішення користувача). Плейсхолдер ніколи не зникає без заміни.

- [ ] **Step 1: Failing test**

```js
// test/assessment/objective-resolver.test.js
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
```

- [ ] **Step 2: Запустити — FAIL.**

- [ ] **Step 3: Імплементація**

```js
// core/assessment/objective-resolver.js
const PLACEHOLDER_RE = /<([A-Z]{2}-\d{2}(?:\(\d{2}\))?_ODP(?:\[\d{2}\])?)\s+([^>]+)>/g;
export const UNDEFINED_TAG = '[НЕ ВИЗНАЧЕНО]';

export function resolveAssessmentObjective({ objectiveTemplate, adapterIndex, effectiveValueFor }) {
  const placeholders = [];
  const resolved_objective = String(objectiveTemplate ?? '').replace(PLACEHOLDER_RE, (m, ref, label) => {
    const verified = adapterIndex.nistVerified.get(ref);
    if (!verified) {
      placeholders.push({ ref, label, resolution: 'REFERENCE_ONLY', local_odp_id: null, assessment_odp_id: null, value: null });
      return label; // нормативний текст плейсхолдера як є
    }
    const { entry } = verified;
    const ev = effectiveValueFor(entry.local_odp_id);
    if (ev?.status === 'RESOLVED') {
      placeholders.push({ ref, label, resolution: 'SUBSTITUTED', local_odp_id: entry.local_odp_id,
        assessment_odp_id: entry.assessment_odp_id, value: ev.value });
      return ev.value;
    }
    placeholders.push({ ref, label, resolution: 'UNRESOLVED_VALUE', local_odp_id: entry.local_odp_id,
      assessment_odp_id: entry.assessment_odp_id, value: null });
    return UNDEFINED_TAG;
  });
  return { resolved_objective, placeholders };
}
```

- [ ] **Step 4: Тести — PASS.**

- [ ] **Step 5: Commit**

```bash
git add core/assessment/objective-resolver.js test/assessment/objective-resolver.test.js
git commit -m "feat(assessment): objective template resolver with VERIFIED-only substitution"
```

---

### Task 6: AC-02 gold-standard tests

**Files:**
- Test: `test/assessment/ac02-gold-standard.test.js` (тільки тест — модулі вже є)

**Interfaces:** Consumes Task 1/4/5 API.

- [ ] **Step 1: Написати тест** (ТЗ §26 — обов'язкові перевірки)

```js
// test/assessment/ac02-gold-standard.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { indexAdapter } from '../../core/assessment/odp-adapter.js';
import { resolveEffectiveValue } from '../../core/assessment/effective-value-resolver.js';
import { resolveAssessmentObjective } from '../../core/assessment/objective-resolver.js';

const adapter = JSON.parse(await readFile(new URL('../../data/assessment/assessment_odp_adapter.json', import.meta.url), 'utf8'));
const genericDefaults = JSON.parse(await readFile(new URL('../../data/generic_parameter_defaults.json', import.meta.url), 'utf8'));
const as2 = JSON.parse(await readFile(new URL('../../data/FIXTURES/АС-2.json', import.meta.url), 'utf8'));
const idx = indexAdapter(adapter);

const GOLD = [
  ['AC-02_ODP[01]', 'ac-2_odp.01', ['AC-02_ODP[03]']],
  ['AC-02_ODP[02]', 'ac-2_odp.02', ['AC-02_ODP[04]']],
  ['AC-02_ODP[03]', 'ac-2_odp.03', ['AC-02_ODP[06]', 'AC-02_ODP[07]', 'AC-02_ODP[08]']],
  ['AC-02_ODP[04]', 'ac-2_odp.04', ['AC-02_ODP[10]']],
];

test('gold standard: local mapping + VERIFIED NIST traceability', () => {
  for (const [aid, localId, nistIds] of GOLD) {
    const { entry } = idx.byAssessmentId.get(aid);
    assert.equal(entry.local_odp_id, localId);
    assert.equal(entry.nist_traceability.status, 'VERIFIED');
    assert.deepEqual(entry.nist_traceability.odp_ids, nistIds);
  }
});

test('AS-2: ac-2_odp.01 unresolved (немає target value), ac-2_odp.02 — CPB override', () => {
  const r1 = resolveEffectiveValue({ adapterEntry: idx.byAssessmentId.get('AC-02_ODP[01]').entry, cpb: as2, genericDefaults });
  assert.deepEqual([r1.status, r1.value], ['UNRESOLVED', null]);
  const r2 = resolveEffectiveValue({ adapterEntry: idx.byAssessmentId.get('AC-02_ODP[02]').entry, cpb: as2, genericDefaults });
  assert.equal(r2.source, 'CPB_OVERRIDE');
});

test('BPB inheritance: statement_path bindings h.1/h.2/h.3 та j (AC-02_ODP[02]/[03])', () => {
  // ac-2_odp.03 (AC-02_ODP[03]) в open_confidential має statement_path bindings h.1/h.2/h.3
  const e3 = idx.byAssessmentId.get('AC-02_ODP[03]').entry;
  const paths3 = (e3.bpb_bindings.open_confidential ?? []).map(b => b.locator);
  assert.ok(['h.1', 'h.2', 'h.3'].every(p => paths3.includes(p)) || e3.statement_usage.some(u => ['h.1', 'h.2', 'h.3'].includes(u.statement_path)),
    `очікуються h.1/h.2/h.3 у bindings або statement_usage, отримано: ${JSON.stringify(paths3)}`);
  // merged/multi-locator: один local ODP → декілька locators не ламає resolver
  const cpbNoOverride = { info_type: 'open_confidential', profile: { param_overrides: {} } };
  const r = resolveEffectiveValue({ adapterEntry: e3, cpb: cpbNoOverride, genericDefaults });
  assert.ok(['RESOLVED', 'UNRESOLVED'].includes(r.status));
  if (r.status === 'RESOLVED') assert.equal(r.source, 'BPB_INHERITED');
});

test('resolved objective: placeholder substitution і [НЕ ВИЗНАЧЕНО]', () => {
  const tpl = 'для запитів на створення облікових записів потрібні схвалення від <AC-02_ODP[03] персоналу або ролей>;';
  const withValue = resolveAssessmentObjective({ objectiveTemplate: tpl, adapterIndex: idx,
    effectiveValueFor: (id) => id === 'ac-2_odp.01' ? { status: 'RESOLVED', value: 'Начальник служби захисту інформації' } : null });
  assert.ok(withValue.resolved_objective.includes('Начальник служби захисту інформації'));
  const noValue = resolveAssessmentObjective({ objectiveTemplate: tpl, adapterIndex: idx,
    effectiveValueFor: () => ({ status: 'UNRESOLVED', value: null }) });
  assert.ok(noValue.resolved_objective.includes('[НЕ ВИЗНАЧЕНО]'));
  assert.ok(!noValue.resolved_objective.includes('<AC-02_ODP'));
});
```

- [ ] **Step 2: Запустити — PASS очікується одразу** (модулі готові). Якщо перевірка h.1/h.2/h.3 FAIL — вивести реальні bindings `node -e` і скоригувати ТІЛЬКИ форму перевірки (не дані), зафіксувавши реальний вміст адаптера в assert.

- [ ] **Step 3: Commit**

```bash
git add test/assessment/ac02-gold-standard.test.js
git commit -m "test(assessment): AC-02 gold standard mapping and substitution tests"
```

---

### Task 7: AS-2 regression test (270 рядків, per-row)

**Files:**
- Test: `test/assessment/as2-regression.test.js`

**Interfaces:** Consumes Task 1/4 API + fixtures.

- [ ] **Step 1: Написати тест**

```js
// test/assessment/as2-regression.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { indexAdapter } from '../../core/assessment/odp-adapter.js';
import { resolveEffectiveValue } from '../../core/assessment/effective-value-resolver.js';

const adapter = JSON.parse(await readFile(new URL('../../data/assessment/assessment_odp_adapter.json', import.meta.url), 'utf8'));
const genericDefaults = JSON.parse(await readFile(new URL('../../data/generic_parameter_defaults.json', import.meta.url), 'utf8'));
const as2 = JSON.parse(await readFile(new URL('../../data/FIXTURES/АС-2.json', import.meta.url), 'utf8'));
const sanity = JSON.parse(await readFile(new URL('../../data/VALIDATED_ARTIFACTS/as2_full_odp_sanity_check_v1.json', import.meta.url), 'utf8'));
const idx = indexAdapter(adapter);

// Baseline regression ТЗ §25: 270 рядків, 231 resolved / 39 unresolved (85.56%), 90/83/58 за джерелами.
test('AS-2 baseline: per-row відповідність validated sanity check', () => {
  assert.equal(sanity.rows.length, 270);
  const mismatches = [];
  const counts = { RESOLVED: 0, UNRESOLVED: 0, CPB_OVERRIDE: 0, BPB_INHERITED: 0, GENERIC_DEFAULT: 0 };
  for (const row of sanity.rows) {
    const hit = idx.byAssessmentId.get(row.assessment_odp_id);
    if (!hit) { mismatches.push(`${row.assessment_odp_id}: відсутній в адаптері`); continue; }
    const r = resolveEffectiveValue({ adapterEntry: hit.entry, cpb: as2, genericDefaults });
    counts[r.status]++;
    if (r.source) counts[r.source]++;
    const exp = row.effective_value;
    if (r.status !== exp.status || (r.source ?? null) !== (exp.source ?? null) || (r.value ?? null) !== (exp.value ?? null))
      mismatches.push(`${row.assessment_odp_id} (${row.local_odp_id}): got ${r.status}/${r.source}/${r.value} want ${exp.status}/${exp.source}/${exp.value}`);
  }
  assert.deepEqual(mismatches, [], `розбіжності:\n${mismatches.slice(0, 15).join('\n')}`);
  assert.equal(counts.RESOLVED, 231);
  assert.equal(counts.UNRESOLVED, 39);
  assert.equal(counts.CPB_OVERRIDE, 90);
  assert.equal(counts.BPB_INHERITED, 83);
  assert.equal(counts.GENERIC_DEFAULT, 58);
  assert.equal(Math.round((counts.RESOLVED / 270) * 10000) / 100, 85.56);
});
```

- [ ] **Step 2: Запустити** — `node --test test/assessment/as2-regression.test.js`. Якщо є mismatches — діагностувати конкретні рядки (`node -e` дамп adapter entry + generic default для проблемного id). Числа фіксовані ТЗ §25: міняти можна лише source data/binding/resolver з поясненням у changelog, не тест.

- [ ] **Step 3: Commit**

```bash
git add test/assessment/as2-regression.test.js
git commit -m "test(assessment): AS-2 270-row baseline regression against validated sanity check"
```

---

### Task 8: Rework `assessment-plan.js` під v3

**Files:**
- Rewrite: `core/assessment/assessment-plan.js`
- Delete: `core/assessment/assessment-resolver.js` (заміняється resolver-ами v3), `data/assessment_catalog.json` (старий fixture), `docs/superpowers/plans/assessment_catalog_ac02_reference.json` (залишок, якщо є посилання — ні)
- Rewrite: `test/assessment-plan.test.js` → перенести в `test/assessment/assessment-plan.test.js`
- Delete: `test/assessment-resolver.test.js`, `test/assessment-catalog-fixture.test.js`
- Modify: `server.js` (шлях каталогу → `data/assessment/assessment_catalog.json`, нові аргументи buildAssessmentPlan) — мінімально, повний rework маршрутів у Task 12.

**Interfaces:**
- Consumes: `indexAdapter`, `resolveEffectiveValue`, `baselineValue`, `resolveAssessmentObjective`, `normalizeControlId/denormalizeControlId`, `STATUS` з profile-engine; catalog v3 (Task 3).
- Produces: `buildAssessmentPlan({ approvedState, catalogs, assessmentCatalog, adapter }) → { items, warnings }`, item:

```json
{ "assessment_source_id": "AC-02e", "control_id": "AC-02", "canonical_control_id": "AC-2",
  "family": "AC", "family_title": "...", "control_title": "...", "enhancement": false,
  "statement_path": "e", "kind": "STATEMENT", "cpb_status": "APPLIED|EXEMPT|EXCLUDED",
  "objective_template": "...", "resolved_objective": "...", "placeholders": [],
  "odp_values": [ { "assessment_odp_id": "AC-02_ODP[01]", "local_odp_id": "ac-2_odp.01",
      "baseline_value": null, "target_value": null, "effective_source": null, "status": "UNRESOLVED" } ],
  "available_methods": ["EXAMINE", "INTERVIEW", "TEST"] }
```
- `odp_values` — усі adapter ODP контролю (target_value = effective value, effective_source = source), незалежно від плейсхолдерів.
- Warnings: `{code:'ODP_UNRESOLVED', assessment_source_id, local_odp_id}` на кожен unresolved; `{code:'CATALOG_MISSING', control_id}` якщо для applicable控 немає items; `{code:'NO_METHODS', assessment_source_id}` якщо methods порожні.
- Фільтрація scope: reuse логіки `cpbApplicableControlIds` (скопіювати з поточного файла без змін — вона коректна) — тільки APPLIED контролі потрапляють у items; EXEMPT/EXCLUDED не включаються (ТЗ §10: план не містить excluded), але у warnings додати `{code:'CONTROL_EXCLUDED'|'CONTROL_EXEMPT', control_id}` для traceability.

- [ ] **Step 1: Переписати тест** — `test/assessment/assessment-plan.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { buildAssessmentPlan } from '../../core/assessment/assessment-plan.js';

const read = async (p) => JSON.parse(await readFile(new URL(`../../${p}`, import.meta.url), 'utf8'));
const catalogs = {
  ndTzi: await read('data/nd_tzi.json'),
  bpb: { service: await read('data/bpb_service.json'), open_confidential: await read('data/bpb_open_confidential.json') },
  exemptions: await read('data/as_class_exemptions.json'),
  genericDefaults: await read('data/generic_parameter_defaults.json'),
};
const assessmentCatalog = await read('data/assessment/assessment_catalog.json');
const adapter = await read('data/assessment/assessment_odp_adapter.json');
const as2 = await read('data/FIXTURES/АС-2.json');
const approvedState = { info_type: as2.info_type, profile: as2.profile, passport: { as_class: 2, ics_name: 'АС-2' } };

const { items, warnings } = buildAssessmentPlan({ approvedState, catalogs, assessmentCatalog, adapter });

test('план містить лише applicable контролі, без EXEMPT/EXCLUDED items', () => {
  assert.ok(items.length > 0);
  assert.ok(items.every(i => i.cpb_status === 'APPLIED'));
});

test('AC-02e: resolved_objective, odp_values зі baseline/target', () => {
  const e = items.find(i => i.assessment_source_id === 'AC-02e');
  assert.ok(e, 'AC-02e має бути в плані');
  assert.ok(e.objective_template.includes('<AC-02_ODP[03]'));
  // ac-2_odp.01 unresolved в АС-2 → [НЕ ВИЗНАЧЕНО]
  assert.ok(e.resolved_objective.includes('[НЕ ВИЗНАЧЕНО]'));
  const odp1 = e.odp_values.find(v => v.assessment_odp_id === 'AC-02_ODP[01]');
  assert.deepEqual([odp1.local_odp_id, odp1.status, odp1.target_value], ['ac-2_odp.01', 'UNRESOLVED', null]);
  const odp4 = e.odp_values.find(v => v.assessment_odp_id === 'AC-02_ODP[04]');
  assert.deepEqual([odp4.baseline_value, odp4.target_value, odp4.effective_source],
    ['мінімум щоквартально', 'мінімум щоквартально', 'BPB_INHERITED']);
  assert.ok(e.available_methods.includes('EXAMINE') && e.available_methods.includes('TEST'));
});

test('unresolved ODP потрапляють у warnings', () => {
  assert.ok(warnings.some(w => w.code === 'ODP_UNRESOLVED' && w.local_odp_id === 'ac-2_odp.01'));
});

test('невибрані enhancements не потрапляють у план', () => {
  // АС-2 не має обраних enhancements → жодного item з enhancement control
  assert.ok(!items.some(i => i.control_id.includes('(')));
});
```

- [ ] **Step 2: Запустити — FAIL** (нова сигнатура/структура).

- [ ] **Step 3: Переписати `core/assessment/assessment-plan.js`**

```js
import { STATUS } from '../profile-engine.js';
import { normalizeControlId, denormalizeControlId } from './control-id.js';
import { indexAdapter } from './odp-adapter.js';
import { resolveEffectiveValue, baselineValue } from './effective-value-resolver.js';
import { resolveAssessmentObjective } from './objective-resolver.js';

// Scope ЦПБ: скопійовано без змін із v1 (перевірено тестами v1)
function cpbApplicableControlIds(approvedState, catalogs) {
  const bpb = catalogs.bpb[approvedState.info_type];
  const ids = new Map();
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

export function buildAssessmentPlan({ approvedState, catalogs, assessmentCatalog, adapter }) {
  const items = [];
  const warnings = [];
  const adapterIndex = indexAdapter(adapter);
  const cpb = { info_type: approvedState.info_type, profile: approvedState.profile };
  const genericDefaults = catalogs.genericDefaults;
  const applicable = cpbApplicableControlIds(approvedState, catalogs);

  const catalogByNorm = new Map();
  for (const ctrl of assessmentCatalog.controls) catalogByNorm.set(normalizeControlId(ctrl.control_id), ctrl);

  const effCache = new Map();
  const effectiveFor = (adapterEntry) => {
    if (!effCache.has(adapterEntry.local_odp_id))
      effCache.set(adapterEntry.local_odp_id, resolveEffectiveValue({ adapterEntry, cpb, genericDefaults }));
    return effCache.get(adapterEntry.local_odp_id);
  };
  const effectiveValueFor = (localOdpId) => {
    const hit = adapterIndex.byLocalId.get(localOdpId)?.[0];
    return hit ? effectiveFor(hit.entry) : { status: 'UNRESOLVED', value: null };
  };

  for (const [controlId, statusKey] of applicable) {
    const cpbStatus = CPB_STATUS_MAP[statusKey];
    if (cpbStatus !== 'APPLIED') {
      warnings.push({ code: cpbStatus === 'EXEMPT' ? 'CONTROL_EXEMPT' : 'CONTROL_EXCLUDED', control_id: denormalizeControlId(controlId) });
      continue;
    }
    const catCtrl = catalogByNorm.get(normalizeControlId(controlId));
    if (!catCtrl) { warnings.push({ code: 'CATALOG_MISSING', control_id: denormalizeControlId(controlId) }); continue; }
    const adapterCtrl = adapterIndex.controls.get(catCtrl.control_id);
    const odpValues = (adapterCtrl?.assessment_odps ?? []).map(entry => {
      const eff = effectiveFor(entry);
      if (eff.status === 'UNRESOLVED')
        warnings.push({ code: 'ODP_UNRESOLVED', control_id: catCtrl.control_id, local_odp_id: entry.local_odp_id });
      return { assessment_odp_id: entry.assessment_odp_id, local_odp_id: entry.local_odp_id,
        baseline_value: baselineValue({ adapterEntry: entry, infoType: cpb.info_type }),
        target_value: eff.value, effective_source: eff.source, status: eff.status };
    });
    // дедуп ODP_UNRESOLVED по одному контролю робиться нижче, після циклу
    for (const item of catCtrl.items) {
      const { resolved_objective, placeholders } = resolveAssessmentObjective({
        objectiveTemplate: item.objective_template, adapterIndex, effectiveValueFor });
      items.push({
        assessment_source_id: item.assessment_source_id, control_id: catCtrl.control_id,
        canonical_control_id: catCtrl.canonical_control_id, family: catCtrl.family,
        family_title: catCtrl.family_title, control_title: catCtrl.title, enhancement: catCtrl.enhancement,
        statement_path: item.statement_path, kind: item.kind, cpb_status: cpbStatus,
        objective_template: item.objective_template, resolved_objective, placeholders,
        odp_values: odpValues, available_methods: Object.keys(item.methods),
      });
      if (!Object.keys(item.methods).length) warnings.push({ code: 'NO_METHODS', assessment_source_id: item.assessment_source_id });
    }
  }
  // дедуплікація warning-ів unresolved (один на local_odp_id)
  const seen = new Set();
  const dedup = warnings.filter(w => {
    if (w.code !== 'ODP_UNRESOLVED') return true;
    const k = `${w.code}:${w.local_odp_id}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  return { items, warnings: dedup };
}
```

- [ ] **Step 4: Прибрати v1-залишки** — видалити `core/assessment/assessment-resolver.js`, `test/assessment-resolver.test.js`, `test/assessment-catalog-fixture.test.js`, старий `data/assessment_catalog.json`, старий `test/assessment-plan.test.js`. У `server.js` замінити читання каталогу:

```js
// server.js: у POST /api/assessments
const assessmentCatalog = JSON.parse(await readFile(join(ROOT, 'data', 'assessment', 'assessment_catalog.json'), 'utf8'));
const adapter = JSON.parse(await readFile(join(ROOT, 'data', 'assessment', 'assessment_odp_adapter.json'), 'utf8'));
const { items, warnings } = buildAssessmentPlan({ approvedState: approvedRecord.state, catalogs, assessmentCatalog, adapter });
```
`test/server-assessment.test.js` і `core/assessment/assessment-io.js` тимчасово працюють зі старими items-полями — якщо server-тест червоний через нову структуру item, оновити його очікування мінімально (перевірка `assessment_source_id` замість `id`); повний rework IO/маршрутів — Task 9/12.

- [ ] **Step 5: `npm test` — все зелено.** (`assessment-io.test.js`, `assessment-state.test.js`, `evidence-editor.test.js` не залежать від plan-структури; якщо залежать — оновити поля item у їх фікстурах на v3-імена.)

- [ ] **Step 6: Commit**

```bash
git add -A core/assessment/ test/ server.js data/assessment_catalog.json
git commit -m "feat(assessment): v3 assessment plan builder on adapter + resolvers; drop v1 resolver/catalog"
```

---

### Task 9: v3 `assessment-io.js` (схема + міграція v1→v3) і `assessment-run.js`

**Files:**
- Rewrite: `core/assessment/assessment-io.js`
- Create: `core/assessment/assessment-run.js`
- Rewrite: `test/assessment-io.test.js` → `test/assessment/assessment-io.test.js`
- Test: `test/assessment/assessment-run.test.js`

**Interfaces:**
- Produces (`assessment-io.js`):
  - `nextAssessmentId(existingIds)` — без змін (`ASSESS-YYYY-NNN`).
  - `makeAssessment({ approvedRecord, approvedName, plan, warnings, id, startedBy }) → assessment` v3:

```json
{ "kind": "assessment", "schema_version": "3.0.0", "id": "ASSESS-2026-002",
  "created_at": "...", "updated_at": "...", "status": "IN_PROGRESS",
  "started_by": "", "finalized_at": null, "finalized_by": null,
  "metadata": { "ics_name": "", "as_class": null, "info_type": null, "assessment_body": "",
    "assessor_name": "", "assessor_position": "", "assessment_start_date": "", "assessment_end_date": "" },
  "cpb_snapshot": { "source_approved_name": "...", "relative_path": "cpb-snapshot.json", "hash": "" },
  "warnings": [], "plan": { "items": [] },
  "results": [ { "assessment_source_id": "AC-02e", "methods_used": [], "result": "NOT_ASSESSED",
      "evidence_ids": [], "source_references": [], "assessor_comment": "", "conclusion": "", "finding_ids": [] } ],
  "evidence": [], "findings": [] }
```
  - `serializeAssessment/deserializeAssessment` — без змін.
  - `validateAssessmentSchema(obj) → string[]` — v3-перевірки (kind, id, plan.items, results, enum result).
  - `migrateAssessment(obj) → assessment` — v1 (`schema_version 1.x`, `items[]`) → v3; v3 повертається як є. Mapping: `POSITIVE→SATISFIED, PARTIALLY_POSITIVE→PARTIALLY_SATISFIED, NEGATIVE→NOT_SATISFIED, NOT_APPLICABLE→NOT_APPLICABLE, null|NOT_ASSESSED→NOT_ASSESSED`; v1 item → plan.item (перенести наявні поля: `assessment_source_id = item.id`, resolved_statement → resolved_objective, odp_refs/odp_values{} → odp_values[] з `effective_source: 'LEGACY'`, recommended_methods → available_methods) + result; v1 item.evidence[] → глобальні evidence з id `EV-001…` (v1 `method` → `methods_used` результату; `source_type||'OTHER'` → type; title/reference/observation переносяться; `collected_at = migration timestamp`, `collected_by = 'migration:v1'`); v1 `finding.description` → finding `{finding_id:'F-001…', severity:'OBSERVATION', title:'Перенесено з v1', description, evidence_ids:[], recommendation:'', status:'OPEN'}`.
- Produces (`assessment-run.js`):
  - `RESULT_VALUES = ['NOT_ASSESSED','SATISFIED','PARTIALLY_SATISFIED','NOT_SATISFIED','NOT_APPLICABLE']`
  - `updateResult(assessment, assessmentSourceId, patch) → { assessment, before, after }` — immutable update (новий об'єкт), patch дозволяє `{ result, methods_used, assessor_comment, conclusion, source_references }`; невідомий result → throw; методи поза `['EXAMINE','INTERVIEW','TEST']` → throw; FINALIZED → throw.
  - `finalizeAssessment(assessment, { finalizedBy }) → assessment` — статус FINALIZED + timestamps; повторний виклик → throw.

- [ ] **Step 1: Failing tests**

```js
// test/assessment/assessment-io.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeAssessment, migrateAssessment, validateAssessmentSchema, nextAssessmentId } from '../../core/assessment/assessment-io.js';

const plan = { items: [{ assessment_source_id: 'AC-02e', control_id: 'AC-02', available_methods: ['EXAMINE'], odp_values: [] }] };
const approvedRecord = { state: { passport: { ics_name: 'Тест', as_class: 2 }, info_type: 'open_confidential' } };

test('makeAssessment v3: schema 3.0.0, results ініціалізовані NOT_ASSESSED', () => {
  const a = makeAssessment({ approvedRecord, approvedName: 'test', plan, warnings: [], id: 'ASSESS-2026-002' });
  assert.equal(a.schema_version, '3.0.0');
  assert.equal(a.results.length, 1);
  assert.deepEqual(a.results[0], { assessment_source_id: 'AC-02e', methods_used: [], result: 'NOT_ASSESSED',
    evidence_ids: [], source_references: [], assessor_comment: '', conclusion: '', finding_ids: [] });
  assert.deepEqual(validateAssessmentSchema(a), []);
});

test('migrateAssessment: v1 → v3 enum/evidence/finding', () => {
  const v1 = { kind: 'assessment', schema_version: '1.0.0', id: 'ASSESS-2026-001', status: 'IN_PROGRESS',
    metadata: {}, cpb_snapshot: { source_approved_name: 'x', relative_path: 'cpb-snapshot.json', hash: '' },
    warnings: [], items: [{ id: 'AC-02.e', control_id: 'AC-02', statement_path: 'e', resolved_statement: 'текст',
      odp_refs: ['ac-2_odp.01'], odp_values: { 'ac-2_odp.01': 'значення' }, recommended_methods: ['EXAMINE'],
      conclusion: 'POSITIVE', assessor_comment: 'ок',
      evidence: [{ method: 'EXAMINE', source_type: 'ORDER', title: 'Наказ', reference: 'п. 4.2', observation: 'є' }],
      finding: { description: 'зауваження' } }] };
  const a = migrateAssessment(v1);
  assert.equal(a.schema_version, '3.0.0');
  const r = a.results.find(x => x.assessment_source_id === 'AC-02.e');
  assert.equal(r.result, 'SATISFIED');
  assert.deepEqual(r.methods_used, ['EXAMINE']);
  assert.equal(a.evidence.length, 1);
  assert.equal(a.evidence[0].evidence_id, 'EV-001');
  assert.equal(a.evidence[0].type, 'ORDER');
  assert.deepEqual(r.evidence_ids, ['EV-001']);
  assert.equal(a.findings[0].finding_id, 'F-001');
  assert.equal(a.findings[0].description, 'зауваження');
  assert.deepEqual(r.finding_ids, ['F-001']);
  const planItem = a.plan.items.find(i => i.assessment_source_id === 'AC-02.e');
  assert.equal(planItem.resolved_objective, 'текст');
  // v3 проходить без змін
  assert.equal(migrateAssessment(a), a);
});

test('nextAssessmentId', () => {
  const y = new Date().getFullYear();
  assert.equal(nextAssessmentId([`ASSESS-${y}-001`, `ASSESS-${y}-007`]), `ASSESS-${y}-008`);
});
```

```js
// test/assessment/assessment-run.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeAssessment } from '../../core/assessment/assessment-io.js';
import { updateResult, finalizeAssessment, RESULT_VALUES } from '../../core/assessment/assessment-run.js';

const plan = { items: [{ assessment_source_id: 'AC-02e', control_id: 'AC-02', available_methods: ['EXAMINE', 'TEST'], odp_values: [] }] };
const approvedRecord = { state: { passport: {}, info_type: 'open_confidential' } };
const base = () => makeAssessment({ approvedRecord, approvedName: 'x', plan, warnings: [], id: 'ASSESS-2026-009' });

test('updateResult: enum, методи, immutability, before/after', () => {
  const a = base();
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

test('finalizeAssessment: read-only після FINALIZED', () => {
  const a = finalizeAssessment(base(), { finalizedBy: 'Оцінювач' });
  assert.equal(a.status, 'FINALIZED');
  assert.ok(a.finalized_at);
  assert.throws(() => updateResult(a, 'AC-02e', { result: 'SATISFIED' }), /finalized|фіналізован/i);
  assert.throws(() => finalizeAssessment(a, { finalizedBy: 'x' }), /finalized|фіналізован/i);
});
```

- [ ] **Step 2: Запустити — FAIL.**

- [ ] **Step 3: Імплементація**

```js
// core/assessment/assessment-io.js
export function nextAssessmentId(existingIds) {
  const year = new Date().getFullYear();
  const nums = existingIds
    .map(id => id.match(new RegExp(`^ASSESS-${year}-(\\d+)$`)))
    .filter(Boolean).map(m => Number(m[1]));
  return `ASSESS-${year}-${String((nums.length ? Math.max(...nums) : 0) + 1).padStart(3, '0')}`;
}

export const RESULT_VALUES = ['NOT_ASSESSED', 'SATISFIED', 'PARTIALLY_SATISFIED', 'NOT_SATISFIED', 'NOT_APPLICABLE'];

export function emptyResult(assessmentSourceId) {
  return { assessment_source_id: assessmentSourceId, methods_used: [], result: 'NOT_ASSESSED',
    evidence_ids: [], source_references: [], assessor_comment: '', conclusion: '', finding_ids: [] };
}

export function makeAssessment({ approvedRecord, approvedName, plan, warnings, id, startedBy = '' }) {
  const now = new Date().toISOString();
  return {
    kind: 'assessment', schema_version: '3.0.0', id: id ?? nextAssessmentId([]),
    created_at: now, updated_at: now, status: 'IN_PROGRESS',
    started_by: startedBy, finalized_at: null, finalized_by: null,
    metadata: {
      ics_name: approvedRecord.state.passport?.ics_name ?? '',
      as_class: approvedRecord.state.passport?.as_class ?? null,
      info_type: approvedRecord.state.info_type ?? null,
      assessment_body: '', assessor_name: '', assessor_position: '',
      assessment_start_date: now.slice(0, 10), assessment_end_date: '',
    },
    cpb_snapshot: { source_approved_name: approvedName, relative_path: 'cpb-snapshot.json', hash: '' },
    warnings: warnings ?? [],
    plan: { items: plan.items },
    results: plan.items.map(i => emptyResult(i.assessment_source_id)),
    evidence: [], findings: [],
  };
}

const V1_CONCLUSION_MAP = { POSITIVE: 'SATISFIED', PARTIALLY_POSITIVE: 'PARTIALLY_SATISFIED',
  NEGATIVE: 'NOT_SATISFIED', NOT_APPLICABLE: 'NOT_APPLICABLE', NOT_ASSESSED: 'NOT_ASSESSED' };

export function migrateAssessment(obj) {
  if (obj?.schema_version?.startsWith('3.')) return obj;
  const now = new Date().toISOString();
  const evidence = [];
  const findings = [];
  const planItems = [];
  const results = [];
  for (const item of obj.items ?? []) {
    planItems.push({
      assessment_source_id: item.id, control_id: item.control_id,
      canonical_control_id: item.canonical_control_id ?? null, family: item.family ?? null,
      family_title: '', control_title: item.control_title ?? '', enhancement: !!item.enhancement,
      statement_path: item.statement_path ?? null, kind: 'STATEMENT', cpb_status: item.cpb_status ?? 'APPLIED',
      objective_template: item.source_statement ?? '', resolved_objective: item.resolved_statement ?? '',
      placeholders: [],
      odp_values: (item.odp_refs ?? []).map(ref => ({ assessment_odp_id: null, local_odp_id: ref,
        baseline_value: null, target_value: item.odp_values?.[ref] ?? null,
        effective_source: 'LEGACY', status: item.odp_values?.[ref] != null ? 'RESOLVED' : 'UNRESOLVED' })),
      available_methods: item.recommended_methods ?? [],
    });
    const r = emptyResult(item.id);
    r.result = V1_CONCLUSION_MAP[item.conclusion] ?? 'NOT_ASSESSED';
    r.assessor_comment = item.assessor_comment ?? '';
    for (const ev of item.evidence ?? []) {
      const evidence_id = `EV-${String(evidence.length + 1).padStart(3, '0')}`;
      evidence.push({ evidence_id, type: ev.source_type || 'OTHER', title: ev.title ?? '',
        source: ev.attachment ? { kind: 'LOCAL_FILE', path: `evidence/${ev.attachment}` } : { kind: 'NONE', path: null },
        reference: ev.reference ?? '', observation: ev.observation ?? '',
        collected_at: now, collected_by: 'migration:v1' });
      r.evidence_ids.push(evidence_id);
      if (ev.method && !r.methods_used.includes(ev.method) && ['EXAMINE', 'INTERVIEW', 'TEST'].includes(ev.method))
        r.methods_used.push(ev.method);
    }
    if (item.finding?.description) {
      const finding_id = `F-${String(findings.length + 1).padStart(3, '0')}`;
      findings.push({ finding_id, assessment_source_id: item.id, severity: 'OBSERVATION',
        title: 'Перенесено з v1', description: item.finding.description, evidence_ids: [],
        recommendation: '', status: 'OPEN' });
      r.finding_ids.push(finding_id);
    }
    results.push(r);
  }
  return { ...obj, schema_version: '3.0.0', started_by: obj.started_by ?? '',
    finalized_at: obj.finalized_at ?? null, finalized_by: obj.finalized_by ?? null,
    plan: { items: planItems }, results, evidence, findings, items: undefined };
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
  if (!obj.schema_version?.startsWith('3.')) errs.push('Очікується schema_version 3.x');
  if (!Array.isArray(obj.plan?.items)) errs.push('plan.items має бути масивом');
  if (!Array.isArray(obj.results)) errs.push('results має бути масивом');
  else for (const r of obj.results)
    if (!RESULT_VALUES.includes(r.result)) errs.push(`Невідомий result "${r.result}" (${r.assessment_source_id})`);
  if (!Array.isArray(obj.evidence)) errs.push('evidence має бути масивом');
  if (!Array.isArray(obj.findings)) errs.push('findings має бути масивом');
  return errs;
}
```

```js
// core/assessment/assessment-run.js
export { RESULT_VALUES } from './assessment-io.js';
import { RESULT_VALUES } from './assessment-io.js';

const METHODS = ['EXAMINE', 'INTERVIEW', 'TEST'];

function assertMutable(assessment) {
  if (assessment.status === 'FINALIZED') throw new Error('оцінювання фіналізовано — зміни заборонені');
}

export function updateResult(assessment, assessmentSourceId, patch) {
  assertMutable(assessment);
  const i = assessment.results.findIndex(r => r.assessment_source_id === assessmentSourceId);
  if (i === -1) throw new Error(`результат не знайдено: ${assessmentSourceId}`);
  if (patch.result !== undefined && !RESULT_VALUES.includes(patch.result))
    throw new Error(`невідомий result: ${patch.result}`);
  if (patch.methods_used !== undefined)
    for (const m of patch.methods_used) if (!METHODS.includes(m)) throw new Error(`невідомий метод: ${m}`);
  const before = assessment.results[i];
  const allowed = ['result', 'methods_used', 'assessor_comment', 'conclusion', 'source_references'];
  const after = { ...before };
  for (const k of allowed) if (patch[k] !== undefined) after[k] = patch[k];
  const results = assessment.results.slice();
  results[i] = after;
  return { assessment: { ...assessment, results, updated_at: new Date().toISOString() }, before, after };
}

export function finalizeAssessment(assessment, { finalizedBy = '' } = {}) {
  assertMutable(assessment);
  const now = new Date().toISOString();
  return { ...assessment, status: 'FINALIZED', finalized_at: now, finalized_by: finalizedBy, updated_at: now };
}
```

- [ ] **Step 4: Тести — PASS**; видалити старий `test/assessment-io.test.js`; `npm test` повністю (server-тест може вимагати правки: `makeAssessment` тепер приймає `plan` — оновити виклик у `server.js`: `makeAssessment({ approvedRecord, approvedName, plan: { items }, warnings, id })`).

- [ ] **Step 5: Commit**

```bash
git add -A core/assessment/assessment-io.js core/assessment/assessment-run.js test/ server.js
git commit -m "feat(assessment): v3 run model with SATISFIED enum, v1->v3 migration, finalize guard"
```

---

### Task 10: `evidence.js`, `findings.js`, v3 `assessment-validator.js`

**Files:**
- Create: `core/assessment/evidence.js`, `core/assessment/findings.js`
- Rewrite: `core/assessment/assessment-validator.js`, `core/assessment/assessment-summary.js`
- Rewrite: `test/assessment-validator.test.js` → `test/assessment/assessment-validator.test.js`; `test/assessment-summary.test.js` → `test/assessment/assessment-summary.test.js`
- Test: `test/assessment/evidence.test.js`, `test/assessment/findings.test.js`

**Interfaces:**
- `evidence.js`:
  - `EVIDENCE_TYPES = ['DOCUMENT','POLICY','PROCEDURE','ORDER','REGISTER','SYSTEM_CONFIGURATION','SCREENSHOT','LOG','INTERVIEW_NOTE','TEST_RESULT','PHYSICAL_INSPECTION','OTHER']`
  - `nextEvidenceId(assessment) → 'EV-NNN'`
  - `addEvidence(assessment, resultSourceId, evidenceFields) → { assessment, evidence }` — валідує type/поля, пушить у `assessment.evidence`, додає id у result.evidence_ids; FINALIZED → throw; `source.path` має починатися з `evidence/` і не містити `..`.
  - `removeEvidence(assessment, evidenceId) → { assessment, removed }` — знімає з усіх results.evidence_ids і findings.evidence_ids.
- `findings.js`:
  - `SEVERITIES = ['OBSERVATION','MINOR','MAJOR','CRITICAL']`, `FINDING_STATUSES = ['OPEN','CLOSED']`
  - `nextFindingId(assessment) → 'F-NNN'`
  - `addFinding(assessment, { assessment_source_id, severity, title, description, evidence_ids, recommendation }) → { assessment, finding }` — лінк до result.finding_ids; невідомий severity/評source → throw.
  - `updateFinding(assessment, findingId, patch) → { assessment, before, after }`; `removeFinding(assessment, findingId)`.
- `assessment-validator.js` (v3):
  - `validateResult(result, { findings }) → string[]`: `SATISFIED/PARTIALLY_SATISFIED/NOT_SATISFIED` без evidence_ids → помилка; `PARTIALLY_SATISFIED/NOT_SATISFIED` без пов'язаного finding → помилка; `NOT_APPLICABLE` без assessor_comment → помилка.
  - `validateAssessment(assessment) → string[]` — по всіх results + referential integrity (evidence_ids/finding_ids існують).
- `assessment-summary.js` (v3): `buildAssessmentSummary(assessment) → { total, satisfied, partially_satisfied, not_satisfied, not_applicable, not_assessed, has_finding, evidence_count }` (рахує по `results`).

- [ ] **Step 1: Failing tests**

```js
// test/assessment/evidence.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeAssessment } from '../../core/assessment/assessment-io.js';
import { addEvidence, removeEvidence, EVIDENCE_TYPES } from '../../core/assessment/evidence.js';
import { finalizeAssessment } from '../../core/assessment/assessment-run.js';

const plan = { items: [{ assessment_source_id: 'AC-02e', control_id: 'AC-02', available_methods: ['EXAMINE'], odp_values: [] }] };
const base = () => makeAssessment({ approvedRecord: { state: { passport: {}, info_type: 'open_confidential' } }, approvedName: 'x', plan, warnings: [], id: 'ASSESS-2026-050' });
const fields = { type: 'ORDER', title: 'Наказ про облікові записи', source: { kind: 'LOCAL_FILE', path: 'evidence/nakaz.pdf' },
  reference: 'п. 4.2', observation: 'схвалення фіксується', collected_by: 'Оцінювач' };

test('addEvidence: id, лінк до result, sandbox path', () => {
  const { assessment, evidence } = addEvidence(base(), 'AC-02e', fields);
  assert.equal(evidence.evidence_id, 'EV-001');
  assert.ok(evidence.collected_at);
  assert.deepEqual(assessment.results[0].evidence_ids, ['EV-001']);
  assert.throws(() => addEvidence(base(), 'AC-02e', { ...fields, type: 'MALWARE' }), /тип/i);
  assert.throws(() => addEvidence(base(), 'AC-02e', { ...fields, source: { kind: 'LOCAL_FILE', path: '../secret' } }), /шлях/i);
  assert.throws(() => addEvidence(finalizeAssessment(base()), 'AC-02e', fields), /фіналізован/i);
  assert.equal(EVIDENCE_TYPES.length, 12);
});

test('removeEvidence знімає всі посилання', () => {
  const a1 = addEvidence(base(), 'AC-02e', fields).assessment;
  const { assessment } = removeEvidence(a1, 'EV-001');
  assert.deepEqual(assessment.evidence, []);
  assert.deepEqual(assessment.results[0].evidence_ids, []);
});
```

```js
// test/assessment/findings.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeAssessment } from '../../core/assessment/assessment-io.js';
import { addFinding, updateFinding, SEVERITIES } from '../../core/assessment/findings.js';

const plan = { items: [{ assessment_source_id: 'AC-02e', control_id: 'AC-02', available_methods: [], odp_values: [] }] };
const base = () => makeAssessment({ approvedRecord: { state: { passport: {}, info_type: 'open_confidential' } }, approvedName: 'x', plan, warnings: [], id: 'ASSESS-2026-051' });

test('addFinding: id, severity, лінк до result', () => {
  const { assessment, finding } = addFinding(base(), { assessment_source_id: 'AC-02e', severity: 'MAJOR',
    title: 'Відсутні схвалення', description: 'Запити створюються без погодження', evidence_ids: [], recommendation: 'Впровадити' });
  assert.equal(finding.finding_id, 'F-001');
  assert.equal(finding.status, 'OPEN');
  assert.deepEqual(assessment.results[0].finding_ids, ['F-001']);
  assert.throws(() => addFinding(base(), { assessment_source_id: 'AC-02e', severity: 'HUGE', title: 't', description: 'd' }), /severity/i);
  assert.throws(() => addFinding(base(), { assessment_source_id: 'нема', severity: 'MINOR', title: 't', description: 'd' }), /не знайдено/i);
  assert.deepEqual(SEVERITIES, ['OBSERVATION', 'MINOR', 'MAJOR', 'CRITICAL']);
});

test('updateFinding: статус і перевірка before/after', () => {
  const a = addFinding(base(), { assessment_source_id: 'AC-02e', severity: 'MINOR', title: 't', description: 'd' }).assessment;
  const { assessment, after } = updateFinding(a, 'F-001', { status: 'CLOSED' });
  assert.equal(after.status, 'CLOSED');
  assert.equal(assessment.findings[0].status, 'CLOSED');
  assert.throws(() => updateFinding(a, 'F-001', { status: 'MAYBE' }), /статус/i);
});
```

```js
// test/assessment/assessment-validator.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateResult, validateAssessment } from '../../core/assessment/assessment-validator.js';

test('validateResult: evidence обовʼязкові для оцінених, finding для negative, коментар для N/A', () => {
  const ok = (r, f = []) => validateResult(r, { findings: f });
  assert.equal(ok({ assessment_source_id: 'x', result: 'SATISFIED', evidence_ids: ['EV-001'], finding_ids: [], assessor_comment: '' }).length, 0);
  assert.ok(ok({ assessment_source_id: 'x', result: 'SATISFIED', evidence_ids: [], finding_ids: [], assessor_comment: '' }).length > 0);
  assert.ok(ok({ assessment_source_id: 'x', result: 'NOT_SATISFIED', evidence_ids: ['EV-001'], finding_ids: [], assessor_comment: '' }).length > 0);
  assert.equal(ok({ assessment_source_id: 'x', result: 'NOT_SATISFIED', evidence_ids: ['EV-001'], finding_ids: ['F-001'], assessor_comment: '' },
    [{ finding_id: 'F-001' }]).length, 0);
  assert.ok(ok({ assessment_source_id: 'x', result: 'NOT_APPLICABLE', evidence_ids: [], finding_ids: [], assessor_comment: '' }).length > 0);
  assert.equal(ok({ assessment_source_id: 'x', result: 'NOT_ASSESSED', evidence_ids: [], finding_ids: [], assessor_comment: '' }).length, 0);
});

test('validateAssessment: referential integrity', () => {
  const a = { results: [{ assessment_source_id: 'x', result: 'NOT_ASSESSED', evidence_ids: ['EV-404'], finding_ids: [], assessor_comment: '' }],
    evidence: [], findings: [] };
  assert.ok(validateAssessment(a).some(e => e.includes('EV-404')));
});
```

```js
// test/assessment/assessment-summary.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildAssessmentSummary } from '../../core/assessment/assessment-summary.js';

test('summary рахує по v3 results', () => {
  const a = { results: [
    { result: 'SATISFIED', finding_ids: [] }, { result: 'PARTIALLY_SATISFIED', finding_ids: ['F-001'] },
    { result: 'NOT_SATISFIED', finding_ids: ['F-002'] }, { result: 'NOT_APPLICABLE', finding_ids: [] },
    { result: 'NOT_ASSESSED', finding_ids: [] } ], evidence: [{}, {}] };
  assert.deepEqual(buildAssessmentSummary(a), { total: 5, satisfied: 1, partially_satisfied: 1,
    not_satisfied: 1, not_applicable: 1, not_assessed: 1, has_finding: 2, evidence_count: 2 });
});
```

- [ ] **Step 2: Запустити — FAIL.**

- [ ] **Step 3: Імплементація**

```js
// core/assessment/evidence.js
export const EVIDENCE_TYPES = ['DOCUMENT', 'POLICY', 'PROCEDURE', 'ORDER', 'REGISTER', 'SYSTEM_CONFIGURATION',
  'SCREENSHOT', 'LOG', 'INTERVIEW_NOTE', 'TEST_RESULT', 'PHYSICAL_INSPECTION', 'OTHER'];

export function nextEvidenceId(assessment) {
  const nums = assessment.evidence.map(e => Number(e.evidence_id?.match(/^EV-(\d+)$/)?.[1] ?? 0));
  return `EV-${String((nums.length ? Math.max(...nums) : 0) + 1).padStart(3, '0')}`;
}

function assertMutable(assessment) {
  if (assessment.status === 'FINALIZED') throw new Error('оцінювання фіналізовано — зміни заборонені');
}

export function addEvidence(assessment, resultSourceId, fields) {
  assertMutable(assessment);
  const i = assessment.results.findIndex(r => r.assessment_source_id === resultSourceId);
  if (i === -1) throw new Error(`результат не знайдено: ${resultSourceId}`);
  if (!EVIDENCE_TYPES.includes(fields.type)) throw new Error(`невідомий тип доказу: ${fields.type}`);
  const path = fields.source?.path;
  if (fields.source?.kind === 'LOCAL_FILE' && (typeof path !== 'string' || !path.startsWith('evidence/') || path.includes('..')))
    throw new Error('шлях доказу має бути в межах evidence/');
  const evidence = { evidence_id: nextEvidenceId(assessment), type: fields.type, title: fields.title ?? '',
    source: fields.source ?? { kind: 'NONE', path: null }, reference: fields.reference ?? '',
    observation: fields.observation ?? '', collected_at: new Date().toISOString(), collected_by: fields.collected_by ?? '' };
  const results = assessment.results.slice();
  results[i] = { ...results[i], evidence_ids: [...results[i].evidence_ids, evidence.evidence_id] };
  return { assessment: { ...assessment, results, evidence: [...assessment.evidence, evidence], updated_at: evidence.collected_at }, evidence };
}

export function removeEvidence(assessment, evidenceId) {
  assertMutable(assessment);
  const removed = assessment.evidence.find(e => e.evidence_id === evidenceId);
  if (!removed) throw new Error(`доказ не знайдено: ${evidenceId}`);
  return { assessment: { ...assessment,
    evidence: assessment.evidence.filter(e => e.evidence_id !== evidenceId),
    results: assessment.results.map(r => ({ ...r, evidence_ids: r.evidence_ids.filter(id => id !== evidenceId) })),
    findings: assessment.findings.map(f => ({ ...f, evidence_ids: (f.evidence_ids ?? []).filter(id => id !== evidenceId) })),
    updated_at: new Date().toISOString() }, removed };
}
```

```js
// core/assessment/findings.js
export const SEVERITIES = ['OBSERVATION', 'MINOR', 'MAJOR', 'CRITICAL'];
export const FINDING_STATUSES = ['OPEN', 'CLOSED'];

export function nextFindingId(assessment) {
  const nums = assessment.findings.map(f => Number(f.finding_id?.match(/^F-(\d+)$/)?.[1] ?? 0));
  return `F-${String((nums.length ? Math.max(...nums) : 0) + 1).padStart(3, '0')}`;
}

function assertMutable(assessment) {
  if (assessment.status === 'FINALIZED') throw new Error('оцінювання фіналізовано — зміни заборонені');
}

export function addFinding(assessment, { assessment_source_id, severity, title, description, evidence_ids = [], recommendation = '' }) {
  assertMutable(assessment);
  const i = assessment.results.findIndex(r => r.assessment_source_id === assessment_source_id);
  if (i === -1) throw new Error(`результат не знайдено: ${assessment_source_id}`);
  if (!SEVERITIES.includes(severity)) throw new Error(`невідома severity: ${severity}`);
  const finding = { finding_id: nextFindingId(assessment), assessment_source_id, severity,
    title: title ?? '', description: description ?? '', evidence_ids, recommendation, status: 'OPEN' };
  const results = assessment.results.slice();
  results[i] = { ...results[i], finding_ids: [...results[i].finding_ids, finding.finding_id] };
  return { assessment: { ...assessment, results, findings: [...assessment.findings, finding], updated_at: new Date().toISOString() }, finding };
}

export function updateFinding(assessment, findingId, patch) {
  assertMutable(assessment);
  const i = assessment.findings.findIndex(f => f.finding_id === findingId);
  if (i === -1) throw new Error(`недолік не знайдено: ${findingId}`);
  if (patch.severity !== undefined && !SEVERITIES.includes(patch.severity)) throw new Error(`невідома severity: ${patch.severity}`);
  if (patch.status !== undefined && !FINDING_STATUSES.includes(patch.status)) throw new Error(`невідомий статус: ${patch.status}`);
  const before = assessment.findings[i];
  const allowed = ['severity', 'title', 'description', 'evidence_ids', 'recommendation', 'status'];
  const after = { ...before };
  for (const k of allowed) if (patch[k] !== undefined) after[k] = patch[k];
  const findings = assessment.findings.slice();
  findings[i] = after;
  return { assessment: { ...assessment, findings, updated_at: new Date().toISOString() }, before, after };
}

export function removeFinding(assessment, findingId) {
  assertMutable(assessment);
  const removed = assessment.findings.find(f => f.finding_id === findingId);
  if (!removed) throw new Error(`недолік не знайдено: ${findingId}`);
  return { assessment: { ...assessment,
    findings: assessment.findings.filter(f => f.finding_id !== findingId),
    results: assessment.results.map(r => ({ ...r, finding_ids: r.finding_ids.filter(id => id !== findingId) })),
    updated_at: new Date().toISOString() }, removed };
}
```

```js
// core/assessment/assessment-validator.js
const ASSESSED = ['SATISFIED', 'PARTIALLY_SATISFIED', 'NOT_SATISFIED'];
const NEEDS_FINDING = ['PARTIALLY_SATISFIED', 'NOT_SATISFIED'];

export function validateResult(result, { findings = [] } = {}) {
  const errs = [];
  const label = result.assessment_source_id;
  if (ASSESSED.includes(result.result) && !result.evidence_ids.length)
    errs.push(`${label}: оцінка «${result.result}» потребує щонайменше одного доказу`);
  if (NEEDS_FINDING.includes(result.result)) {
    const has = result.finding_ids.some(id => findings.some(f => f.finding_id === id));
    if (!has) errs.push(`${label}: оцінка «${result.result}» потребує зафіксованого недоліку`);
  }
  if (result.result === 'NOT_APPLICABLE' && !result.assessor_comment?.trim())
    errs.push(`${label}: «NOT_APPLICABLE» потребує коментаря оцінювача`);
  return errs;
}

export function validateAssessment(assessment) {
  const errs = [];
  const evidenceIds = new Set((assessment.evidence ?? []).map(e => e.evidence_id));
  const findingIds = new Set((assessment.findings ?? []).map(f => f.finding_id));
  for (const r of assessment.results ?? []) {
    errs.push(...validateResult(r, { findings: assessment.findings ?? [] }));
    for (const id of r.evidence_ids) if (!evidenceIds.has(id)) errs.push(`${r.assessment_source_id}: посилання на неіснуючий доказ ${id}`);
    for (const id of r.finding_ids) if (!findingIds.has(id)) errs.push(`${r.assessment_source_id}: посилання на неіснуючий недолік ${id}`);
  }
  return errs;
}
```

```js
// core/assessment/assessment-summary.js
export function buildAssessmentSummary(assessment) {
  const s = { total: 0, satisfied: 0, partially_satisfied: 0, not_satisfied: 0, not_applicable: 0,
    not_assessed: 0, has_finding: 0, evidence_count: (assessment.evidence ?? []).length };
  for (const r of assessment.results ?? []) {
    s.total++;
    if (r.result === 'SATISFIED') s.satisfied++;
    else if (r.result === 'PARTIALLY_SATISFIED') s.partially_satisfied++;
    else if (r.result === 'NOT_SATISFIED') s.not_satisfied++;
    else if (r.result === 'NOT_APPLICABLE') s.not_applicable++;
    else s.not_assessed++;
    if (r.finding_ids?.length) s.has_finding++;
  }
  return s;
}
```

- [ ] **Step 4: Видалити старі `test/assessment-validator.test.js`, `test/assessment-summary.test.js`; `npm test` зелений** (validateAssessmentSchema з Task 9 викликає v3 validateAssessment — перевірити, що інтеграція узгоджена: `validateAssessmentSchema` НЕ включає validateResult-помилки як blocking для PUT чернетки; викликати validateAssessment лише при finalize — виправити `validateAssessmentSchema`, прибравши виклик validateAssessment, якщо він лишився з v1).

- [ ] **Step 5: Commit**

```bash
git add -A core/assessment/ test/
git commit -m "feat(assessment): v3 evidence/findings models, validator and summary"
```

---

### Task 11: `audit-trail.js` + версії/хеші snapshot

**Files:**
- Create: `core/assessment/audit-trail.js`
- Create: `core/assessment/versioning.js`
- Test: `test/assessment/audit-trail.test.js`, `test/assessment/versioning.test.js`

**Interfaces:**
- `audit-trail.js`:
  - `AUDIT_ACTIONS = ['ASSESSMENT_CREATED','ASSESSMENT_STARTED','RESULT_UPDATED','EVIDENCE_ADDED','EVIDENCE_REMOVED','FINDING_CREATED','FINDING_UPDATED','ASSESSMENT_FINALIZED','REPORT_GENERATED']`
  - `makeAuditEntry({ actor, action, entity_id, before = {}, after = {} }) → { timestamp, actor, action, entity_id, before, after }` — невідомий action → throw.
  - `appendAuditEntry(logArray, entry) → newArray` (append-only, не мутує).
- `versioning.js`:
  - `sha256(text: string|Buffer) → hex string` (через `node:crypto`).
  - `buildCatalogVersion({ files: {name: contentString} }) → { generated_at, hashes: {name: {sha256, bytes}} }` — для `catalog-version.json`.

- [ ] **Step 1: Failing tests**

```js
// test/assessment/audit-trail.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeAuditEntry, appendAuditEntry, AUDIT_ACTIONS } from '../../core/assessment/audit-trail.js';

test('makeAuditEntry: структура і валідація action', () => {
  const e = makeAuditEntry({ actor: 'Оцінювач', action: 'RESULT_UPDATED', entity_id: 'AC-02e',
    before: { result: 'NOT_ASSESSED' }, after: { result: 'SATISFIED' } });
  assert.ok(e.timestamp);
  assert.equal(e.action, 'RESULT_UPDATED');
  assert.deepEqual(e.before, { result: 'NOT_ASSESSED' });
  assert.throws(() => makeAuditEntry({ actor: 'x', action: 'HACKED', entity_id: 'y' }), /action/i);
  assert.equal(AUDIT_ACTIONS.length, 9);
});

test('appendAuditEntry не мутує вихідний масив', () => {
  const log = [];
  const out = appendAuditEntry(log, makeAuditEntry({ actor: 'x', action: 'ASSESSMENT_CREATED', entity_id: 'ASSESS-2026-001' }));
  assert.equal(log.length, 0);
  assert.equal(out.length, 1);
});
```

```js
// test/assessment/versioning.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sha256, buildCatalogVersion } from '../../core/assessment/versioning.js';

test('sha256 детермінований', () => {
  assert.equal(sha256('abc'), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
});

test('buildCatalogVersion: hash + bytes на файл', () => {
  const v = buildCatalogVersion({ files: { 'nd_tzi.json': '{}', 'adapter.json': '{"a":1}' } });
  assert.ok(v.generated_at);
  assert.equal(v.hashes['nd_tzi.json'].sha256, sha256('{}'));
  assert.equal(v.hashes['adapter.json'].bytes, 8);
});
```

- [ ] **Step 2: FAIL → Step 3: Імплементація**

```js
// core/assessment/audit-trail.js
export const AUDIT_ACTIONS = ['ASSESSMENT_CREATED', 'ASSESSMENT_STARTED', 'RESULT_UPDATED', 'EVIDENCE_ADDED',
  'EVIDENCE_REMOVED', 'FINDING_CREATED', 'FINDING_UPDATED', 'ASSESSMENT_FINALIZED', 'REPORT_GENERATED'];

export function makeAuditEntry({ actor = '', action, entity_id = '', before = {}, after = {} }) {
  if (!AUDIT_ACTIONS.includes(action)) throw new Error(`невідомий audit action: ${action}`);
  return { timestamp: new Date().toISOString(), actor, action, entity_id, before, after };
}

export function appendAuditEntry(logArray, entry) {
  return [...(logArray ?? []), entry];
}
```

```js
// core/assessment/versioning.js
import { createHash } from 'node:crypto';

export function sha256(data) {
  return createHash('sha256').update(data).digest('hex');
}

export function buildCatalogVersion({ files }) {
  const hashes = {};
  for (const [name, content] of Object.entries(files))
    hashes[name] = { sha256: sha256(content), bytes: Buffer.byteLength(content) };
  return { generated_at: new Date().toISOString(), hashes };
}
```

- [ ] **Step 4: Тести — PASS. Step 5: Commit**

```bash
git add core/assessment/audit-trail.js core/assessment/versioning.js test/assessment/audit-trail.test.js test/assessment/versioning.test.js
git commit -m "feat(assessment): audit trail entries and snapshot version hashes"
```

---

### Task 12: Server routes v3 (finalize, audit, read-only, catalog-version)

**Files:**
- Modify: `server.js` (блок `parts[1] === 'assessments'`)
- Rewrite: `test/server-assessment.test.js` → `test/assessment/server-assessment.test.js`

**Interfaces (маршрути після task):**
```text
GET    /api/assessments                       → { items }
POST   /api/assessments {approved_name}       → 201 { id }  (+catalog-version.json, audit ASSESSMENT_CREATED)
GET    /api/assessments/:id                   → assessment (migrateAssessment на льоту; якщо мігровано — перезаписати файл)
PUT    /api/assessments/:id                   → 200 | 409 якщо FINALIZED (+audit RESULT_UPDATED)
POST   /api/assessments/:id/evidence?filename → 200 | 409 якщо FINALIZED (+audit EVIDENCE_ADDED)
DELETE /api/assessments/:id/evidence/:file    → 200 | 409 якщо FINALIZED (+audit EVIDENCE_REMOVED)
POST   /api/assessments/:id/finalize {finalized_by} → 200 {ok} | 400 з validateAssessment errors | 409 (+audit ASSESSMENT_FINALIZED)
POST   /api/assessments/:id/export/docx       → DOCX (+audit REPORT_GENERATED)
GET    /api/assessments/:id/audit             → { entries }
```
- Snapshot при створенні: `assessment.cpb_snapshot.hash = sha256(JSON.stringify(approvedRecord))`; `catalog-version.json` з хешами `nd_tzi.json`, `assessment/assessment_odp_adapter.json`, `assessment/assessment_catalog.json`, `assessment/assessment_reference.json`, `generic_parameter_defaults.json`, `bpb_<info_type>.json`.
- Audit: helper у server.js читає/пише `assessments/<id>/audit-log.json` через `appendAuditEntry`; actor — з body `actor` або `''`.
- PUT: `migrateAssessment` не потрібен (клієнт шле v3); перевірка `existing.status === 'FINALIZED'` → 409 до запису.

- [ ] **Step 1: Переписати server-тест** (за зразком наявного `test/server-assessment.test.js` — він стартує сервер на випадковому порту; ВАЖЛИВО: cleanup видаляє ЛИШЕ створений тестом id):

```js
// test/assessment/server-assessment.test.js — ключові кейси (повний файл будується за наявним зразком)
// 1. POST /api/assessments з approved fixture → 201, на диску assessment.json(v3)+cpb-snapshot.json+catalog-version.json+audit-log.json з ASSESSMENT_CREATED
// 2. GET :id повертає schema_version 3.0.0 (створити вручну v1-файл → GET віддає мігрований v3 і перезаписує)
// 3. PUT з result=SATISFIED → 200; audit-log містить RESULT_UPDATED
// 4. POST finalize з невалідними results (SATISFIED без evidence) → 400 з переліком помилок
// 5. Валідний flow: додати evidence через PUT (модель) + файл через POST evidence → finalize → 200
// 6. Після finalize: PUT → 409, POST evidence → 409, DELETE evidence → 409
// 7. GET :id/audit → entries у хронологічному порядку
// Cleanup: rmSync(join(assessDir, createdId), {recursive:true, force:true}) — НІКОЛИ не rmSync('assessments')
```
Повний код тесту пишеться за структурою наявного `test/server-assessment.test.js` (він містить хелпери запуску сервера і фікстуру approved-запису) — перенести хелпери, замінити перевірки на 7 кейсів вище.

- [ ] **Step 2: FAIL → Step 3: Імплементація в server.js.** Ключові фрагменти:

```js
// server.js — нові імпорти
import { migrateAssessment } from './core/assessment/assessment-io.js';
import { validateAssessment } from './core/assessment/assessment-validator.js';
import { makeAuditEntry, appendAuditEntry } from './core/assessment/audit-trail.js';
import { sha256, buildCatalogVersion } from './core/assessment/versioning.js';

// helper поруч із readBody
async function appendAudit(dir, entry) {
  const file = join(dir, 'audit-log.json');
  let log = [];
  try { log = JSON.parse(await readFile(file, 'utf8')); } catch { /* нового запису ще немає */ }
  await writeFile(file, JSON.stringify(appendAuditEntry(log, entry), null, 2));
}

async function readAssessmentGuarded(dir) {
  const raw = JSON.parse(await readFile(join(dir, 'assessment.json'), 'utf8'));
  const migrated = migrateAssessment(raw);
  if (migrated !== raw) await writeFile(join(dir, 'assessment.json'), serializeAssessment(migrated));
  return migrated;
}
```

```js
// POST /api/assessments — доповнення після створення assessment (замінює старий блок запису)
const snapshotText = JSON.stringify(approvedRecord, null, 2);
assessment.cpb_snapshot.hash = sha256(snapshotText);
const dataFiles = {
  'nd_tzi.json': await readFile(join(ROOT, 'data', 'nd_tzi.json'), 'utf8'),
  'assessment_odp_adapter.json': await readFile(join(ROOT, 'data', 'assessment', 'assessment_odp_adapter.json'), 'utf8'),
  'assessment_catalog.json': await readFile(join(ROOT, 'data', 'assessment', 'assessment_catalog.json'), 'utf8'),
  'assessment_reference.json': await readFile(join(ROOT, 'data', 'assessment', 'assessment_reference.json'), 'utf8'),
  'generic_parameter_defaults.json': await readFile(join(ROOT, 'data', 'generic_parameter_defaults.json'), 'utf8'),
};
await writeFile(join(dir, 'catalog-version.json'), JSON.stringify(buildCatalogVersion({ files: dataFiles }), null, 2));
await writeFile(join(dir, 'assessment.json'), serializeAssessment(assessment));
await writeFile(join(dir, 'cpb-snapshot.json'), snapshotText);
await appendAudit(dir, makeAuditEntry({ actor: body.actor ?? '', action: 'ASSESSMENT_CREATED', entity_id: id }));
return json(res, 201, { id });
```

```js
// PUT /api/assessments/:id — guard і audit
const existing = await readAssessmentGuarded(dir);
if (existing.status === 'FINALIZED') return json(res, 409, { error: 'оцінювання фіналізовано — зміни заборонені' });
const errors = validateAssessmentSchema(body);
if (errors.length) return json(res, 400, { error: errors.join('; ') });
body.updated_at = new Date().toISOString();
await writeFile(join(dir, 'assessment.json'), serializeAssessment(body));
await appendAudit(dir, makeAuditEntry({ actor: body.actor_name ?? '', action: 'RESULT_UPDATED', entity_id: body.id,
  before: { updated_at: existing.updated_at }, after: { updated_at: body.updated_at } }));
return json(res, 200, { ok: true });
```

```js
// POST /api/assessments/:id/finalize
if (parts[3] === 'finalize' && parts.length === 4 && req.method === 'POST') {
  const body = JSON.parse((await readBody(req)).toString('utf8') || '{}');
  const a = await readAssessmentGuarded(dir);
  if (a.status === 'FINALIZED') return json(res, 409, { error: 'вже фіналізовано' });
  const errors = validateAssessment(a);
  if (errors.length) return json(res, 400, { error: errors.join('; '), errors });
  const { finalizeAssessment } = await import('./core/assessment/assessment-run.js');
  const finalized = finalizeAssessment(a, { finalizedBy: body.finalized_by ?? '' });
  await writeFile(join(dir, 'assessment.json'), serializeAssessment(finalized));
  await appendAudit(dir, makeAuditEntry({ actor: body.finalized_by ?? '', action: 'ASSESSMENT_FINALIZED', entity_id: a.id }));
  return json(res, 200, { ok: true });
}
// GET /api/assessments/:id/audit
if (parts[3] === 'audit' && req.method === 'GET') {
  try { return json(res, 200, { entries: JSON.parse(await readFile(join(dir, 'audit-log.json'), 'utf8')) }); }
  catch { return json(res, 200, { entries: [] }); }
}
```
Аналогічні guard-и (`status === 'FINALIZED'` → 409 + audit EVIDENCE_ADDED/EVIDENCE_REMOVED) додати в evidence POST/DELETE; export/docx: після генерації `appendAudit(..., 'REPORT_GENERATED')`. GET :id → `readAssessmentGuarded`. `finalizeAssessment` імпортувати зверху разом з іншими (не динамічно) — фрагмент вище спрощений, у файлі використати статичний import.

- [ ] **Step 4: `npm test` — зелено** (видалити старий `test/server-assessment.test.js`).

- [ ] **Step 5: Commit**

```bash
git add -A server.js test/
git commit -m "feat(assessment): v3 server routes — finalize, audit trail, snapshot hashes, read-only guard"
```

---

### Task 13: UI — згрупована таблиця оцінювання

**Files:**
- Create: `public/js/assessment/assessment-table.js`
- Rewrite: `public/js/assessment/assessment-item.js` (детальна панель item)
- Modify: `public/js/assessment/assessment-app.js`, `public/js/assessment/assessment-state.js`
- Modify: `public/css/*.css` (стилі таблиці — додати класи `assessment-table`, `odp-subrow`, `group-row`)
- Test: `test/assessment/assessment-table.test.js` (unit на функції групування/лейблів, без DOM)

**Interfaces:**
- `assessment-table.js`:
  - `groupPlanItems(assessment) → Array<{ family, family_title, controls: Array<{ control_id, control_title, items: Array<{ planItem, result }> }> }>` — з'єднує plan.items з results за `assessment_source_id`, групує family → control, стабільний порядок як у plan.
  - `RESULT_LABELS = { NOT_ASSESSED:'Не оцінено', SATISFIED:'Відповідає', PARTIALLY_SATISFIED:'Частково відповідає', NOT_SATISFIED:'Не відповідає', NOT_APPLICABLE:'Не застосовується' }`
  - `METHOD_LABELS = { EXAMINE:'Дослідження', INTERVIEW:'Співбесіда', TEST:'Перевірка' }`
  - `renderAssessmentTable(container, { onOpenItem })` — таблиця §16: group headers (рядок класу `AC — Управління доступом`, рядок заходу `AC-02 — …`), колонки: Позначення мети / Мета оцінювання / Значення з БПБ / Значення з ЦПБ / Вибір оцінки (select) / Типи дослідження (checkboxes) / Докази (кількість, кнопка) / Висновок (текст + кнопка відкрити). Клік по позначенню мети розгортає ODP sub-rows (assessment_odp_id, local, baseline, target, source; NIST відсутній). Select/checkbox міняють result через `setAssessment` (existing state API).
- «Значення з БПБ»/«Значення з ЦПБ» у рядку: список `odp_values` item-а — `baseline_value ?? '—'` і `target_value ?? '[НЕ ВИЗНАЧЕНО]'`.

- [ ] **Step 1: Failing unit test**

```js
// test/assessment/assessment-table.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { groupPlanItems, RESULT_LABELS, METHOD_LABELS } from '../../public/js/assessment/assessment-table.js';

const assessment = { plan: { items: [
  { assessment_source_id: 'AC-01a', control_id: 'AC-01', family: 'AC', family_title: 'УПРАВЛІННЯ ДОСТУПОМ', control_title: 'ПОЛІТИКА', odp_values: [], available_methods: ['EXAMINE'] },
  { assessment_source_id: 'AC-02e', control_id: 'AC-02', family: 'AC', family_title: 'УПРАВЛІННЯ ДОСТУПОМ', control_title: 'ОБЛІКОВІ ЗАПИСИ', odp_values: [], available_methods: ['EXAMINE', 'TEST'] },
  { assessment_source_id: 'AU-01a', control_id: 'AU-01', family: 'AU', family_title: 'АУДИТ', control_title: 'ПОЛІТИКА АУДИТУ', odp_values: [], available_methods: [] },
] }, results: [
  { assessment_source_id: 'AC-01a', result: 'SATISFIED' },
  { assessment_source_id: 'AC-02e', result: 'NOT_ASSESSED' },
  { assessment_source_id: 'AU-01a', result: 'NOT_ASSESSED' },
] };

test('groupPlanItems: family → control → items, results приєднані', () => {
  const groups = groupPlanItems(assessment);
  assert.equal(groups.length, 2);
  assert.deepEqual(groups.map(g => g.family), ['AC', 'AU']);
  assert.equal(groups[0].controls.length, 2);
  assert.equal(groups[0].controls[1].items[0].result.result, 'NOT_ASSESSED');
  assert.equal(groups[0].controls[0].items[0].result.result, 'SATISFIED');
});

test('українські лейбли', () => {
  assert.equal(RESULT_LABELS.SATISFIED, 'Відповідає');
  assert.equal(METHOD_LABELS.INTERVIEW, 'Співбесіда');
  assert.equal(METHOD_LABELS.TEST, 'Перевірка');
});
```

- [ ] **Step 2: FAIL → Step 3: Імплементація `assessment-table.js`**

```js
// public/js/assessment/assessment-table.js
import { el } from '../render/dom.js';
import { getAssessment, setAssessment } from './assessment-state.js';
import { updateResult } from '../../../core/assessment/assessment-run.js';

export const RESULT_LABELS = { NOT_ASSESSED: 'Не оцінено', SATISFIED: 'Відповідає',
  PARTIALLY_SATISFIED: 'Частково відповідає', NOT_SATISFIED: 'Не відповідає', NOT_APPLICABLE: 'Не застосовується' };
export const METHOD_LABELS = { EXAMINE: 'Дослідження', INTERVIEW: 'Співбесіда', TEST: 'Перевірка' };

export function groupPlanItems(assessment) {
  const resultsById = new Map((assessment.results ?? []).map(r => [r.assessment_source_id, r]));
  const groups = [];
  const groupByFamily = new Map();
  for (const planItem of assessment.plan?.items ?? []) {
    let g = groupByFamily.get(planItem.family);
    if (!g) { g = { family: planItem.family, family_title: planItem.family_title, controls: [], _byControl: new Map() };
      groupByFamily.set(planItem.family, g); groups.push(g); }
    let c = g._byControl.get(planItem.control_id);
    if (!c) { c = { control_id: planItem.control_id, control_title: planItem.control_title, items: [] };
      g._byControl.set(planItem.control_id, c); g.controls.push(c); }
    c.items.push({ planItem, result: resultsById.get(planItem.assessment_source_id) });
  }
  for (const g of groups) delete g._byControl;
  return groups;
}

function patchResult(sourceId, patch) {
  setAssessment(prev => updateResult(prev, sourceId, patch).assessment);
}

function odpSubrows(planItem) {
  return (planItem.odp_values ?? []).map(v => el('tr', { class: 'odp-subrow' },
    el('td', {}, v.assessment_odp_id ?? ''),
    el('td', { colspan: '7' },
      el('span', { class: 'odp-meta' }, `local: ${v.local_odp_id}`),
      el('span', { class: 'odp-meta' }, `БПБ: ${v.baseline_value ?? '—'}`),
      el('span', { class: 'odp-meta' }, `ЦПБ: ${v.target_value ?? '[НЕ ВИЗНАЧЕНО]'}`),
      el('span', { class: 'odp-meta' }, `джерело: ${v.effective_source ?? '—'}`))));
}

function itemRow({ planItem, result }, { onOpenItem, rerender }) {
  const expanded = { on: false };
  const select = el('select', { onchange: (e) => patchResult(planItem.assessment_source_id, { result: e.target.value }) },
    ...Object.entries(RESULT_LABELS).map(([v, label]) =>
      el('option', { value: v, ...(result.result === v ? { selected: '' } : {}) }, label)));
  const methods = el('div', { class: 'methods' }, ...(planItem.available_methods ?? []).map(m => el('label', {},
    el('input', { type: 'checkbox', ...(result.methods_used.includes(m) ? { checked: '' } : {}),
      onchange: (e) => patchResult(planItem.assessment_source_id, {
        methods_used: e.target.checked ? [...result.methods_used, m] : result.methods_used.filter(x => x !== m) }) }),
    METHOD_LABELS[m] ?? m)));
  const baseline = (planItem.odp_values ?? []).map(v => v.baseline_value).filter(Boolean).join('; ') || '—';
  const target = (planItem.odp_values ?? []).map(v => v.target_value ?? '[НЕ ВИЗНАЧЕНО]').join('; ') || '—';
  const row = el('tr', { class: 'assessment-item-row' },
    el('td', {}, el('button', { type: 'button', class: 'link', onclick: () => { expanded.on = !expanded.on; rerender(); } },
      planItem.assessment_source_id)),
    el('td', { class: 'objective' }, planItem.resolved_objective ?? ''),
    el('td', {}, baseline),
    el('td', {}, target),
    el('td', {}, select),
    el('td', {}, methods),
    el('td', {}, el('button', { type: 'button', onclick: () => onOpenItem(planItem.assessment_source_id) },
      `Докази: ${result.evidence_ids.length}`)),
    el('td', { class: 'conclusion' }, result.conclusion || '', el('button', { type: 'button', class: 'link',
      onclick: () => onOpenItem(planItem.assessment_source_id) }, '✎')));
  return { row, subrows: () => expanded.on ? odpSubrows(planItem) : [] , expanded };
}

export function renderAssessmentTable(container, { onOpenItem }) {
  const rerender = () => renderAssessmentTable(container, { onOpenItem });
  const assessment = getAssessment();
  const head = el('tr', {}, ...['Позначення мети оцінювання', 'Мета оцінювання', 'Значення з БПБ', 'Значення з ЦПБ',
    'Вибір оцінки', 'Вибір типів дослідження', 'Докази / джерела', 'Висновок'].map(h => el('th', {}, h)));
  const body = [];
  for (const g of groupPlanItems(assessment)) {
    body.push(el('tr', { class: 'group-row family' }, el('td', { colspan: '8' }, `${g.family} — ${g.family_title}`)));
    for (const c of g.controls) {
      body.push(el('tr', { class: 'group-row control' }, el('td', { colspan: '8' }, `${c.control_id} — ${c.control_title}`)));
      for (const pair of c.items) {
        const { row, subrows } = itemRow(pair, { onOpenItem, rerender });
        body.push(row, ...subrows());
      }
    }
  }
  container.replaceChildren(el('table', { class: 'assessment-table' }, el('thead', {}, head), el('tbody', {}, ...body)));
}
```
Примітка: `updateResult` — core-модуль без node-залежностей, сервер віддає `core/` як статику (вже налаштовано), тому import працює в браузері. Розгортання ODP sub-row реалізовано перерендером таблиці (стан expanded губиться — прийнятно для MVP; якщо заважає — тримати Set розгорнутих id на рівні модуля).

- [ ] **Step 4: Інтеграція** — `assessment-item.js` переписати як панель одного item (objective, ODP-таблиця, evidence list, findings list, conclusion textarea, comment) поверх нових полів; `assessment-app.js` view(id) рендерить: шапку (metadata, прогрес з `buildAssessmentSummary`), попередження unresolved (`assessment.warnings` з `ODP_UNRESOLVED`), `renderAssessmentTable`, і модал/панель item через `onOpenItem`.

- [ ] **Step 5: Ручна перевірка UI** — `npm start`; створити оцінювання з approved-запису; перевірити: групування, селект оцінки зберігається (PUT), чекбокси методів, ODP sub-row без NIST id, `[НЕ ВИЗНАЧЕНО]` у цілі. Browser console без помилок.

- [ ] **Step 6: `npm test` + Commit**

```bash
git add public/js/assessment/ public/css/ test/assessment/assessment-table.test.js
git commit -m "feat(assessment-ui): grouped assessment table with ODP subrows and method checkboxes"
```

---

### Task 14: UI — evidence/finding діалоги, finalize, traceability drawer

**Files:**
- Rewrite: `public/js/assessment/evidence-editor.js` → v3 evidence модель (type enum, collected_by, файл-аплоад як було)
- Create: `public/js/assessment/finding-dialog.js`
- Create: `public/js/assessment/traceability-drawer.js`
- Modify: `public/js/assessment/assessment-item.js`, `assessment-app.js`
- Rewrite: `test/evidence-editor.test.js` → `test/assessment/evidence-editor.test.js` (адаптувати наявні unit-перевірки до нових полів)

**Interfaces:**
- `evidence-editor.js`: `renderEvidenceEditor(container, { sourceId })` — форма: select type (12 значень EVIDENCE_TYPES, укр. лейбли: DOCUMENT Документ, POLICY Політика, PROCEDURE Процедура, ORDER Наказ, REGISTER Реєстр, SYSTEM_CONFIGURATION Конфігурація системи, SCREENSHOT Знімок екрана, LOG Журнал, INTERVIEW_NOTE Нотатка співбесіди, TEST_RESULT Результат перевірки, PHYSICAL_INSPECTION Фізичний огляд, OTHER Інше), title/reference/observation/collected_by, файл (upload → `source:{kind:'LOCAL_FILE',path:'evidence/<name>'}`); сабміт → `setAssessment(prev => addEvidence(prev, sourceId, fields).assessment)`.
- `finding-dialog.js`: `renderFindingDialog(container, { sourceId })` — severity select (укр.: OBSERVATION Спостереження, MINOR Незначний, MAJOR Значний, CRITICAL Критичний), title, description, recommendation, вибір evidence з result.evidence_ids; через `addFinding`/`updateFinding`.
- `traceability-drawer.js`: `renderTraceabilityDrawer(container, planItem)` — «Трасовність»: для кожного odp_value рядок assessment_odp_id/local/baseline/target/source + (тільки тут) NIST: дані з `planItem.placeholders` (ref) і legend «NIST traceability: інформаційно, не впливає на оцінювання».
- Finalize-кнопка в `assessment-app.js`: `POST /api/assessments/:id/finalize`; 400 → показати список помилок; 200 → перезавантажити (read-only режим: усі inputs disabled коли `status==='FINALIZED'`).

- [ ] **Step 1: Адаптувати unit-тести evidence-editor** (наявний `test/evidence-editor.test.js` тестує чисті функції формування evidence — переписати на виклик `addEvidence` з v3-полями; DOM не тестуємо).
- [ ] **Step 2: Імплементація трьох UI-модулів + інтеграція** (за інтерфейсами вище; всі рендери через `el`; disabled-стан: `if (getAssessment().status === 'FINALIZED') input.setAttribute('disabled','')`).
- [ ] **Step 3: Ручна e2e-перевірка** — повний цикл: створити → оцінити item → додати доказ з файлом → створити недолік → finalize (спершу з помилкою валідації, потім валідно) → перевірити 409 на редагування, drawer з NIST тільки за кліком.
- [ ] **Step 4: `npm test` + Commit**

```bash
git add public/js/assessment/ test/
git commit -m "feat(assessment-ui): v3 evidence/finding dialogs, finalize flow, traceability drawer"
```

---

### Task 15: `report-projection.js`

**Files:**
- Create: `core/assessment/report-projection.js`
- Test: `test/assessment/report-projection.test.js`

**Interfaces:**
- `buildReportProjection({ assessment, cpbSnapshot }) → projection`:

```json
{ "title": { "ics_name": "...", "assessment_id": "...", "date": "YYYY-MM-DD", "assessment_body": "...", "assessor_name": "..." },
  "system_info": { "ics_name": "...", "as_class": 2, "info_type": "open_confidential" },
  "basis_scope": { "cpb_source": "назва approved-запису", "cpb_hash": "...", "items_total": 0, "controls_total": 0 },
  "cpb_version": { "hash": "...", "approved_name": "..." },
  "methods": [ { "key": "EXAMINE", "label": "Дослідження", "used_count": 0 } ],
  "families": [ { "family": "AC", "family_title": "...", "controls": [ { "control_id": "AC-02", "control_title": "...",
      "items": [ { "assessment_source_id": "AC-02e", "resolved_objective": "...", "result": "SATISFIED",
        "result_label": "Відповідає", "methods_used_labels": ["Дослідження"], "evidence_ids": [], "conclusion": "..." } ] } ] } ],
  "evidence_register": [ { "evidence_id": "EV-001", "type": "ORDER", "title": "...", "reference": "...", "collected_by": "...", "collected_at": "..." } ],
  "findings": [ { "finding_id": "F-001", "severity_label": "Значний", "title": "...", "description": "...", "recommendation": "...", "assessment_source_id": "AC-02e" } ],
  "overall": { "counts": { "satisfied": 0, "partially_satisfied": 0, "not_satisfied": 0, "not_applicable": 0, "not_assessed": 0 },
    "conclusion_text": "..." },
  "appendices": { "unresolved_odp": [ { "local_odp_id": "ac-2_odp.01", "control_id": "AC-02" } ] } }
```
- `overall.conclusion_text` детермінований: є `not_satisfied>0` → «ІКС не відповідає вимогам ЦПБ: N заходів не відповідають»; інакше `partially_satisfied>0` → «частково відповідає»; інакше `not_assessed>0` → «оцінювання не завершено»; інакше «відповідає». Проєкція будується ТІЛЬКИ з persisted assessment (ТЗ §18) — жодних живих каталогів.

- [ ] **Step 1: Failing test**

```js
// test/assessment/report-projection.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildReportProjection } from '../../core/assessment/report-projection.js';

const assessment = {
  id: 'ASSESS-2026-077', metadata: { ics_name: 'АС-2', as_class: 2, info_type: 'open_confidential', assessment_body: 'Орган', assessor_name: 'Оцінювач' },
  cpb_snapshot: { source_approved_name: 'as2', hash: 'abc' },
  warnings: [{ code: 'ODP_UNRESOLVED', control_id: 'AC-02', local_odp_id: 'ac-2_odp.01' }],
  plan: { items: [{ assessment_source_id: 'AC-02e', control_id: 'AC-02', family: 'AC', family_title: 'ДОСТУП',
    control_title: 'ОБЛІК', resolved_objective: 'мета', odp_values: [] }] },
  results: [{ assessment_source_id: 'AC-02e', result: 'NOT_SATISFIED', methods_used: ['EXAMINE', 'INTERVIEW'],
    evidence_ids: ['EV-001'], finding_ids: ['F-001'], conclusion: 'не виконується', assessor_comment: '' }],
  evidence: [{ evidence_id: 'EV-001', type: 'ORDER', title: 'Наказ', reference: 'п.1', collected_by: 'О', collected_at: 'т' }],
  findings: [{ finding_id: 'F-001', assessment_source_id: 'AC-02e', severity: 'MAJOR', title: 'Недолік', description: 'опис', recommendation: 'рек', status: 'OPEN' }],
};

test('проєкція: розділи, лейбли, загальний висновок', () => {
  const p = buildReportProjection({ assessment, cpbSnapshot: { state: {} } });
  assert.equal(p.title.assessment_id, 'ASSESS-2026-077');
  assert.equal(p.families[0].controls[0].items[0].result_label, 'Не відповідає');
  assert.deepEqual(p.families[0].controls[0].items[0].methods_used_labels, ['Дослідження', 'Співбесіда']);
  assert.equal(p.findings[0].severity_label, 'Значний');
  assert.equal(p.evidence_register.length, 1);
  assert.ok(p.overall.conclusion_text.includes('не відповідає'));
  assert.deepEqual(p.appendices.unresolved_odp, [{ local_odp_id: 'ac-2_odp.01', control_id: 'AC-02' }]);
});
```

- [ ] **Step 2: FAIL → Step 3: Імплементація** (групування families/controls — та сама логіка, що `groupPlanItems`; словники: RESULT_LABELS як у Task 13, SEVERITY_LABELS `{OBSERVATION:'Спостереження',MINOR:'Незначний',MAJOR:'Значний',CRITICAL:'Критичний'}`, METHOD_LABELS). Реалізувати без імпорту з `public/` — продублювати словники в core-модулі і реекспортувати їх у UI звідси (UI Task 13/14 імпортують з core, виправити імпорти).

- [ ] **Step 4: Тести — PASS → Step 5: Commit**

```bash
git add core/assessment/report-projection.js public/js/assessment/ test/assessment/report-projection.test.js
git commit -m "feat(assessment): report projection from persisted assessment run"
```

---

### Task 16: DOCX writer v3 + reproducibility

**Files:**
- Rewrite: `core/docx/assessment-docx-writer.js`
- Rewrite: `test/assessment-docx-writer.test.js` → `test/assessment/assessment-docx-writer.test.js`
- Modify: `server.js` (export route: `buildAssessmentDocx({ projection: buildReportProjection({ assessment, cpbSnapshot }) })`)

**Interfaces:**
- `buildAssessmentDocx({ projection }) → Buffer` — розділи ТЗ §18: 1 титул (назва «Звіт за результатами оцінювання ІКС», ics_name, id, дата, орган, оцінювач); 2 відомості про ІКС; 3 підстава та область (cpb_source, items_total); 4 версія/hash ЦПБ; 5 методи (3 рядки, укр.); 6 результати за класами — по family: heading, по control: таблиця «Позначення | Мета оцінювання | Оцінка | Методи | Висновок»; 7 реєстр доказів (таблиця); 8 недоліки (таблиця з severity_label, recommendation); 9 загальний висновок; 10 додатки (unresolved ODP таблиця).
- Використати той самий підхід/хелпери OOXML, що в наявному `core/docx/assessment-docx-writer.js` (він будує document.xml і пакує через `./zip-writer.js` — зберегти `esc`, table-хелпери, стилі; розширити на секції).
- Відтворюваність: `buildAssessmentDocx` не викликає `Date.now`/`new Date()` — дата тільки з projection.

- [ ] **Step 1: Failing test**

```js
// test/assessment/assessment-docx-writer.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildAssessmentDocx } from '../../core/docx/assessment-docx-writer.js';
import { buildReportProjection } from '../../core/assessment/report-projection.js';

const assessment = { /* та сама фікстура, що в report-projection.test.js — скопіювати */ 
  id: 'ASSESS-2026-077', metadata: { ics_name: 'АС-2', as_class: 2, info_type: 'open_confidential', assessment_body: 'Орган', assessor_name: 'Оцінювач' },
  cpb_snapshot: { source_approved_name: 'as2', hash: 'abc' }, warnings: [],
  plan: { items: [{ assessment_source_id: 'AC-02e', control_id: 'AC-02', family: 'AC', family_title: 'ДОСТУП', control_title: 'ОБЛІК', resolved_objective: 'мета', odp_values: [] }] },
  results: [{ assessment_source_id: 'AC-02e', result: 'SATISFIED', methods_used: ['EXAMINE'], evidence_ids: [], finding_ids: [], conclusion: 'ок', assessor_comment: '' }],
  evidence: [], findings: [] };
const projection = buildReportProjection({ assessment, cpbSnapshot: { state: {} } });

test('DOCX містить обовʼязкові розділи і укр. лейбли', () => {
  const buf = buildAssessmentDocx({ projection });
  const xml = buf.toString('latin1'); // zip — шукаємо по сирих байтах document.xml (deflate store), простіше: перевірити розмір і сигнатуру
  assert.equal(buf.slice(0, 2).toString(), 'PK');
  assert.ok(buf.length > 2000);
});

test('відтворюваність: дві генерації байт-в-байт ідентичні', () => {
  const a = buildAssessmentDocx({ projection });
  const b = buildAssessmentDocx({ projection });
  assert.ok(a.equals(b));
});
```
Додатково перевірити текстовий вміст так, як це робить наявний `test/assessment-docx-writer.test.js` (він має техніку розпаковки/пошуку по document.xml — перенести її та assert-и на «Дослідження», «Співбесіда», «Перевірка», «Звіт за результатами оцінювання», resolved objective, загальний висновок).

- [ ] **Step 2: FAIL → Step 3: Переписати writer** за структурою наявного файла (esc/para/table хелпери), секції 1–10 з projection. Якщо zip-writer вшиває mtime — передавати фіксований timestamp (наприклад, з `projection.title.date`) для відтворюваності; перевірити наявний `core/docx/zip-writer.js` і, якщо він використовує поточний час, додати опційний параметр `{ fixedDate }`.

- [ ] **Step 4: Оновити server export route + `npm test` зелений.**

- [ ] **Step 5: Commit**

```bash
git add core/docx/assessment-docx-writer.js core/docx/zip-writer.js test/ server.js
git commit -m "feat(assessment): v3 DOCX report from projection, reproducible output"
```

---

### Task 17: Deliverables — ADR, README, sample run, звіти валідації, фінальний e2e

**Files:**
- Create: `docs/adr/assessment-odp-numbering.md`
- Modify: `README.md` (розділ «Модуль оцінювання ІКС»)
- Create: `docs/migration-notes-assessment-v3.md`
- Create: `tools/create-sample-assessment.js` + згенерований `assessments/ASSESS-2026-900/` + `exports/assessments/ASSESS-2026-900.docx`
- Create: `tools/generate-validation-reports.js` + `docs/reports/ac02-validation.md`, `docs/reports/as2-regression.md`

- [ ] **Step 1: ADR** — `docs/adr/assessment-odp-numbering.md` з пунктами ТЗ §34 (кожен — окремий розділ рішення):

```markdown
# ADR: Нумерація ODP у модулі оцінювання

## Статус: прийнято (2026-08-17)

## Рішення
1. Первинна нумерація assessment ODP — українська локальна (НД ТЗІ): `AC-02_ODP[01]`.
2. `local_odp_id` (`ac-2_odp.01`) — єдине джерело для резолвінгу значень ЦПБ (`assessment_odp_id → local_odp_id` детермінований через adapter binding `DIRECT_LOCAL_ODP`).
3. NIST ODP — виключно optional provenance/traceability; ніколи не primary key, не бере участі в runtime-логіці, нумерації UI, плані чи звіті.
4. Розбіжність нумерації з NIST очікувана: український НД ТЗІ адаптував NIST SP 800-53/53A зі зміною складу і порядку параметрів (валідований приклад AC-02: local [01]-[04] ↔ NIST [03],[04],[06/07/08],[10]).
5. Ordinal inference у runtime заборонений: зв'язок лише через явні verified bindings адаптера.
6. Similarity score у production mapping заборонений; machine-generated кандидати живуть тільки в internal-review файлі поза runtime.
7. Нові VERIFIED NIST-мапінги додаються редагуванням `nist_traceability` в адаптері без міграції даних ЦПБ або assessment-записів.
```

- [ ] **Step 2: README-розділ** — додати в `README.md`: призначення модуля, режим «Оцінювання ІКС», lifecycle (створення з approved-запису → оцінювання → finalize → DOCX), файлова структура `assessments/<id>/`, команди `node tools/build-assessment-reference.js`, `node tools/build-assessment-catalog.js`, запуск тестів.

- [ ] **Step 3: Migration notes** — `docs/migration-notes-assessment-v3.md`: v1→v3 автоматична міграція при GET (enum-мапінг таблицею, evidence/findings перенесення, `items` → `plan.items`+`results`), локальні ODP не змінені, старі cpb/approved-записи повністю сумісні.

- [ ] **Step 4: Sample run** — `tools/create-sample-assessment.js`:

```js
// Створює sample assessment з data/FIXTURES/АС-2.json без сервера
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { buildAssessmentPlan } from '../core/assessment/assessment-plan.js';
import { makeAssessment, serializeAssessment } from '../core/assessment/assessment-io.js';
import { sha256, buildCatalogVersion } from '../core/assessment/versioning.js';
import { makeAuditEntry } from '../core/assessment/audit-trail.js';
import { buildReportProjection } from '../core/assessment/report-projection.js';
import { buildAssessmentDocx } from '../core/docx/assessment-docx-writer.js';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const read = async (p) => JSON.parse(await readFile(join(ROOT, p), 'utf8'));
const as2 = await read('data/FIXTURES/АС-2.json');
const approvedRecord = { kind: 'approved', approved_at: '2026-08-17T00:00:00.000Z',
  state: { info_type: as2.info_type, profile: as2.profile, passport: { ics_name: 'АС-2 (fixture)', as_class: 2 } }, summary: {} };
const catalogs = { ndTzi: await read('data/nd_tzi.json'),
  bpb: { service: await read('data/bpb_service.json'), open_confidential: await read('data/bpb_open_confidential.json') },
  exemptions: await read('data/as_class_exemptions.json'), genericDefaults: await read('data/generic_parameter_defaults.json') };
const assessmentCatalog = await read('data/assessment/assessment_catalog.json');
const adapter = await read('data/assessment/assessment_odp_adapter.json');
const { items, warnings } = buildAssessmentPlan({ approvedState: approvedRecord.state, catalogs, assessmentCatalog, adapter });
const id = 'ASSESS-2026-900'; // сумісний з ASSESSMENT_ID_RE сервера
const assessment = makeAssessment({ approvedRecord, approvedName: 'as2-fixture', plan: { items }, warnings, id });
const snapshotText = JSON.stringify(approvedRecord, null, 2);
assessment.cpb_snapshot.hash = sha256(snapshotText);
const dir = join(ROOT, 'assessments', id);
await mkdir(join(dir, 'evidence'), { recursive: true });
await writeFile(join(dir, 'assessment.json'), serializeAssessment(assessment));
await writeFile(join(dir, 'cpb-snapshot.json'), snapshotText);
await writeFile(join(dir, 'catalog-version.json'), JSON.stringify(buildCatalogVersion({ files: {
  'assessment_catalog.json': JSON.stringify(assessmentCatalog), 'assessment_odp_adapter.json': JSON.stringify(adapter) } }), null, 2));
await writeFile(join(dir, 'audit-log.json'), JSON.stringify([makeAuditEntry({ actor: 'sample-generator', action: 'ASSESSMENT_CREATED', entity_id: id })], null, 2));
const projection = buildReportProjection({ assessment, cpbSnapshot: approvedRecord });
await mkdir(join(ROOT, 'exports', 'assessments'), { recursive: true });
await writeFile(join(ROOT, 'exports', 'assessments', `${id}.docx`), buildAssessmentDocx({ projection }));
console.log(`sample: ${items.length} items, ${warnings.length} warnings`);
```
Примітка: `ASSESSMENT_ID_RE` у server.js дозволяє лише `ASSESS-\d{4}-\d{3}` — тому обрано id `ASSESS-2026-900` (без зміни regex).

- [ ] **Step 5: Validation reports** — `tools/generate-validation-reports.js`: запускає той самий код, що тести Task 6/7 (gold mappings + 270 рядків), пише `docs/reports/ac02-validation.md` (таблиця 4 gold мапінгів + результат resolver для кожного AC-02 ODP на АС-2) і `docs/reports/as2-regression.md` (summary: 270/231/39/85.56%, розбивка 90/83/58, список 39 unresolved local_odp_id). Запустити, закомітити результати.

- [ ] **Step 6: Фінальний e2e-чекліст** (вручну):
  1. `npm test` — вся сюїта зелена.
  2. `npm start` → повний CPB flow (створити ІКС→ЦПБ→затвердити) без регресій.
  3. Створити оцінювання, внести результат+доказ+недолік, перезапустити сервер — дані збереглися.
  4. `npm test` ще раз → перевірити, що створене вручну оцінювання НЕ зникло (перевірка на blanket-rmSync у тестах).
  5. Finalize → PUT повертає 409; export DOCX відкривається у Word/LibreOffice.
  6. `grep -r "innerHTML" public/js/assessment/` — порожньо.
  7. `node -e` перевірка: у `data/assessment/*.json` немає ключів score/similarity.

- [ ] **Step 7: Commit**

```bash
git add docs/adr/ docs/reports/ docs/migration-notes-assessment-v3.md README.md tools/create-sample-assessment.js tools/generate-validation-reports.js assessments/ASSESS-2026-900/ exports/assessments/
git commit -m "docs(assessment): ADR, README, migration notes, sample AS-2 run, validation reports"
```

---

## Acceptance criteria mapping (ТЗ §32)

| # | Критерій | Task |
|---|---|---|
| 1 | CPB flow без регресій | кожен task step `npm test`, Task 17.6 |
| 2 | Local ODP IDs незмінні | жодних правок nd_tzi/ЦПБ; Task 1 валідація |
| 3 | Assessment з валідного CPB | Task 8, 12 |
| 4 | Immutable snapshot | Task 12 (hash, файл), Task 9 (finalize guard) |
| 5 | План — тільки applicable | Task 8 |
| 6 | Локальна нумерація в UI/звіті | Task 13, 16 |
| 7 | Пріоритет resolver | Task 4 |
| 8 | Підстановка placeholder-ів | Task 5 |
| 9 | Baseline/target окремо | Task 8, 13 |
| 10 | Явний UNRESOLVED | Task 4, 5, 8 |
| 11 | Методи з укр. лейблами | Task 3, 13 |
| 12 | Evidence локально | Task 10, 12 |
| 13 | Findings traceable | Task 10 |
| 14 | Звіт лише з persisted run | Task 15, 16 |
| 15 | Finalized read-only | Task 9, 12, 14 |
| 16 | AC-02 gold tests | Task 6 |
| 17 | AS-2 regression | Task 7 |
| 18 | NIST unresolved не блокує | Task 1 (warnings-only), 24-валідація у Task 8 |
| 19 | Без score у production | Task 1 (`SCORE_IN_PRODUCTION`) |
| 20 | Offline zero-dependency | Global constraints, Task 17.6 |
