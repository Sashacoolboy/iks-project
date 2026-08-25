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
  const controls = order.map(id => byId.get(id));
  applyManualCorrections(controls);
  return {
    schema: { id: 'ua.ics.assessment-reference', version: '1.0.0', language: 'uk', source: 'ndtzi36006(1).json' },
    families,
    controls,
  };
}

// The raw import (ndtzi36006(1).json) merges some paragraphs' determination
// text into a single sibling record (e.g. "AC-02с" or "CM-6(a)" markers
// embedded mid-sentence in another paragraph's `text`). Each correction below
// trims the donor record back to its own paragraph and splits out the
// genuinely-missing paragraph(s) as new determinations, so the compiled
// catalog covers every paragraph present in the ND TZI norm text. See
// data/assessment/assessment_catalog.json gap audit (2026-08) for the
// per-control source quotes that justify each split.
function applyManualCorrections(controls) {
  const byControlId = new Map(controls.map(c => [c.control_id, c]));

  const trim = (controlId, code, newText) => {
    const ctrl = byControlId.get(controlId);
    const det = ctrl?.determinations.find(d => d.code === code);
    if (det) det.text = newText;
  };
  const insertAfter = (controlId, afterCode, newDet) => {
    const ctrl = byControlId.get(controlId);
    if (!ctrl) return;
    const idx = ctrl.determinations.findIndex(d => d.code === afterCode);
    if (idx === -1) return;
    ctrl.determinations.splice(idx + 1, 0, newDet);
  };
  const append = (controlId, newDets) => {
    const ctrl = byControlId.get(controlId);
    if (ctrl) ctrl.determinations.push(...newDets);
  };

  // AC-02.c: merged into AC-02b's text.
  trim('AC-02', 'AC-02b', 'призначені менеджери облікових записів;');
  insertAfter('AC-02', 'AC-02b', {
    code: 'AC-02c',
    text: 'необхідні <AC-02_ODP[01] умови та критерії> для членства в групах та ролях;',
  });

  // CM-06.a/.b/.c[01]/.c[02]/.d[01]/.d[02]: merged into CM-06_ODP[03]'s text.
  trim('CM-06', 'CM-06_ODP[03]', 'визначені експлуатаційні вимоги, що вимагають затвердження відхилень;');
  append('CM-06', [
    {
      code: 'CM-06a',
      text: 'налаштування конфігурації, які відображають найбільш обмежувальний режим, що відповідає експлуатаційним вимогам, встановлені та задокументовані для компонентів, що застосовуються в системі з використанням <CM-06_ODP[01] безпечні конфігурації>;',
    },
    { code: 'CM-06b', text: 'реалізовано установки конфігурації, задокументовані в CM-06a;' },
    {
      code: 'CM-06c.[01]',
      text: 'будь-які відхилення від встановлених параметрів конфігурації для <CM-06_ODP[02] компонентів системи> визначаються та документуються на основі <CM-06_ODP[03] експлуатаційних вимог>;',
    },
    {
      code: 'CM-06c.[02]',
      text: 'будь-які відхилення від встановлених налаштувань конфігурації для <CM-06_ODP[02] компонентів системи> затверджуються;',
    },
    {
      code: 'CM-06d.[01]',
      text: 'зміни в налаштуваннях конфігурації відстежуються відповідно до політики та процедур організації;',
    },
    {
      code: 'CM-06d.[02]',
      text: 'зміни налаштувань конфігурації керуються відповідно до політики та процедур організації.',
    },
  ]);

  // CP-09.c: merged into CP-09(b)'s text.
  trim('CP-09', 'CP-09(b)', 'виконується резервне копіювання інформації системи, що міститься в системі <CP-09_ODP[03] частота>;');
  insertAfter('CP-09', 'CP-09(b)', {
    code: 'CP-09(c)',
    text: "створюються резервні копії документації системи, включаючи документацію, пов'язану з безпекою та конфіденційністю <CP-09_ODP[04] частота>;",
  });

  // PE-17.a/.b/.c/.d: merged into PE-17_ODP[02]'s text.
  trim('PE-17', 'PE-17_ODP[02]', 'визначаються заходи захисту, які будуть застосовуватися на альтернативних робочих місцях;');
  append('PE-17', [
    { code: 'PE-17a', text: '<PE-17_ODP[01] альтернативні робочі місця> визначені та задокументовані;' },
    { code: 'PE-17b', text: '<PE-17_ODP[02] заходи захисту> впроваджені на альтернативних робочих місцях;' },
    { code: 'PE-17c', text: 'оцінюється ефективність заходів захисту на альтернативних робочих місцях;' },
    {
      code: 'PE-17d',
      text: 'працівникам надаються засоби комунікації з персоналом служби інформаційної безпеки на випадок інцидентів.',
    },
  ]);

  // AC-20.a/.b: not present as standalone determinations in the source at all;
  // added as separate rows per explicit request, derived from the closely
  // related ODP determination text (AC-20_ODP[01] and AC-20_ODP[04]).
  append('AC-20', [
    {
      code: 'AC-20a',
      text: 'вибрано одне або більше з наступних значень параметрів: {встановити <AC-20_ODP[02] умови та положення>; визначити <AC-20_ODP[03] заходи захисту>}, узгоджені з довірчими відносинами, встановленими з іншими організаціями, які володіють, експлуатують та/або обслуговують зовнішні системи;',
    },
    { code: 'AC-20b', text: 'заборонено використання <AC-20_ODP[04] типів зовнішніх систем>;' },
  ]);

  // The paragraphs below have NO determinationcontrol record at all anywhere
  // in the raw source (not even merged into a sibling) — the raw import simply
  // never captured them. Text is derived either from the ND TZI norm statement
  // itself (data/nd_tzi.json), rephrased in the same declarative "виконано X"
  // voice used throughout this catalog, or — where ODP placeholders are
  // involved — from data/assessment/assessment_odp_adapter.json's semantic
  // labels (itself derived from the ODP dictionary, independent of this raw
  // determinationcontrol import).

  // CP-01.d/.e: no source determination record; norm text has no ODP
  // placeholders, so a direct declarative rephrase is used.
  append('CP-01', [
    {
      code: 'CP-01(d)',
      text: 'процедури планування безперервної роботи реалізовують політику та заходи планування безперервної роботи;',
    },
    {
      code: 'CP-01(e)',
      text: 'розроблені, задокументовані та здійснені коригувальні заходи щодо виправлення становища в разі порушень політики планування безперервної роботи.',
    },
  ]);

  // MP-07.a: no source determination or ODP_DEFINITION records; the 4 ODPs
  // are defined via assessment_odp_adapter.json (mp-7_odp.01..04) and are
  // added here as ODP_DEFINITION determinations, followed by the STATEMENT
  // item that embeds them, matching the sibling MP-07(b)'s "(x)" id style.
  append('MP-07', [
    { code: 'MP-07_ODP[01]', text: 'вибрано одне з наступних ЗНАЧЕНЬ ПАРАМЕТРІВ: {обмежити; заборонити};' },
    { code: 'MP-07_ODP[02]', text: 'визначено типи носіїв системи, на які поширюється обмеження;' },
    { code: 'MP-07_ODP[03]', text: 'визначено системи або компоненти системи, на які поширюється обмеження;' },
    {
      code: 'MP-07_ODP[04]',
      text: 'визначено заходи безпеки, що застосовуються для обмеження використання носіїв інформації;',
    },
    {
      code: 'MP-07(a)',
      text: '<MP-07_ODP[01] вибір: обмежити; заборонити> використання <MP-07_ODP[02] визначених організацією типів носіїв системи> на <MP-07_ODP[03] визначених організацією системах або компонентах системи>, використовуючи <MP-07_ODP[04] визначені організацією заходи безпеки>;',
    },
  ]);

  // SC-17.a: no source determination or ODP_DEFINITION record; the ODP is
  // defined via assessment_odp_adapter.json (sc-17_odp.01, single-ODP control
  // so no bracket suffix, matching the adapter's own "SC-17_ODP" id).
  // Sibling item uses the "b." (trailing-dot) id/path style, matched here.
  append('SC-17', [
    { code: 'SC-17_ODP', text: 'визначено політику сертифікації, якою керується випуск сертифікатів відкритого ключа;' },
    {
      code: 'SC-17a.',
      text: 'сертифікати відкритого ключа випускаються відповідно до <SC-17_ODP визначеної організацією політики сертифікації>;',
    },
  ]);

  // PE-23: entire control has zero records of any kind in the raw source
  // (no determinations, no examine/interview/test objects). Text derived
  // directly from the ND TZI norm statement (no ODP placeholders exist for
  // this control). methods stay empty — no source basis to invent EXAMINE/
  // INTERVIEW/TEST objects for this control.
  append('PE-23', [
    {
      code: 'PE-23a',
      text: 'розташування або ділянка об’єкта, де знаходиться система, сплановані з урахуванням фізичних та екологічних ризиків;',
    },
    {
      code: 'PE-23b',
      text: 'для існуючих об’єктів фізичні та екологічні ризики враховані в організаційній стратегії управління ризиками організації.',
    },
  ]);
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
