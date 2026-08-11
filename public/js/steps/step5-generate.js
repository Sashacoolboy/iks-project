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
      const state = getState();
      if (!state.info_type) {
        summaryBox.replaceChildren(el('p', { class: 'warn' }, 'Спершу оберіть тип інформації на Кроці 4.'));
        return;
      }
      const doc = buildProfile(state, catalogs);
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
