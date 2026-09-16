import { el, option } from '../render/dom.js';
import { getState, setState } from '../state.js';
import { catalogs } from '../app.js';
import { applyIcsTemplate, validateTemplate } from '/core/template-io.js';

async function loadTemplateList(select) {
  const { names } = await (await fetch('/api/templates/ics')).json();
  select.replaceChildren(option('', '— оберіть шаблон —'), ...names.map(n => option(n, n)));
}

export const step = {
  id: 'passport', title: 'Проект та політики',
  validate(state) {
    const errors = [];
    if (!state.passport.ics_name.trim()) errors.push('Вкажіть назву ІКС');
    if (!state.passport.cert_body.trim()) errors.push('Вкажіть орган сертифікації');
    return errors;
  },
  render(container) {
    const state = getState();
    const field = (key) => el('input', { type: 'text', value: state.passport[key] ?? '',
      oninput: (e) => setState(s => ({ ...s, passport: { ...s.passport, [key]: e.target.value } })) });
    const nameInput = field('ics_name');
    const designationInput = field('designation');
    const systemIdInput = field('system_id');
    const ownerInfoInput = field('owner_info');
    const developerInfoInput = field('developer_info');
    const developmentBasisInput = field('development_basis');
    const baselineProfileInfoInput = field('baseline_profile_info');
    const certInput = field('cert_body');
    const normativeActsInput = el('textarea', { rows: '4',
      oninput: (e) => setState(s => ({ ...s, passport: { ...s.passport, normative_acts: e.target.value } })) },
      state.passport.normative_acts ?? '');
    const classRadios = [1, 2, 3].map(c =>
      el('label', { class: 'radio' },
        el('input', { type: 'radio', name: 'as_class', value: String(c),
          ...(state.passport.as_class === c ? { checked: '' } : {}),
          onchange: () => setState(s => ({ ...s, passport: { ...s.passport, as_class: c },
            selected_assets: s.selected_assets.filter(id =>
              catalogs.assets.find(a => a.id === id)?.min_as_class <= c) })) }),
        `АС-${c}`));
    // Картка глобальних політик — генерується з policy_mapping.json, згруповано
    const groups = new Map();
    for (const gc of catalogs.policyMapping.global_constants) {
      const g = gc.group ?? 'Інше';
      if (!groups.has(g)) groups.set(g, []);
      groups.get(g).push(gc);
    }
    const policyFields = [...groups.entries()].flatMap(([groupName, constants]) => [
      el('fieldset', {}, el('legend', {}, groupName),
        ...constants.map(gc =>
          el('label', { class: 'field' }, gc.label,
            el('input', { type: 'text', placeholder: gc.example, value: state.global_constants[gc.key] ?? '',
              oninput: (e) => setState(s => ({ ...s, global_constants: { ...s.global_constants, [gc.key]: e.target.value } })) })))),
    ]);
    // Завантаження шаблону ІКС
    const tplSelect = el('select', {});
    loadTemplateList(tplSelect);
    const tplBtn = el('button', { type: 'button', onclick: async () => {
      if (!tplSelect.value) return;
      const tpl = await (await fetch(`/api/templates/ics/${encodeURIComponent(tplSelect.value)}`)).json();
      if (validateTemplate('ics', tpl).length) { alert('Шаблон пошкоджено'); return; }
      setState(s => applyIcsTemplate(s, tpl));
      container.replaceChildren();
      step.render(container);
    } }, 'Завантажити шаблон ІКС');
    // Словник ODP наразі лише агрегує дані (див. tools/analyze-dictionary.js);
    // генерація комплексної анкети з нього — майбутній етап.
    container.replaceChildren(
      el('section', {},
        el('h2', {}, 'Крок 1. Паспорт ІКС та Глобальні політики'),
        el('div', { class: 'tpl-row' }, tplSelect, tplBtn),
        el('h3', {}, 'Початкові дані'),
        el('label', { class: 'field' }, 'Назва ІКС', nameInput),
        el('label', { class: 'field' }, 'Умовне позначення', designationInput),
        el('label', { class: 'field' }, 'Ідентифікатор системи (за наявності)', systemIdInput),
        el('label', { class: 'field' }, 'Відомості про власника або розпорядника системи', ownerInfoInput),
        el('label', { class: 'field' }, 'Відомості про виконавця робіт з розробки ЦПБ', developerInfoInput),
        el('label', { class: 'field' }, 'Підстава розробки', developmentBasisInput),
        el('label', { class: 'field' }, 'Відомості про обраний базовий профіль безпеки (галузевий профіль безпеки системи)', baselineProfileInfoInput),
        el('label', { class: 'field' }, 'Орган сертифікації', certInput),
        el('label', { class: 'field' }, 'Перелік нормативно-правових актів', normativeActsInput),
        el('div', { class: 'field' }, 'Клас ІКС відповідно до НД ТЗІ: ', ...classRadios),
        el('h3', {}, 'Картка глобальних політик'),
        ...policyFields));
  },
};
