# Технічне завдання для coding agent
## Розширення «Офлайн-Профіль» модулем оцінювання ІКС
### Версія 3 — unified CPB + Assessment lifecycle, локальна ODP-нумерація НД ТЗІ

**Статус:** до реалізації  
**Пріоритет:** High  
**Тип робіт:** розширення існуючого standalone offline application  
**Базовий продукт:** «Офлайн-Профіль»  
**Режим експлуатації:** 100% offline, локальне АРМ без доступу до мережі  
**Основна мова UI/звітів:** українська  
**Технологічний стек:** Node.js ≥ 18, ES modules, vanilla JS, `node:http`, `node --test`, zero npm dependencies

---

# 1. Мета

Розширити поточний продукт, який формує Цільовий профіль безпеки (ЦПБ), повноцінним модулем оцінювання ІКС.

Продукт має підтримувати єдиний lifecycle:

```text
Нормативні вимоги
        ↓
Базовий профіль безпеки (БПБ)
        ↓
Формування ЦПБ
        ↓
Freeze / snapshot ЦПБ
        ↓
Assessment Plan
        ↓
Assessment Run
        ↓
Докази / джерела / результати
        ↓
Висновки / findings
        ↓
Звіт оцінки
```

Ключова мета — прибрати ручне перенесення значень між ЦПБ і звітом оцінки, зберегти traceability кожної вимоги та забезпечити відтворюваність оцінювання.

---

# 2. Основне архітектурне рішення

## 2.1. Primary numbering для оцінювача — НД ТЗІ

У модулі оцінювання використовувати **локальну нумерацію ODP, прийняту в українському НД ТЗІ та локальному каталозі продукту**.

NIST ODP не є primary key і не повинен впливати на:
- нумерацію ODP у UI;
- підстановку значень;
- побудову Assessment Plan;
- генерацію звіту;
- runtime-логіку.

NIST використовується лише як optional provenance/traceability.

Валідований приклад AC-02:

```text
Assessment ODP НД ТЗІ     Local ODP у ЦПБ      NIST equivalent
AC-02_ODP[01]             ac-2_odp.01           AC-02_ODP[03]
AC-02_ODP[02]             ac-2_odp.02           AC-02_ODP[04]
AC-02_ODP[03]             ac-2_odp.03           AC-02_ODP[06]/[07]/[08]
AC-02_ODP[04]             ac-2_odp.04           AC-02_ODP[10]
```

Цей mapping вважається **gold standard**.

## 2.2. NIST traceability

Production runtime використовує лише:

```json
{
  "nist_traceability": {
    "status": "VERIFIED",
    "odp_ids": ["AC-02_ODP[03]"],
    "verification_basis": "MANUALLY_VALIDATED_GOLD_STANDARD"
  }
}
```

або:

```json
{
  "nist_traceability": {
    "status": "UNRESOLVED",
    "odp_ids": []
  }
}
```

Заборонено:
- використовувати similarity score в production;
- автоматично вважати NIST ODP валідним binding;
- показувати оцінювачу machine-generated candidate;
- блокувати assessment через `UNRESOLVED` NIST traceability.

Machine-generated NIST candidates зберігаються лише в internal-review файлі.

---

# 3. Джерела даних та пріоритет

## 3.1. `nd_tzi.json`

Primary source для:
- control/enhancement structure;
- локальних `local_odp_id`;
- statements;
- placeholders `{{ insert: param, ... }}`;
- titles/families;
- локальної структури ЦПБ.

## 3.2. БПБ

`bpb_service.json` і `bpb_open_confidential.json`.

Primary source baseline values:
- `statement_path`;
- `ordinal_parameter`;
- `free_text`;
- інші параметри профілю.

БПБ не обов'язково використовує ті самі ID, що `nd_tzi.json`. Resolver повинен вміти матчити значення через явний binding.

## 3.3. ЦПБ

Реальний ЦПБ зберігає:
- selected enhancements;
- explicit `param_overrides`;
- excluded/exempted controls;
- тип інформації;
- інші параметри конкретної ІКС.

ЦПБ є джерелом **target/effective configuration** для оцінювання.

## 3.4. `ndtzi36006(1).json`

Reference assessment layer.

Використовувати для:
- determination statements;
- EXAMINE / INTERVIEW / TEST;
- assessment objects;
- reference semantics;
- secondary NIST traceability.

Не використовувати його NIST-like ODP numbering як primary runtime numbering.

## 3.5. НД ТЗІ 2.3-025-24, Том 2 / Том 3

Нормативне джерело assessment methodology:
- «Мета оцінки»;
- determination statements;
- «Дослідження»;
- «Співбесіда»;
- «Перевірка»;
- об'єкти оцінювання.

## 3.6. НД ТЗІ 2.7-009-09

Використовувати як process context:
- lifecycle оцінювання;
- програма;
- методика;
- проведення;
- фіксація результатів;
- аналіз;
- висновок.

Не використовувати як control-by-control assessment catalog.

---

# 4. Центральна доменна модель

Продукт повинен мати 6 окремих шарів.

```text
1. Control Catalog
2. Baseline Profile
3. CPB Instance
4. Assessment Catalog
5. Assessment ODP Adapter
6. Assessment Run
```

Не змішувати їх в один JSON.

---

# 5. Control Catalog

Джерело — `nd_tzi.json`.

Модель:

```json
{
  "control_id": "AC-02",
  "canonical_control_id": "AC-2",
  "family_id": "AC",
  "family_title": "УПРАВЛІННЯ ДОСТУПОМ",
  "title": "УПРАВЛІННЯ ОБЛІКОВИМИ ЗАПИСАМИ",
  "enhancement": false,
  "statements": [],
  "parameters": [
    {
      "local_odp_id": "ac-2_odp.01",
      "type": "assignment",
      "label": "...",
      "guideline": "..."
    }
  ]
}
```

---

# 6. Assessment ODP Adapter

Production source:
`assessment_odp_adapter_full_document_v1_1_production.json`

Це центральний bridge між:
- assessor-facing ODP;
- local ODP;
- БПБ/ЦПБ;
- optional NIST traceability.

Мінімальна модель:

```json
{
  "assessment_odp_id": "AC-02_ODP[01]",
  "local_odp_id": "ac-2_odp.01",
  "ordinal": 1,

  "binding": {
    "type": "DIRECT_LOCAL_ODP",
    "cpb_ref": "ac-2_odp.01"
  },

  "statement_usage": [
    {
      "statement_path": "e"
    }
  ],

  "bpb_bindings": {
    "open_confidential": [],
    "service": []
  },

  "nist_traceability": {
    "status": "VERIFIED",
    "odp_ids": ["AC-02_ODP[03]"]
  }
}
```

## 6.1. Production rule

Mapping:

```text
assessment_odp_id -> local_odp_id
```

є deterministic.

NIST mapping — optional.

---

# 7. Effective Value Resolver

Реалізувати окремий pure core module:

```text
core/assessment/effective-value-resolver.js
```

API:

```js
resolveEffectiveValue({
  localOdpId,
  statementUsage,
  cpb,
  baselineProfile,
  genericDefaults,
  adapterEntry
}) -> EffectiveValue
```

Структура:

```json
{
  "status": "RESOLVED",
  "source": "CPB_OVERRIDE",
  "value": "...",
  "evidence": []
}
```

Пріоритет:

```text
1. CPB_OVERRIDE
2. BPB_INHERITED
3. GENERIC_DEFAULT
4. UNRESOLVED
```

## 7.1. CPB_OVERRIDE

Якщо:

```js
cpb.profile.param_overrides[localOdpId]
```

існує — використовувати його.

## 7.2. BPB_INHERITED

Матчити через explicit adapter bindings.

Підтримати:
- `statement_path`;
- `ordinal_parameter`;
- `free_text`;
- merged statement paths;
- один local ODP → декілька baseline locators.

## 7.3. Generic defaults

Використовувати `generic_parameter_defaults.json`.

## 7.4. UNRESOLVED

Не вигадувати значення.

```json
{
  "status": "UNRESOLVED",
  "value": null
}
```

UI:

```text
[НЕ ВИЗНАЧЕНО]
```

Unresolved ODP повинен потрапити:
- у validation warnings;
- у Assessment Plan;
- у звіт як unresolved profile parameter, якщо оцінювання все ж продовжено.

---

# 8. Assessment Catalog

Assessment Catalog описує **як перевіряти**, а не зберігає actual values.

Структура:

```json
{
  "assessment_source_id": "AC-02e",

  "control_id": "AC-02",
  "statement_path": "e",

  "assessment_odp_refs": [
    "AC-02_ODP[01]"
  ],

  "objective_template":
    "для запитів на створення облікових записів потрібні схвалення від <AC-02_ODP[01] персоналу або ролей>",

  "methods": {
    "EXAMINE": {
      "label_uk": "Дослідження",
      "objects": []
    },
    "INTERVIEW": {
      "label_uk": "Співбесіда",
      "objects": []
    },
    "TEST": {
      "label_uk": "Перевірка",
      "objects": []
    }
  }
}
```

---

# 9. Objective Template Resolver

Створити:

```text
core/assessment/objective-resolver.js
```

API:

```js
resolveAssessmentObjective({
  objectiveTemplate,
  assessmentOdpRefs,
  adapter,
  effectiveValues
}) -> ResolvedObjective
```

Будь-який fragment:

```text
<AC-02_ODP[01] персоналу або ролей>
```

має бути структурованим placeholder.

Приклад:

```text
Template:
для запитів ... схвалення від <AC-02_ODP[01] персоналу або ролей>

Target value:
Начальника служби захисту інформації

Resolved:
для запитів ... схвалення від Начальника служби захисту інформації
```

Правило:
- підстановка для `resolved_objective` завжди використовує **effective CPB value**;
- baseline value показується окремо;
- якщо target value unresolved → `[НЕ ВИЗНАЧЕНО]`.

Не видаляти placeholder мовчки.

---

# 10. Assessment Plan

Assessment Plan генерується з:
- CPB snapshot;
- selected controls/enhancements;
- assessment catalog;
- ODP adapter;
- resolved effective values.

Assessment Plan не повинен містити:
- controls, яких немає в CPB;
- excluded controls;
- enhancements, яких немає у CPB;
- withdrawn controls, якщо вони incorporated в інший control.

Структура:

```json
{
  "assessment_plan_id": "...",
  "cpb_snapshot_id": "...",
  "items": [
    {
      "assessment_source_id": "AC-02e",
      "control_id": "AC-02",
      "statement_path": "e",

      "resolved_objective": "...",

      "odp_values": [
        {
          "assessment_odp_id": "AC-02_ODP[01]",
          "local_odp_id": "ac-2_odp.01",
          "baseline_value": "...",
          "target_value": "...",
          "effective_source": "CPB_OVERRIDE"
        }
      ],

      "available_methods": [
        "EXAMINE",
        "INTERVIEW",
        "TEST"
      ]
    }
  ]
}
```

---

# 11. Snapshot model

При старті assessment створити immutable snapshot.

```text
assessments/<assessment-id>/
├── assessment.json
├── cpb-snapshot.json
├── catalog-version.json
└── evidence/
```

Snapshot повинен фіксувати:
- CPB JSON;
- BPB profile;
- `nd_tzi` catalog version/hash;
- assessment catalog version/hash;
- ODP adapter version/hash;
- generic defaults version/hash;
- date/time;
- user/assessor identity.

Після старту assessment зміни у поточному ЦПБ не змінюють існуючий Assessment Run.

---

# 12. Assessment Run

```json
{
  "assessment_run_id": "AR-2026-001",

  "system_id": "...",
  "cpb_snapshot_id": "...",

  "status": "IN_PROGRESS",

  "started_at": "...",
  "started_by": "...",

  "results": []
}
```

Assessment Run — primary runtime artifact.

DOCX/PDF не є primary data source.

---

# 13. Assessment Result

Для кожного Assessment Item:

```json
{
  "assessment_source_id": "AC-02e",

  "methods_used": [
    "EXAMINE",
    "INTERVIEW"
  ],

  "result": "SATISFIED",

  "evidence_ids": [
    "EV-001"
  ],

  "source_references": [],

  "assessor_comment": "",

  "conclusion": "",

  "finding_ids": []
}
```

Enum:

```text
NOT_ASSESSED
SATISFIED
PARTIALLY_SATISFIED
NOT_SATISFIED
NOT_APPLICABLE
```

Не використовувати boolean.

---

# 14. Evidence Model

```json
{
  "evidence_id": "EV-001",

  "type": "DOCUMENT",

  "title": "Наказ про управління обліковими записами",

  "source": {
    "kind": "LOCAL_FILE",
    "path": "evidence/..."
  },

  "reference": "п. 4.2",

  "observation": "...",

  "collected_at": "...",

  "collected_by": "..."
}
```

Типи:

```text
DOCUMENT
POLICY
PROCEDURE
ORDER
REGISTER
SYSTEM_CONFIGURATION
SCREENSHOT
LOG
INTERVIEW_NOTE
TEST_RESULT
PHYSICAL_INSPECTION
OTHER
```

Усе локально.

---

# 15. Findings

```json
{
  "finding_id": "F-001",

  "assessment_source_id": "AC-02e",

  "severity": "MAJOR",

  "title": "...",

  "description": "...",

  "evidence_ids": [],

  "recommendation": "",

  "status": "OPEN"
}
```

Severity:

```text
OBSERVATION
MINOR
MAJOR
CRITICAL
```

---

# 16. UI оцінювача

Окремий режим:

```text
Офлайн-Профіль
├── Формування ЦПБ
└── Оцінювання ІКС
```

Не робити assessment як «Крок 8» wizard ЦПБ.

## 16.1. Основна таблиця

Group header:
- Клас заходу;
- Назва класу;
- Назва заходу.

Columns:

```text
Позначення мети оцінювання
Мета оцінювання
Значення з БПБ
Значення з ЦПБ
Вибір оцінки
Вибір типів дослідження
Докази / джерела
Висновок
```

Приклад:

```text
AC — Управління доступом
AC-02 — Управління обліковими записами

AC-02e
Мета:
Для запитів на створення облікових записів потрібні схвалення від
Начальника служби захисту інформації

БПБ: —
ЦПБ: Начальник служби захисту інформації

Оцінка: [SATISFIED ▼]

Методи:
[x] Дослідження
[x] Співбесіда
[ ] Перевірка

Докази: 2
Висновок: ...
```

## 16.2. ODP row

Assessment ODP можна показувати додатковим sub-row:

```text
AC-02_ODP[01]
local: ac-2_odp.01
baseline: ...
target: ...
source: CPB_OVERRIDE
```

NIST ID не показувати за замовчуванням.

Дозволено показувати в debug/traceability drawer.

---

# 17. Assessment methods

Enum keys залишаються:

```text
EXAMINE
INTERVIEW
TEST
```

UI labels:

```text
EXAMINE   → Дослідження
INTERVIEW → Співбесіда
TEST      → Перевірка
```

Об'єкти assessment брати з українського assessment catalog/reference.

Не перекладати повторно з NIST, якщо українська нормативна назва вже існує.

---

# 18. Report generation

Фінальний звіт генерується з Assessment Run.

Не формувати report data вручну.

Pipeline:

```text
AssessmentRun
   +
CPB Snapshot
   +
Resolved Assessment Plan
   ↓
Report Projection
   ↓
OOXML DOCX
```

Мінімальні розділи:
1. титульний аркуш;
2. відомості про ІКС;
3. підстава та область оцінювання;
4. версія/ідентифікатор ЦПБ;
5. методи оцінювання;
6. результати за класами заходів;
7. докази та джерела відомостей;
8. невідповідності/findings;
9. загальний висновок;
10. додатки.

---

# 19. Audit trail

Для кожної зміни Assessment Run фіксувати:

```json
{
  "timestamp": "...",
  "actor": "...",
  "action": "RESULT_UPDATED",
  "entity_id": "...",
  "before": {},
  "after": {}
}
```

Можливі actions:

```text
ASSESSMENT_CREATED
ASSESSMENT_STARTED
RESULT_UPDATED
EVIDENCE_ADDED
EVIDENCE_REMOVED
FINDING_CREATED
FINDING_UPDATED
ASSESSMENT_FINALIZED
REPORT_GENERATED
```

---

# 20. Finalization

Після `FINALIZED`:

- assessment results read-only;
- CPB snapshot read-only;
- evidence read-only;
- report reproducible;
- зміни можливі лише через створення нової revision / assessment run.

---

# 21. File structure

Розширити repository:

```text
offline-profile/
├── core/
│   ├── assessment/
│   │   ├── assessment-catalog.js
│   │   ├── assessment-plan.js
│   │   ├── assessment-run.js
│   │   ├── assessment-validator.js
│   │   ├── effective-value-resolver.js
│   │   ├── objective-resolver.js
│   │   ├── odp-adapter.js
│   │   ├── evidence.js
│   │   ├── findings.js
│   │   ├── report-projection.js
│   │   └── audit-trail.js
│   └── docx/
│       └── assessment-docx-writer.js
│
├── data/
│   ├── assessment_odp_adapter.json
│   ├── assessment_catalog.json
│   └── assessment_reference.json
│
├── public/js/assessment/
│   ├── assessment-list.js
│   ├── assessment-start.js
│   ├── assessment-table.js
│   ├── assessment-item.js
│   ├── evidence-dialog.js
│   ├── finding-dialog.js
│   └── assessment-finalize.js
│
├── assessments/
│   └── <assessment-id>/
│       ├── assessment.json
│       ├── cpb-snapshot.json
│       ├── catalog-version.json
│       ├── audit-log.json
│       └── evidence/
│
├── exports/
│   └── assessments/
│
└── test/
    └── assessment/
```

---

# 22. Server endpoints

Тільки loopback.

Suggested endpoints:

```text
GET  /api/assessments
POST /api/assessments

GET  /api/assessments/:id
PUT  /api/assessments/:id

POST /api/assessments/:id/evidence
DELETE /api/assessments/:id/evidence/:evidenceId

POST /api/assessments/:id/finalize
POST /api/assessments/:id/export-docx
```

Зберігати файлово.

Не додавати DB.

---

# 23. Offline security

Обов'язково:
- `127.0.0.1` only;
- no CDN;
- no telemetry;
- no external API;
- no remote fonts;
- no network call from browser;
- CSP, де можливо;
- strict filename/path validation;
- evidence file paths sandboxed inside assessment directory;
- traversal (`../`) заборонений;
- UI rendering only via `textContent`, `createElement`, `append`;
- no `innerHTML` with catalog/user data.

---

# 24. Validation

Перед стартом assessment:

```text
CPB_VALID
CATALOG_VERSION_VALID
ADAPTER_VERSION_VALID
NO_BROKEN_LOCAL_ODP_BINDINGS
```

Warnings:
- unresolved effective values;
- unresolved NIST traceability — informational only;
- missing assessment methods;
- assessment catalog orphan.

Blocking errors:
- assessment ODP points to nonexistent `local_odp_id`;
- control mismatch;
- malformed CPB;
- missing required snapshot;
- adapter duplicate primary binding.

---

# 25. Sanity checks

Використати `АС-2.json` як validation fixture.

Наявний результат:
- 270 ODP у застосованому профілі;
- 231 resolved;
- 39 unresolved;
- resolution rate 85.56%;
- 90 `CPB_OVERRIDE`;
- 83 `BPB_INHERITED`;
- 58 `GENERIC_DEFAULT`;
- 39 unresolved.

Ці числа є baseline regression check для поточної версії input-файлів.

Допустима зміна чисел лише якщо:
- виправлено source data;
- додано explicit binding;
- виправлено resolver;
- зміна пояснена в test fixture / changelog.

---

# 26. Gold standard AC-02 tests

Обов'язкові tests.

```text
AC-02_ODP[01] -> ac-2_odp.01
NIST traceability -> AC-02_ODP[03]

AC-02_ODP[02] -> ac-2_odp.02
NIST traceability -> AC-02_ODP[04]

AC-02_ODP[03] -> ac-2_odp.03
NIST traceability -> AC-02_ODP[06]/[07]/[08]

AC-02_ODP[04] -> ac-2_odp.04
NIST traceability -> AC-02_ODP[10]
```

Також тестувати:
- CPB override;
- BPB inheritance h.1/h.2/h.3;
- BPB inheritance j;
- unresolved `ac-2_odp.01` для поточного AS-2, якщо немає target value;
- resolved objective placeholder substitution;
- `[НЕ ВИЗНАЧЕНО]` handling.

---

# 27. Tests

Створити minimum:

```text
test/assessment/odp-adapter.test.js
test/assessment/effective-value-resolver.test.js
test/assessment/objective-resolver.test.js
test/assessment/assessment-plan.test.js
test/assessment/assessment-run.test.js
test/assessment/evidence.test.js
test/assessment/findings.test.js
test/assessment/finalize.test.js
test/assessment/as2-regression.test.js
test/assessment/ac02-gold-standard.test.js
```

Використовувати `node:test`.

---

# 28. Migration strategy

Поточний ЦПБ формат не ламати.

Не перейменовувати existing local ODP IDs.

Тобто:

```text
ac-2_odp.01
ac-2_odp.02
...
```

залишаються backward-compatible.

Новий assessment layer додається поверх поточної моделі.

---

# 29. Data files to install into repository

Production:

```text
data/nd_tzi.json
data/bpb_service.json
data/bpb_open_confidential.json
data/generic_parameter_defaults.json

data/assessment/assessment_odp_adapter.json
data/assessment/assessment_reference.json
```

`assessment_odp_adapter.json`:
copy from:
`assessment_odp_adapter_full_document_v1_1_production.json`

`assessment_reference.json`:
derive from `ndtzi36006(1).json`, keeping required assessment models:
- determinationcontrol;
- examinecontrol;
- interviewcontrol;
- testcontrol.

Do not ship internal similarity scores into production data.

Internal/research only:

```text
nist_odp_mapping_candidates_internal_review_v1.json
```

---

# 30. Do not do

Заборонено:

1. Не перенумеровувати local ODP IDs під NIST.
2. Не використовувати NIST ODP як runtime primary key.
3. Не використовувати similarity score у production.
4. Не дублювати CPB values в static Assessment Catalog.
5. Не мутувати CPB під час assessment.
6. Не використовувати поточний mutable CPB після старту Assessment Run — тільки snapshot.
7. Не генерувати report як окремий ручний data model.
8. Не використовувати external services.
9. Не додавати npm packages без окремого погодження.
10. Не silent-fix нормативні тексти.
11. Не підставляти value, якщо binding unresolved.
12. Не видаляти `<ODP ...>` placeholder без явного replacement/error marker.

---

# 31. Implementation order

## Phase A — data foundation

- [ ] Copy production ODP adapter.
- [ ] Build normalized assessment reference from `ndtzi36006(1).json`.
- [ ] Add startup validation.
- [ ] Implement data hashes/version tracking.

## Phase B — resolver

- [ ] `odp-adapter.js`
- [ ] `effective-value-resolver.js`
- [ ] `objective-resolver.js`
- [ ] regression tests on AC-02 and AS-2.

## Phase C — Assessment Plan

- [ ] Filter by CPB scope.
- [ ] Resolve objectives.
- [ ] Attach baseline/target values.
- [ ] Attach available assessment methods/objects.
- [ ] Surface unresolved values.

## Phase D — Assessment Run

- [ ] Snapshot CPB.
- [ ] Create filesystem directory.
- [ ] Persist results.
- [ ] Audit trail.
- [ ] Evidence.
- [ ] Findings.

## Phase E — UI

- [ ] Assessment list/start.
- [ ] grouped control table;
- [ ] values BPB/CPB;
- [ ] result selector;
- [ ] method selection;
- [ ] evidence drawer/dialog;
- [ ] conclusion;
- [ ] unresolved warnings;
- [ ] progress summary.

## Phase F — Report

- [ ] report projection;
- [ ] DOCX;
- [ ] reproducibility test;
- [ ] finalized assessment report.

---

# 32. Acceptance Criteria

Feature accepted only when all are true:

1. Existing CPB flow still works without regression.
2. Existing local ODP IDs are unchanged.
3. Assessment can be created from a valid CPB.
4. CPB snapshot is immutable.
5. Assessment Plan contains only applicable CPB controls/enhancements.
6. Assessment ODP local numbering is used in UI/report.
7. ODP values resolve with priority:
   `CPB → BPB → generic → unresolved`.
8. Objective placeholders are substituted with target/effective values.
9. Baseline and target values are displayed separately.
10. `UNRESOLVED` is explicit.
11. EXAMINE / INTERVIEW / TEST are available with Ukrainian labels.
12. Evidence is stored locally.
13. Findings are traceable to assessment item + evidence.
14. Final report is generated only from persisted Assessment Run.
15. Finalized assessment is read-only.
16. AC-02 gold-standard tests pass.
17. AS-2 regression sanity check passes.
18. NIST unresolved mapping never blocks Ukrainian assessment.
19. Production JSON has no similarity `score`.
20. System remains fully offline and zero-dependency.

---

# 33. Deliverables

Agent must deliver:

```text
1. source code
2. updated data files
3. automated tests
4. migration notes
5. README section for Assessment Module
6. architecture decision record:
   docs/adr/assessment-odp-numbering.md
7. sample Assessment Run created from АС-2.json
8. sample generated assessment DOCX
9. validation report for AC-02
10. regression report for entire АС-2
```

---

# 34. Required ADR

Create:

```text
docs/adr/assessment-odp-numbering.md
```

Must state:

- Ukrainian/local assessment ODP is primary;
- `local_odp_id` is source for CPB value resolution;
- NIST ODP is optional traceability;
- NIST numbering mismatch is expected because Ukrainian ND TZI adapted NIST;
- no ordinal inference is allowed in runtime;
- no score is allowed in production mapping;
- verified NIST mapping can be added later without migration of CPB data.

---

# 35. Files in this task bundle

## Product architecture
- `2026-08-10-offline-profile-standalone-app.md`
- `2026-08-10-offline-profile-standalone-app-design.md`
- `assessment_module_technical_spec_v2.md` — historical context only; v3 supersedes conflicting parts.

## Production source data
- `nd_tzi.json`
- `bpb_service.json`
- `bpb_open_confidential.json`
- `generic_parameter_defaults.json`
- `policy_mapping.json`
- `as_class_exemptions.json`
- `threats_risks.json`
- `assets_catalog.json`

## Assessment sources
- `ndtzi36006(1).json`
- `НД ТЗІ 2.3-025-24_Т2 (1).pdf`
- `НД ТЗІ 2.3-025-24_Т3 (1).pdf`
- `НДТЗІ 2.7 009.txt`

## Fixtures
- `АС-2.json`

## Validated/generated artifacts
- `assessment_odp_adapter_full_document_v1_1_production.json`
- `as2_full_odp_sanity_check_v1.json`
- `ac02_local_assessment_odp_adapter_as2_check.json`
- `ac02_local_assessment_odp_adapter_as2_check.md`

## Internal review only
- `nist_odp_mapping_candidates_internal_review_v1.json`

Do not import internal-review candidates into runtime.

---

# 36. First action for agent

Before implementation:

1. read this file completely;
2. inspect existing repository;
3. compare current repository with attached product design;
4. run existing tests;
5. load `assessment_odp_adapter_full_document_v1_1_production.json`;
6. validate all `local_odp_id` references against `nd_tzi.json`;
7. run AC-02 gold-standard validation;
8. run AS-2 baseline regression validation;
9. produce a short implementation plan;
10. only then modify code.

If any attached source conflicts with this v3 task:
- this v3 task controls architecture;
- normative source data controls text/content;
- never silently rewrite normative text.

