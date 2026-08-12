import { el, option } from '../render/dom.js';
import { getState, setState } from '../state.js';
import { catalogs } from '../app.js';
import { applyIcsTemplate, validateTemplate } from '/core/template-io.js';
import { clusterQuestions } from '/core/odp-dictionary.js';

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
    // Динамічні питання зі словника ODP: кластери, не покриті базовими константами
    const dynQuestions = clusterQuestions(catalogs.odpDictionary, catalogs.policyMapping);
    const dynFields = dynQuestions.length ? [
      el('fieldset', { class: 'dyn-questions' },
        el('legend', {}, 'Додаткові питання (з практики заповнення)'),
        el('p', { class: 'hint' }, 'Сформовано зі словника ваших відповідей на Кроці 6 — заповнення тут автоматично підставить значення в усі відповідні пункти ЦПБ.'),
        ...dynQuestions.map(q => {
          const listId = `dynlist-${q.key.replace(/[^a-z0-9]/gi, '')}`;
          return el('label', { class: 'field' },
            `${q.label} (параметрів: ${q.paramIds.length})`,
            el('input', { type: 'text', list: listId, placeholder: q.values[0] ?? '',
              value: state.global_constants[q.key] ?? '',
              oninput: (e) => setState(s => ({ ...s, global_constants: { ...s.global_constants, [q.key]: e.target.value } })) }),
            el('datalist', { id: listId }, ...q.values.map(v => el('option', { value: v }))));
        }))] : [];
    container.replaceChildren(
      el('section', {},
        el('h2', {}, 'Крок 1. Паспорт ІКС та Глобальні політики'),
        el('div', { class: 'tpl-row' }, tplSelect, tplBtn),
        el('label', { class: 'field' }, 'Назва ІКС', nameInput),
        el('label', { class: 'field' }, 'Орган сертифікації', certInput),
        el('div', { class: 'field' }, 'Клас ІКС: ', ...classRadios),
        el('h3', {}, 'Картка глобальних політик'),
        ...policyFields,
        ...dynFields));
  },
};
