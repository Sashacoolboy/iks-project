# V3: словник політик — запис даних оцінювання для подальшого аналізу

**Дата:** 2026-08-21
**Статус:** Approved

## Мета

У майстрі заповнення ЦПБ (v1) вже є накопичувальний словник реальних значень
параметрів (`core/odp-dictionary.js`, файл `dictionary/odp_dictionary.json`,
`/api/dictionary/record`) — він живить підказки автозаповнення. Модуль
оцінювання (v3) наразі в цей словник нічого не пише, хоча має унікальні дані:
реальне значення ЦПБ **плюс вердикт оцінювача**, чи це значення є валідним
трактуванням вимоги НД ТЗІ. Ця спека додає запис цих даних у **той самий**
спільний словник — для подальшого аналізу (які значення реально
використовуються, і які з них визнані валідними/невалідними оцінювачами).

## Межі

- Словник — один і той самий файл/схема, не окремий для v3.
- Розширення схеми — суто адитивне (нове необов'язкове поле `verdict_counts`
  на записі значення); існуючі виклики з v1 (без вердикту) лишаються сумісними.
- Тригер запису: одразу при зміні `result` на **ODP_DEFINITION**-рядку
  (де `assessment_source_id` однозначно відповідає одному ODP).
  STATEMENT-рядки в словник не пишуть (там один рядок може стосуватись
  кількох ODP одночасно — неоднозначно).

## 1. `core/assessment/assessment-plan.js` — прокинути semantic-мітку

У циклі побудови `odpValues` (значення вже читає `entry` з адаптера, зокрема
`entry.semantic`) додати в кожен елемент:

```js
semantic_label: entry.semantic?.label ?? null,
semantic_source_text: entry.semantic?.source_text ?? null,
```

Адитивне поле — не ламає існуючі тести (deepEqual перевіряють лише окремі
поля, не повний об'єкт).

## 2. `core/odp-dictionary.js` — вердикт у схемі

`mergeRecord(dict, { paramId, label, source_text, value, info_type, verdict })`:

- `verdict` — необов'язковий, `'VALID' | 'INVALID'`.
- На записі значення (`values[]`) додається лічильник:
  ```js
  { value, count, last_used, info_type?, verdict_counts?: { VALID: n, INVALID: n } }
  ```
- Якщо `verdict` передано — інкрементувати відповідний лічильник у
  `verdict_counts` знайденого/нового value-запису (створювати
  `verdict_counts` лише коли є хоч один вердикт — щоб не засмічувати v1-записи
  порожнім об'єктом).
- Виклики без `verdict` (v1) поводяться ідентично до сьогодні.

## 3. `server.js` — валідація вердикту

У `POST /api/dictionary/record`: якщо `rec.verdict` присутній, він має бути
`'VALID'` або `'INVALID'`, інакше 400. Якщо відсутній — як зараз (необов'язкове
поле).

## 4. Клієнт — тригер запису

В `public/js/assessment/assessment-table.js` (`patchResult`, спільна для
таблиці й, якщо буде потрібно, деталь-панелі): коли `patch.result` присутній
і `planItem.kind === 'ODP_DEFINITION'`:

1. Знайти власне значення ODP:
   `const own = planItem.odp_values.find(v => v.assessment_odp_id === planItem.assessment_source_id)`
2. Якщо `own?.target_value` не порожнє (як і в v1 — порожнє значення не
   записується):
   - `verdict`: `SATISFIED`/`PARTIALLY_SATISFIED` → `'VALID'`,
     `NOT_SATISFIED` → `'INVALID'`, інакше (`NOT_ASSESSED`/`NOT_APPLICABLE`) —
     **не викликати запис узагалі**.
   - `value`: `formatOdpValue(own.target_value)` (вже є в assessment-table.js
     для join масивів).
   - `paramId`: `own.local_odp_id`.
   - `label`/`source_text`: `own.semantic_label` / `own.semantic_source_text`
     (нове поле з п.1).
   - `info_type`: `getAssessment().metadata.info_type`.
3. Fire-and-forget: `fetch('/api/dictionary/record', { method: 'POST', body: JSON.stringify(rec) }).catch(() => {})`
   (той самий патерн, що й у `step6-verify.js`, без блокування UI й без
   обробки помилки — це фонове збагачення словника, не критичний шлях).

## Тестування

- `test/odp-dictionary.test.js`: новий тест — `mergeRecord` з `verdict: 'VALID'`
  двічі поспіль на той самий `value` → `verdict_counts.VALID === 2`; без
  вердикту — `verdict_counts` не з'являється; змішані виклики (з/без вердикту)
  на той самий paramId не ламають існуючі поля.
- `test/assessment/assessment-plan.test.js`: `semantic_label`/`semantic_source_text`
  присутні на odp_values для відомого ODP (звірити з адаптером).
- `test/server.test.js`: `POST /api/dictionary/record` з `verdict: 'BAD'` → 400;
  з `verdict: 'VALID'` → 200 і зберігається у файлі.
- Ручна e2e-перевірка: змінити result ODP_DEFINITION-рядка на "Відповідає" в
  браузері, перевірити мережевий запит і вміст `dictionary/odp_dictionary.json`.

## Поза межами цієї ітерації

- Без запису зі STATEMENT-рядків (неоднозначна прив'язка до одного ODP).
- Без окремого UI для перегляду/аналізу словника з боку оцінювача в цій
  ітерації — сам словник лишається внутрішнім накопичувальним артефактом
  (як і зараз для v1); аналіз — поза застосунком (напр. через
  `tools/analyze-dictionary.js`, який вже вміє читати цей файл).
- Без зміни `clusterQuestions`/`suggestionsFor` — вони й далі не враховують
  вердикт (це стосується лише автопідказок v1, не оцінювання).
