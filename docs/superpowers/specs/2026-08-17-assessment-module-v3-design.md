# Assessment Module v3 — Design

**Дата:** 2026-08-17
**Статус:** затверджено користувачем
**Авторитетне ТЗ:** [data/assessment_module_agent_task_v3.md](../../../data/assessment_module_agent_task_v3.md) (v3 controls architecture; нормативні джерела controls text/content)
**Замінює:** assessment module v1 (комміти 2026-08-13..15, старий spec `docs/superpowers/specs/...standalone-app-design.md` §assessment та план `2026-08-13-assessment-module-implementation.md`)

## Контекст і мета

Репозиторій вже містить assessment module v1 (assessment-io/plan/resolver/summary/validator, DOCX writer, /api/assessments маршрути, UI-картки). ТЗ v3 вимагає іншу архітектуру: центральний Assessment ODP Adapter з локальною нумерацією НД ТЗІ як primary key, детермінований effective-value resolver, objective templates з плейсхолдерами, повний Assessment Run lifecycle (snapshot → results → evidence → findings → audit → finalize → report).

Рішення користувача:
1. **v1 → v3 переробка з міграцією**: v1-код рефакториться під v3-модель; наявні v1 `assessment.json` конвертуються при завантаженні (enum, evidence, findings). Запис — лише у v3-схемі.
2. **Assessment catalog деривується з `ndtzi36006(1).json`** (скриптом, відтворювано).
3. **Один наскрізний план** для фаз A–F.
4. **Плейсхолдери без VERIFIED NIST-зв'язку** показуються нормативним текстом як є (не `[НЕ ВИЗНАЧЕНО]`, не auto-match); статус `REFERENCE_ONLY` видно в ODP sub-row.

## 1. Шар даних (Phase A)

### 1.1. `data/assessment/assessment_odp_adapter.json`
Копія `data/VALIDATED_ARTIFACTS/assessment_odp_adapter_full_document_v1_1_production.json`:
1026 ODP-записів, 586 контролів, NIST traceability: 4 VERIFIED (AC-02 gold standard), 1022 UNRESOLVED, без similarity scores.

### 1.2. `data/assessment/assessment_reference.json`
Деривується новим скриптом `tools/build-assessment-reference.js` з `data/ASSESSMENT_SOURCES/ndtzi36006(1).json` (Django fixture, 4213 determinationcontrol / 676 examinecontrol / 674 interviewcontrol / 590 testcontrol):
- determination statements per control (code, control, text);
- examine/interview/test objects: парсинг `[ВИБІР: a; b; c].` → масив рядків;
- нормативний текст не редагується (no silent fix).
Скрипт і результат комітяться.

### 1.3. `data/assessment_catalog.json` (v3, повний)
Генерується з reference (скрипт `tools/build-assessment-catalog.js` або та сама деривація):
- кожен determination statement → assessment item: `assessment_source_id` = code (напр. `AC-02e`), `control_id`, `statement_path` (витягнутий з code), `objective_template` = нормативний текст із `<ODP …>` плейсхолдерами, `assessment_odp_refs`;
- `methods.EXAMINE/INTERVIEW/TEST` з objects з examine/interview/test записів контролю; укр. labels Дослідження/Співбесіда/Перевірка.
Старий AC-02-only fixture-каталог замінюється.

### 1.4. Правило плейсхолдерів (ключове)
`<AC-02_ODP[03] …>` у reference-тексті — NIST-подібна нумерація. Резолвінг: NIST id → зворотний пошук в адаптері по `nist_traceability.odp_ids` (тільки `status: "VERIFIED"`) → assessment_odp_id локальний → `local_odp_id` → effective value. Без VERIFIED-зв'язку — плейсхолдер лишається нормативним текстом (label), позначається `REFERENCE_ONLY`. Плейсхолдер ніколи не видаляється мовчки. Заборонено: ordinal inference, similarity, machine candidates у runtime.

### 1.5. Версії/хеші
SHA-256 хеші nd_tzi.json, adapter, catalog, reference, generic defaults, BPB — фіксуються у `catalog-version.json` кожного snapshot.

## 2. Core-модулі (Phases B–D)

Структура за ТЗ §21, `core/assessment/`:

| Модуль | Призначення |
|---|---|
| `odp-adapter.js` | завантаження/індексація адаптера; індекси: assessment_odp_id→entry, local_odp_id→entries, NIST VERIFIED reverse index; валідація local_odp_id проти nd_tzi; детект duplicate primary binding |
| `effective-value-resolver.js` | pure; пріоритет `CPB_OVERRIDE → BPB_INHERITED → GENERIC_DEFAULT → UNRESOLVED`; BPB — тільки через explicit `bpb_bindings` адаптера (statement_path, ordinal_parameter, free_text, merged paths, 1→N locators); результат `{status, source, value, evidence[]}`; UNRESOLVED → value:null, ніколи не вигадувати |
| `objective-resolver.js` | структурний парсинг `<ODP-ID label>`; VERIFIED→effective value; VERIFIED але unresolved → `[НЕ ВИЗНАЧЕНО]`; без VERIFIED → label as-is + REFERENCE_ONLY |
| `assessment-plan.js` (переробка) | items з CPB snapshot scope (без excluded/exempt/withdrawn-incorporated, тільки вибрані enhancements); `odp_values[] {assessment_odp_id, local_odp_id, baseline_value, target_value, effective_source}`; `resolved_objective`; `available_methods` |
| `assessment-run.js` | run lifecycle: create (snapshot+dirs), результати `NOT_ASSESSED/SATISFIED/PARTIALLY_SATISFIED/NOT_SATISFIED/NOT_APPLICABLE`, `methods_used[]`, status transitions |
| `evidence.js` | модель §14: evidence_id, type enum (DOCUMENT…OTHER), source{kind,path} sandboxed, reference, observation, collected_at/by |
| `findings.js` | модель §15: finding_id, severity OBSERVATION/MINOR/MAJOR/CRITICAL, evidence_ids[], recommendation, status |
| `audit-trail.js` | append-only `audit-log.json`, actions §19 |
| `report-projection.js` | проєкція Run + snapshot + resolved plan → report data (10 розділів §18) |
| `assessment-validator.js` (переробка) | pre-start blocking errors + warnings §24; unresolved NIST — informational, ніколи не блокує |
| `assessment-io.js` (переробка) | v3-схема; міграція v1→v3 при read: `POSITIVE→SATISFIED`, `PARTIALLY_POSITIVE→PARTIALLY_SATISFIED`, `NEGATIVE→NOT_SATISFIED`, evidence → нова модель, `finding.description` → structured finding |

## 3. Сервер і сховище

- Наявні маршрути зберігаються; додається `POST /api/assessments/:id/finalize`; PUT покриває results/findings; кожна зміна — audit-log append.
- `assessments/<id>/{assessment.json, cpb-snapshot.json, catalog-version.json, audit-log.json, evidence/}`.
- Після FINALIZED: results/snapshot/evidence read-only (сервер відхиляє мутації), report reproducible.
- 127.0.0.1 only, path traversal захист, файлове сховище без DB — без змін.

## 4. UI (Phase E)

- Окремий режим «Оцінювання ІКС» поруч із «Формування ЦПБ» (не крок wizard).
- Головна таблиця §16: group headers (клас заходу → назва заходу); колонки: Позначення мети оцінювання / Мета оцінювання / Значення з БПБ / Значення з ЦПБ / Вибір оцінки / Вибір типів дослідження (чекбокси Дослідження/Співбесіда/Перевірка) / Докази / Висновок.
- ODP sub-rows: assessment ODP id, local id, baseline, target, source; NIST — тільки в traceability drawer, не за замовчуванням.
- Evidence/finding діалоги — рефактор наявних під нові моделі.
- Unresolved warnings + progress summary.
- Рендеринг лише `textContent`/`createElement`/`append`; без innerHTML.

## 5. Звіт (Phase F)

`assessment-docx-writer.js` переробляється: вхід — тільки report projection; розділи §18 (титул, відомості про ІКС, підстава/область, версія ЦПБ, методи, результати за класами, докази, findings, загальний висновок, додатки); укр. labels методів. Тест відтворюваності: дві генерації → ідентичний document.xml.

## 6. Тести

`test/assessment/` за ТЗ §27: odp-adapter, effective-value-resolver, objective-resolver, assessment-plan, assessment-run, evidence, findings, finalize, **ac02-gold-standard** (4 мапінги §26 + CPB override, BPB h.1/h.2/h.3, j, unresolved ac-2_odp.01, placeholder substitution, `[НЕ ВИЗНАЧЕНО]`), **as2-regression** (з `data/FIXTURES/АС-2.json`: 270 ODP, 231 resolved, 39 unresolved, 85.56%, 90 CPB/83 BPB/58 GENERIC). Наявні 20 тест-файлів лишаються зеленими. Тест міграції v1→v3.

## 7. Deliverables (§33)

Код, дані, тести, migration notes, README-розділ, ADR `docs/adr/assessment-odp-numbering.md` (§34), sample Assessment Run з АС-2.json, sample DOCX, AC-02 validation report, AS-2 regression report.

## 8. Do not (§30, скорочено)

Не перенумеровувати local ODP; NIST не primary key; без similarity в production; не дублювати CPB values в каталозі; не мутувати CPB після старту run; report тільки з persisted run; без external services/npm; не silent-fix нормативний текст; не підставляти unresolved binding; не видаляти плейсхолдер без explicit marker.
