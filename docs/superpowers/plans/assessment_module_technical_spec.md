# Технічне завдання
## Розширення автономного комплексу «Офлайн-Профіль» модулем оцінювання ІКС
### Версія 2 — модель ODP узгоджена з `nd_tzi.json`

**Статус:** до реалізації  
**Тип робіт:** розширення існуючого standalone offline application  
**Базовий продукт:** «Офлайн-Профіль»  
**Режим експлуатації:** 100% offline, АРМ без доступу до мережі  
**Пріоритет:** High

---

## 1. Мета

Розширити існуючий автономний програмний комплекс «Офлайн-Профіль» окремим режимом **«Оцінювання ІКС»**, який використовується після формування та затвердження Цільового профілю безпеки (ЦПБ).

Модуль повинен:

1. приймати затверджений запис ЦПБ (`templates/approved/*.json`) як вхідний артефакт;
2. створювати immutable snapshot ЦПБ;
3. будувати Assessment Plan виключно на основі локальних каталогів та фактичного складу сформованого ЦПБ;
4. використовувати ті самі ODP-параметри, що були використані під час формування ЦПБ;
5. підставляти resolved ODP values у тексти заходів та посилень;
6. створювати Assessment Items на рівні перевірюваних тверджень заходу/посилення;
7. дозволяти оцінювачу реєструвати методи, докази, джерела відомостей, спостереження, висновок, коментарі та findings;
8. зберігати робочий результат у `assessment.json`;
9. генерувати DOCX «Звіт з оцінювання»;
10. працювати без мережі, зовнішніх API, npm-залежностей, БД та хмарних сервісів.

---

## 2. Ключова модель ODP

### 2.1. Єдиний namespace ODP

У системі НЕ створювати окремий namespace «assessment ODP».

ODP — це параметри, визначені в `nd_tzi.json` для базового заходу та його посилень. Їх значення визначаються під час формування профілю/ЦПБ залежно від:

- класу АС;
- БПБ;
- типу інформації;
- глобальних політик;
- ризиків;
- ручних overrides;
- вибраних посилень.

Assessment Module використовує ці значення **read-only**.

### 2.2. Для AC-02 є 16 ODP-параметрів

```text
Base AC-2:
1. ac-2_odp.01
2. ac-2_odp.02
3. ac-2_odp.03
4. ac-2_odp.04

Enhancement AC-2(2):
5. ac-2.2_odp.01
6. ac-2.2_odp.02

Enhancement AC-2(3):
7. ac-2.3_odp.01

Enhancement AC-2(5):
8. ac-2.5_odp.01

Enhancement AC-2(6):
9. ac-2.6_odp.01

Enhancement AC-2(8):
10. ac-2.8_odp.01

Enhancement AC-2(9):
11. ac-2.9_odp.01

Enhancement AC-2(11):
12. ac-2.11_odp.01
13. ac-2.11_odp.02

Enhancement AC-2(12):
14. ac-2.12_odp.01
15. ac-2.12_odp.02

Enhancement AC-2(13):
16. ac-2.13_odp.01
```

### 2.3. ODP не є самостійним результатом аудиту

ODP є змінною, яка формує конкретну вимогу.

Приклад:

```text
Source statement:
Вимагати схвалення {{ insert: param, ac-2_odp.01 }}
запитів на створення облікових записів системи.

CPB:
ac-2_odp.01 = "керівником служби захисту інформації"

Assessment requirement:
Вимагати схвалення керівником служби захисту інформації
запитів на створення облікових записів системи.
```

Оцінювач перевіряє **resolved requirement**, а не повторно визначає значення ODP.

---

## 3. Архітектурні обмеження

Зберегти:

- Node.js ≥ 18;
- ES modules;
- vanilla JavaScript;
- zero npm dependencies;
- `node:http`;
- loopback only `127.0.0.1`;
- `core/` без DOM / `fs` / `http`;
- UI без `innerHTML` для даних;
- локальні JSON-каталоги;
- власний OOXML/ZIP writer;
- український UI;
- переносимість шляхом копіювання папки.

Не додавати React, Vue, Angular, SQLite, Electron, cloud, CDN, remote API.

---

## 4. Місце Assessment Module

Не робити «Крок 8» існуючого wizard.

```text
Офлайн-Профіль
├── Формування ЦПБ
└── Оцінювання ІКС
```

---

## 5. Джерела даних

Існуючі:

```text
data/nd_tzi.json
data/bpb_service.json
data/bpb_open_confidential.json
data/generic_parameter_defaults.json
data/policy_mapping.json
data/as_class_exemptions.json
templates/approved/*.json
```

**Вхідний артефакт оцінювання — затверджений запис** (`templates/approved/*.json`, `kind === "approved"`):

- містить повний знімок стану майстра (`passport` з `ics_name`/`as_class`, `global_constants`, `selected_assets`, `risks`, `info_type`, `profile`) — цього достатньо для повного resolve усіх ODP (пріоритет: override > policy > BPB > generic) та заповнення metadata;
- записи вже immutable на server layer (POST на існуюче імʼя → 409), що природно гарантує незмінність джерела;
- cpb-шаблони (`templates/cpb/*.json`) НЕ є валідним входом: вони не містять `passport` та `global_constants`, без яких resolve неможливий.

Нові:

```text
data/assessment_catalog.json
data/assessment_methods.json
data/assessment_report_mapping.json
```

---

## 6. Структура репозиторію

```text
offline-profile/
├── core/
│   ├── assessment/
│   │   ├── assessment-plan.js
│   │   ├── assessment-resolver.js
│   │   ├── assessment-validator.js
│   │   ├── assessment-summary.js
│   │   ├── assessment-io.js
│   │   └── evidence-utils.js
│   └── docx/
│       ├── docx-writer.js
│       ├── assessment-docx-writer.js
│       └── zip-writer.js
├── data/
│   ├── assessment_catalog.json
│   ├── assessment_methods.json
│   └── assessment_report_mapping.json
├── public/js/assessment/
├── assessments/
│   └── <assessment-id>/
│       ├── assessment.json
│       ├── cpb-snapshot.json
│       └── evidence/
├── exports/assessments/
└── test/
```

---

## 7. Доменна модель

### Assessment
Один цикл оцінювання одного snapshot ЦПБ.

### Assessment Item
Мінімальна перевірювана одиниця.

Наприклад:

```text
AC-02.a
AC-02.b
AC-02.c
AC-02.e
AC-02.h.1
AC-02(02)
AC-02(03).d
AC-02(12).i
```

### ODP Reference
Assessment Item може містити `odp_refs`, які вказують на параметри з `nd_tzi.json`.

### Evidence Record
Структурований доказ.

### Conclusion
Висновок щодо Assessment Item.

### Finding
Невідповідність для negative/partial conclusion.

---

## 8. Assessment Catalog

`assessment_catalog.json` не дублює ЦПБ і не зберігає значення ODP.

Він зберігає **методику оцінювання**:

```json
{
  "id": "AC-02.e",
  "control_id": "AC-02",
  "statement_path": "e",
  "odp_refs": ["ac-2_odp.01"],
  "methods": ["EXAMINE", "INTERVIEW", "TEST"],
  "potential_evidence": ["POLICY", "PROCEDURE", "ACCESS_REQUEST", "SYSTEM_CONFIGURATION"]
}
```

Resolved text будується з:

```text
nd_tzi statement
+
CPB ODP values
```

---

## 9. ODP Registry у Assessment Catalog

Для кожного control catalog може містити registry параметрів для валідації:

```json
{
  "id": "ac-2_odp.01",
  "owner_control_id": "AC-02",
  "owner_statement_path": "e",
  "type": "assignment"
}
```

Для enhancement:

```json
{
  "id": "ac-2.2_odp.01",
  "owner_control_id": "AC-02(02)",
  "owner_statement_path": null,
  "type": "selection"
}
```

Registry не містить actual value.

---

## 10. Генерація Assessment Plan

```js
buildAssessmentPlan({
  approvedState,   // state зі знімка затвердженого запису
  ndTzi,
  assessmentCatalog,
  bpb,
  exemptions
})
```

Алгоритм:

1. зчитати immutable snapshot затвердженого запису;
2. отримати список застосованих base controls;
3. отримати список фактично включених enhancements;
4. не додавати enhancement, якого немає у ЦПБ;
5. отримати statement tree із `nd_tzi.json`;
6. отримати ODP values через повний resolve стану знімка (override > policy > BPB > generic);
7. знайти assessment catalog entry для кожного застосованого control/enhancement;
8. resolve statement placeholders;
9. створити Assessment Items;
10. для unresolved ODP поставити warning;
11. зберегти source statement і resolved statement;
12. сформувати summary.

---

## 11. Resolver

Використовувати той самий placeholder format, що й основний продукт:

```text
{{ insert: param, ac-2_odp.01 }}
```

Функції:

```js
resolveStatement(text, odpValues)
resolveAssessmentItem(item, context)
collectControlOdpValues(cpb, controlId)
```

Якщо значення немає:

```text
[НЕ ВИЗНАЧЕНО: ac-2_odp.01]
```

та warning:

```json
{
  "code": "ODP_UNRESOLVED",
  "param_id": "ac-2_odp.01"
}
```

Не генерувати значення автоматично.

---

## 12. Важливе правило посилень

Assessment Plan створює Assessment Items для enhancement лише якщо enhancement:

- є у сформованому ЦПБ;
- або включений risk-driven/manual enhancement selection.

Наприклад, наявність `AC-02(12)` у `nd_tzi.json` сама по собі не означає, що його потрібно оцінювати.

---

## 13. CPB Snapshot

При створенні Assessment користувач обирає запис із реєстру затверджених (`templates/approved/*.json`); система валідовує `kind === "approved"` і копіює його у:

```text
assessments/<id>/cpb-snapshot.json
```

Snapshot містить повний затверджений запис (state + summary + approved_at). Подальші зміни у реєстрі (нові версії, дублікати) не впливають на Assessment.

Snapshot бажано hash-увати через `node:crypto` на server layer.

---

## 14. Assessment JSON

```json
{
  "kind": "assessment",
  "schema_version": "1.0.0",
  "id": "ASSESS-2026-001",
  "created_at": "",
  "updated_at": "",
  "status": "IN_PROGRESS",
  "metadata": {
    "ics_name": "",
    "as_class": 1,
    "info_type": "",
    "assessment_body": "",
    "assessor_name": "",
    "assessor_position": "",
    "assessment_start_date": "",
    "assessment_end_date": ""
  },
  "cpb_snapshot": {
    "source_approved_name": "",
    "relative_path": "cpb-snapshot.json",
    "hash": ""
  },
  "items": []
}
```

---

## 15. Assessment Item

```json
{
  "id": "AC-02.e",
  "control_id": "AC-02",
  "canonical_control_id": "AC-2",
  "family": "AC",
  "control_title": "Управління обліковими записами",
  "enhancement": false,
  "statement_path": "e",
  "source_statement": "Вимагати схвалення {{ insert: param, ac-2_odp.01 }} запитів...",
  "resolved_statement": "Вимагати схвалення ... запитів...",
  "odp_refs": ["ac-2_odp.01"],
  "odp_values": {
    "ac-2_odp.01": "..."
  },
  "assessment_status": "NOT_STARTED",
  "recommended_methods": ["EXAMINE", "INTERVIEW", "TEST"],
  "evidence": [],
  "conclusion": null,
  "assessor_comment": "",
  "finding": null
}
```

---

## 16. Assessment Methods

```text
EXAMINE   → Дослідження
INTERVIEW → Опитування
TEST      → Випробування
OBSERVE   → Спостереження
```

---

## 17. Evidence Types

```text
POLICY
PROCEDURE
ORDER
DOCUMENT
REGISTER
LIST
ROLE_MATRIX
ACCESS_REQUEST
LOG
SYSTEM_CONFIGURATION
SCREENSHOT
INTERVIEW
TEST_RESULT
PHYSICAL_INSPECTION
OTHER
```

---

## 18. Evidence

```json
{
  "id": "EV-0001",
  "method": "EXAMINE",
  "source_type": "POLICY",
  "title": "",
  "reference": "",
  "source_date": "",
  "observation": "",
  "comment": "",
  "attachment": null
}
```

---

## 19. Conclusions

```text
POSITIVE
PARTIALLY_POSITIVE
NEGATIVE
NOT_APPLICABLE
NOT_ASSESSED
```

Workflow status:

```text
NOT_STARTED
IN_PROGRESS
READY_FOR_CONCLUSION
COMPLETED
```

Не змішувати їх.

---

## 20. Validation

### POSITIVE
- є evidence;
- є conclusion.

### PARTIALLY_POSITIVE
- є evidence;
- `finding.description` обов'язковий.

### NEGATIVE
- є evidence;
- `finding.description` обов'язковий.

### NOT_APPLICABLE
- justification/comment обов'язковий.

---

## 21. Architectural Exemptions

`Виконано архітектурно` не перетворювати автоматично на `NOT_APPLICABLE`.

Оцінювач повинен підтвердити архітектурне твердження доказами.

---

## 22. Manual Not Applicable

Manual `Не застосовується` залишається в Assessment Plan та підлягає перевірці обґрунтування.

---

## 23. UI

Landing:

```text
Нове оцінювання   ← вибір запису з реєстру затверджених
Продовжити оцінювання
Відкрити завершене оцінювання
```

Навігація:

```text
Family
  Control
    Base statements
    Included enhancements
      Enhancement statements
```

Assessment Item показує read-only:

- ID;
- control;
- source statement;
- resolved statement;
- ODP IDs;
- ODP resolved values;
- статус ЦПБ.

Editable:

- evidence;
- observation;
- conclusion;
- comment;
- finding;
- recommendation.

---

## 24. Evidence Attachments

Файлова модель:

```text
assessments/<id>/
├── assessment.json
├── cpb-snapshot.json
└── evidence/
```

Allowlist:

```text
.pdf .png .jpg .jpeg .txt .log .json
```

Не зберігати base64 у JSON.

---

## 25. Autosave

Primary persistence: `assessment.json`.

Autosave через localhost API, debounce приблизно 500 ms.

---

## 26. Server API

```text
GET    /api/assessments
POST   /api/assessments
GET    /api/assessments/:id
PUT    /api/assessments/:id
POST   /api/assessments/:id/evidence
DELETE /api/assessments/:id/evidence/:file
POST   /api/assessments/:id/export/docx
```

Зберегти path sanitization та directory containment.

---

## 27. DOCX

Створити:

```text
core/docx/assessment-docx-writer.js
```

Reuse `zip-writer.js`.

Звіт будується з Assessment Items.

Таблиця:

| № заходу | Оцінювання | Висновок | Докази, джерела отримання відомостей, коментарі |
|---|---|---|---|

В «Оцінювання»:

```text
AC-02(e)

<resolved statement>
```

У «Докази…»:

```text
Дослідження:
...

Опитування:
...

Випробування:
...

Спостереження:
...

Коментар оцінювача:
...
```

---

## 28. Missing Catalog Rule

Якщо control/enhancement є у ЦПБ, але assessment catalog не містить methodology:

- не пропускати;
- створити fallback `UNMAPPED_CONTROL`;
- дозволити ручне evidence/conclusion;
- показати warning.

---

## 29. AC-02 як еталонний control

Reference fixture повинен містити:

- base AC-02;
- всі 16 ODP identifiers;
- усі enhancement owners цих ODP;
- assessment objectives для base AC-02;
- assessment objectives для посилень AC-02(02), (03), (05), (06), (08), (09), (11), (12), (13);
- posилення без ODP (наприклад AC-02(01), (04), (07)) також можуть мати objectives, оскільки їх вимога не потребує параметризації;
- AC-02(10) із текстом «вилучено до AC-2k» не формувати як active assessment objective, якщо воно не є самостійною вимогою у чинному каталозі.

---

## 30. Тестування

Обов'язково:

```text
assessment-plan.test.js
assessment-resolver.test.js
assessment-validator.test.js
assessment-summary.test.js
assessment-io.test.js
assessment-docx-writer.test.js
server-assessment.test.js
```

Тести AC-02:

1. знайдено рівно 16 ODP IDs;
2. base control містить 4 ODP;
3. enhancement ODP owners визначаються правильно;
4. enhancement не потрапляє в Assessment Plan, якщо його немає в CPB;
5. enhancement потрапляє, якщо він включений;
6. усі placeholders resolve зі знімка затвердженого запису;
7. unresolved ODP дає warning;
8. source statement не модифікується;
9. resolved statement зберігається окремо;
10. DOCX використовує resolved statement.

---

## 31. Definition of Done

- існуючий CPB workflow не зламано;
- Assessment створюється із затвердженого запису (`templates/approved/*.json`);
- snapshot immutable;
- AC-02 model має 16 реальних ODP;
- немає окремого assessment ODP namespace;
- resolved requirements формуються з `nd_tzi.json + CPB values`;
- included enhancements оцінюються;
- evidence/conclusion/finding працюють;
- Assessment JSON persist/reopen працює;
- DOCX генерується;
- всі тести green;
- npm dependencies = 0;
- outbound network = 0.

---

## 32. Out of Scope v1

- AI/LLM;
- автоматичний висновок;
- POA&M;
- residual risk recalculation;
- authorization decision;
- БД;
- multi-user;
- cloud;
- OCR;
- автоматичний parsing evidence.

---

## 33. Головний принцип

```text
Risk / Class / BPB
        ↓
ODP values
        ↓
Resolved CPB
        ↓
Assessment Plan
        ↓
Resolved Assessment Items
        ↓
Evidence
        ↓
Assessor Conclusion
        ↓
assessment.json
        ↓
Assessment Report DOCX
```

**ODP визначається під час формування ЦПБ. Оцінювач не визначає ODP повторно — він перевіряє виконання заходу з уже підставленим значенням ODP.**
