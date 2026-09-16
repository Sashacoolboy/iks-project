# «Офлайн-Профіль» — план імплементації автономного комплексу

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Автономний офлайн-застосунок (Node.js сервер + браузер, нуль залежностей) для формування ЦПБ ІКС за 7-кроковим флоу: паспорт+політики → активи → ризики → тип інформації → генерація ЦПБ → верифікація/посилення → шаблони+DOCX.

**Architecture:** Чисте JS-ядро `core/` (без DOM і node-API, крім документованого винятку node:zlib у zip-writer) + тонкий vanilla-JS UI `public/js/` + мінімальний `node:http` сервер. Дані — статичні JSON-каталоги в `data/`, шаблони — JSON-файли в `templates/`, експорт — власний OOXML/ZIP-генератор.

**Tech Stack:** Node.js ≥ 18, ES-модулі, `node --test`, `node:http`, `node:zlib`. Жодних npm dependencies.

**Spec:** `docs/superpowers/specs/2026-08-10-offline-profile-standalone-app-design.md` (копіюється в новий репозиторій у Task 1; оригінал — в iks_solution).

## Global Constraints

- Репозиторій: `/Users/alexbuchkivskii/Documents/offline-profile` (новий, окремий від iks_solution).
- `package.json`: `"type": "module"`, без `dependencies` та `devDependencies`. Скрипти: `"start": "node server.js"`, `"test": "node --test test/"`.
- `core/` — чисті функції, БЕЗ `document`/`window`/`fs`/`http`. Виняток: `core/docx/zip-writer.js` імпортує `node:zlib` (експорт виконується сервером; при портуванні на Python замінюється на `zipfile`).
- UI: рендеринг ТІЛЬКИ через `textContent`/`createElement`/`append` — ніякого `innerHTML` з даних.
- Сервер слухає ТІЛЬКИ `127.0.0.1`. Імена файлів шаблонів: `/^[a-zа-яіїєґ0-9_\-]+$/i`, запис лише в `templates/ics/`, `templates/cpb/`, `exports/`.
- Усі тексти UI та даних — українською.
- Плейсхолдер параметра в текстах nd_tzi: `{{ insert: param, <param_id> }}`, regex: `/\{\{\s*insert:\s*param,\s*([A-Za-z0-9._-]+)\s*\}\}/g`.
- Статуси пункту профілю (точні рядки): `Застосовується (автозаповнено)`, `Виконано архітектурно`, `Не застосовується (вручну)`.
- Шкала ризиків (пороги, R = impact × likelihood): Дуже низький ≤ 0.3 < Низький ≤ 0.5 < Середній ≤ 1.5 < Високий ≤ 3.0 < Критичний ≤ 5.0.
- Джерела копійованих каталогів: `/Users/alexbuchkivskii/Documents/iks_solution/data/`.

## Структури наявних каталогів (довідка для всіх задач)

**`data/bpb_service.json` / `data/bpb_open_confidential.json`:**
```
{ schema, profile: {id, title, classification_scope},
  security_classes: [
    { security_class: { name_from_profile: "Управління доступом", class_id: "AC" },
      actions: [
        { number: "1", name: "Управління обліковими записами",
          content_raw: "…текст вимоги…", content_items: […],
          security_actions: [
            { control: { id: "AC-2", base_id: "AC-2", is_enhancement: false, enhancement_id: null },
              security_params: { raw: "…", items: [
                { type: "statement_path", locator: "h.1", value: "24 години", source_text: "…" } ] } } ] } ] } ],
  flat_controls: […], quality: {…} }
```

**`data/nd_tzi.json`:**
```
{ schema, document: { security_families: [
  { id: "AC", title: "УПРАВЛІННЯ ДОСТУПОМ", controls: [
    { id: "AC-01", canonical_id: "AC-1", oscal_id: "ac-1", family: "AC",
      enhancement: false, title: "…",
      catalog: {
        statement: { items: [ { label: "a.", marker: "a", marker_type: "alpha",
                                text: "…{{ insert: param, ac-1_odp.01 }}…", children: […] } ] },
        parameters: [ { id: "ac-1_odp.01", type: "assignment", label: "…", guideline: "…" } ] },
      children: [ { canonical_id: "AC-2(1)", title: "…", enhancement: true, catalog: {…} } ] } ] } ] } }
```

---

### Task 1: Bootstrap репозиторію

**Files:**
- Create: `package.json`, `.gitignore`, `README.md`
- Create (копії): `data/nd_tzi.json`, `data/bpb_service.json`, `data/bpb_open_confidential.json`, `data/generic_parameter_defaults.json`
- Create: `docs/superpowers/specs/2026-08-10-offline-profile-standalone-app-design.md` (копія), `docs/superpowers/plans/2026-08-10-offline-profile-standalone-app.md` (цей файл)
- Create: `templates/ics/.gitkeep`, `templates/cpb/.gitkeep`, `exports/.gitkeep`

**Interfaces:**
- Produces: структуру папок і каталоги даних, які споживають усі наступні задачі.

- [ ] **Step 1: Створити структуру і git**

```bash
mkdir -p /Users/alexbuchkivskii/Documents/offline-profile
cd /Users/alexbuchkivskii/Documents/offline-profile
git init
mkdir -p public/js/steps public/js/render public/css core/docx data templates/ics templates/cpb exports test tools docs/superpowers/specs docs/superpowers/plans
touch templates/ics/.gitkeep templates/cpb/.gitkeep exports/.gitkeep
```

- [ ] **Step 2: package.json та .gitignore**

`package.json`:
```json
{
  "name": "offline-profile",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "start": "node server.js",
    "test": "node --test test/"
  }
}
```

`.gitignore`:
```
node_modules/
exports/*.docx
.DS_Store
```

- [ ] **Step 3: Скопіювати каталоги та документи**

```bash
SRC=/Users/alexbuchkivskii/Documents/iks_solution
cp "$SRC/data/nd_tzi.json" data/nd_tzi.json
cp "$SRC/data/bpb_service_information_parameters.json" data/bpb_service.json
cp "$SRC/data/bpb_open_or_confidential_information_parameters.json" data/bpb_open_confidential.json
cp "$SRC/data/generic_parameter_defaults.json" data/generic_parameter_defaults.json
cp "$SRC/docs/superpowers/specs/2026-08-10-offline-profile-standalone-app-design.md" docs/superpowers/specs/
cp "$SRC/docs/superpowers/plans/2026-08-10-offline-profile-standalone-app.md" docs/superpowers/plans/
```

- [ ] **Step 4: README.md**

```markdown
# Офлайн-Профіль

Автономний комплекс формування Цільового профілю безпеки ІКС (АС-1/2/3).
100% офлайн, нуль залежностей. Вимога: Node.js ≥ 18.

Запуск: `npm start` → відкрити http://127.0.0.1:3000
Тести: `npm test`
```

- [ ] **Step 5: Перевірити і закомітити**

Run: `node -e "JSON.parse(require('fs').readFileSync('data/nd_tzi.json')); JSON.parse(require('fs').readFileSync('data/bpb_service.json')); console.log('OK')"`
Expected: `OK`

```bash
git add -A && git commit -m "chore: bootstrap offline-profile repo with data catalogs"
```

---

### Task 2: Каталог активів + core/asset-catalog.js

**Files:**
- Create: `data/assets_catalog.json`
- Create: `core/asset-catalog.js`
- Test: `test/asset-catalog.test.js`

**Interfaces:**
- Produces: `filterAssetsByClass(assets, asClass) -> Asset[]`; `groupByCategory(assets) -> Map<string, Asset[]>`. `Asset = { id, name, category, min_as_class }`.

- [ ] **Step 1: Записати data/assets_catalog.json (повний вміст)**

```json
{
  "assets": [
    { "id": "A-01", "name": "Автоматизоване робоче місце (АРМ)", "category": "Фізичні активи", "min_as_class": 1 },
    { "id": "A-02", "name": "Знімні носії інформації", "category": "Фізичні активи", "min_as_class": 1 },
    { "id": "A-03", "name": "Периферійні пристрої (друку/скану)", "category": "Фізичні активи", "min_as_class": 1 },
    { "id": "A-04", "name": "Персонал (Користувач, Адміністратор)", "category": "Людські ресурси", "min_as_class": 1 },
    { "id": "A-05", "name": "Програмні/Апаратні засоби захисту (ЗКЗІ, Антивірус)", "category": "Засоби захисту", "min_as_class": 1 },
    { "id": "A-06", "name": "Локальні дані та електронні документи", "category": "Інформаційне", "min_as_class": 1 },
    { "id": "A-07", "name": "Приміщення / Об'єкт розміщення", "category": "Середовище", "min_as_class": 1 },
    { "id": "A-08", "name": "Комутаційне та мережеве обладнання", "category": "Інфраструктурні активи", "min_as_class": 2 },
    { "id": "A-09", "name": "Сервери (фізичне залізо)", "category": "Інфраструктурні активи", "min_as_class": 2 },
    { "id": "A-10", "name": "Системне ПЗ (операційні системи, сервери баз даних)", "category": "Платформне", "min_as_class": 2 },
    { "id": "A-11", "name": "Постачальники зовнішнього доступу (Провайдери)", "category": "Зовнішні залежності", "min_as_class": 3 },
    { "id": "A-12", "name": "Зовнішні ІКС та інтегровані програмні продукти", "category": "Зовнішні залежності", "min_as_class": 3 },
    { "id": "A-13", "name": "Віртуальна інфраструктура / Хмарні обчислювальні потужності", "category": "Віртуальне", "min_as_class": 3 }
  ]
}
```

- [ ] **Step 2: Написати провальний тест**

`test/asset-catalog.test.js`:
```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { filterAssetsByClass, groupByCategory } from '../core/asset-catalog.js';

const { assets } = JSON.parse(readFileSync(new URL('../data/assets_catalog.json', import.meta.url)));

test('АС-1 бачить лише активи 1-7', () => {
  const r = filterAssetsByClass(assets, 1);
  assert.equal(r.length, 7);
  assert.ok(r.every(a => a.min_as_class === 1));
});

test('АС-2 бачить активи 1-10', () => {
  assert.equal(filterAssetsByClass(assets, 2).length, 10);
});

test('АС-3 бачить усі 13', () => {
  assert.equal(filterAssetsByClass(assets, 3).length, 13);
});

test('групування за категоріями зберігає порядок', () => {
  const g = groupByCategory(filterAssetsByClass(assets, 1));
  assert.deepEqual([...g.keys()], ['Фізичні активи', 'Людські ресурси', 'Засоби захисту', 'Інформаційне', 'Середовище']);
  assert.equal(g.get('Фізичні активи').length, 3);
});
```

- [ ] **Step 3: Запустити — впевнитись у провалі**

Run: `npm test`
Expected: FAIL — `Cannot find module '../core/asset-catalog.js'`

- [ ] **Step 4: Реалізація core/asset-catalog.js**

```js
export function filterAssetsByClass(assets, asClass) {
  return assets.filter(a => a.min_as_class <= asClass);
}

export function groupByCategory(assets) {
  const map = new Map();
  for (const a of assets) {
    if (!map.has(a.category)) map.set(a.category, []);
    map.get(a.category).push(a);
  }
  return map;
}
```

- [ ] **Step 5: Тести зелені, коміт**

Run: `npm test` → Expected: PASS (4 tests)

```bash
git add data/assets_catalog.json core/asset-catalog.js test/asset-catalog.test.js
git commit -m "feat: assets catalog (13 classes) + filtering by AS class"
```

---

### Task 3: Каталог загроз/ризиків threats_risks.json + валідатор даних

**Files:**
- Create: `data/threats_risks.json`
- Create: `tools/validate-data.js`

**Interfaces:**
- Produces: `threats_risks.json` зі `scale` та `risks[]` (схема нижче) — споживається risk-engine (Task 4) та UI (Task 16). `tools/validate-data.js` — перевикористовується Task 5 і Task 7.

Схема ризику:
```
{ id, asset_id, min_as_class, threat, vulnerability, impact (1-5),
  likelihood (0.1-0.9), likelihood_label, treatment_strategy, treatment_plan,
  responsible, residual_risk, priority, control_refs: [canonical_id],
  enhancement_suggestions: [canonical_id посилення] }
```

- [ ] **Step 1: Записати data/threats_risks.json — блок scale**

```json
{
  "scale": {
    "levels": [
      { "label": "Дуже низький", "max": 0.3 },
      { "label": "Низький", "max": 0.5 },
      { "label": "Середній", "max": 1.5 },
      { "label": "Високий", "max": 3.0 },
      { "label": "Критичний", "max": 5.0 }
    ],
    "likelihood_options": [
      { "value": 0.1, "label": "Дуже низька" },
      { "value": 0.2, "label": "Дуже низька" },
      { "value": 0.3, "label": "Низька" },
      { "value": 0.4, "label": "Середня" },
      { "value": 0.5, "label": "Середня" },
      { "value": 0.6, "label": "Висока" },
      { "value": 0.7, "label": "Висока" },
      { "value": 0.8, "label": "Висока" },
      { "value": 0.9, "label": "Дуже висока" }
    ],
    "impact_options": [
      { "value": 1, "label": "Дуже низький" },
      { "value": 2, "label": "Середній" },
      { "value": 3, "label": "Помітний" },
      { "value": 4, "label": "Високий" },
      { "value": 5, "label": "Критичний" }
    ]
  },
  "risks": []
}
```

- [ ] **Step 2: Додати 9 еталонних ризиків користувача (R-001…R-009)**

Примітка: R-005 у таблиці користувача значився як «Мережеве обладнання / АС-1», але йдеться про радіоінтерфейси самого АРМ (Wi-Fi/Bluetooth у BIOS, порти RJ-45) — тому `asset_id: "A-01"`, інакше актив був би прихований для АС-1.

```json
[
  { "id": "R-001", "asset_id": "A-01", "min_as_class": 1,
    "threat": "Локальний НСД при втраті або викраденні пристрою",
    "vulnerability": "Відсутність шифрування диска",
    "impact": 4, "likelihood": 0.5, "likelihood_label": "Середня",
    "treatment_strategy": "Зменшення",
    "treatment_plan": "Впровадження повного шифрування диска (BitLocker/LUKS) з прив'язкою до PIN-коду.",
    "responsible": "Начальник ІБ", "residual_risk": "Низький", "priority": "Високий",
    "control_refs": ["SC-28", "MP-6"], "enhancement_suggestions": ["SC-28(1)"] },
  { "id": "R-002", "asset_id": "A-04", "min_as_class": 1,
    "threat": "Компрометація облікових даних (фішинг, соціальна інженерія)",
    "vulnerability": "Низький рівень кібергігієни",
    "impact": 4, "likelihood": 0.7, "likelihood_label": "Висока",
    "treatment_strategy": "Зменшення",
    "treatment_plan": "Регулярне навчання з кібергігієни, підписання інструкцій та зобов'язань користувача.",
    "responsible": "HR, Начальник ІБ", "residual_risk": "Середній", "priority": "Середній",
    "control_refs": ["AT-2", "PS-6"], "enhancement_suggestions": ["AT-2(3)"] },
  { "id": "R-003", "asset_id": "A-02", "min_as_class": 1,
    "threat": "Занесення шкідливого ПЗ (ШПЗ), витік даних",
    "vulnerability": "Неконтрольоване підключення USB",
    "impact": 4, "likelihood": 0.8, "likelihood_label": "Висока",
    "treatment_strategy": "Зменшення",
    "treatment_plan": "Програмне блокування неавторизованих USB; примусове шифрування дозволених носіїв.",
    "responsible": "Начальник ІБ", "residual_risk": "Низький", "priority": "Середній",
    "control_refs": ["MP-7", "SI-3"], "enhancement_suggestions": [] },
  { "id": "R-004", "asset_id": "A-03", "min_as_class": 1,
    "threat": "Витік даних через залишкову пам'ять пристрою друку",
    "vulnerability": "Відсутність регулярного очищення черги друку",
    "impact": 2, "likelihood": 0.4, "likelihood_label": "Середня",
    "treatment_strategy": "Прийняття",
    "treatment_plan": "Регулярне автоматичне очищення черги друку; фізичний контроль доступу до принтера/МФУ.",
    "responsible": "Керівник відділу", "residual_risk": "Середній", "priority": "Високий",
    "control_refs": ["MP-6", "PE-5"], "enhancement_suggestions": [] },
  { "id": "R-005", "asset_id": "A-01", "min_as_class": 1,
    "threat": "Перехоплення трафіку зловмисником",
    "vulnerability": "Гіпотетична наявність вразливих радіоінтерфейсів",
    "impact": 4, "likelihood": 0.1, "likelihood_label": "Дуже низька",
    "treatment_strategy": "Уникнення",
    "treatment_plan": "Фізичний демонтаж або деактивація Wi-Fi/Bluetooth в BIOS, опечатування портів RJ-45.",
    "responsible": "ІТ-відділ", "residual_risk": "Дуже низький", "priority": "Низький",
    "control_refs": ["AC-18", "SC-40"], "enhancement_suggestions": [] },
  { "id": "R-006", "asset_id": "A-08", "min_as_class": 2,
    "threat": "НСД до контуру через компрометацію мережевого стику",
    "vulnerability": "Відсутність сегментації мережі",
    "impact": 4, "likelihood": 0.5, "likelihood_label": "Середня",
    "treatment_strategy": "Зменшення",
    "treatment_plan": "Сегментація мережі (VLAN), фільтрація за MAC-адресами, автентифікація 802.1X.",
    "responsible": "ІТ-відділ", "residual_risk": "Низький", "priority": "Середній",
    "control_refs": ["SC-7", "AC-3"], "enhancement_suggestions": ["SC-7(21)"] },
  { "id": "R-007", "asset_id": "A-09", "min_as_class": 2,
    "threat": "Компрометація прав адміністратора, модифікація БД",
    "vulnerability": "Слабкі локальні паролі, відсутність аудиту",
    "impact": 5, "likelihood": 0.4, "likelihood_label": "Середня",
    "treatment_strategy": "Зменшення",
    "treatment_plan": "Активація рольової моделі (RBAC), вхід за апаратним токеном, централізований збір логів.",
    "responsible": "Начальник ІБ", "residual_risk": "Низький", "priority": "Середній",
    "control_refs": ["AC-6", "IA-2", "AU-6"], "enhancement_suggestions": ["IA-2(1)", "AC-6(5)"] },
  { "id": "R-008", "asset_id": "A-11", "min_as_class": 3,
    "threat": "Перехоплення/модифікація трафіку (MitM)",
    "vulnerability": "Передача даних через відкриті канали провайдера",
    "impact": 5, "likelihood": 0.9, "likelihood_label": "Дуже висока",
    "treatment_strategy": "Зменшення",
    "treatment_plan": "Обов'язкова побудова захищеного тунелю (IPsec VPN) з державним криптографічним шифруванням.",
    "responsible": "ІТ-відділ", "residual_risk": "Дуже низький", "priority": "Високий",
    "control_refs": ["SC-8", "SC-12"], "enhancement_suggestions": ["SC-8(1)"] },
  { "id": "R-009", "asset_id": "A-12", "min_as_class": 3,
    "threat": "Перехоплення або компрометація сесії у сторонній системі",
    "vulnerability": "Можливість підбору паролів",
    "impact": 5, "likelihood": 0.8, "likelihood_label": "Висока",
    "treatment_strategy": "Зменшення",
    "treatment_plan": "Багатофакторна автентифікація для зовнішніх сервісів, контроль угод з постачальниками.",
    "responsible": "Начальник ІБ", "residual_risk": "Низький", "priority": "Високий",
    "control_refs": ["IA-2", "SA-9", "AC-20"], "enhancement_suggestions": ["IA-2(1)"] }
]
```

- [ ] **Step 3: Додати догенеровані ризики до покриття 13 класів (R-010…R-035)**

Кожен рядок таблиці конвертується в JSON-об'єкт тієї самої схеми (likelihood_label — за likelihood_options зі scale; residual_risk після заходів «Зменшення» = «Низький», після «Прийняття» = без змін, priority = рівню початкового ризику):

| id | asset | min | threat | vulnerability | imp | lik | strategy | plan (стисло) | responsible | control_refs | enh |
|---|---|---|---|---|---|---|---|---|---|---|---|
| R-010 | A-01 | 1 | Експлуатація незакритих вразливостей ОС | Несвоєчасне оновлення ПЗ | 4 | 0.6 | Зменшення | Регламент офлайн-оновлень з перевірених носіїв; контроль версій ПЗ | ІТ-відділ | SI-2, CM-6 | — |
| R-011 | A-02 | 1 | Втрата носія з незашифрованими даними | Відсутність обліку та маркування носіїв | 4 | 0.5 | Зменшення | Журнал обліку носіїв, маркування грифом, зберігання в сейфі | Начальник ІБ | MP-4, MP-5 | — |
| R-012 | A-03 | 1 | НСД до документів у зоні друку | Відсутність контролю видачі роздруківок | 3 | 0.5 | Зменшення | Видача друку за особистою присутністю; журнал обліку роздруківок ДСК | Керівник відділу | PE-5, MP-3 | — |
| R-013 | A-04 | 1 | Умисні дії інсайдера (розголошення) | Відсутність перевірки при допуску | 5 | 0.3 | Зменшення | Перевірка персоналу при допуску, договори про нерозголошення, розмежування доступу | HR, Начальник ІБ | PS-3, PS-6, AC-6 | — |
| R-014 | A-04 | 1 | Помилки користувача при обробці інформації | Відсутність інструкцій на робочому місці | 3 | 0.6 | Зменшення | Затверджені інструкції користувача, періодичний інструктаж | Начальник ІБ | AT-3, PL-4 | — |
| R-015 | A-05 | 1 | Відмова або обхід засобу захисту | Відсутність контролю працездатності ЗЗІ | 4 | 0.3 | Зменшення | Періодична перевірка функціонування ЗЗІ, контроль цілісності | Начальник ІБ | SI-6, SI-7 | — |
| R-016 | A-05 | 1 | Компрометація ключів ЗКЗІ | Неналежне зберігання ключових документів | 5 | 0.3 | Зменшення | Зберігання ключів на апаратному токені, регламент поводження з ключовими документами | Начальник ІБ | SC-12, IA-5 | — |
| R-017 | A-06 | 1 | Втрата даних через збій обладнання | Відсутність резервного копіювання | 4 | 0.5 | Зменшення | Регламентне резервне копіювання на обліковані носії, перевірка відновлення | ІТ-відділ | CP-9, CP-10 | CP-9(1) |
| R-018 | A-06 | 1 | Несанкціонована модифікація документів | Відсутність розмежування прав на файли | 4 | 0.4 | Зменшення | Матриця доступу до каталогів, контроль цілісності критичних файлів | Начальник ІБ | AC-3, SI-7 | — |
| R-019 | A-07 | 1 | Фізичне проникнення сторонніх осіб | Недостатній контроль доступу до приміщення | 5 | 0.3 | Зменшення | Кодовий замок/СКУД, журнал відвідувачів, опечатування приміщення | Комендант, Начальник ІБ | PE-2, PE-3 | — |
| R-020 | A-07 | 1 | Пошкодження обладнання (пожежа, залиття) | Відсутність засобів пожежогасіння та датчиків | 4 | 0.2 | Зменшення | Датчики диму/вологи, вогнегасник, регламент реагування | Комендант | PE-13, PE-15 | — |
| R-021 | A-08 | 2 | Підключення стороннього пристрою до ЛОМ | Відсутність контролю фізичних портів комутатора | 4 | 0.4 | Зменшення | Вимкнення невикористаних портів, port-security, інвентаризація підключень | ІТ-відділ | AC-3, CM-8 | — |
| R-022 | A-08 | 2 | Відмова активного мережевого обладнання | Відсутність резервування | 3 | 0.3 | Прийняття | ЗІП-комплект, договір обслуговування | ІТ-відділ | CP-2, MA-2 | — |
| R-023 | A-09 | 2 | Відмова сервера, втрата сервісів | Одиночна точка відмови, відсутність резервної копії | 4 | 0.4 | Зменшення | Резервне копіювання конфігурацій та даних, план відновлення | ІТ-відділ | CP-9, CP-10 | — |
| R-024 | A-09 | 2 | НСД до серверної шафи | Вільний фізичний доступ до серверного приміщення | 4 | 0.3 | Зменшення | Замикання серверної шафи, окремий доступ до серверного приміщення | Комендант | PE-2, PE-3 | — |
| R-025 | A-10 | 2 | Експлуатація вразливостей системного ПЗ | Застарілі версії ОС/СУБД без підтримки | 5 | 0.5 | Зменшення | План оновлень, контроль підтримуваних версій, усунення вразливостей | ІТ-відділ | SI-2, RA-5 | — |
| R-026 | A-10 | 2 | Небезпечна конфігурація ОС/СУБД | Використання конфігурацій за замовчуванням | 4 | 0.6 | Зменшення | Базові конфігурації (hardening), контроль змін конфігурації | ІТ-відділ | CM-2, CM-6 | — |
| R-027 | A-11 | 3 | Відмова каналу провайдера | Єдиний канал зв'язку без резервування | 3 | 0.4 | Зменшення | Резервний канал іншого провайдера, SLA у договорі | ІТ-відділ | CP-2, SA-9 | — |
| R-028 | A-11 | 3 | Витік даних на стороні провайдера | Відсутність вимог безпеки в договорі | 4 | 0.4 | Зменшення | Вимоги захисту інформації в договорі, шифрування трафіку наскрізно | Начальник ІБ | SA-9, SC-8 | SC-8(1) |
| R-029 | A-12 | 3 | Атака через скомпрометовану зовнішню ІКС | Довірча інтеграція без фільтрації | 5 | 0.4 | Зменшення | Угоди про взаємодію, контроль інтерфейсів обміну, фільтрація на стику | Начальник ІБ | CA-3, SC-7 | — |
| R-030 | A-12 | 3 | Передача надлишкових даних до зовнішньої ІКС | Відсутність контролю складу даних обміну | 4 | 0.5 | Зменшення | Регламент складу даних обміну, журналювання передач | Начальник ІБ | AC-4, AU-12 | — |
| R-031 | A-13 | 3 | НСД до даних у хмарному середовищі | Некоректна конфігурація прав доступу хмари | 5 | 0.5 | Зменшення | Політики IAM хмари, MFA, аудит конфігурацій | Начальник ІБ | AC-6, IA-2, SA-9 | IA-2(1) |
| R-032 | A-13 | 3 | Втрата даних при відмові хмарного провайдера | Відсутність локальних резервних копій | 5 | 0.3 | Зменшення | Локальне резервне копіювання критичних даних, план виходу (exit plan) | ІТ-відділ | CP-9, SA-9 | — |
| R-033 | A-13 | 3 | Компрометація гіпервізора / сусідніх ВМ | Спільне середовище віртуалізації | 5 | 0.2 | Зменшення | Ізоляція ВМ, вимоги до сегментації у договорі з провайдером | ІТ-відділ | SC-7, SA-9 | — |
| R-034 | A-01 | 1 | Візуальне зчитування інформації з екрана | Розташування монітора у зоні огляду сторонніх | 2 | 0.5 | Зменшення | Розворот монітора, захисна плівка, блокування сеансу при відході | Користувач | AC-11, PE-5 | — |
| R-035 | A-06 | 1 | Відновлення видалених даних з носія при списанні | Відсутність гарантованого знищення | 4 | 0.3 | Зменшення | Процедура гарантованого знищення інформації перед списанням/передачею | Начальник ІБ | MP-6 | — |

- [ ] **Step 4: Написати tools/validate-data.js**

```js
import { readFileSync } from 'node:fs';

const read = (p) => JSON.parse(readFileSync(new URL(`../data/${p}`, import.meta.url)));
const nd = read('nd_tzi.json');
const assets = read('assets_catalog.json').assets;
const tr = read('threats_risks.json');

const knownControls = new Set();
for (const fam of nd.document.security_families)
  for (const c of fam.controls) {
    knownControls.add(c.canonical_id);
    for (const ch of c.children ?? []) knownControls.add(ch.canonical_id);
  }
const knownAssets = new Set(assets.map(a => a.id));

const errors = [];
for (const r of tr.risks) {
  if (!knownAssets.has(r.asset_id)) errors.push(`${r.id}: невідомий asset_id ${r.asset_id}`);
  for (const ref of r.control_refs) if (!knownControls.has(ref)) errors.push(`${r.id}: невідомий control_ref ${ref}`);
  for (const e of r.enhancement_suggestions) if (!knownControls.has(e)) errors.push(`${r.id}: невідоме посилення ${e}`);
  if (r.impact < 1 || r.impact > 5) errors.push(`${r.id}: impact поза межами`);
  if (r.likelihood < 0.1 || r.likelihood > 0.9) errors.push(`${r.id}: likelihood поза межами`);
}
// Покриття: кожен клас активів має >= 2 ризики
for (const a of assets) {
  const n = tr.risks.filter(r => r.asset_id === a.id).length;
  if (n < 2) errors.push(`Актив ${a.id} (${a.name}): лише ${n} ризиків (мінімум 2)`);
}
if (errors.length) { console.error(errors.join('\n')); process.exit(1); }
console.log(`OK: ${tr.risks.length} ризиків, покриття всіх ${assets.size ?? assets.length} класів`);
```

- [ ] **Step 5: Запустити валідатор, виправити невалідні control_refs**

Run: `node tools/validate-data.js`
Expected: `OK: 35 ризиків, …`. Якщо якийсь canonical_id відсутній у nd_tzi (напр., SC-40, SC-7(21), AC-6(5)) — замінити на найближчий наявний (перевірити список: `node -e "…"` grep по canonical_id) і повторити. Якщо для активу < 2 ризиків — додати відсутні за зразком таблиці.

- [ ] **Step 6: Коміт**

```bash
git add data/threats_risks.json tools/validate-data.js
git commit -m "feat: threats/risks catalog (35 risks, full 13-class coverage) + data validator"
```

---

### Task 4: core/risk-engine.js

**Files:**
- Create: `core/risk-engine.js`
- Test: `test/risk-engine.test.js`

**Interfaces:**
- Consumes: `data/threats_risks.json` (scale, risks).
- Produces:
  - `computeRiskScore(impact, likelihood) -> number`
  - `riskLevel(score, scale) -> string` (label зі шкали)
  - `annotateRisk(risk, scale) -> {...risk, score, level}`
  - `baseRisksFor(catalog, selectedAssetIds, asClass) -> AnnotatedRisk[]`
  - `threatDirectory(catalog) -> [{threat, vulnerability}]` (унікальні, відсортовані за threat)
  - `buildCustomRisk(input, existingIds, scale) -> AnnotatedRisk` (id формату `C-001`, `custom: true`)

- [ ] **Step 1: Провальний тест**

`test/risk-engine.test.js`:
```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { computeRiskScore, riskLevel, annotateRisk, baseRisksFor, threatDirectory, buildCustomRisk } from '../core/risk-engine.js';

const tr = JSON.parse(readFileSync(new URL('../data/threats_risks.json', import.meta.url)));

test('калібрування рівнів за еталонними ризиками', () => {
  assert.equal(riskLevel(computeRiskScore(4, 0.8), tr.scale), 'Критичний');   // R-003
  assert.equal(riskLevel(computeRiskScore(4, 0.5), tr.scale), 'Високий');     // R-001
  assert.equal(riskLevel(computeRiskScore(2, 0.4), tr.scale), 'Середній');    // R-004
  assert.equal(riskLevel(computeRiskScore(4, 0.1), tr.scale), 'Низький');     // R-005
  assert.equal(riskLevel(computeRiskScore(5, 0.9), tr.scale), 'Критичний');   // R-008
});

test('baseRisksFor фільтрує за активами та класом', () => {
  const r = baseRisksFor(tr, ['A-01', 'A-08'], 1);
  assert.ok(r.every(x => x.asset_id === 'A-01'));          // A-08 недоступний на АС-1
  assert.ok(r.every(x => typeof x.level === 'string' && x.score > 0));
});

test('threatDirectory повертає унікальні пари', () => {
  const d = threatDirectory(tr);
  const keys = d.map(x => x.threat + '|' + x.vulnerability);
  assert.equal(new Set(keys).size, keys.length);
});

test('buildCustomRisk генерує послідовний id та обчислює рівень', () => {
  const c = buildCustomRisk(
    { asset_id: 'A-01', threat: 'Т', vulnerability: 'В', impact: 5, likelihood: 0.7 },
    ['C-001'], tr.scale);
  assert.equal(c.id, 'C-002');
  assert.equal(c.custom, true);
  assert.equal(c.level, 'Критичний');
});
```

- [ ] **Step 2: Запустити — FAIL** (`Cannot find module '../core/risk-engine.js'`)

- [ ] **Step 3: Реалізація core/risk-engine.js**

```js
export function computeRiskScore(impact, likelihood) {
  return Math.round(impact * likelihood * 100) / 100;
}

export function riskLevel(score, scale) {
  for (const l of scale.levels) if (score <= l.max) return l.label;
  return scale.levels.at(-1).label;
}

export function annotateRisk(risk, scale) {
  const score = computeRiskScore(risk.impact, risk.likelihood);
  return { ...risk, score, level: riskLevel(score, scale) };
}

export function baseRisksFor(catalog, selectedAssetIds, asClass) {
  const sel = new Set(selectedAssetIds);
  return catalog.risks
    .filter(r => sel.has(r.asset_id) && r.min_as_class <= asClass)
    .map(r => annotateRisk(r, catalog.scale));
}

export function threatDirectory(catalog) {
  const seen = new Set();
  const out = [];
  for (const r of catalog.risks) {
    const key = r.threat + '|' + r.vulnerability;
    if (!seen.has(key)) { seen.add(key); out.push({ threat: r.threat, vulnerability: r.vulnerability }); }
  }
  return out.sort((a, b) => a.threat.localeCompare(b.threat, 'uk'));
}

export function buildCustomRisk(input, existingIds, scale) {
  let n = 1;
  while (existingIds.includes(`C-${String(n).padStart(3, '0')}`)) n++;
  return annotateRisk({
    id: `C-${String(n).padStart(3, '0')}`,
    custom: true,
    min_as_class: 1,
    treatment_strategy: input.treatment_strategy ?? 'Зменшення',
    treatment_plan: input.treatment_plan ?? '',
    responsible: input.responsible ?? '',
    control_refs: input.control_refs ?? [],
    enhancement_suggestions: input.enhancement_suggestions ?? [],
    ...input,
  }, scale);
}
```

- [ ] **Step 4: Тести зелені** — `npm test` → PASS

- [ ] **Step 5: Коміт** — `git add core/risk-engine.js test/risk-engine.test.js && git commit -m "feat: risk engine (score, scale mapping, filtering, custom risks)"`

---

### Task 5: policy_mapping.json (глобальні політики → ODP-параметри)

**Files:**
- Create: `data/policy_mapping.json`
- Create: `tools/list-params.js`
- Modify: `tools/validate-data.js` (додати перевірку odp_params)

**Interfaces:**
- Produces: `policy_mapping.json` зі схемою `{ global_constants: [{ key, label, example, odp_params: [param_id] }] }` — споживається policy-autofill (Task 6) та UI Кроку 1 (Task 15).

- [ ] **Step 1: Написати tools/list-params.js — дамп усіх параметрів**

```js
import { readFileSync, writeFileSync } from 'node:fs';
const nd = JSON.parse(readFileSync(new URL('../data/nd_tzi.json', import.meta.url)));
const rows = [];
for (const fam of nd.document.security_families)
  for (const c of fam.controls)
    for (const node of [c, ...(c.children ?? [])])
      for (const p of node.catalog?.parameters ?? [])
        rows.push(`${node.canonical_id}\t${p.id}\t${p.type}\t${p.label}`);
writeFileSync(new URL('../tools/params_dump.tsv', import.meta.url), rows.join('\n'));
console.log(`${rows.length} параметрів → tools/params_dump.tsv`);
```

Run: `node tools/list-params.js`

- [ ] **Step 2: Відібрати odp_params за правилами і записати data/policy_mapping.json**

Правила відбору (grep по `tools/params_dump.tsv`, регістронезалежно):

| key | правило відбору параметрів | очікувані контролі |
|---|---|---|
| `organization_policy_id` | НЕ мапиться на ODP (odp_params: []) — використовується лише в титулі DOCX та розділі політик | — |
| `security_officer_role` | параметри контролів `XX-1` (усі сім'ї) з label, що містить `персонал` або `ролей` — перший odp кожного XX-1 | AC-1, AT-1, AU-1, … |
| `crypto_hardware_token` | параметри IA-2/IA-5/SC-12 з label, що містить `апаратн`, `токен` або `автентифікатор`; якщо немає — [] | IA-5 |
| `password_rotation_days` | параметри IA-5 з label, що містить `термін`, `строк` або `зміни паро` | IA-5 |
| `session_timeout_minutes` | параметри AC-11/AC-12/SC-10 з label, що містить `час` або `період` | AC-11, AC-12, SC-10 |
| `log_retention_months` | параметри AU-11 (усі), AU-4 з label про `зберіган` | AU-11 |
| `incident_response_time` | параметри IR-6 з label, що містить `час` або `період` | IR-6 |

Формат файлу:
```json
{
  "global_constants": [
    { "key": "organization_policy_id", "label": "Розпорядчий документ організації",
      "example": "Внутрішній Наказ № 45 від 10.08.2026", "odp_params": [] },
    { "key": "security_officer_role", "label": "Відповідальний за інформаційну безпеку",
      "example": "Начальник ІБ (майор Петренко І.В.)", "odp_params": ["ac-1_odp.01", "…за результатом відбору…"] },
    { "key": "crypto_hardware_token", "label": "Апаратний засіб КЗІ (токен)",
      "example": "Апаратний токен Алмаз-1К", "odp_params": [] },
    { "key": "password_rotation_days", "label": "Періодичність зміни паролів",
      "example": "90 днів", "odp_params": ["…"] },
    { "key": "session_timeout_minutes", "label": "Тайм-аут сеансу (блокування)",
      "example": "30 хвилин", "odp_params": ["…"] },
    { "key": "log_retention_months", "label": "Строк зберігання журналів аудиту",
      "example": "6 місяців", "odp_params": ["…"] },
    { "key": "incident_response_time", "label": "Час реагування на інцидент",
      "example": "2 години", "odp_params": ["…"] }
  ]
}
```
Плейсхолдери `"…"` вище — заповнюються реальними param_id з дампу на цьому кроці (це робота цього кроку, НЕ відкладається).

- [ ] **Step 3: Розширити tools/validate-data.js**

Додати після наявних перевірок:
```js
const pm = read('policy_mapping.json');
const knownParams = new Set();
for (const fam of nd.document.security_families)
  for (const c of fam.controls)
    for (const node of [c, ...(c.children ?? [])])
      for (const p of node.catalog?.parameters ?? []) knownParams.add(p.id);
for (const gc of pm.global_constants)
  for (const pid of gc.odp_params)
    if (!knownParams.has(pid)) errors.push(`policy_mapping ${gc.key}: невідомий param ${pid}`);
```
(перемістити `if (errors.length)`-блок у кінець файлу).

- [ ] **Step 4: Валідація і коміт**

Run: `node tools/validate-data.js` → Expected: `OK: …`

```bash
git add data/policy_mapping.json tools/list-params.js tools/validate-data.js
git commit -m "feat: global policy constants to ODP parameter mapping"
```

---

### Task 6: core/policy-autofill.js

**Files:**
- Create: `core/policy-autofill.js`
- Test: `test/policy-autofill.test.js`

**Interfaces:**
- Consumes: policy_mapping (Task 5), generic_parameter_defaults.json.
- Produces:
  - `buildPolicyParamIndex(policyMapping, globalConstants) -> Map<paramId, value>` — розгортає введені значення констант на всі їхні odp_params.
  - `resolveParamValue(paramId, sources) -> { value: string, source: 'override'|'policy'|'bpb'|'generic'|'empty' }`, де `sources = { overrides: Record, policyIndex: Map, bpbValues: Map, genericDefaults: Record }`.
  - `renderText(text, resolveFn) -> { text, parts: [{type:'text'|'param', value, paramId?, source?}] }` — підставляє плейсхолдери `{{ insert: param, X }}`; `parts` для підсвітки в UI.
  - `PARAM_RE` — експортований regex.

- [ ] **Step 1: Провальний тест**

`test/policy-autofill.test.js`:
```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildPolicyParamIndex, resolveParamValue, renderText } from '../core/policy-autofill.js';

const policyMapping = { global_constants: [
  { key: 'password_rotation_days', label: '', example: '', odp_params: ['ia-5_odp.03'] },
] };

test('пріоритет: override > policy > bpb > generic > empty', () => {
  const sources = {
    overrides: { 'ia-5_odp.03': 'кожні 60 днів' },
    policyIndex: buildPolicyParamIndex(policyMapping, { password_rotation_days: '90 днів' }),
    bpbValues: new Map([['ia-5_odp.03', 'раз на рік']]),
    genericDefaults: { 'ia-5_odp.03': 'періодично' },
  };
  assert.deepEqual(resolveParamValue('ia-5_odp.03', sources), { value: 'кожні 60 днів', source: 'override' });
  delete sources.overrides['ia-5_odp.03'];
  assert.deepEqual(resolveParamValue('ia-5_odp.03', sources), { value: '90 днів', source: 'policy' });
  sources.policyIndex.delete('ia-5_odp.03');
  assert.deepEqual(resolveParamValue('ia-5_odp.03', sources), { value: 'раз на рік', source: 'bpb' });
  sources.bpbValues.delete('ia-5_odp.03');
  assert.deepEqual(resolveParamValue('ia-5_odp.03', sources), { value: 'періодично', source: 'generic' });
  delete sources.genericDefaults['ia-5_odp.03'];
  assert.deepEqual(resolveParamValue('ia-5_odp.03', sources), { value: '', source: 'empty' });
});

test('renderText підставляє плейсхолдери і формує parts', () => {
  const resolve = (id) => id === 'x_odp.01' ? { value: '90 днів', source: 'policy' } : { value: '', source: 'empty' };
  const r = renderText('Зміна паролів кожні {{ insert: param, x_odp.01 }} під контролем {{ insert: param, y_odp.02 }}.', resolve);
  assert.equal(r.text, 'Зміна паролів кожні 90 днів під контролем [не визначено].');
  assert.equal(r.parts.filter(p => p.type === 'param').length, 2);
  assert.equal(r.parts[1].source, 'policy');
});
```

- [ ] **Step 2: Запустити — FAIL**

- [ ] **Step 3: Реалізація core/policy-autofill.js**

```js
export const PARAM_RE = /\{\{\s*insert:\s*param,\s*([A-Za-z0-9._-]+)\s*\}\}/g;
const EMPTY_TEXT = '[не визначено]';

export function buildPolicyParamIndex(policyMapping, globalConstants) {
  const index = new Map();
  for (const gc of policyMapping.global_constants) {
    const value = globalConstants?.[gc.key];
    if (!value) continue;
    for (const pid of gc.odp_params) index.set(pid, value);
  }
  return index;
}

export function resolveParamValue(paramId, { overrides = {}, policyIndex = new Map(), bpbValues = new Map(), genericDefaults = {} }) {
  if (overrides[paramId]) return { value: overrides[paramId], source: 'override' };
  if (policyIndex.has(paramId)) return { value: policyIndex.get(paramId), source: 'policy' };
  if (bpbValues.has(paramId)) return { value: bpbValues.get(paramId), source: 'bpb' };
  if (genericDefaults[paramId]) return { value: genericDefaults[paramId], source: 'generic' };
  return { value: '', source: 'empty' };
}

export function renderText(text, resolveFn) {
  const parts = [];
  let out = '';
  let last = 0;
  for (const m of text.matchAll(PARAM_RE)) {
    if (m.index > last) { const t = text.slice(last, m.index); parts.push({ type: 'text', value: t }); out += t; }
    const { value, source } = resolveFn(m[1]);
    const shown = value || EMPTY_TEXT;
    parts.push({ type: 'param', value: shown, paramId: m[1], source });
    out += shown;
    last = m.index + m[0].length;
  }
  if (last < text.length) { const t = text.slice(last); parts.push({ type: 'text', value: t }); out += t; }
  return { text: out, parts };
}
```

- [ ] **Step 4: Тести зелені** — `npm test` → PASS

- [ ] **Step 5: Коміт** — `git add core/policy-autofill.js test/policy-autofill.test.js && git commit -m "feat: policy autofill (priority chain + placeholder rendering)"`

---

### Task 7: as_class_exemptions.json (архітектурні винятки)

**Files:**
- Create: `data/as_class_exemptions.json`
- Modify: `tools/validate-data.js`

**Interfaces:**
- Produces: `{ exemptions: [{ control_ref, applies_to_classes: [1|2], reason_note, category }] }` — споживається profile-engine (Task 8).

- [ ] **Step 1: Зібрати перелік контролів, задіяних у BPB-каталогах**

Run:
```bash
node -e "
const fs=require('fs');
const ids=new Set();
for (const f of ['data/bpb_service.json','data/bpb_open_confidential.json']) {
  const b=JSON.parse(fs.readFileSync(f,'utf8'));
  for (const sc of b.security_classes) for (const a of sc.actions) for (const sa of a.security_actions) ids.add(sa.control.base_id);
}
console.log([...ids].sort().join('\n'));"
```

- [ ] **Step 2: Записати data/as_class_exemptions.json**

Тексти приміток за категоріями (використовувати дослівно):

- `network_absent` (АС-1): «Захід реалізовано архітектурно: ІКС класу АС-1 є ізольованою автоматизованою системою без підключення до локальних мереж та мережі Інтернет; мережеві інтерфейси відсутні або деактивовані.»
- `remote_access_absent` (АС-1): «Віддалений доступ до ІКС класу АС-1 неможливий за архітектурою: відсутні мережеві інтерфейси та канали віддаленого підключення.»
- `external_connection_absent` (АС-1, АС-2): «Захід реалізовано архітектурно: ІКС не має підключень до зовнішніх мереж, систем чи постачальників послуг; зовнішній периметр відсутній.»
- `wireless_absent` (АС-1, АС-2): «Бездротові технології в ІКС не використовуються: радіоінтерфейси деактивовано або демонтовано, що зафіксовано актом.»
- `virtualization_absent` (АС-1, АС-2): «Віртуальна інфраструктура та хмарні обчислювальні потужності в ІКС не використовуються.»

Розподіл кандидатів (зі списку Step 1 включати ЛИШЕ ті control_ref, що фактично присутні у BPB; типовий очікуваний набір):

| category | classes | контролі-кандидати |
|---|---|---|
| network_absent | [1] | SC-7, SC-5, SC-20, SC-21, SC-22, SC-23, AC-4 |
| remote_access_absent | [1] | AC-17, SC-10 |
| external_connection_absent | [1, 2] | AC-20, CA-3, SA-9 |
| wireless_absent | [1, 2] | AC-18 |
| virtualization_absent | [1, 2] | SC-39 (якщо присутній) |

Один запис на пару (control_ref, category):
```json
{ "exemptions": [
  { "control_ref": "SC-7", "applies_to_classes": [1], "category": "network_absent",
    "reason_note": "Захід реалізовано архітектурно: ІКС класу АС-1 є ізольованою автоматизованою системою без підключення до локальних мереж та мережі Інтернет; мережеві інтерфейси відсутні або деактивовані." }
] }
```
(решта записів — за таблицею вище, з відповідним текстом категорії).

- [ ] **Step 3: Розширити tools/validate-data.js**

```js
const ex = read('as_class_exemptions.json');
for (const e of ex.exemptions) {
  if (!knownControls.has(e.control_ref)) errors.push(`exemption: невідомий control_ref ${e.control_ref}`);
  if (!e.reason_note || e.reason_note.length < 30) errors.push(`exemption ${e.control_ref}: примітка закоротка`);
  if (!e.applies_to_classes.every(c => c === 1 || c === 2)) errors.push(`exemption ${e.control_ref}: класи лише 1/2`);
}
```

- [ ] **Step 4: Валідація і коміт**

Run: `node tools/validate-data.js` → `OK`
```bash
git add data/as_class_exemptions.json tools/validate-data.js
git commit -m "feat: architectural exemptions catalog per AS class"
```

---

### Task 8: core/profile-engine.js

**Files:**
- Create: `core/profile-engine.js`
- Test: `test/profile-engine.test.js`

**Interfaces:**
- Consumes: BPB-каталоги, nd_tzi, exemptions (Task 7), `resolveParamValue`/`renderText`/`buildPolicyParamIndex` (Task 6).
- Produces:
  - `INFO_TYPES = { open_confidential: 'bpb_open_confidential', service: 'bpb_service', state_secret: null }`
  - `buildProfile(state, catalogs) -> ProfileDoc`, де `catalogs = { ndTzi, bpb: {service, open_confidential}, exemptions, policyMapping, genericDefaults }`;
  - `ProfileDoc = { items: ProfileItem[], summary: { total, autofilled, empty, exempted, excluded } }`
  - `ProfileItem = { key: "<class_id>:<number>", classId, className, actionNumber, actionName, controls: [{ id, statementLines: [{label, parts, text}], emptyParams: [paramId] }], status, exemptionNote?, enhancements: [{id, title, text}] }`
  - `statementLinesFor(ndTzi, controlId, resolveFn) -> lines` — рендер statement із nd_tzi з підстановкою.
  - `bpbValuesFor(ndTzi, bpbAction) -> Map<paramId, value>` — значення BPB за локаторами: statement item з label, що починається з локатора (напр. `h.1`), віддає своє value усім параметрам у тексті цього item.

- [ ] **Step 1: Провальний тест**

`test/profile-engine.test.js`:
```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildProfile, INFO_TYPES } from '../core/profile-engine.js';

const read = (p) => JSON.parse(readFileSync(new URL(`../data/${p}`, import.meta.url)));
const catalogs = {
  ndTzi: read('nd_tzi.json'),
  bpb: { service: read('bpb_service.json'), open_confidential: read('bpb_open_confidential.json') },
  exemptions: read('as_class_exemptions.json'),
  policyMapping: read('policy_mapping.json'),
  genericDefaults: read('generic_parameter_defaults.json'),
};
const baseState = {
  passport: { as_class: 1 },
  global_constants: {},
  info_type: 'service',
  profile: { param_overrides: {}, enhancements: [], excluded: [], exemption_overrides: [] },
};

test('service-каталог дає 100 пунктів, open_confidential — 85', () => {
  assert.equal(buildProfile(baseState, catalogs).items.length, 100);
  assert.equal(buildProfile({ ...baseState, info_type: 'open_confidential' }, catalogs).items.length, 85);
});

test('на АС-1 пункти з exemption мають статус Виконано архітектурно і примітку', () => {
  const doc = buildProfile(baseState, catalogs);
  const exempted = doc.items.filter(i => i.status === 'Виконано архітектурно');
  assert.ok(exempted.length > 0);
  assert.ok(exempted.every(i => i.exemptionNote?.length > 30));
  assert.equal(doc.summary.exempted, exempted.length);
});

test('на АС-3 ті самі пункти застосовуються звичайно', () => {
  const doc = buildProfile({ ...baseState, passport: { as_class: 3 } }, catalogs);
  assert.equal(doc.items.filter(i => i.status === 'Виконано архітектурно').length, 0);
});

test('exemption_overrides повертає пункт у Застосовується', () => {
  const doc1 = buildProfile(baseState, catalogs);
  const key = doc1.items.find(i => i.status === 'Виконано архітектурно').key;
  const doc2 = buildProfile({ ...baseState, profile: { ...baseState.profile, exemption_overrides: [key] } }, catalogs);
  assert.equal(doc2.items.find(i => i.key === key).status, 'Застосовується (автозаповнено)');
});

test('глобальна політика підставляється у текст', () => {
  const pm = catalogs.policyMapping.global_constants.find(g => g.odp_params.length > 0);
  const state = { ...baseState, global_constants: { [pm.key]: 'ТЕСТ-ЗНАЧЕННЯ-123' } };
  const doc = buildProfile(state, catalogs);
  const hit = doc.items.some(i => i.controls.some(c => c.statementLines.some(l => l.text.includes('ТЕСТ-ЗНАЧЕННЯ-123'))));
  assert.ok(hit);
});

test('state_secret не має каталогу', () => {
  assert.equal(INFO_TYPES.state_secret, null);
});
```

- [ ] **Step 2: Запустити — FAIL**

- [ ] **Step 3: Реалізація core/profile-engine.js**

```js
import { buildPolicyParamIndex, resolveParamValue, renderText, PARAM_RE } from './policy-autofill.js';

export const INFO_TYPES = { open_confidential: 'bpb_open_confidential', service: 'bpb_service', state_secret: null };

export const STATUS = {
  APPLIED: 'Застосовується (автозаповнено)',
  EXEMPT: 'Виконано архітектурно',
  EXCLUDED: 'Не застосовується (вручну)',
};

function indexNdControls(ndTzi) {
  const map = new Map();
  for (const fam of ndTzi.document.security_families)
    for (const c of fam.controls) {
      map.set(c.canonical_id, c);
      for (const ch of c.children ?? []) map.set(ch.canonical_id, ch);
    }
  return map;
}

function flattenStatement(items, prefix = []) {
  const out = [];
  for (const it of items ?? []) {
    const label = [...prefix, (it.label ?? '').replace(/\.$/, '')].filter(Boolean).join('.');
    out.push({ label, text: it.text ?? '' });
    out.push(...flattenStatement(it.children, [...prefix, (it.label ?? '').replace(/\.$/, '')].filter(Boolean)));
  }
  return out;
}

export function bpbValuesFor(ndControl, securityAction) {
  const values = new Map();
  const flat = flattenStatement(ndControl?.catalog?.statement?.items);
  for (const item of securityAction.security_params?.items ?? []) {
    const target = flat.find(l => l.label === item.locator);
    if (!target) continue;
    for (const m of target.text.matchAll(PARAM_RE)) values.set(m[1], item.value);
  }
  return values;
}

export function statementLinesFor(ndControl, resolveFn) {
  const lines = [];
  const walk = (items, depth) => {
    for (const it of items ?? []) {
      const r = renderText(it.text ?? '', resolveFn);
      lines.push({ label: it.label ?? '', depth, text: r.text, parts: r.parts });
      walk(it.children, depth + 1);
    }
  };
  walk(ndControl?.catalog?.statement?.items, 0);
  return lines;
}

export function buildProfile(state, catalogs) {
  const bpbKey = state.info_type;
  const bpb = catalogs.bpb[bpbKey];
  if (!bpb) throw new Error(`Каталог для типу інформації "${state.info_type}" відсутній`);
  const nd = indexNdControls(catalogs.ndTzi);
  const policyIndex = buildPolicyParamIndex(catalogs.policyMapping, state.global_constants);
  const exemptByControl = new Map();
  for (const e of catalogs.exemptions.exemptions)
    if (e.applies_to_classes.includes(state.passport.as_class)) exemptByControl.set(e.control_ref, e);

  const items = [];
  for (const sc of bpb.security_classes) {
    for (const action of sc.actions) {
      const key = `${sc.security_class.class_id}:${action.number}`;
      const controls = [];
      let exemption = null;
      for (const sa of action.security_actions) {
        const ndControl = nd.get(sa.control.base_id) ?? nd.get(sa.control.id);
        if (exemptByControl.has(sa.control.base_id)) exemption = exemptByControl.get(sa.control.base_id);
        if (!ndControl) continue;
        const bpbValues = bpbValuesFor(ndControl, sa);
        const emptyParams = [];
        const resolve = (paramId) => {
          const r = resolveParamValue(paramId, {
            overrides: state.profile.param_overrides,
            policyIndex,
            bpbValues,
            genericDefaults: catalogs.genericDefaults,
          });
          if (r.source === 'empty') emptyParams.push(paramId);
          return r;
        };
        controls.push({ id: sa.control.id, statementLines: statementLinesFor(ndControl, resolve), emptyParams });
      }
      let status = STATUS.APPLIED;
      let exemptionNote;
      if (state.profile.excluded.includes(key)) status = STATUS.EXCLUDED;
      else if (exemption && !state.profile.exemption_overrides.includes(key)) {
        status = STATUS.EXEMPT;
        exemptionNote = exemption.reason_note;
      }
      const enhancements = (state.profile.enhancements ?? [])
        .filter(eid => action.security_actions.some(sa => eid.startsWith(sa.control.base_id + '(')))
        .map(eid => ({ id: eid, title: nd.get(eid)?.title ?? eid }));
      items.push({
        key, classId: sc.security_class.class_id, className: sc.security_class.name_from_profile,
        actionNumber: action.number, actionName: action.name,
        controls, status, exemptionNote, enhancements,
      });
    }
  }
  const summary = {
    total: items.length,
    exempted: items.filter(i => i.status === STATUS.EXEMPT).length,
    excluded: items.filter(i => i.status === STATUS.EXCLUDED).length,
    empty: items.filter(i => i.status === STATUS.APPLIED && i.controls.some(c => c.emptyParams.length)).length,
    autofilled: items.filter(i => i.status === STATUS.APPLIED && i.controls.every(c => c.emptyParams.length === 0)).length,
  };
  return { items, summary };
}
```

Примітка для імплементера: якщо тест про 100/85 пунктів не проходить через розбіжність ключів BPB (`security_class.class_id` відсутній тощо) — надрукувати перший security_class і скоригувати шляхи полів за фактичною структурою (див. довідку структур на початку плану).

- [ ] **Step 4: Тести зелені** — `npm test` → PASS

- [ ] **Step 5: Коміт** — `git add core/profile-engine.js test/profile-engine.test.js && git commit -m "feat: profile engine (BPB selection, exemptions, autofill, statuses)"`

---

### Task 9: core/enhancement-engine.js

**Files:**
- Create: `core/enhancement-engine.js`
- Test: `test/enhancement-engine.test.js`

**Interfaces:**
- Consumes: nd_tzi, annotated risks (Task 4).
- Produces:
  - `enhancementsForControl(ndTzi, baseControlId) -> [{id, title, text}]` (text — plain-текст statement посилення, без підстановки)
  - `suggestionsFromRisks(annotatedRisks, scale) -> Map<baseControlId, [{enhancementId, riskId, level}]>` — лише для ризиків з рівнем `Високий` або `Критичний`.

- [ ] **Step 1: Провальний тест**

`test/enhancement-engine.test.js`:
```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { enhancementsForControl, suggestionsFromRisks } from '../core/enhancement-engine.js';

const nd = JSON.parse(readFileSync(new URL('../data/nd_tzi.json', import.meta.url)));
const tr = JSON.parse(readFileSync(new URL('../data/threats_risks.json', import.meta.url)));

test('AC-2 має посилення з id формату AC-2(N)', () => {
  const list = enhancementsForControl(nd, 'AC-2');
  assert.ok(list.length > 0);
  assert.ok(list.every(e => /^AC-2\(\d+\)$/.test(e.id)));
  assert.ok(list.every(e => e.title.length > 0));
});

test('невідомий контроль дає порожній список', () => {
  assert.deepEqual(enhancementsForControl(nd, 'XX-99'), []);
});

test('suggestionsFromRisks містить лише високі/критичні ризики', () => {
  const risks = [
    { id: 'R-A', level: 'Критичний', enhancement_suggestions: ['IA-2(1)'] },
    { id: 'R-B', level: 'Низький', enhancement_suggestions: ['SC-8(1)'] },
  ];
  const m = suggestionsFromRisks(risks);
  assert.deepEqual(m.get('IA-2'), [{ enhancementId: 'IA-2(1)', riskId: 'R-A', level: 'Критичний' }]);
  assert.equal(m.has('SC-8'), false);
});
```

- [ ] **Step 2: Запустити — FAIL**

- [ ] **Step 3: Реалізація core/enhancement-engine.js**

```js
function plainStatement(items, out = []) {
  for (const it of items ?? []) {
    if (it.text) out.push(it.text);
    plainStatement(it.children, out);
  }
  return out;
}

export function enhancementsForControl(ndTzi, baseControlId) {
  for (const fam of ndTzi.document.security_families)
    for (const c of fam.controls)
      if (c.canonical_id === baseControlId)
        return (c.children ?? []).map(ch => ({
          id: ch.canonical_id,
          title: ch.title,
          text: plainStatement(ch.catalog?.statement?.items).join(' '),
        }));
  return [];
}

const HIGH_LEVELS = new Set(['Високий', 'Критичний']);

export function suggestionsFromRisks(annotatedRisks) {
  const map = new Map();
  for (const r of annotatedRisks) {
    if (!HIGH_LEVELS.has(r.level)) continue;
    for (const eid of r.enhancement_suggestions ?? []) {
      const base = eid.slice(0, eid.indexOf('('));
      if (!map.has(base)) map.set(base, []);
      map.get(base).push({ enhancementId: eid, riskId: r.id, level: r.level });
    }
  }
  return map;
}
```

- [ ] **Step 4: Тести зелені** — `npm test` → PASS

- [ ] **Step 5: Коміт** — `git add core/enhancement-engine.js test/enhancement-engine.test.js && git commit -m "feat: enhancement engine (catalog lookup + risk-driven suggestions)"`

---

### Task 10: core/template-io.js

**Files:**
- Create: `core/template-io.js`
- Test: `test/template-io.test.js`

**Interfaces:**
- Produces:
  - `defaultState() -> State` (структура з розділу 3.5 спеки)
  - `makeIcsTemplate(state) -> {kind:'ics', saved_at, passport, global_constants, selected_assets}`
  - `applyIcsTemplate(state, tpl) -> State` (новий об'єкт)
  - `makeCpbTemplate(state) -> {kind:'cpb', saved_at, info_type, profile}`
  - `applyCpbTemplate(state, tpl) -> State`
  - `validateTemplate(kind, obj) -> string[]` (порожній масив = валідно)

- [ ] **Step 1: Провальний тест**

`test/template-io.test.js`:
```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { defaultState, makeIcsTemplate, applyIcsTemplate, makeCpbTemplate, applyCpbTemplate, validateTemplate } from '../core/template-io.js';

test('ICS template round-trip', () => {
  const s = defaultState();
  s.passport = { ics_name: 'ІКС-1', cert_body: 'ДССЗЗІ', as_class: 2 };
  s.global_constants = { password_rotation_days: '90 днів' };
  s.selected_assets = ['A-01', 'A-08'];
  const tpl = makeIcsTemplate(s);
  assert.equal(validateTemplate('ics', tpl).length, 0);
  const restored = applyIcsTemplate(defaultState(), tpl);
  assert.deepEqual(restored.passport, s.passport);
  assert.deepEqual(restored.selected_assets, s.selected_assets);
  assert.equal(restored.info_type, null); // не зачіпає профільну частину
});

test('CPB template round-trip', () => {
  const s = defaultState();
  s.info_type = 'service';
  s.profile.enhancements = ['IA-2(1)'];
  s.profile.param_overrides = { 'x_odp.01': 'значення' };
  const tpl = makeCpbTemplate(s);
  assert.equal(validateTemplate('cpb', tpl).length, 0);
  const restored = applyCpbTemplate(defaultState(), tpl);
  assert.equal(restored.info_type, 'service');
  assert.deepEqual(restored.profile.enhancements, ['IA-2(1)']);
});

test('validateTemplate ловить чужий kind і сміття', () => {
  assert.ok(validateTemplate('ics', { kind: 'cpb' }).length > 0);
  assert.ok(validateTemplate('ics', null).length > 0);
  assert.ok(validateTemplate('cpb', { kind: 'cpb', info_type: 'bad_type', profile: {} }).length > 0);
});
```

- [ ] **Step 2: Запустити — FAIL**

- [ ] **Step 3: Реалізація core/template-io.js**

```js
export function defaultState() {
  return {
    passport: { ics_name: '', cert_body: '', as_class: 1 },
    global_constants: {},
    selected_assets: [],
    risks: { accepted_base: [], custom: [] },
    info_type: null,
    profile: { param_overrides: {}, enhancements: [], excluded: [], exemption_overrides: [] },
  };
}

const clone = (o) => JSON.parse(JSON.stringify(o));

export function makeIcsTemplate(state) {
  return { kind: 'ics', saved_at: new Date().toISOString(),
    passport: clone(state.passport), global_constants: clone(state.global_constants),
    selected_assets: clone(state.selected_assets) };
}

export function applyIcsTemplate(state, tpl) {
  return { ...clone(state), passport: clone(tpl.passport),
    global_constants: clone(tpl.global_constants), selected_assets: clone(tpl.selected_assets) };
}

export function makeCpbTemplate(state) {
  return { kind: 'cpb', saved_at: new Date().toISOString(),
    info_type: state.info_type, profile: clone(state.profile) };
}

export function applyCpbTemplate(state, tpl) {
  return { ...clone(state), info_type: tpl.info_type, profile: clone(tpl.profile) };
}

const INFO_TYPE_VALUES = ['open_confidential', 'service', 'state_secret'];

export function validateTemplate(kind, obj) {
  const errors = [];
  if (!obj || typeof obj !== 'object') return ['Шаблон не є об\u02BCєктом'];
  if (obj.kind !== kind) errors.push(`Невірний тип шаблону: очікується "${kind}", отримано "${obj.kind}"`);
  if (kind === 'ics') {
    if (!obj.passport || typeof obj.passport.as_class !== 'number') errors.push('Відсутній паспорт або клас АС');
    if (!Array.isArray(obj.selected_assets)) errors.push('selected_assets має бути масивом');
    if (typeof obj.global_constants !== 'object') errors.push('global_constants має бути об\u02BCєктом');
  }
  if (kind === 'cpb') {
    if (!INFO_TYPE_VALUES.includes(obj.info_type)) errors.push('Невірний info_type');
    if (!obj.profile || typeof obj.profile !== 'object') errors.push('Відсутній блок profile');
  }
  return errors;
}
```

- [ ] **Step 4: Тести зелені** — `npm test` → PASS

- [ ] **Step 5: Коміт** — `git add core/template-io.js test/template-io.test.js && git commit -m "feat: template serialization/validation (ICS + CPB)"`

---

### Task 11: core/docx/zip-writer.js

**Files:**
- Create: `core/docx/zip-writer.js`
- Test: `test/zip-writer.test.js`

**Interfaces:**
- Produces: `createZip(entries) -> Buffer`, де `entries = [{ path: string, content: string|Buffer }]`. Документований виняток: імпортує `node:zlib` (deflateRawSync).

- [ ] **Step 1: Провальний тест**

`test/zip-writer.test.js`:
```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createZip } from '../core/docx/zip-writer.js';

test('createZip дає валідний архів (unzip -t)', () => {
  const buf = createZip([
    { path: 'hello.txt', content: 'Привіт, світ!' },
    { path: 'dir/data.xml', content: '<a>1</a>' },
  ]);
  assert.equal(buf[0], 0x50); // 'P'
  assert.equal(buf[1], 0x4b); // 'K'
  const dir = mkdtempSync(join(tmpdir(), 'ziptest-'));
  const file = join(dir, 't.zip');
  writeFileSync(file, buf);
  const out = execFileSync('unzip', ['-t', file], { encoding: 'utf8' });
  assert.match(out, /No errors detected/);
});
```

- [ ] **Step 2: Запустити — FAIL**

- [ ] **Step 3: Реалізація core/docx/zip-writer.js (повний код)**

```js
// Виняток із правила чистоти core/: node:zlib (експорт виконується сервером;
// у Python-порті модуль замінюється на stdlib zipfile).
import { deflateRawSync } from 'node:zlib';

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function dosDateTime(d = new Date()) {
  const time = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1);
  const date = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
  return { time, date };
}

export function createZip(entries) {
  const { time, date } = dosDateTime();
  const localParts = [];
  const centralParts = [];
  let offset = 0;

  for (const e of entries) {
    const nameBuf = Buffer.from(e.path, 'utf8');
    const data = Buffer.isBuffer(e.content) ? e.content : Buffer.from(e.content, 'utf8');
    const crc = crc32(data);
    const deflated = deflateRawSync(data, { level: 9 });
    const useDeflate = deflated.length < data.length;
    const stored = useDeflate ? deflated : data;
    const method = useDeflate ? 8 : 0;

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);            // version needed
    local.writeUInt16LE(0x0800, 6);        // UTF-8 flag
    local.writeUInt16LE(method, 8);
    local.writeUInt16LE(time, 10);
    local.writeUInt16LE(date, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(stored.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    local.writeUInt16LE(0, 28);
    localParts.push(local, nameBuf, stored);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);          // version made by
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(method, 10);
    central.writeUInt16LE(time, 12);
    central.writeUInt16LE(date, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(stored.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(nameBuf.length, 28);
    // extra/comment/disk/attrs = 0
    central.writeUInt32LE(offset, 42);
    centralParts.push(Buffer.concat([central, nameBuf]));

    offset += 30 + nameBuf.length + stored.length;
  }

  const centralDir = Buffer.concat(centralParts);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(centralDir.length, 12);
  eocd.writeUInt32LE(offset, 16);

  return Buffer.concat([...localParts, centralDir, eocd]);
}
```

- [ ] **Step 4: Тести зелені** — `npm test` → PASS (unzip: No errors detected)

- [ ] **Step 5: Коміт** — `git add core/docx/zip-writer.js test/zip-writer.test.js && git commit -m "feat: zero-dependency ZIP writer for DOCX packaging"`

---

### Task 12: core/docx/docx-writer.js

**Files:**
- Create: `core/docx/docx-writer.js`
- Test: `test/docx-writer.test.js`

**Interfaces:**
- Consumes: `createZip` (Task 11), `ProfileDoc` (Task 8), state, annotated risks (Task 4).
- Produces: `buildDocx(input) -> Buffer`, де `input = { state, profileDoc, annotatedRisks, assets }`; `escapeXml(s) -> string`.
- Формат: Times New Roman 14pt (28 half-points), гриф «Для службового користування» у верхньому правому колонтитулі якщо `info_type === 'service'` (для `open_confidential` — без грифа); секції: титул (портрет) → політики (таблиця) → активи → ризики (альбомна таблиця) → профіль (альбомна таблиця: №, клас, пункт, зміст, статус, посилення) → підписи.

- [ ] **Step 1: Провальний тест**

`test/docx-writer.test.js`:
```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { escapeXml, buildDocx } from '../core/docx/docx-writer.js';

const input = {
  state: {
    passport: { ics_name: 'Тест & <ІКС>', cert_body: 'Орган', as_class: 1 },
    global_constants: { password_rotation_days: '90 днів' },
    selected_assets: ['A-01'],
    info_type: 'service',
    profile: { param_overrides: {}, enhancements: [], excluded: [], exemption_overrides: [] },
  },
  assets: [{ id: 'A-01', name: 'АРМ', category: 'Фізичні активи', min_as_class: 1 }],
  annotatedRisks: [{ id: 'R-001', asset_id: 'A-01', threat: 'Загроза', vulnerability: 'Вразливість',
    impact: 4, likelihood: 0.5, likelihood_label: 'Середня', level: 'Високий', score: 2,
    treatment_strategy: 'Зменшення', treatment_plan: 'План', responsible: 'НІБ',
    residual_risk: 'Низький', priority: 'Високий' }],
  profileDoc: { items: [{ key: 'AC:1', classId: 'AC', className: 'Управління доступом',
    actionNumber: '1', actionName: 'Дія', status: 'Застосовується (автозаповнено)',
    controls: [{ id: 'AC-2', statementLines: [{ label: 'a.', depth: 0, text: 'Текст заходу', parts: [] }], emptyParams: [] }],
    enhancements: [] }],
    summary: { total: 1, autofilled: 1, empty: 0, exempted: 0, excluded: 0 } },
};

test('escapeXml екранує спецсимволи', () => {
  assert.equal(escapeXml('a & <b> "c" \u02BCd\u02BC'), 'a &amp; &lt;b&gt; &quot;c&quot; \u02BCd\u02BC');
});

test('buildDocx повертає валідний docx з грифом та назвою ІКС', () => {
  const buf = buildDocx(input);
  const dir = mkdtempSync(join(tmpdir(), 'docxtest-'));
  const file = join(dir, 't.docx');
  writeFileSync(file, buf);
  assert.match(execFileSync('unzip', ['-t', file], { encoding: 'utf8' }), /No errors detected/);
  const xml = execFileSync('unzip', ['-p', file, 'word/document.xml'], { encoding: 'utf8' });
  assert.match(xml, /Тест &amp; &lt;ІКС&gt;/);
  assert.match(xml, /Times New Roman/);
  const header = execFileSync('unzip', ['-p', file, 'word/header1.xml'], { encoding: 'utf8' });
  assert.match(header, /Для службового користування/);
});

test('для open_confidential гриф відсутній', () => {
  const buf = buildDocx({ ...input, state: { ...input.state, info_type: 'open_confidential' } });
  const dir = mkdtempSync(join(tmpdir(), 'docxtest2-'));
  const file = join(dir, 't.docx');
  writeFileSync(file, buf);
  const header = execFileSync('unzip', ['-p', file, 'word/header1.xml'], { encoding: 'utf8' });
  assert.doesNotMatch(header, /Для службового користування/);
});
```

- [ ] **Step 2: Запустити — FAIL**

- [ ] **Step 3: Реалізація core/docx/docx-writer.js**

Ключові хелпери та каркас (повна структура; рядки таблиць — за цим же зразком):

```js
import { createZip } from './zip-writer.js';

export function escapeXml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

const FONT = 'Times New Roman';
const SZ = 28; // 14pt у half-points

const rpr = (opts = {}) =>
  `<w:rPr><w:rFonts w:ascii="${FONT}" w:hAnsi="${FONT}" w:cs="${FONT}"/><w:sz w:val="${SZ}"/><w:szCs w:val="${SZ}"/>${opts.bold ? '<w:b/>' : ''}</w:rPr>`;

export const run = (text, opts) => `<w:r>${rpr(opts)}<w:t xml:space="preserve">${escapeXml(text)}</w:t></w:r>`;

export const par = (text, opts = {}) =>
  `<w:p><w:pPr>${opts.align ? `<w:jc w:val="${opts.align}"/>` : ''}</w:pPr>${text ? run(text, opts) : ''}</w:p>`;

export const cell = (text, opts = {}) =>
  `<w:tc><w:tcPr>${opts.width ? `<w:tcW w:w="${opts.width}" w:type="dxa"/>` : ''}</w:tcPr>${par(text, opts)}</w:tc>`;

export const row = (cells) => `<w:tr>${cells.join('')}</w:tr>`;

export const table = (rows, opts = {}) =>
  `<w:tbl><w:tblPr><w:tblBorders>` +
  ['top', 'left', 'bottom', 'right', 'insideH', 'insideV']
    .map(b => `<w:${b} w:val="single" w:sz="4" w:color="000000"/>`).join('') +
  `</w:tblBorders><w:tblW w:w="0" w:type="auto"/></w:tblPr>${rows.join('')}</w:tbl>`;

// Розрив секції: portrait (титул/політики/активи) → landscape (ризики/профіль)
const SECT_PORTRAIT_BREAK =
  `<w:p><w:pPr><w:sectPr><w:headerReference w:type="default" r:id="rIdHdr"/>` +
  `<w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1134" w:right="850" w:bottom="1134" w:left="1701"/></w:sectPr></w:pPr></w:p>`;
const SECT_LANDSCAPE_FINAL =
  `<w:sectPr><w:headerReference w:type="default" r:id="rIdHdr"/>` +
  `<w:pgSz w:w="16838" w:h="11906" w:orient="landscape"/><w:pgMar w:top="850" w:right="1134" w:bottom="850" w:left="1134"/></w:sectPr>`;

function headerXml(infoType) {
  const stamp = infoType === 'service'
    ? `<w:p><w:pPr><w:jc w:val="right"/></w:pPr>${run('Для службового користування', { bold: true })}</w:p>` +
      `<w:p><w:pPr><w:jc w:val="right"/></w:pPr>${run('Прим. № ___')}</w:p>`
    : '<w:p/>';
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<w:hdr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">${stamp}</w:hdr>`;
}

export function buildDocx({ state, profileDoc, annotatedRisks, assets }) {
  const body = [];
  // 1. Титул
  body.push(par('ЦІЛЬОВИЙ ПРОФІЛЬ БЕЗПЕКИ', { bold: true, align: 'center' }));
  body.push(par(state.passport.ics_name, { bold: true, align: 'center' }));
  body.push(par(`Орган сертифікації: ${state.passport.cert_body}`, { align: 'center' }));
  body.push(par(`Клас автоматизованої системи: АС-${state.passport.as_class}`, { align: 'center' }));
  // 2. Глобальні політики
  body.push(par('1. Глобальні політики безпеки організації', { bold: true }));
  body.push(table(Object.entries(state.global_constants).map(([k, v]) => row([cell(k), cell(v)]))));
  // 3. Активи
  body.push(par('2. Реєстр активів', { bold: true }));
  body.push(table([
    row([cell('ID', { bold: true }), cell('Актив', { bold: true }), cell('Категорія', { bold: true })]),
    ...state.selected_assets.map(id => {
      const a = assets.find(x => x.id === id);
      return row([cell(id), cell(a?.name ?? id), cell(a?.category ?? '')]);
    }),
  ]));
  body.push(SECT_PORTRAIT_BREAK);
  // 4. Ризики (альбомна)
  body.push(par('3. Реєстр ризиків (за методикою Наказу № 402)', { bold: true }));
  body.push(table([
    row(['ID', 'Актив', 'Загроза', 'Вразливість', 'Вплив', 'Ймовірність', 'Рівень', 'Стратегія', 'Заходи', 'Відп.', 'Залишковий']
      .map(h => cell(h, { bold: true }))),
    ...annotatedRisks.map(r => row([
      cell(r.id), cell(r.asset_id), cell(r.threat), cell(r.vulnerability),
      cell(String(r.impact)), cell(`${r.likelihood_label} / ${r.likelihood}`),
      cell(r.level), cell(r.treatment_strategy), cell(r.treatment_plan),
      cell(r.responsible), cell(r.residual_risk ?? ''),
    ])),
  ]));
  // 5. Профіль
  body.push(par('4. Цільовий профіль безпеки', { bold: true }));
  const profileRows = [row(['№', 'Клас заходів', 'Пункт БПБ', 'Зміст заходу', 'Статус', 'Посилення']
    .map(h => cell(h, { bold: true })))];
  for (const item of profileDoc.items) {
    const content = item.exemptionNote
      ? item.exemptionNote
      : item.controls.map(c => c.statementLines.map(l => `${l.label} ${l.text}`.trim()).join('\n')).join('\n');
    profileRows.push(row([
      cell(item.actionNumber), cell(`${item.classId} — ${item.className}`),
      cell(item.actionName), cell(content), cell(item.status),
      cell(item.enhancements.map(e => `${e.id} ${e.title}`).join('; ')),
    ]));
  }
  body.push(table(profileRows));
  // 6. Підписи
  body.push(par(''));
  body.push(par('Адміністратор безпеки: _________________'));
  body.push(par('Керівник організації: _________________'));

  const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" ` +
    `xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">` +
    `<w:body>${body.join('')}${SECT_LANDSCAPE_FINAL}</w:body></w:document>`;

  return createZip([
    { path: '[Content_Types].xml', content:
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
      `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
      `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
      `<Default Extension="xml" ContentType="application/xml"/>` +
      `<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>` +
      `<Override PartName="/word/header1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml"/></Types>` },
    { path: '_rels/.rels', content:
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
      `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
      `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>` },
    { path: 'word/_rels/document.xml.rels', content:
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
      `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
      `<Relationship Id="rIdHdr" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/header" Target="header1.xml"/></Relationships>` },
    { path: 'word/document.xml', content: documentXml },
    { path: 'word/header1.xml', content: headerXml(state.info_type) },
  ]);
}
```

Примітка: багаторядковий текст у `cell()` — розбивати `content.split('\n')` на окремі `par()` всередині `<w:tc>` (доопрацювати `cell` до підтримки масиву рядків, зберігши сигнатуру для одного рядка).

- [ ] **Step 4: Тести зелені; відкрити файл вручну**

Run: `npm test` → PASS. Додатково: згенерувати тестовий файл і відкрити у Word/LibreOffice — таблиці читабельні, шрифт Times New Roman 14pt, гриф на кожній сторінці.

- [ ] **Step 5: Коміт** — `git add core/docx/ test/docx-writer.test.js && git commit -m "feat: zero-dependency OOXML DOCX writer (DSTU format, DSK stamp)"`

---

### Task 13: server.js

**Files:**
- Create: `server.js`
- Test: `test/server.test.js`

**Interfaces:**
- Produces HTTP API на `127.0.0.1:3000` (порт через `process.env.PORT`):
  - `GET /` та `GET /css|/js/...` — статика з `public/`; `GET /data/*.json` — каталоги (read-only)
  - `GET /api/templates/:kind` → `{ names: string[] }` (kind ∈ ics|cpb)
  - `GET /api/templates/:kind/:name` → JSON шаблону
  - `POST /api/templates/:kind/:name` (body JSON) → `{ ok: true }`
  - `POST /api/export/docx` (body = `{ state }`) → binary docx + запис у `exports/`

- [ ] **Step 1: Провальний smoke-тест**

`test/server.test.js`:
```js
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { rmSync } from 'node:fs';

let proc;
const BASE = 'http://127.0.0.1:34567';

before(async () => {
  proc = spawn('node', ['server.js'], { env: { ...process.env, PORT: '34567' } });
  await new Promise((res) => proc.stdout.on('data', (d) => d.toString().includes('listening') && res()));
});
after(() => { proc.kill(); rmSync('templates/ics/тест-шаблон.json', { force: true }); });

test('віддає index.html', async () => {
  const r = await fetch(BASE + '/');
  assert.equal(r.status, 200);
  assert.match(await r.text(), /<html/i);
});

test('віддає каталог даних', async () => {
  const r = await fetch(BASE + '/data/assets_catalog.json');
  assert.equal((await r.json()).assets.length, 13);
});

test('шаблони: POST → список → GET', async () => {
  const tpl = { kind: 'ics', passport: { ics_name: 'Т', cert_body: '', as_class: 1 }, global_constants: {}, selected_assets: [] };
  const p = await fetch(BASE + '/api/templates/ics/тест-шаблон', { method: 'POST', body: JSON.stringify(tpl) });
  assert.equal(p.status, 200);
  const list = await (await fetch(BASE + '/api/templates/ics')).json();
  assert.ok(list.names.includes('тест-шаблон'));
  const got = await (await fetch(BASE + '/api/templates/ics/тест-шаблон')).json();
  assert.equal(got.passport.ics_name, 'Т');
});

test('відхиляє небезпечні імена', async () => {
  const r = await fetch(BASE + '/api/templates/ics/..%2Fevil', { method: 'POST', body: '{}' });
  assert.equal(r.status, 400);
});
```

- [ ] **Step 2: Запустити — FAIL** (server.js відсутній)

- [ ] **Step 3: Реалізація server.js**

```js
import { createServer } from 'node:http';
import { readFile, writeFile, readdir, mkdir } from 'node:fs/promises';
import { join, extname, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDocx } from './core/docx/docx-writer.js';
import { buildProfile } from './core/profile-engine.js';
import { baseRisksFor, buildCustomRisk, annotateRisk } from './core/risk-engine.js';
import { validateTemplate } from './core/template-io.js';

const ROOT = fileURLToPath(new URL('.', import.meta.url));
const PORT = Number(process.env.PORT ?? 3000);
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json' };
const NAME_RE = /^[a-zа-яіїєґ0-9_\-]+$/i;
const KINDS = new Set(['ics', 'cpb']);

const readBody = (req, limit = 5_000_000) => new Promise((resolve, reject) => {
  let size = 0; const chunks = [];
  req.on('data', (c) => { size += c.length; if (size > limit) reject(new Error('too large')); else chunks.push(c); });
  req.on('end', () => resolve(Buffer.concat(chunks)));
  req.on('error', reject);
});

const json = (res, code, obj) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(obj)); };

async function loadCatalogs() {
  const read = async (p) => JSON.parse(await readFile(join(ROOT, 'data', p), 'utf8'));
  return {
    ndTzi: await read('nd_tzi.json'),
    bpb: { service: await read('bpb_service.json'), open_confidential: await read('bpb_open_confidential.json') },
    exemptions: await read('as_class_exemptions.json'),
    policyMapping: await read('policy_mapping.json'),
    genericDefaults: await read('generic_parameter_defaults.json'),
    assets: (await read('assets_catalog.json')).assets,
    threatsRisks: await read('threats_risks.json'),
  };
}
const catalogsPromise = loadCatalogs();

createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://127.0.0.1:${PORT}`);
    const parts = url.pathname.split('/').filter(Boolean).map(decodeURIComponent);

    if (parts[0] === 'api') {
      if (parts[1] === 'templates') {
        const kind = parts[2];
        if (!KINDS.has(kind)) return json(res, 400, { error: 'невідомий тип шаблону' });
        const dir = join(ROOT, 'templates', kind);
        if (parts.length === 3 && req.method === 'GET') {
          const names = (await readdir(dir)).filter(f => f.endsWith('.json')).map(f => f.slice(0, -5));
          return json(res, 200, { names });
        }
        const name = parts[3];
        if (!name || !NAME_RE.test(name)) return json(res, 400, { error: 'некоректне ім\u02BCя шаблону' });
        const file = join(dir, name + '.json');
        if (req.method === 'GET') return json(res, 200, JSON.parse(await readFile(file, 'utf8')));
        if (req.method === 'POST') {
          const body = JSON.parse((await readBody(req)).toString('utf8'));
          const errors = validateTemplate(kind, body);
          if (errors.length) return json(res, 400, { error: errors.join('; ') });
          await writeFile(file, JSON.stringify(body, null, 2));
          return json(res, 200, { ok: true });
        }
      }
      if (parts[1] === 'export' && parts[2] === 'docx' && req.method === 'POST') {
        const { state } = JSON.parse((await readBody(req)).toString('utf8'));
        const catalogs = await catalogsPromise;
        const profileDoc = buildProfile(state, catalogs);
        const accepted = new Set(state.risks.accepted_base);
        const annotatedRisks = [
          ...baseRisksFor(catalogs.threatsRisks, state.selected_assets, state.passport.as_class).filter(r => accepted.has(r.id)),
          ...state.risks.custom.map(r => annotateRisk(r, catalogs.threatsRisks.scale)),
        ];
        const buf = buildDocx({ state, profileDoc, annotatedRisks, assets: catalogs.assets });
        const safeName = (state.passport.ics_name || 'профіль').replace(/[^a-zа-яіїєґ0-9_\- ]/gi, '').trim() || 'профіль';
        const fileName = `${safeName}_${new Date().toISOString().slice(0, 10)}.docx`;
        await mkdir(join(ROOT, 'exports'), { recursive: true });
        await writeFile(join(ROOT, 'exports', fileName), buf);
        res.writeHead(200, {
          'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(fileName)}`,
        });
        return res.end(buf);
      }
      return json(res, 404, { error: 'not found' });
    }

    // Статика: public/ + data/ (read-only)
    let filePath = url.pathname === '/' ? '/index.html' : url.pathname;
    const base = filePath.startsWith('/data/') ? ROOT : join(ROOT, 'public');
    const resolved = normalize(join(base, filePath));
    if (!resolved.startsWith(base)) { res.writeHead(403); return res.end(); }
    try {
      const content = await readFile(resolved);
      res.writeHead(200, { 'Content-Type': MIME[extname(resolved)] ?? 'application/octet-stream' });
      return res.end(content);
    } catch { res.writeHead(404); return res.end('not found'); }
  } catch (err) {
    return json(res, 500, { error: String(err.message ?? err) });
  }
}).listen(PORT, '127.0.0.1', () => console.log(`listening on http://127.0.0.1:${PORT}`));
```

Увага: тест «index.html» вимагатиме заглушки `public/index.html` — створити мінімальну (`<!doctype html><html><body>Профіль-Аудитор</body></html>`), Task 14 її замінить.

- [ ] **Step 4: Тести зелені** — `npm test` → PASS

- [ ] **Step 5: Коміт** — `git add server.js test/server.test.js public/index.html && git commit -m "feat: loopback-only HTTP server (static, templates API, DOCX export)"`

---

### Task 14: UI-каркас: index.html, state.js, app.js, стилі

**Files:**
- Create: `public/index.html` (замінити заглушку), `public/css/app.css`, `public/js/state.js`, `public/js/app.js`, `public/js/render/dom.js`

**Interfaces:**
- Produces:
  - `state.js`: `getState()`, `setState(patch)` (merge + автозбереження в localStorage ключ `offline-profile-state`), `resetState()`, `subscribe(fn)`.
  - `app.js`: `registerStep({id, title, render(container), validate() -> string[]})`; навігація по кроках 1–7; глобальний об'єкт каталогів `window.__catalogs` після `loadCatalogs()`.
  - `render/dom.js`: `el(tag, attrs, ...children)` — створення елементів БЕЗ innerHTML; `option`, `labeled` хелпери.
- Consumes: `core/template-io.js` → `defaultState()` (імпорт через `/core/...` — сервер віддає лише public/ і data/, тому `core/` копіюється як `public/js/core/`-симлінк НІ: замість цього сервер у Task 13 доповнюється маршрутом статики для `/core/` — див. Step 1).

- [ ] **Step 1: Дозволити віддачу /core/ як статики**

У `server.js` замінити рядок вибору бази:
```js
const base = (filePath.startsWith('/data/') || filePath.startsWith('/core/')) ? ROOT : join(ROOT, 'public');
```
(браузер імпортує ядро напряму: `import { defaultState } from '/core/template-io.js'`).

- [ ] **Step 2: public/js/render/dom.js**

```js
export function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') node.className = v;
    else if (k === 'dataset') Object.assign(node.dataset, v);
    else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2), v);
    else if (v !== null && v !== undefined) node.setAttribute(k, v);
  }
  for (const c of children.flat()) {
    if (c === null || c === undefined) continue;
    node.append(typeof c === 'string' ? document.createTextNode(c) : c);
  }
  return node;
}
export const option = (value, label, selected = false) =>
  el('option', selected ? { value, selected: '' } : { value }, label);
```

- [ ] **Step 3: public/js/state.js**

```js
import { defaultState } from '/core/template-io.js';

const KEY = 'offline-profile-state';
let state = load();
const listeners = new Set();

function load() {
  try { const raw = localStorage.getItem(KEY); if (raw) return { ...defaultState(), ...JSON.parse(raw) }; }
  catch { /* зіпсований стан — почати заново */ }
  return defaultState();
}
export const getState = () => state;
export function setState(patch) {
  state = typeof patch === 'function' ? patch(state) : { ...state, ...patch };
  localStorage.setItem(KEY, JSON.stringify(state));
  for (const fn of listeners) fn(state);
}
export function resetState() { state = defaultState(); localStorage.setItem(KEY, JSON.stringify(state)); for (const fn of listeners) fn(state); }
export const subscribe = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };
```

- [ ] **Step 4: public/index.html + app.css + app.js**

`index.html`:
```html
<!doctype html>
<html lang="uk">
<head>
  <meta charset="utf-8">
  <title>Профіль-Аудитор — формування ЦПБ</title>
  <link rel="stylesheet" href="/css/app.css">
</head>
<body>
  <header><h1>Автономний комплекс «Профіль-Аудитор»</h1><nav id="stepper"></nav></header>
  <main id="step-container"></main>
  <footer>
    <button id="btn-back" type="button">← Назад</button>
    <button id="btn-next" type="button">Далі →</button>
  </footer>
  <script type="module" src="/js/app.js"></script>
</body>
</html>
```

`app.js`:
```js
import { el } from './render/dom.js';
import { getState, subscribe } from './state.js';

const steps = [];
export function registerStep(step) { steps.push(step); }

export async function loadCatalogs() {
  const get = async (p) => (await fetch('/data/' + p)).json();
  return {
    ndTzi: await get('nd_tzi.json'),
    bpb: { service: await get('bpb_service.json'), open_confidential: await get('bpb_open_confidential.json') },
    exemptions: await get('as_class_exemptions.json'),
    policyMapping: await get('policy_mapping.json'),
    genericDefaults: await get('generic_parameter_defaults.json'),
    assets: (await get('assets_catalog.json')).assets,
    threatsRisks: await get('threats_risks.json'),
  };
}

let current = 0;
export let catalogs = null;

function renderStepper() {
  const nav = document.getElementById('stepper');
  nav.replaceChildren(...steps.map((s, i) =>
    el('button', {
      class: `step-tab${i === current ? ' active' : ''}${i < current ? ' done' : ''}`,
      type: 'button',
      onclick: () => { if (i <= current) go(i); },
    }, `${i + 1}. ${s.title}`)));
}

function go(index) {
  current = index;
  renderStepper();
  const container = document.getElementById('step-container');
  container.replaceChildren();
  steps[current].render(container);
  document.getElementById('btn-back').disabled = current === 0;
  document.getElementById('btn-next').style.display = current === steps.length - 1 ? 'none' : '';
}

document.getElementById('btn-back').addEventListener('click', () => current > 0 && go(current - 1));
document.getElementById('btn-next').addEventListener('click', () => {
  const errors = steps[current].validate?.(getState()) ?? [];
  if (errors.length) { alert(errors.join('\n')); return; }
  if (current < steps.length - 1) go(current + 1);
});

(async () => {
  catalogs = await loadCatalogs();
  const modules = await Promise.all([
    import('./steps/step1-passport.js'), import('./steps/step2-assets.js'),
    import('./steps/step3-base-risks.js'), import('./steps/step4-custom-risks.js'),
    import('./steps/step5-generate.js'), import('./steps/step6-verify.js'),
    import('./steps/step7-export.js'),
  ]);
  for (const m of modules) registerStep(m.step);
  go(0);
})();
```

`app.css` — мінімальні стилі: `.step-tab.active` (акцент), `.step-tab.done` (сірий), таблиці з бордерами, бейджі рівнів ризику (`.lvl-Критичний` червоний, `.lvl-Високий` помаранчевий, `.lvl-Середній` жовтий, `.lvl-Низький`/`.lvl-Дуже\ низький` зелений), підсвітка параметрів: `.src-policy` зелений, `.src-generic`/`.src-bpb` сірий, `.src-empty` червоний, `.src-override` синій; бейдж `.badge-exempt` жовтий.

- [ ] **Step 5: Заглушки кроків і ручна перевірка**

Створити 7 файлів `public/js/steps/stepN-*.js` з мінімальним експортом:
```js
export const step = { id: 'passport', title: 'Паспорт', render(c) { c.append('TODO'); }, validate: () => [] };
```
Run: `npm start` → відкрити http://127.0.0.1:3000 → стрічка 7 кроків рендериться, навігація вперед/назад працює.

- [ ] **Step 6: Коміт** — `git add public/ server.js && git commit -m "feat: UI shell (stepper, state persistence, catalog loading)"`

---

### Task 15: UI Кроки 1–2 (Паспорт+Політики, Активи)

**Files:**
- Modify: `public/js/steps/step1-passport.js`, `public/js/steps/step2-assets.js`

**Interfaces:**
- Consumes: `catalogs` (app.js), `getState`/`setState` (state.js), `el` (dom.js), `filterAssetsByClass`/`groupByCategory` (`/core/asset-catalog.js`), `applyIcsTemplate`/`validateTemplate` (`/core/template-io.js`).

- [ ] **Step 1: step1-passport.js**

```js
import { el, option } from '../render/dom.js';
import { getState, setState } from '../state.js';
import { catalogs } from '../app.js';
import { applyIcsTemplate, validateTemplate } from '/core/template-io.js';

async function loadTemplateList(select) {
  const { names } = await (await fetch('/api/templates/ics')).json();
  select.replaceChildren(option('', '— оберіть шаблон —'), ...names.map(n => option(n, n)));
}

export const step = {
  id: 'passport', title: 'Паспорт та політики',
  validate(state) {
    const errors = [];
    if (!state.passport.ics_name.trim()) errors.push('Вкажіть назву ІКС');
    if (!state.passport.cert_body.trim()) errors.push('Вкажіть орган сертифікації');
    return errors;
  },
  render(container) {
    const state = getState();
    const nameInput = el('input', { type: 'text', value: state.passport.ics_name,
      oninput: (e) => setState(s => ({ ...s, passport: { ...s.passport, ics_name: e.target.value } })) });
    const certInput = el('input', { type: 'text', value: state.passport.cert_body,
      oninput: (e) => setState(s => ({ ...s, passport: { ...s.passport, cert_body: e.target.value } })) });
    const classRadios = [1, 2, 3].map(c =>
      el('label', { class: 'radio' },
        el('input', { type: 'radio', name: 'as_class', value: String(c),
          ...(state.passport.as_class === c ? { checked: '' } : {}),
          onchange: () => setState(s => ({ ...s, passport: { ...s.passport, as_class: c },
            selected_assets: s.selected_assets.filter(id =>
              catalogs.assets.find(a => a.id === id)?.min_as_class <= c) })) }),
        `АС-${c}`));
    // Картка глобальних політик — генерується з policy_mapping.json
    const policyFields = catalogs.policyMapping.global_constants.map(gc =>
      el('label', { class: 'field' }, gc.label,
        el('input', { type: 'text', placeholder: gc.example, value: state.global_constants[gc.key] ?? '',
          oninput: (e) => setState(s => ({ ...s, global_constants: { ...s.global_constants, [gc.key]: e.target.value } })) })));
    // Завантаження шаблону ІКС
    const tplSelect = el('select', {});
    loadTemplateList(tplSelect);
    const tplBtn = el('button', { type: 'button', onclick: async () => {
      if (!tplSelect.value) return;
      const tpl = await (await fetch(`/api/templates/ics/${encodeURIComponent(tplSelect.value)}`)).json();
      if (validateTemplate('ics', tpl).length) { alert('Шаблон пошкоджено'); return; }
      setState(s => applyIcsTemplate(s, tpl));
      step.render(container.parentElement ? (container.replaceChildren(), container) : container);
    } }, 'Завантажити шаблон ІКС');
    container.replaceChildren(
      el('section', {},
        el('h2', {}, 'Крок 1. Паспорт ІКС та Глобальні політики'),
        el('div', { class: 'tpl-row' }, tplSelect, tplBtn),
        el('label', { class: 'field' }, 'Назва ІКС', nameInput),
        el('label', { class: 'field' }, 'Орган сертифікації', certInput),
        el('div', { class: 'field' }, 'Клас ІКС: ', ...classRadios),
        el('h3', {}, 'Картка глобальних політик'),
        ...policyFields));
  },
};
```

- [ ] **Step 2: step2-assets.js**

```js
import { el } from '../render/dom.js';
import { getState, setState } from '../state.js';
import { catalogs } from '../app.js';
import { filterAssetsByClass, groupByCategory } from '/core/asset-catalog.js';

export const step = {
  id: 'assets', title: 'Активи',
  validate(state) { return state.selected_assets.length ? [] : ['Оберіть щонайменше один актив']; },
  render(container) {
    const state = getState();
    const visible = filterAssetsByClass(catalogs.assets, state.passport.as_class);
    const groups = groupByCategory(visible);
    const sections = [...groups.entries()].map(([category, assets]) =>
      el('fieldset', {}, el('legend', {}, category),
        ...assets.map(a => el('label', { class: 'checkbox' },
          el('input', { type: 'checkbox', value: a.id,
            ...(state.selected_assets.includes(a.id) ? { checked: '' } : {}),
            onchange: (e) => setState(s => ({ ...s,
              selected_assets: e.target.checked
                ? [...s.selected_assets, a.id]
                : s.selected_assets.filter(x => x !== a.id) })) }),
          `${a.id}. ${a.name}`))));
    container.replaceChildren(
      el('section', {},
        el('h2', {}, `Крок 2. Вибір активів (доступно для АС-${state.passport.as_class}: ${visible.length} із 13)`),
        ...sections));
  },
};
```

- [ ] **Step 3: Ручна перевірка**

`npm start` → Крок 1: поля рендеряться з policy_mapping, клас АС перемикається; Крок 2: для АС-1 видно 7 активів, для АС-3 — 13; вибір зберігається після F5 (localStorage). Зміна АС-3→АС-1 знімає мережеві активи.

- [ ] **Step 4: Коміт** — `git add public/js/steps/step1-passport.js public/js/steps/step2-assets.js && git commit -m "feat: wizard steps 1-2 (passport+policies, assets)"`

---

### Task 16: UI Кроки 3–4 (Базові ризики, Кастомні ризики + Тип інформації)

**Files:**
- Modify: `public/js/steps/step3-base-risks.js`, `public/js/steps/step4-custom-risks.js`

**Interfaces:**
- Consumes: `baseRisksFor`, `threatDirectory`, `buildCustomRisk` (`/core/risk-engine.js`).

- [ ] **Step 1: step3-base-risks.js**

```js
import { el } from '../render/dom.js';
import { getState, setState } from '../state.js';
import { catalogs } from '../app.js';
import { baseRisksFor } from '/core/risk-engine.js';

export const step = {
  id: 'base-risks', title: 'Базові ризики',
  validate() { return []; },
  render(container) {
    const state = getState();
    const risks = baseRisksFor(catalogs.threatsRisks, state.selected_assets, state.passport.as_class);
    // Перший показ: усі прийняті за замовчуванням
    if (!state.risks.accepted_base.length && risks.length) {
      setState(s => ({ ...s, risks: { ...s.risks, accepted_base: risks.map(r => r.id) } }));
    }
    const accepted = new Set(getState().risks.accepted_base);
    const assetName = (id) => catalogs.assets.find(a => a.id === id)?.name ?? id;
    const header = el('tr', {}, ...['✓', 'ID', 'Актив', 'Загроза', 'Вразливість', 'Вплив', 'Ймовірність', 'Рівень', 'Стратегія', 'Відповідальний', 'Залишковий']
      .map(h => el('th', {}, h)));
    const rows = risks.map(r => el('tr', {},
      el('td', {}, el('input', { type: 'checkbox', ...(accepted.has(r.id) ? { checked: '' } : {}),
        onchange: (e) => setState(s => ({ ...s, risks: { ...s.risks,
          accepted_base: e.target.checked
            ? [...s.risks.accepted_base, r.id]
            : s.risks.accepted_base.filter(x => x !== r.id) } })) })),
      el('td', {}, r.id), el('td', {}, assetName(r.asset_id)), el('td', {}, r.threat),
      el('td', {}, r.vulnerability), el('td', {}, String(r.impact)),
      el('td', {}, `${r.likelihood_label} / ${r.likelihood}`),
      el('td', {}, el('span', { class: `badge lvl-${r.level.replace(/ /g, '\\ ')}` }, r.level)),
      el('td', {}, r.treatment_strategy), el('td', {}, r.responsible), el('td', {}, r.residual_risk ?? '')));
    container.replaceChildren(el('section', {},
      el('h2', {}, `Крок 3. Первинна матриця загроз (${risks.length} ризиків за обраними активами)`),
      el('table', { class: 'risk-table' }, header, ...rows)));
  },
};
```

- [ ] **Step 2: step4-custom-risks.js**

```js
import { el, option } from '../render/dom.js';
import { getState, setState } from '../state.js';
import { catalogs } from '../app.js';
import { threatDirectory, buildCustomRisk, computeRiskScore, riskLevel } from '/core/risk-engine.js';

const INFO_OPTIONS = [
  { value: 'open_confidential', label: 'Відкрита / Конфіденційна інформація' },
  { value: 'service', label: 'Службова інформація (ДСК)' },
  { value: 'state_secret', label: 'Державна таємниця (каталог буде додано)', disabled: true },
];

export const step = {
  id: 'custom-risks', title: 'Кастомні ризики та тип інформації',
  validate(state) { return state.info_type ? [] : ['Оберіть тип інформації']; },
  render(container) {
    const state = getState();
    const scale = catalogs.threatsRisks.scale;
    const dir = threatDirectory(catalogs.threatsRisks);
    const assetSel = el('select', {}, ...state.selected_assets.map(id =>
      option(id, catalogs.assets.find(a => a.id === id)?.name ?? id)));
    const threatSel = el('select', {}, ...dir.map((t, i) => option(String(i), `${t.threat} / ${t.vulnerability}`)));
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
    const addBtn = el('button', { type: 'button', onclick: () => {
      const t = dir[Number(threatSel.value)];
      const existing = [...getState().risks.custom.map(r => r.id)];
      const risk = buildCustomRisk({ asset_id: assetSel.value, threat: t.threat, vulnerability: t.vulnerability,
        impact: Number(impSel.value), likelihood: Number(likSel.value),
        likelihood_label: scale.likelihood_options.find(o => o.value === Number(likSel.value)).label }, existing, scale);
      setState(s => ({ ...s, risks: { ...s.risks, custom: [...s.risks.custom, risk] } }));
      step.render(container);
    } }, '+ Додати ризик');
    const customList = getState().risks.custom.map(r => el('li', {},
      `${r.id}: ${r.threat} → ${r.level}`,
      el('button', { type: 'button', onclick: () => {
        setState(s => ({ ...s, risks: { ...s.risks, custom: s.risks.custom.filter(x => x.id !== r.id) } }));
        step.render(container);
      } }, '✕')));
    const infoRadios = INFO_OPTIONS.map(o => el('label', { class: 'radio' },
      el('input', { type: 'radio', name: 'info_type', value: o.value,
        ...(o.disabled ? { disabled: '' } : {}),
        ...(state.info_type === o.value ? { checked: '' } : {}),
        onchange: () => setState(s => ({ ...s, info_type: o.value })) }),
      o.label));
    container.replaceChildren(el('section', {},
      el('h2', {}, 'Крок 4. Конструктор ризиків та Тип інформації'),
      el('div', { class: 'constructor' },
        el('label', {}, 'Актив: ', assetSel), el('label', {}, 'Загроза: ', threatSel),
        el('label', {}, 'Ймовірність: ', likSel), el('label', {}, 'Вплив: ', impSel),
        el('label', {}, 'Рівень: ', preview), addBtn),
      el('ul', { class: 'custom-list' }, ...customList),
      el('h3', {}, 'Тип інформації, що обробляється (обов\u02BCязково)'),
      ...infoRadios));
  },
};
```

- [ ] **Step 3: Ручна перевірка**

Крок 3: таблиця містить лише ризики обраних активів, бейджі рівнів кольорові, зняття чек-боксу зберігається. Крок 4: конструктор додає C-001 з миттєвим рівнем; «Далі» блокується без типу інформації; опція держтаємниці неактивна.

- [ ] **Step 4: Коміт** — `git add public/js/steps/step3-base-risks.js public/js/steps/step4-custom-risks.js && git commit -m "feat: wizard steps 3-4 (base risk matrix, custom risk constructor, info type)"`

---

### Task 17: UI Кроки 5–6 (Генерація ЦПБ, Верифікація та Посилення)

**Files:**
- Modify: `public/js/steps/step5-generate.js`, `public/js/steps/step6-verify.js`

**Interfaces:**
- Consumes: `buildProfile`, `STATUS` (`/core/profile-engine.js`); `enhancementsForControl`, `suggestionsFromRisks` (`/core/enhancement-engine.js`); `baseRisksFor`, `annotateRisk` (`/core/risk-engine.js`); `applyCpbTemplate`, `validateTemplate` (`/core/template-io.js`).

- [ ] **Step 1: step5-generate.js**

```js
import { el, option } from '../render/dom.js';
import { getState, setState } from '../state.js';
import { catalogs } from '../app.js';
import { buildProfile } from '/core/profile-engine.js';
import { applyCpbTemplate, validateTemplate } from '/core/template-io.js';

export const step = {
  id: 'generate', title: 'Ініціація ЦПБ',
  validate() { return []; },
  render(container) {
    const summaryBox = el('div', { class: 'summary' });
    const showSummary = () => {
      const doc = buildProfile(getState(), catalogs);
      summaryBox.replaceChildren(
        el('p', {}, `Пунктів БПБ: ${doc.summary.total}`),
        el('p', {}, `Автозаповнено повністю: ${doc.summary.autofilled}`),
        el('p', {}, `З порожніми параметрами: ${doc.summary.empty}`),
        el('p', {}, `Виконано архітектурно: ${doc.summary.exempted}`),
        el('p', {}, `Виключено вручну: ${doc.summary.excluded}`));
    };
    const genBtn = el('button', { type: 'button', onclick: showSummary }, 'Згенерувати профіль');
    const tplSelect = el('select', {});
    (async () => {
      const { names } = await (await fetch('/api/templates/cpb')).json();
      tplSelect.replaceChildren(option('', '— шаблон ЦПБ —'), ...names.map(n => option(n, n)));
    })();
    const tplBtn = el('button', { type: 'button', onclick: async () => {
      if (!tplSelect.value) return;
      const tpl = await (await fetch(`/api/templates/cpb/${encodeURIComponent(tplSelect.value)}`)).json();
      if (validateTemplate('cpb', tpl).length) { alert('Шаблон пошкоджено'); return; }
      setState(s => applyCpbTemplate(s, tpl));
      showSummary();
    } }, 'Застосувати шаблонний профіль безпеки (ЦПБ)');
    container.replaceChildren(el('section', {},
      el('h2', {}, 'Крок 5. Ініціація Цільового профілю безпеки'),
      el('div', { class: 'actions' }, genBtn, tplSelect, tplBtn),
      summaryBox));
    showSummary();
  },
};
```

- [ ] **Step 2: step6-verify.js**

```js
import { el } from '../render/dom.js';
import { getState, setState } from '../state.js';
import { catalogs } from '../app.js';
import { buildProfile, STATUS } from '/core/profile-engine.js';
import { enhancementsForControl, suggestionsFromRisks } from '/core/enhancement-engine.js';
import { baseRisksFor, annotateRisk } from '/core/risk-engine.js';

function acceptedAnnotatedRisks(state) {
  const accepted = new Set(state.risks.accepted_base);
  return [
    ...baseRisksFor(catalogs.threatsRisks, state.selected_assets, state.passport.as_class).filter(r => accepted.has(r.id)),
    ...state.risks.custom.map(r => annotateRisk(r, catalogs.threatsRisks.scale)),
  ];
}

function paramSpan(part) {
  if (part.type === 'text') return part.value;
  const span = el('span', { class: `param src-${part.source}`, title: part.paramId }, part.value);
  span.addEventListener('click', () => {
    const current = getState().profile.param_overrides[part.paramId] ?? (part.source === 'empty' ? '' : part.value);
    const next = prompt(`Значення параметра ${part.paramId}:`, current);
    if (next === null) return;
    setState(s => {
      const overrides = { ...s.profile.param_overrides };
      if (next.trim()) overrides[part.paramId] = next.trim(); else delete overrides[part.paramId];
      return { ...s, profile: { ...s.profile, param_overrides: overrides } };
    });
    document.dispatchEvent(new CustomEvent('profile-rerender'));
  });
  return span;
}

export const step = {
  id: 'verify', title: 'Верифікація та посилення',
  validate() { return []; },
  render(container) {
    const state = getState();
    const doc = buildProfile(state, catalogs);
    const suggestions = suggestionsFromRisks(acceptedAnnotatedRisks(state));
    const rerender = () => step.render(container);
    document.addEventListener('profile-rerender', rerender, { once: true });

    const sections = [];
    let currentClass = null;
    for (const item of doc.items) {
      if (item.classId !== currentClass) {
        currentClass = item.classId;
        sections.push(el('h3', {}, `${item.classId} — ${item.className}`));
      }
      const statusBadge = el('span', {
        class: item.status === STATUS.EXEMPT ? 'badge badge-exempt' :
               item.status === STATUS.EXCLUDED ? 'badge badge-excluded' : 'badge badge-applied' }, item.status);
      const body = [];
      if (item.status === STATUS.EXEMPT) {
        body.push(el('p', { class: 'exemption-note' }, item.exemptionNote));
        body.push(el('button', { type: 'button', onclick: () => {
          setState(s => ({ ...s, profile: { ...s.profile, exemption_overrides: [...s.profile.exemption_overrides, item.key] } }));
          rerender();
        } }, 'Застосовувати попри виняток'));
      } else if (item.status === STATUS.APPLIED) {
        for (const c of item.controls)
          for (const line of c.statementLines)
            body.push(el('p', { class: 'stmt', style: `margin-left:${line.depth * 1.5}em` },
              `${line.label} `, ...line.parts.map(paramSpan)));
        // Посилення
        for (const c of item.controls) {
          const baseId = c.id.includes('(') ? c.id.slice(0, c.id.indexOf('(')) : c.id;
          const available = enhancementsForControl(catalogs.ndTzi, baseId)
            .filter(e => !state.profile.enhancements.includes(e.id));
          const recommended = suggestions.get(baseId) ?? [];
          if (available.length) {
            const list = el('div', { class: 'enh-list', hidden: '' },
              ...available.map(e => {
                const rec = recommended.find(r => r.enhancementId === e.id);
                return el('button', { type: 'button', class: rec ? 'enh recommended' : 'enh', onclick: () => {
                  setState(s => ({ ...s, profile: { ...s.profile, enhancements: [...s.profile.enhancements, e.id] } }));
                  rerender();
                } }, rec ? `★ ${e.id} ${e.title} (рекомендовано ризиком ${rec.riskId})` : `${e.id} ${e.title}`);
              }));
            body.push(el('button', { type: 'button', onclick: () => { list.hidden = !list.hidden; } },
              `+ Додати посилення (${available.length})`), list);
          }
        }
        for (const e of item.enhancements)
          body.push(el('p', { class: 'enh-applied' }, `Посилення: ${e.id} ${e.title}`,
            el('button', { type: 'button', onclick: () => {
              setState(s => ({ ...s, profile: { ...s.profile, enhancements: s.profile.enhancements.filter(x => x !== e.id) } }));
              rerender();
            } }, '✕')));
      }
      const toggleExclude = el('button', { type: 'button', onclick: () => {
        setState(s => ({ ...s, profile: { ...s.profile,
          excluded: s.profile.excluded.includes(item.key)
            ? s.profile.excluded.filter(k => k !== item.key)
            : [...s.profile.excluded, item.key] } }));
        rerender();
      } }, item.status === STATUS.EXCLUDED ? 'Повернути' : 'Не застосовується');
      sections.push(el('article', { class: 'profile-item' },
        el('header', {}, el('strong', {}, `${item.actionNumber}. ${item.actionName}`), statusBadge, toggleExclude),
        ...body));
    }
    container.replaceChildren(el('section', {},
      el('h2', {}, `Крок 6. Верифікація (${doc.summary.total} пунктів, порожніх: ${doc.summary.empty})`),
      ...sections));
  },
};
```

- [ ] **Step 3: Ручна перевірка**

Крок 5: зведення показує 100 пунктів (service, АС-1) з ненульовими exempted. Крок 6: параметри підсвічені за джерелом; клік → prompt → значення змінюється і стає синім (override); «+ Додати посилення» розкриває список, рекомендовані від ризиків — із ★; додане посилення з'являється в пункті; «Не застосовується» перемикає статус; «Застосовувати попри виняток» повертає текст заходу.

- [ ] **Step 4: Коміт** — `git add public/js/steps/step5-generate.js public/js/steps/step6-verify.js && git commit -m "feat: wizard steps 5-6 (profile generation, verification, enhancements)"`

---

### Task 18: UI Крок 7 (Шаблони + DOCX) та наскрізна перевірка

**Files:**
- Modify: `public/js/steps/step7-export.js`

**Interfaces:**
- Consumes: `makeIcsTemplate`, `makeCpbTemplate` (`/core/template-io.js`); `buildProfile` (`/core/profile-engine.js`); серверні API (Task 13).

- [ ] **Step 1: step7-export.js**

```js
import { el } from '../render/dom.js';
import { getState } from '../state.js';
import { catalogs } from '../app.js';
import { makeIcsTemplate, makeCpbTemplate } from '/core/template-io.js';
import { buildProfile } from '/core/profile-engine.js';

async function saveTemplate(kind, tpl) {
  const name = prompt('Ім\u02BCя шаблону (літери, цифри, дефіс, підкреслення):');
  if (!name) return;
  const r = await fetch(`/api/templates/${kind}/${encodeURIComponent(name)}`, {
    method: 'POST', body: JSON.stringify(tpl) });
  const body = await r.json();
  alert(r.ok ? `Шаблон «${name}» збережено` : `Помилка: ${body.error}`);
}

export const step = {
  id: 'export', title: 'Шаблони та експорт',
  validate() { return []; },
  render(container) {
    const state = getState();
    const doc = buildProfile(state, catalogs);
    const warnings = doc.summary.empty
      ? el('p', { class: 'warn' }, `Увага: ${doc.summary.empty} пунктів мають незаповнені параметри — поверніться до Кроку 6 або експортуйте з позначкою [не визначено].`)
      : el('p', { class: 'ok' }, 'Усі параметри заповнено.');
    const exportBtn = el('button', { type: 'button', onclick: async () => {
      const r = await fetch('/api/export/docx', { method: 'POST', body: JSON.stringify({ state }) });
      if (!r.ok) { alert('Помилка експорту: ' + (await r.json()).error); return; }
      const blob = await r.blob();
      const a = el('a', { href: URL.createObjectURL(blob),
        download: decodeURIComponent(r.headers.get('Content-Disposition')?.match(/filename\*=UTF-8''(.+)/)?.[1] ?? 'профіль.docx') });
      a.click();
      URL.revokeObjectURL(a.href);
    } }, '🖨️ Експорт у DOCX');
    container.replaceChildren(el('section', {},
      el('h2', {}, 'Крок 7. Шаблонізація та Експорт'),
      warnings,
      el('div', { class: 'actions' },
        el('button', { type: 'button', onclick: () => saveTemplate('ics', makeIcsTemplate(state)) }, '💾 Зберегти як шаблон ІКС'),
        el('button', { type: 'button', onclick: () => saveTemplate('cpb', makeCpbTemplate(state)) }, '💾 Зберегти як шаблон ЦПБ'),
        exportBtn)));
  },
};
```

- [ ] **Step 2: Наскрізна ручна перевірка (чек-лист)**

1. `npm start`, чистий localStorage (DevTools → Application → Clear).
2. Крок 1: заповнити назву/орган, АС-1, дві політики (паролі 90 днів, відповідальний).
3. Крок 2: обрати АРМ, Носії, Персонал.
4. Крок 3: перевірити, що з'явились ризики лише цих активів; зняти один.
5. Крок 4: додати кастомний ризик з високим рівнем; обрати «Службова (ДСК)».
6. Крок 5: згенерувати — 100 пунктів, exempted > 0.
7. Крок 6: знайти пункт із зеленим значенням політики; додати рекомендоване посилення (★).
8. Крок 7: зберегти обидва шаблони; експортувати DOCX; відкрити файл — гриф ДСК праворуч угорі, Times New Roman 14pt, розділи 1–4 і підписи на місці, у профілі є пункт «Виконано архітектурно» з приміткою.
9. Перезапустити з чистим localStorage → Крок 1 → «Завантажити шаблон ІКС» → паспорт/політики/активи відновлені.
10. `npm test` → всі тести PASS; `node tools/validate-data.js` → OK.

- [ ] **Step 3: Фінальний коміт**

```bash
git add public/js/steps/step7-export.js
git commit -m "feat: wizard step 7 (templates persistence, DOCX export)"
```

---

## Порядок виконання та залежності

```
Task 1 (bootstrap)
 ├─ Task 2 (активи) ──┐
 ├─ Task 3 (ризики) ──┼─ Task 4 (risk-engine)
 ├─ Task 5 (policy_mapping) ─ Task 6 (policy-autofill) ─┐
 ├─ Task 7 (exemptions) ────────────────────────────────┼─ Task 8 (profile-engine)
 │                                                      ├─ Task 9 (enhancement-engine)
 │                                                      └─ Task 10 (template-io)
 ├─ Task 11 (zip) ─ Task 12 (docx-writer, потребує 8)
 └─ Task 13 (server, потребує 8/10/12) ─ Task 14 (UI shell) ─ Task 15 → 16 → 17 → 18
```
Паралелити безпечно: (2,3,5,7,11) після Task 1; (4,6) після своїх даних; 9-10 після 1.

