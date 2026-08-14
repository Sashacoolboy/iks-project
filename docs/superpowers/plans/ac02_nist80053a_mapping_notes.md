# AC-02 — mapping `nd_tzi.json` ↔ NIST SP 800-53A Rev. 5

Цей reference-файл показує, як будувати machine-readable Assessment Catalog без евристичних `suggested_methods`.

## Джерела

- `nd_tzi.json` — український control catalog, statements, enhancements та ODP.
- NIST SP 800-53A Rev. 5 — assessment objectives, potential assessment methods and objects.
- НД ТЗІ 2.7-009-09 — контекст процесу оцінювання, а не джерело control-by-control determination statements.

## Ключовий результат

Mapping по `canonical_id = AC-2` працює, але **ODP-модель не є 1:1**.

У локальному AC-02 + посиленнях: **16 ODP**.

NIST 800-53A на рівні assessment determination statements має додаткові ODP, які у локальному каталозі:
- інколи перетворені на статичні вимоги;
- інколи об'єднані в один ODP;
- інколи hardcoded;
- інколи відсутні як параметр, хоча семантика вимоги збережена.

Тому Assessment Engine не повинен робити mapping за номером ODP. Він повинен використовувати окремий семантичний mapping table.

## Mapping statuses

- `EXACT_SEMANTIC` — значення можна напряму брати з відповідного local ODP.
- `MERGED_LOCAL_ODP` — кілька NIST ODP використовують одне local ODP.
- `LOCAL_STATIC_REQUIREMENT` — NIST параметризує значення, але local control містить його як статичну вимогу.
- `LOCAL_RESTRICTED_STATIC` — локальна вимога вужча та зафіксована текстом.
- `LOCAL_STATIC_IMMEDIATE` — локальний текст задає дію без окремого time-period ODP.
- `LOCAL_HARDCODED_SELECTION` — NIST дозволяє selection, local control зафіксував один варіант.

## Product implication

Runtime Assessment Item формується так:

```text
local control statement
+ resolved local ODP values from CPB
+ NIST assessment methods/objects
+ NIST determination granularity
= assessment item shown to assessor
```

NIST determination ID треба зберігати як provenance/traceability, але користувачу можна показувати український resolved statement.

## Наступний крок

Після затвердження AC-02 mapping цей самий mapper можна масштабувати на всі `canonical_id` в `nd_tzi.json`, автоматично позначаючи:
- `DIRECT`;
- `PARAMETER_MISMATCH`;
- `LOCAL_STATIC`;
- `WITHDRAWN`;
- `MAPPING_REVIEW_REQUIRED`.
