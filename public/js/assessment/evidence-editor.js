import { el } from '../render/dom.js';

export function nextEvidenceId(existing) {
  const nums = existing.map(e => Number((e.id ?? '').replace('EV-', ''))).filter(n => !Number.isNaN(n));
  return `EV-${String((nums.length ? Math.max(...nums) : 0) + 1).padStart(4, '0')}`;
}

const METHOD_LABELS = { EXAMINE: 'Дослідження', INTERVIEW: 'Опитування', TEST: 'Випробування', OBSERVE: 'Спостереження' };
const EVIDENCE_TYPES = ['POLICY', 'PROCEDURE', 'ORDER', 'DOCUMENT', 'REGISTER', 'LIST', 'ROLE_MATRIX',
  'ACCESS_REQUEST', 'LOG', 'SYSTEM_CONFIGURATION', 'SCREENSHOT', 'INTERVIEW', 'TEST_RESULT', 'PHYSICAL_INSPECTION', 'OTHER'];

export function renderEvidenceEditor(container, item, onChange) {
  const list = el('ul', { class: 'custom-list' },
    ...item.evidence.map(ev => el('li', {},
      `${METHOD_LABELS[ev.method] ?? ev.method} — ${ev.title || ev.source_type}: ${ev.observation || ''}`,
      el('button', { type: 'button', class: 'link-btn', onclick: () => {
        item.evidence = item.evidence.filter(e => e.id !== ev.id);
        onChange();
      } }, '✕'))));

  const methodSel = el('select', {}, ...Object.entries(METHOD_LABELS).map(([v, label]) => el('option', { value: v }, label)));
  const typeSel = el('select', {}, ...EVIDENCE_TYPES.map(t => el('option', { value: t }, t)));
  const titleInput = el('input', { type: 'text', placeholder: 'Назва / джерело' });
  const refInput = el('input', { type: 'text', placeholder: 'Реквізити (розділ, пункт)' });
  const obsInput = el('textarea', { rows: '2', placeholder: 'Результат дослідження/опитування/випробування/спостереження' });
  const addBtn = el('button', { type: 'button', onclick: () => {
    item.evidence.push({
      id: nextEvidenceId(item.evidence), method: methodSel.value, source_type: typeSel.value,
      title: titleInput.value, reference: refInput.value, source_date: '', observation: obsInput.value,
      comment: '', attachment: null,
    });
    titleInput.value = ''; refInput.value = ''; obsInput.value = '';
    onChange();
  } }, '+ Додати доказ');

  container.replaceChildren(list, el('div', { class: 'evidence-form' }, methodSel, typeSel, titleInput, refInput, obsInput, addBtn));
}
