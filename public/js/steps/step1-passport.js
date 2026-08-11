import { el, option } from '../render/dom.js';
import { getState, setState } from '../state.js';
import { catalogs } from '../app.js';
import { applyIcsTemplate, applyApprovedRecord, validateTemplate } from '/core/template-io.js';

async function loadTemplateList(select) {
  const { names } = await (await fetch('/api/templates/ics')).json();
  select.replaceChildren(option('', '— оберіть шаблон —'), ...names.map(n => option(n, n)));
}

const INFO_LABELS = { open_confidential: 'Відкрита/Конфіденційна', service: 'Службова (ДСК)', state_secret: 'Державна таємниця' };

async function approvedPanel(rerender) {
  const box = el('div', { class: 'approved-panel' });
  const { items } = await (await fetch('/api/templates/approved')).json();
  if (!items?.length) return box;
  box.append(el('h3', {}, `Затверджені профілі (${items.length})`));
  for (const it of items) {
    const details = el('div', { class: 'approved-details', hidden: '' });
    const viewBtn = el('button', { type: 'button', onclick: () => {
      if (!details.hidden) { details.hidden = true; return; }
      const s = it.summary ?? {};
      details.replaceChildren(
        el('p', {}, `Тип інформації: ${INFO_LABELS[it.info_type] ?? '—'}`),
        el('p', {}, `Пунктів БПБ: ${s.total ?? '—'}, автозаповнено: ${s.autofilled ?? '—'}, порожніх: ${s.empty ?? '—'}`),
        el('p', {}, `Архітектурних винятків: ${s.exempted ?? '—'}, виключено: ${s.excluded ?? '—'}`),
        el('p', {}, `Ризиків у реєстрі: ${s.risks_count ?? '—'}, посилень: ${s.enhancements_count ?? '—'}`));
      details.hidden = false;
    } }, 'Інфо');
    const loadBtn = el('button', { type: 'button', onclick: async () => {
      if (!confirm(`Завантажити затверджений профіль «${it.name}»? Поточний стан майстра буде замінено.`)) return;
      const rec = await (await fetch(`/api/templates/approved/${encodeURIComponent(it.name)}`)).json();
      if (validateTemplate('approved', rec).length) { alert('Запис пошкоджено'); return; }
      setState(() => applyApprovedRecord(rec));
      rerender();
    } }, 'Завантажити в майстер');
    box.append(el('article', { class: 'approved-item' },
      el('header', {},
        el('strong', {}, it.ics_name || it.name),
        el('span', { class: 'badge badge-applied' }, `АС-${it.as_class ?? '?'}`),
        el('span', { class: 'approved-date' }, it.approved_at ? new Date(it.approved_at).toLocaleDateString('uk-UA') : ''),
        viewBtn, loadBtn),
      details));
  }
  return box;
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
    const approvedBox = el('div', {});
    const rerender = () => { container.replaceChildren(); step.render(container); };
    approvedPanel(rerender).then(panel => approvedBox.append(panel));
    container.replaceChildren(
      el('section', {},
        el('h2', {}, 'Крок 1. Паспорт ІКС та Глобальні політики'),
        approvedBox,
        el('div', { class: 'tpl-row' }, tplSelect, tplBtn),
        el('label', { class: 'field' }, 'Назва ІКС', nameInput),
        el('label', { class: 'field' }, 'Орган сертифікації', certInput),
        el('div', { class: 'field' }, 'Клас ІКС: ', ...classRadios),
        el('h3', {}, 'Картка глобальних політик'),
        ...policyFields));
  },
};
