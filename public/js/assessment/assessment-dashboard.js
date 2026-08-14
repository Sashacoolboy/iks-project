import { el } from '../render/dom.js';

export function renderLanding(container, { onOpen }) {
  const listBox = el('div', { class: 'approved-panel' }, el('p', {}, 'Завантаження…'));
  (async () => {
    const { items } = await (await fetch('/api/assessments')).json();
    if (!items.length) { listBox.replaceChildren(el('p', {}, 'Оцінювань ще немає.')); }
    else listBox.replaceChildren(...items.map(it => el('article', { class: 'approved-item' },
      el('header', {},
        el('strong', {}, `${it.ics_name} (${it.id})`),
        el('span', { class: 'badge' }, it.status),
        el('button', { type: 'button', onclick: () => onOpen(it.id) }, 'Відкрити')))));
  })();

  const approvedSelect = el('select', {});
  (async () => {
    const { items } = await (await fetch('/api/templates/approved')).json();
    approvedSelect.replaceChildren(
      el('option', { value: '' }, '— оберіть затверджений запис —'),
      ...items.map(it => el('option', { value: it.name }, `${it.ics_name} (${it.name})`)));
  })();
  const newBtn = el('button', { type: 'button', class: 'primary', onclick: async () => {
    if (!approvedSelect.value) return;
    const r = await fetch('/api/assessments', { method: 'POST', body: JSON.stringify({ approved_name: approvedSelect.value }) });
    if (!r.ok) { alert((await r.json()).error); return; }
    const { id } = await r.json();
    onOpen(id);
  } }, 'Нове оцінювання');

  container.replaceChildren(el('section', {},
    el('h2', {}, 'Оцінювання ІКС'),
    el('div', { class: 'actions' }, approvedSelect, newBtn),
    el('h3', {}, 'Наявні оцінювання'),
    listBox));
}
