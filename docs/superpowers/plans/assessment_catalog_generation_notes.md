# Assessment Catalog — результат генерації

Каталог сформовано автоматично з `nd_tzi.json`.

## Покриття

- Сімейств/класів заходів захисту: **18**
- Базових заходів: **322**
- Посилень: **740**
- Усього control/enhancement entries: **1062**
- Активних control/enhancement entries: **942**
- ODP-параметрів: **1026**
- Атомарних Assessment Objectives: **1686**
- Вилучених source statements: **132**

## Що є source-derived

З `nd_tzi.json` безпосередньо взято:

- 18 security families;
- IDs, canonical IDs, titles;
- parent/enhancement structure;
- statement tree;
- ODP IDs, type, label, source_text, guideline;
- зв'язок ODP із statement через `{{ insert: param, ... }}`;
- позначки `[Вилучено: ...]`.

## Як формуються Assessment Objectives

Statement tree перетворюється у leaf-level objectives.

Якщо вимога має структуру:

```text
h.
  1.
  2.
  3.
```

генеруються окремі leaf objectives, а `source_statement` містить контекст батьківського statement + дочірнього пункту.

## Важливе обмеження

`nd_tzi.json` не містить повної нормативної методики оцінювання на кшталт
«які саме методи, кого опитувати, які конкретно докази достатні».

Тому поля:

```text
suggested_methods
suggested_evidence
```

позначені:

```text
methodology_status = DRAFT_HEURISTIC
```

Це **не нормативні твердження**. Вони створені як початковий продуктовый skeleton і повинні
бути верифіковані/замінені методологічним каталогом до production.

## Рекомендація для продукту

Не редагувати source-derived поля вручну. Якщо потрібно уточнювати методику,
додавати окремий overlay-файл, наприклад:

```text
assessment_methodology_overrides.json
```

який міститиме only:

- objective_id;
- methods;
- evidence;
- interview_roles;
- test_guidance;
- assessor_guidance;
- normative_reference.

Це дозволить повторно регенерувати catalog при оновленні `nd_tzi.json`
без втрати вручну верифікованої методики.
