import { el } from '../render/dom.js';
import { setState, resetState } from '../state.js';
import { goToStep } from '../app.js';
import { applyApprovedRecord, validateTemplate } from '/core/template-io.js';

const INFO_LABELS = { open_confidential: 'Відкрита/Конфіденційна', service: 'Службова (ДСК)', state_secret: 'Державна таємниця' };

function approvedItem(it) {
  const details = el('div', { class: 'approved-details', hidden: '' });
  const infoBtn = el('button', { type: 'button', onclick: () => {
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
    if (!confirm(`Відкрити затверджений профіль «${it.name}»? Поточний стан майстра буде замінено.`)) return;
    const rec = await (await fetch(`/api/templates/approved/${encodeURIComponent(it.name)}`)).json();
    if (validateTemplate('approved', rec).length) { alert('Запис пошкоджено'); return; }
    setState(() => applyApprovedRecord(rec));
    goToStep(1);
  } }, 'Переглянути кроки');
  return el('article', { class: 'approved-item' },
    el('header', {},
      el('strong', {}, it.ics_name || it.name),
      el('span', { class: 'badge badge-applied' }, `АС-${it.as_class ?? '?'}`),
      el('span', { class: 'badge' }, INFO_LABELS[it.info_type] ?? '—'),
      el('span', { class: 'approved-date' }, it.approved_at ? new Date(it.approved_at).toLocaleDateString('uk-UA') : ''),
      infoBtn, loadBtn),
    details);
}

export const step = {
  id: 'registry', title: 'Реєстр',
  validate() { return []; },
  render(container) {
    const listBox = el('div', { class: 'approved-panel' }, el('p', {}, 'Завантаження…'));
    (async () => {
      const { items } = await (await fetch('/api/templates/approved')).json();
      if (!items?.length) {
        listBox.replaceChildren(
          el('h3', {}, 'Затверджені профілі'),
          el('p', {}, 'Реєстр порожній. Створіть перший проєкт ІКС та затвердіть його на Кроці 7.'));
        return;
      }
      listBox.replaceChildren(
        el('h3', {}, `Затверджені профілі (${items.length})`),
        ...items.map(approvedItem));
    })();
    const newBtn = el('button', { type: 'button', class: 'primary', onclick: () => {
      if (!confirm('Почати новий проєкт ІКС? Незбережений стан майстра буде очищено.')) return;
      resetState();
      goToStep(1);
    } }, '➕ Додати новий ІКС проєкт');
    const continueBtn = el('button', { type: 'button', onclick: () => goToStep(1) }, 'Продовжити поточний проєкт →');
    container.replaceChildren(el('section', {},
      el('h2', {}, 'Реєстр затверджених ІКС та ЦПБ'),
      listBox,
      el('div', { class: 'actions' }, newBtn, continueBtn)));
  },
};
