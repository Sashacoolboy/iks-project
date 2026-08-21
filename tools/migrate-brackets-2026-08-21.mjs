// Міграція: екстракція сирих [Призначення:/Вибір:/Завдання:] у параметри nd_tzi,
// ремонт розірваних item-структур, синхронні записи в адаптер і generic defaults.
// Запуск: node /tmp/migrate-brackets.mjs [--apply]
import { readFile, writeFile } from 'node:fs/promises';

const APPLY = process.argv.includes('--apply');
const ROOT = '/Users/alexbuchkivskii/Documents/offline-profile/';
const read = async (p) => JSON.parse(await readFile(ROOT + p, 'utf8'));

const nd = await read('data/nd_tzi.json');
const adapter = await read('data/assessment/assessment_odp_adapter.json');
const defaults = await read('data/generic_parameter_defaults.json');
const source = await read('data/ASSESSMENT_SOURCES/ndtzi36006(1).json');

// ---------- Таблиця правок ----------
// merge: злити unlabeled-хвіст у попередній item (діти хвоста стають сиблінгами)
// sub:   заміна підрядка у тексті item-а (рівно 1 входження в межах контролу)
// param: додати параметр до nd_tzi
// verified: nist_traceability для нового ODP (дефолт UNRESOLVED)
const EDITS = [
  { id: 'AC-03(03)', ops: [
    { sub: ['Застосовувати [Призначення: визначену організацією мандатну (mandatory) політику управління доступом] щодо', 'Застосовувати {{ insert: param, ac-3.3_odp.03 }} щодо'] },
  ], params: [{ id: 'ac-3.3_odp.03', label: 'визначену організацією мандатну (mandatory) політику управління доступом' }] },

  { id: 'AC-03(08)', ops: [
    { sub: ['на основі [Призначення: визначених організацією правил, що регулюють терміни скасування прав доступу].', 'на основі {{ insert: param, ac-3.8_odp.01 }}.'] },
  ], params: [{ id: 'ac-3.8_odp.01', label: 'визначених організацією правил, що регулюють терміни скасування прав доступу', verified: ['AC-03(08)_ODP'] }] },

  { id: 'AC-04(04)', ops: [{ sub: ['ac-4.4_odp.02 }}].', 'ac-4.4_odp.02 }}.'] }] },

  { id: 'AC-04(06)', ops: [
    { merge: 'визначених організацією метаданих].' },
    { sub: ['на основі [Призначення: визначених організацією метаданих].', 'на основі {{ insert: param, ac-4.6_odp.01 }}.'] },
  ], params: [{ id: 'ac-4.6_odp.01', label: 'визначених організацією метаданих', verified: ['AC-04(06)_ODP'] }] },

  { id: 'AC-04(25)', ops: [{ sub: ['ac-4.25_odp.02 }}].', 'ac-4.25_odp.02 }}.'] }] },

  { id: 'AC-10', ops: [
    { merge: 'визначеної організацією кількості].' },
    { sub: ['до [Призначення: визначеної організацією кількості].', 'до {{ insert: param, ac-10_odp.02 }}.'] },
  ], params: [{ id: 'ac-10_odp.02', label: 'визначеної організацією кількості', verified: ['AC-10_ODP[02]'] }] },

  { id: 'AC-16(01)', ops: [
    { sub: ['з [Призначенням: визначеними організацією суб’єктами й об’єктами] відповідно', 'з {{ insert: param, ac-16.1_odp.01 }} відповідно'] },
    { sub: ['до [Призначення: визначених організацією політик безпеки та приватності], у міру', 'до {{ insert: param, ac-16.1_odp.02 }}, у міру'] },
  ], params: [
    { id: 'ac-16.1_odp.01', label: 'визначеними організацією суб’єктами й об’єктами' },
    { id: 'ac-16.1_odp.02', label: 'визначених організацією політик безпеки та приватності' },
  ] },

  { id: 'AC-16(03)', ops: [
    { sub: ['цілісність [Призначення: визначених організацією атрибутів безпеки та приватності] з', 'цілісність {{ insert: param, ac-16.3_odp.01 }} з'] },
    { sub: ['з [Призначення: визначених організацією суб’єктів і об’єктів].', 'з {{ insert: param, ac-16.3_odp.02 }}.'] },
  ], params: [
    { id: 'ac-16.3_odp.01', label: 'визначених організацією атрибутів безпеки та приватності' },
    { id: 'ac-16.3_odp.02', label: 'визначених організацією суб’єктів і об’єктів' },
  ] },

  { id: 'AC-16(05)', ops: [
    { sub: ['ідентифікувати [Призначення: визначені організацією спеціальні інструкції щодо поширення, обробки чи наступного розподілу інформації], використовуючи', 'ідентифікувати {{ insert: param, ac-16.5_odp.01 }}, використовуючи'] },
    { sub: ['використовуючи [Призначення: визначену організацією ідентифікацію, у зручній для людини формі про стандартні угоди про присвоєння імен].', 'використовуючи {{ insert: param, ac-16.5_odp.02 }}.'] },
  ], params: [
    { id: 'ac-16.5_odp.01', label: 'визначені організацією спеціальні інструкції щодо поширення, обробки чи наступного розподілу інформації' },
    { id: 'ac-16.5_odp.02', label: 'визначену організацією ідентифікацію, у зручній для людини формі про стандартні угоди про присвоєння імен' },
  ] },

  { id: 'AC-16(06)', ops: [
    { sub: ['асоціацію [Призначення: визначених організацією атрибутів безпеки та приватності] з', 'асоціацію {{ insert: param, ac-16.6_odp.01 }} з'] },
    { sub: ['з [Призначенням: визначеними організацією суб’єктами та об’єктами] відповідно', 'з {{ insert: param, ac-16.6_odp.02 }} відповідно'] },
    { sub: ['до [Призначення: визначеної організацією політики безпеки та приватності].', 'до {{ insert: param, ac-16.6_odp.03 }}.'] },
  ], params: [
    { id: 'ac-16.6_odp.01', label: 'визначених організацією атрибутів безпеки та приватності' },
    { id: 'ac-16.6_odp.02', label: 'визначеними організацією суб’єктами та об’єктами' },
    { id: 'ac-16.6_odp.03', label: 'визначеної організацією політики безпеки та приватності' },
  ] },

  { id: 'AC-16(09)', ops: [
    { sub: ['використанням [Призначення: визначених організацією технік або процедур].', 'використанням {{ insert: param, ac-16.9_odp.01 }}.'] },
  ], params: [{ id: 'ac-16.9_odp.01', label: 'визначених організацією технік або процедур', verified: ['AC-16(09)_ODP[01]'] }] },

  { id: 'AT-04', ops: [
    { sub: ['впродовж [Призначення: визначеного організацією періоду часу].', 'впродовж {{ insert: param, at-4_odp.01 }}.'] },
  ], params: [{ id: 'at-4_odp.01', label: 'визначеного організацією періоду часу', verified: ['AT-04_ODP'] }] },

  { id: 'AU-06(05)', ops: [{ sub: ['au-6.5_odp.01 }}] для', 'au-6.5_odp.01 }} для'] }] },
  { id: 'CA-02(02)', ops: [{ sub: ['ca-2.2_odp.03 }}].', 'ca-2.2_odp.03 }}.'] }] },

  { id: 'CA-05(01)', ops: [
    { merge: 'механізми, визначені організацією].' },
    { sub: ['за допомогою [Завдання: автоматизовані механізми, визначені організацією].', 'за допомогою {{ insert: param, ca-5.1_odp.01 }}.'] },
  ], params: [{ id: 'ca-5.1_odp.01', label: 'автоматизовані механізми, визначені організацією', source: '[Завдання: автоматизовані механізми, визначені організацією]', verified: ['CA-05(01)_ODP'] }] },

  { id: 'CA-09', ops: [
    { sub: ['після [Призначення: умови, визначені організацією];', 'після {{ insert: param, ca-9_odp.03 }};'] },
  ], params: [{ id: 'ca-9_odp.03', label: 'умови, визначені організацією' }] },

  { id: 'CM-01', ops: [
    { sub: ['серед [Призначення: визначених організацією персоналу або ролей]:', 'серед {{ insert: param, cm-1_odp.07 }}:'] },
  ], params: [{ id: 'cm-1_odp.07', label: 'визначених організацією персоналу або ролей' }] },

  { id: 'CM-07(02)', ops: [
    { sub: ['cm-7.2_odp.01 }}; правил, що встановлюють терміни та умови використання програмного забезпечення].', 'cm-7.2_odp.01 }}.'] },
  ] },

  { id: 'IA-04(03)', ops: [{ sub: ['Включено до ІА-12(2)].', 'Включено до ІА-12(2).'] }] },

  { id: 'IA-04(04)', ops: [
    { merge: 'ідентифікує індивідуальний статус].' },
    { sub: ['як [Призначення: визначена організацією ознака, що ідентифікує індивідуальний статус].', 'як {{ insert: param, ia-4.4_odp.01 }}.'] },
  ], params: [{ id: 'ia-4.4_odp.01', label: 'визначена організацією ознака, що ідентифікує індивідуальний статус', verified: ['IA-04(04)_ODP'] }] },

  { id: 'MA-02', ops: [
    { sub: ['Вносити [Призначення: визначену організацією інформацію, пов’язану з технічним обслуговуванням] до', 'Вносити {{ insert: param, ma-2_odp.02 }} до'] },
  ], params: [{ id: 'ma-2_odp.02', label: 'визначену організацією інформацію, пов’язану з технічним обслуговуванням' }] },

  { id: 'MA-06(02)', ops: [
    { merge: 'часові інтервали].' },
    { sub: ['у [Призначення: визначені організацією часові інтервали].', 'у {{ insert: param, ma-6.2_odp.02 }}.'] },
  ], params: [{ id: 'ma-6.2_odp.02', label: 'визначені організацією часові інтервали', verified: ['MA-06(02)_ODP[02]'] }] },

  { id: 'MP-06(03)', ops: [
    { merge: 'вимагають очищення портативних запам’ятовувальних пристроїв].' },
    { sub: ['обставин: [Призначення: визначених організацією умов, що вимагають очищення портативних запам’ятовувальних пристроїв].', 'обставин: {{ insert: param, mp-6.3_odp.01 }}.'] },
  ], params: [{ id: 'mp-6.3_odp.01', label: 'визначених організацією умов, що вимагають очищення портативних запам’ятовувальних пристроїв', verified: ['MP-06(03)_ODP'] }] },

  { id: 'PE-02(03)', ops: [{ sub: ['pe-2.3_odp.01 }}].', 'pe-2.3_odp.01 }}.'] }] },

  { id: 'PE-10', ops: [
    { sub: ['в [Призначення: визначені організацією місця розташування в системі або в компоненті системи] для', 'в {{ insert: param, pe-10_odp.01 }} для'] },
  ], params: [{ id: 'pe-10_odp.01', label: 'визначені організацією місця розташування в системі або в компоненті системи', verified: ['PE-10_ODP[01]'] }] },

  { id: 'PE-21', ops: [
    { merge: 'систем].' },
    { sub: ['Використовувати{{ insert: param, pe-21_odp.01 }}проти', 'Використовувати {{ insert: param, pe-21_odp.01 }} проти'] },
    { sub: ['для [Призначення: визначених організацією систем].', 'для {{ insert: param, pe-21_odp.02 }}.'] },
  ], params: [{ id: 'pe-21_odp.02', label: 'визначених організацією систем', verified: ['PE-21_ODP[02]'] }] },

  { id: 'RA-06', ops: [{ sub: ['ra-6_odp.02 }}].', 'ra-6_odp.02 }}.'] }] },

  { id: 'RA-10', ops: [
    { sub: ['загроз [Призначення: частота, визначена організацією].', 'загроз {{ insert: param, ra-10_odp.01 }}.'] },
  ], params: [{ id: 'ra-10_odp.01', label: 'частота, визначена організацією', verified: ['RA-10_ODP'] }] },

  { id: 'SA-04', ops: [
    { sub: ['використовуючи [Вибір (один або більше): стандартні пункти контракту; [Призначення: пункти контракту, визначені організацією]] в контракті', 'використовуючи {{ insert: param, sa-4_odp.01 }} в контракті'] },
  ], params: [{ id: 'sa-4_odp.01', type: 'selection', label: 'стандартні пункти контракту; пункти контракту, визначені організацією', source: '[Вибір (один або більше): стандартні пункти контракту; [Призначення: пункти контракту, визначені організацією]]', verified: ['SA-04_ODP[01]'] }] },

  { id: 'SA-04(02)', ops: [{ sub: ['sa-4.2_odp.01 }}] на', 'sa-4.2_odp.01 }} на'] }] },

  { id: 'SA-09(02)', ops: [
    { sub: ['системи [Призначення: визначених організацією зовнішніх послуг для системи] визначити', 'системи {{ insert: param, sa-9.2_odp.01 }} визначити'] },
  ], params: [{ id: 'sa-9.2_odp.01', label: 'визначених організацією зовнішніх послуг для системи' }] },

  { id: 'SA-11', ops: [
    { sub: ['тестування/оцінювання [Призначення: з визначеною організацією частотою] з', 'тестування/оцінювання {{ insert: param, sa-11_odp.03 }} з'] },
  ], params: [{ id: 'sa-11_odp.03', label: 'з визначеною організацією частотою' }] },

  { id: 'SC-06', ops: [{ sub: ['sc-6_odp.02 }}].', 'sc-6_odp.02 }}.'] }] },
  { id: 'SC-07(05)', ops: [{ sub: ['sc-7.5_odp.01 }}].', 'sc-7.5_odp.01 }}.'] }] },

  { id: 'SC-08(01)', ops: [
    { merge: 'інформації] під час передачі.' },
    { sub: ['для [Вибір (один або більше): запобіганнянесанкціонованомурозкриттюінформації;виявузмінив інформації] під час передачі.', 'для {{ insert: param, sc-8.1_odp.01 }} під час передачі.'] },
  ], params: [{ id: 'sc-8.1_odp.01', type: 'selection', label: 'запобігання несанкціонованому розкриттю інформації; вияв змін в інформації', source: '[Вибір (один або більше): запобігання несанкціонованому розкриттю інформації; вияв змін в інформації]' }] },

  { id: 'SC-12(03)', ops: [
    { merge: 'процеси управління ключами;' },
    { sub: ['використовуючи [Вибір: затверджені уповноваженим органом технології та процеси управління ключами; посилені сертифікати відкритого ключа; попередньо визначений «ключовий» матеріал; кваліфіковані сертифікати відкритого ключа та надійні апаратні засоби цифрового підпису (токени), які захищають особистий ключ користувача; сертифікати, видані відповідно до визначених організацією вимог].', 'використовуючи {{ insert: param, sc-12.3_odp.01 }}.'] },
  ], params: [{ id: 'sc-12.3_odp.01', type: 'selection', label: 'затверджені уповноваженим органом технології та процеси управління ключами; посилені сертифікати відкритого ключа; попередньо визначений «ключовий» матеріал; кваліфіковані сертифікати відкритого ключа та надійні апаратні засоби цифрового підпису (токени), які захищають особистий ключ користувача; сертифікати, видані відповідно до визначених організацією вимог', verified: ['SC-12(03)_ODP'] }] },

  { id: 'SC-30(03)', ops: [
    { sub: ['sc-30.3_odp.02 }}; випадкових часових інтервалах]].', 'sc-30.3_odp.02 }}.'] },
  ] },

  { id: 'SI-07(01)', ops: [{ sub: ['si-7.1_odp.03 }}].', 'si-7.1_odp.03 }}.'] }] },
  { id: 'SI-07(05)', ops: [{ sub: ['si-7.5_odp.01 }}], коли', 'si-7.5_odp.01 }}, коли'] }] },
  { id: 'SI-07(08)', ops: [{ sub: ['si-7.8_odp.02 }}].', 'si-7.8_odp.02 }}.'] }] },

  { id: 'SI-08(02)', ops: [
    { sub: ['спаму [Призначення: з визначеною організацією частотою].', 'спаму {{ insert: param, si-8.2_odp.01 }}.'] },
  ], params: [{ id: 'si-8.2_odp.01', label: 'з визначеною організацією частотою', verified: ['SI-08(02)_ODP'] }] },

  { id: 'SI-14', ops: [{ sub: ['si-14_odp.02 }}].', 'si-14_odp.02 }}.'] }] },

  { id: 'SI-23', ops: [
    { sub: ['обставини, визначені організацією]:', 'На основі {{ insert: param, si-23_odp.03 }}:'] },
  ], params: [{ id: 'si-23_odp.03', label: 'обставини, визначені організацією' }] },

  { id: 'SR-03', ops: [
    { merge: 'визначена організацією система або компонент системи] у координації' },
    { sub: ['постачання [Призначення: визначена організацією система або компонент системи] у координації', 'постачання {{ insert: param, sr-3_odp.04 }} у координації'] },
    { sub: ['sr-3_odp.03 }}].', 'sr-3_odp.03 }}.'] },
  ], params: [{ id: 'sr-3_odp.04', label: 'визначена організацією система або компонент системи' }] },

  { id: 'SR-04', ops: [
    { sub: ['даних: [Призначення: системи, визначені організацією, системні компоненти та пов’язані дані].', 'даних: {{ insert: param, sr-4_odp.01 }}.'] },
  ], params: [{ id: 'sr-4_odp.01', label: 'системи, визначені організацією, системні компоненти та пов’язані дані', verified: ['SR-04_ODP'] }] },

  { id: 'SR-08', ops: [{ sub: ['sr-8_odp.01 }}].', 'sr-8_odp.01 }}.'] }] },
  { id: 'SR-10', ops: [{ sub: ['sr-10_odp.02 }}] для', 'sr-10_odp.02 }} для'] }] },

  // чистка висячих ] після раніше екстрагованих параметрів
  { id: 'AC-07', ops: [{ sub: ['ac-7_odp.05 }}], коли', 'ac-7_odp.05 }}, коли'] }] },
  { id: 'AC-20', ops: [{ sub: ['ac-20_odp.02 }}], узгоджені', 'ac-20_odp.02 }}, узгоджені'] }] },
  { id: 'CA-03', ops: [{ sub: ['ca-3_odp.01 }}];.', 'ca-3_odp.01 }};'] }] },
  { id: 'CM-03', ops: [{ sub: ['cm-3_odp.04 }}].', 'cm-3_odp.04 }}.'] }] },
  { id: 'CM-08(03)', ops: [{ sub: ['cm-8.3_odp.03 }}].', 'cm-8.3_odp.03 }}.'] }] },
  { id: 'RA-03', ops: [{ sub: ['ra-3_odp.01 }}].', 'ra-3_odp.01 }}.'] }] },
  { id: 'SA-15(01)', ops: [{ sub: ['після постачання].', 'після постачання.'] }] },
  { id: 'SA-22', ops: [{ sub: ['sa-22_odp.01 }}].', 'sa-22_odp.01 }}.'] }] },
  { id: 'SI-06', ops: [{ sub: ['si-6_odp.05 }}], коли', 'si-6_odp.05 }}, коли'] }] },
  { id: 'SI-13(04)', ops: [{ sub: ['si-13.4_odp.03 }}].', 'si-13.4_odp.03 }}.'] }] },
  { id: 'SR-11', ops: [{ sub: ['sr-11_odp.02 }}].', 'sr-11_odp.02 }}.'] }] },
];

// ---------- Реалізація ----------
const errors = [];
const nodeById = new Map();
for (const fam of nd.document.security_families)
  for (const c of fam.controls)
    for (const n of [c, ...(c.children ?? [])]) nodeById.set(n.id, n);

function mergeTail(node, tailStart) {
  const items = node.catalog.statement.items;
  const walk = (arr) => {
    for (let i = 0; i < arr.length; i++) {
      const it = arr[i];
      if (it.label === null && it.marker_type === 'unlabeled' && it.text.startsWith(tailStart) && i > 0) {
        arr[i - 1].text = arr[i - 1].text.replace(/\s*$/, '') + ' ' + it.text;
        const lifted = it.children ?? [];
        arr.splice(i, 1, ...lifted);
        return true;
      }
      if (walk(it.children ?? [])) return true;
    }
    return false;
  };
  return walk(items);
}

function subText(node, find, replace) {
  let count = 0;
  const walk = (arr) => {
    for (const it of arr) {
      if (it.text.includes(find)) { it.text = it.text.replace(find, replace); count++; }
      walk(it.children ?? []);
    }
  };
  walk(node.catalog.statement.items);
  return count;
}

for (const edit of EDITS) {
  const node = nodeById.get(edit.id);
  if (!node) { errors.push(`${edit.id}: не знайдено в nd_tzi`); continue; }
  for (const op of edit.ops) {
    if (op.merge) {
      if (!mergeTail(node, op.merge)) errors.push(`${edit.id}: merge не спрацював: ${op.merge.slice(0, 50)}`);
    } else if (op.sub) {
      const n = subText(node, op.sub[0], op.sub[1]);
      if (n !== 1) errors.push(`${edit.id}: sub x${n} (очікував 1): ${op.sub[0].slice(0, 60)}`);
    }
  }
  for (const p of edit.params ?? []) {
    node.catalog.parameters.push({
      id: p.id, type: p.type ?? 'assignment', label: p.label,
      source_text: p.source ?? `[Призначення: ${p.label}]`, guideline: p.label, used_in: [],
    });
  }
}

// Перевірка: жодних сирих дужок і плейсхолдер існує для кожного параметра
for (const [id, node] of nodeById) {
  const check = (arr) => {
    for (const it of arr) {
      if (/\[(Призначення|Призначенням|Вибір|ВИБІР|Завдання)\b/.test(it.text)) errors.push(`${id}: лишилась сира дужка: ${it.text.slice(0, 80)}`);
      const opens = (it.text.match(/\[/g) ?? []).length, closes = (it.text.match(/\]/g) ?? []).length;
      if (opens !== closes) errors.push(`${id}: незбалансовані дужки (${opens}/${closes}): ${it.text.slice(0, 80)}`);
      check(it.children ?? []);
    }
  };
  check(node.catalog?.statement?.items ?? []);
  for (const p of node.catalog?.parameters ?? []) {
    const used = JSON.stringify(node.catalog.statement).includes(`{{ insert: param, ${p.id} }}`);
    if (!used) errors.push(`${id}: параметр ${p.id} не використаний у statement`);
  }
}

// ---------- Адаптер ----------
const famTitle = new Map(adapter.controls.map(c => [c.family, c.family_title]));
const srcByPk = new Map(source.map(r => [r.pk, r]));
const parseSel = (t) => { const m = String(t ?? '').trim().match(/^\[ВИБІР:\s*([\s\S]*?)\]\.?$/); return m ? [String(t).trim()] : (t ? [String(t).trim()] : []); };

function findUsage(node, paramId) {
  const out = [];
  const walk = (arr) => {
    for (const it of arr) {
      if (it.text.includes(`{{ insert: param, ${paramId} }}`)) {
        const seg = it.label ? it.label.replace(/[^\p{L}\p{N}]/gu, '') : '1';
        out.push({ statement_path: seg, text: it.text, context: it.text });
      }
      walk(it.children ?? []);
    }
  };
  walk(node.catalog.statement.items);
  return out;
}

let newEntries = 0, newControls = 0, newVerifiedIds = 0;
for (const edit of EDITS) {
  if (!(edit.params ?? []).length) continue;
  const node = nodeById.get(edit.id);
  let actrl = adapter.controls.find(c => c.control_id === edit.id);
  if (!actrl) {
    actrl = {
      control_id: node.id, canonical_control_id: node.canonical_id, family: node.family,
      family_title: famTitle.get(node.family) ?? '', title: node.title, enhancement: node.enhancement,
      assessment_odp_count: 0, assessment_odps: [],
    };
    const mref = {};
    for (const [key, pfx] of [['EXAMINE', 'E-'], ['INTERVIEW', 'I-'], ['TEST', 'T-']]) {
      const rec = srcByPk.get(pfx + node.id);
      if (rec?.fields?.text) mref[key] = [rec.fields.text];
    }
    if (Object.keys(mref).length) actrl.assessment_methods_reference = mref;
    // вставка за порядком: після останнього контролу тієї ж родини, що передує за id
    const norm = (s) => s.replace(/\((\d+)\)/g, (_, d) => `(${d.padStart(2, '0')})`);
    let idx = adapter.controls.length;
    for (let i = 0; i < adapter.controls.length; i++)
      if (adapter.controls[i].family === node.family && norm(adapter.controls[i].control_id) > norm(node.id)) { idx = i; break; }
      else if (adapter.controls[i].family === node.family) idx = i + 1;
    adapter.controls.splice(idx, 0, actrl);
    newControls++;
  }
  for (const p of edit.params) {
    const total = node.catalog.parameters.length;
    const ordinal = actrl.assessment_odps.length + 1;
    const aid = total === 1 ? `${node.id}_ODP` : `${node.id}_ODP[${String(node.catalog.parameters.findIndex(x => x.id === p.id) + 1).padStart(2, '0')}]`;
    const usage = findUsage(node, p.id);
    if (!usage.length) { errors.push(`${edit.id}: немає usage для ${p.id}`); continue; }
    const param = node.catalog.parameters.find(x => x.id === p.id);
    actrl.assessment_odps.push({
      assessment_odp_id: aid, local_odp_id: p.id, ordinal,
      semantic: { label: param.label, source_text: param.source_text, guideline: param.guideline },
      statement_usage: usage,
      binding: { type: 'DIRECT_LOCAL_ODP', cpb_ref: p.id },
      bpb_bindings: { open_confidential: [], service: [] },
      nist_traceability: p.verified ? { status: 'VERIFIED', odp_ids: p.verified } : { status: 'UNRESOLVED', odp_ids: [] },
    });
    actrl.assessment_odp_count = actrl.assessment_odps.length;
    newEntries++;
    if (p.verified) newVerifiedIds += p.verified.length;
  }
}

// статистика
let entTotal = 0, verified = 0, unresolved = 0; const ctrlSet = new Set();
for (const c of adapter.controls) for (const e of c.assessment_odps ?? []) {
  entTotal++; ctrlSet.add(c.control_id);
  if (e.nist_traceability?.status === 'VERIFIED') verified++; else unresolved++;
}
adapter.statistics = { controls_with_local_odp: ctrlSet.size, local_odp_total: entTotal,
  nist_traceability_status: { VERIFIED: verified, UNRESOLVED: unresolved } };

// ---------- Generic defaults ----------
const grp = (label) => /персонал|ролей|ролями/i.test(label) ? 'GEN_PERSONNEL_ROLE'
  : /частот/i.test(label) ? 'GEN_FREQUENCY'
  : /період|часові інтервали/i.test(label) ? 'GEN_TIME_PERIOD' : 'GEN_OTHER';
let newDefaults = 0;
for (const edit of EDITS) {
  const node = nodeById.get(edit.id);
  for (const p of edit.params ?? []) {
    if (defaults.parameters[p.id]) continue;
    const g = grp(p.label);
    defaults.parameters[p.id] = {
      controlId: node.canonical_id, guideline: p.label, formGroup: g,
      defaultValue: g === 'GEN_PERSONNEL_ROLE' ? 'Адміністратор безпеки' : null,
      requiresInput: g !== 'GEN_PERSONNEL_ROLE', options: null,
    };
    newDefaults++;
  }
}

// ---------- Підсумок ----------
console.log(`edits: ${EDITS.length} controls | new params: ${newEntries} | new adapter controls: ${newControls} | new defaults: ${newDefaults}`);
console.log(`adapter stats: total=${entTotal} verified=${verified} unresolved=${unresolved} controls=${ctrlSet.size} | new VERIFIED nist ids: ${newVerifiedIds}`);
if (errors.length) { console.log('\nERRORS:'); for (const e of errors) console.log(' -', e); process.exit(1); }

if (APPLY) {
  await writeFile(ROOT + 'data/nd_tzi.json', JSON.stringify(nd, null, 2));
  await writeFile(ROOT + 'data/assessment/assessment_odp_adapter.json', JSON.stringify(adapter, null, 2));
  await writeFile(ROOT + 'data/generic_parameter_defaults.json', JSON.stringify(defaults, null, 2) + '\n');
  console.log('APPLIED');
} else {
  // dry-run: показати відремонтовані тексти
  for (const edit of EDITS) {
    const node = nodeById.get(edit.id);
    console.log(`\n### ${edit.id}`);
    const dump = (arr, ind) => { for (const it of arr) { console.log(`${ind}[${it.label ?? '∅'}] ${it.text}`); dump(it.children ?? [], ind + '  '); } };
    dump(node.catalog.statement.items, '');
  }
  console.log('\nDRY RUN — нічого не записано');
}
