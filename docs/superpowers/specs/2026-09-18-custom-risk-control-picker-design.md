# Заходи захисту для кастомних ризиків: вибір з НД ТЗІ + відображення в ЦПБ

**Дата:** 2026-09-18
**Статус:** Approved

## Мета

Зараз кастомний ризик (створений вручну, без прив'язки до каталогу) має порожній
`control_refs` — користувач не може вказати, який захід захисту з НД ТЗІ покриває цю
загрозу. Мета: дати вибір базових заходів (без посилень) при створенні/редагуванні
кастомного ризику, і, якщо обраний захід ще не входить до Цільового профілю безпеки
(бо не мандований Базовим профілем для даного типу інформації), показати його прямо в
ЦПБ (Крок 4 і DOCX) — розподілено по класах/родинах, а не окремим блоком.

## Межі змін

- Схема ризику не змінюється: `control_refs` — той самий масив базових ID заходів
  (`"SC-28"`, не `"SC-28(1)"`), просто тепер керується picker'ом, а не лише
  автозаповненням з каталогу.
- Без посилень (`enhancement_suggestions`) у цьому раунді — лише базові заходи.
- `openEditRiskModal` (базові ризики, не кастомні) не чіпаємо — базові ризики вже
  мають `control_refs` з каталогу.
- Режим «З переліку» модалу додавання ризику не чіпаємо — там `control_refs`
  автозаповнюється з відповідного каталожного запису, як і зараз.
- Раніше ухвалене рішення «Реєстр ризиків більше НЕ входить у ЦПБ» лишається чинним
  для звичайних (мандованих БПБ) ризиків — сюди потрапляють ТІЛЬКИ заходи, яких немає
  в БПБ-похідному профілі й які користувач сам обрав для кастомного ризику.

## 1. `controlPicker` — спільний UI-компонент вибору заходів

Новий експорт у `public/js/risk-form.js`:

```js
export function controlPicker(ndTzi, initialIds = []) {
  // повертає { el, getSelected() }
}
```

- Плаский список усіх базових (не-посилень) заходів з `ndTzi.document.security_families[].controls[]`
  — `{ id: canonical_id, title }`, відсортований за `id`.
- `el` — контейнер: текстовий `<input>` (пошук за id та назвою, регістронезалежно,
  substring-match), під ним прокручуваний `<div>` з чекбоксами `${id} — ${title}`
  (фільтрується на кожен `input`), над списком — рядок обраних заходів як чипси
  (`<span class="badge">${id} <button>✕</button></span>`), незалежно від поточного
  фільтру пошуку.
- `getSelected()` повертає поточний масив обраних id (у порядку додавання).
- Початково позначені чекбокси/чипси — з `initialIds`.

## 2. Використання `controlPicker`

**`openRiskFormModal`, режим «Власна загроза»** (`public/js/risk-form.js`): під полем
«Вразливість» додається `el('label', {}, 'Заходи захисту (НД ТЗІ): ', picker.el)`.
При збереженні (`addManualBtn`) — `control_refs: picker.getSelected()` замість
дефолтного порожнього масиву.

**`openEditCustomRiskModal`** (`public/js/steps/step3-base-risks.js`, застосовується
до БУДЬ-ЯКОГО кастомного ризику, не лише створеного вручну): той самий picker,
`initialIds: risk.control_refs ?? []`, під полем «Залишковий ризик». При збереженні —
`control_refs: picker.getSelected()` додається до patch-об'єкта `saveCustomRiskEdit`.

## 3. `core/profile-engine.js` — обчислення `additional_controls`

У `buildProfile()`, паралельно з побудовою `items`, збирається множина
`mandatedControlIds` (усі `controlId`, що вже потрапили в `byControlId` хоч одного
action — тобто вже присутні в профілі). Після побудови `items`:

```js
const ndFamilies = catalogs.ndTzi.document.security_families;
const controlMeta = new Map(); // id -> { title, family }
for (const fam of ndFamilies)
  for (const c of fam.controls) controlMeta.set(c.canonical_id, { title: c.title, family: fam.id });

const contributingRisks = new Map(); // controlId -> Set<riskId>
for (const r of state.risks.custom)
  for (const ref of r.control_refs ?? [])
    if (!mandatedControlIds.has(ref)) {
      if (!contributingRisks.has(ref)) contributingRisks.set(ref, new Set());
      contributingRisks.get(ref).add(r.id);
    }

const additional_controls = [...contributingRisks.entries()]
  .filter(([id]) => controlMeta.has(id))
  .map(([id, riskIds]) => {
    const meta = controlMeta.get(id);
    const ndControl = nd.get(id);
    const emptyParams = [];
    const resolve = makeResolver(new Map(), emptyParams); // немає БПБ-значень — лише policy/generic/empty
    return {
      id, family: meta.family, title: meta.title,
      statementLines: statementLinesFor(ndControl, resolve),
      risk_ids: [...riskIds].sort(),
    };
  })
  .sort((a, b) => a.id.localeCompare(b.id));
```

Повертається як нове поле `buildProfile(...).additional_controls` (масив, може бути
порожнім). Без БПБ-значень параметр резолвиться так само, як порожній/невизначений
параметр деінде (`policyIndex` → `genericDefaults` → «не визначено»), консистентно з
рештою профілю.

## 4. Крок 4 (`public/js/steps/step6-verify.js`) — розподілене відображення

Для кожного `family`, представленого в `additional_controls`:

- Якщо серед `profileDoc.items` вже є class-card з `classId === family` — після
  звичайних рядків цього класу додається блок «Додатково, з реєстру ризиків»
  (невеликий заголовок) з рядком на кожен `additional_controls`, що належить цій
  родині: `id`, `title`, `statementLines` (рендер тим самим способом, що й звичайний
  захід), і under ним — `Ризики: R-013, C-002` (`risk_ids`, через кому).
- Якщо class-card для цієї родини відсутній (у профілі взагалі немає жодного пункту
  цієї родини для даного типу інформації) — рендериться новий міні-class-card
  (`${family} — ${назва родини з ndTzi.document.security_families}`) з тим самим
  «Додатково, з реєстру ризиків» блоком і без звичайних рядків над ним.
- Якщо `additional_controls` порожній — нічого не рендериться, поточна поведінка
  Кроку 4 незмінна.

## 5. DOCX (`core/docx/docx-writer.js`, `buildDocx`)

У тому самому циклі `for (const item of profileDoc.items)`, що групує рядки за
`item.classId` (де вже є перевірка `if (item.classId !== currentClass) { … push
class-header row … }`): після завершення рядків останнього `action` кожного класу
(тобто коли наступний item належить іншому класу, або після циклу для останнього
класу) — якщо для щойно завершеного `classId` є записи в `additional_controls`,
додається один рядок-розділювач («Додатково, з реєстру ризиків») і по рядку на
кожен захід (`id` + `title`, зміст заходу як звичайний statement-параграф, і окремим
курсивним рядком під ним — «Ризики: …»).

Родини, для яких у `profileDoc.items` взагалі немає жодного рядка (весь клас
відсутній для даного типу інформації), обробляються окремим проходом ПІСЛЯ основного
циклу: для кожної такої родини — новий class-header рядок (`${назва} (${family})`) +
блок «Додатково, з реєстру ризиків».

Розділ не отримує власного номера/заголовка «4. …» — це не окрема секція документа, а
рядки всередині тієї самої таблиці профілю (розділ 3), помічені міткою «додатково».
Якщо `additional_controls` порожній — жодного нового рядка в DOCX не з'являється,
`buildDocx` генерує ідентичний до сьогоднішнього документ.

## Валідація

- Нові тести в `test/profile-engine.test.js` (чи де вже є тести для `buildProfile`):
  кастомний ризик з `control_refs`, що входить у БПБ → `additional_controls` порожній;
  кастомний ризик з `control_refs`, якого немає в БПБ → зʼявляється в
  `additional_controls` з правильним `title`/`family`/`risk_ids`; два кастомні ризики
  з однаковим позабпбшним `control_refs` → один запис із двома id в `risk_ids`.
- Новий тест у `test/docx-writer.test.js`: `buildDocx` з непорожнім
  `additional_controls` → у XML є заголовок «Додатково, з реєстру ризиків», ID заходу,
  і `assert.doesNotMatch` на старому (без цього поля) вході — жодних змін у виводі.
- `npm test` без регресій.
- Ручна перевірка в браузері: додати кастомний ризик, обрати через picker захід, якого
  напевно немає в поточному БПБ (напр. рідкісна родина); перевірити Крок 4 показує
  новий блок під відповідним класом (або новий міні-class-card); експортувати DOCX,
  перевірити той самий блок і коректну навігацію (unzip + XML-перевірка).

## Поза межами цього дизайну

- Посилення (enhancements) для кастомних ризиків — лише базові заходи в цьому раунді.
- Позначення «застосовано»/«винятковано» для цих додаткових заходів (вони завжди
  показуються як застосовані — прибрати їх можна лише видаливши відповідний
  `control_ref` з ризику).
- Дедуплікація, якщо той самий control_ref одночасно і мандований БПБ, і вказаний у
  кастомному ризику — така комбінація просто не потрапляє в `additional_controls`
  (уже покрита звичайним профілем), що й потрібно.
