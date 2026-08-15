import { el } from '../render/dom.js';
import { getAssessment, setAssessment } from './assessment-state.js';
import { renderEvidenceEditor } from './evidence-editor.js';

const CONCLUSIONS = [
  ['', '— оберіть —'], ['POSITIVE', 'Позитивно'], ['PARTIALLY_POSITIVE', 'Частково позитивно'],
  ['NEGATIVE', 'Негативно'], ['NOT_APPLICABLE', 'Не застосовується'], ['NOT_ASSESSED', 'Не оцінено'],
];

function itemDetail(item, rerender) {
  const conclusionSel = el('select', {}, ...CONCLUSIONS.map(([v, l]) => el('option', { value: v, ...(item.conclusion === v ? { selected: '' } : {}) }, l)));
  conclusionSel.addEventListener('change', () => {
    setAssessment(a => { item.conclusion = conclusionSel.value || null; return { ...a }; });
    rerender();
  });
  const commentArea = el('textarea', { rows: '2' }, item.assessor_comment ?? '');
  commentArea.addEventListener('blur', () => setAssessment(a => { item.assessor_comment = commentArea.value; return { ...a }; }));
  const findingDesc = el('textarea', { rows: '2', placeholder: 'Опис невідповідності' }, item.finding?.description ?? '');
  findingDesc.addEventListener('blur', () => setAssessment(a => {
    item.finding = { ...(item.finding ?? {}), description: findingDesc.value };
    return { ...a };
  }));
  const evidenceBox = el('div', {});
  renderEvidenceEditor(evidenceBox, item, () => { setAssessment(a => ({ ...a })); rerender(); });

  return el('article', { class: 'profile-item' },
    el('header', {}, el('strong', {}, item.id), item.catalog_missing
      ? el('span', { class: 'badge badge-excluded' }, 'Методика не визначена')
      : el('span', { class: 'badge' }, item.cpb_status)),
    el('p', { class: 'stmt' }, item.resolved_statement || item.control_title),
    el('label', { class: 'field' }, 'Висновок з оцінювання', conclusionSel),
    el('label', { class: 'field' }, 'Коментар оцінювача', commentArea),
    el('label', { class: 'field' }, 'Finding (опис невідповідності)', findingDesc),
    el('h4', {}, 'Докази'), evidenceBox);
}

export function renderDashboard(container, { onBack }) {
  const rerender = () => { container.replaceChildren(); renderDashboard(container, { onBack }); };
  const assessment = getAssessment();
  const backBtn = el('button', { type: 'button', onclick: onBack }, '← До реєстру оцінювань');
  const byFamily = new Map();
  for (const item of assessment.items) {
    if (!byFamily.has(item.family)) byFamily.set(item.family, []);
    byFamily.get(item.family).push(item);
  }
  const groups = [...byFamily.entries()].map(([family, items]) =>
    el('section', {}, el('h3', {}, family), ...items.map(item => itemDetail(item, rerender))));
  container.replaceChildren(el('section', {},
    el('h2', {}, `Оцінювання «${assessment.metadata.ics_name}» (${assessment.id})`),
    backBtn, ...groups));
}
