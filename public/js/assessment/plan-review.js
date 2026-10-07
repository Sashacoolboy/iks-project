// public/js/assessment/plan-review.js
import { el } from '../render/dom.js';
import { getAssessment, setAssessment, subscribe } from './assessment-state.js';

let isSubscribed = false;
let currentRerender = null;

function groupChecklist(assessment) {
  const groups = [];
  const byFamily = new Map();
  for (const entry of assessment.plan?.checklist ?? []) {
    let group = byFamily.get(entry.family);
    if (!group) {
      group = { family: entry.family, family_title: entry.family_title, entries: [] };
      byFamily.set(entry.family, group);
      groups.push(group);
    }
    group.entries.push(entry);
  }
  return groups;
}

function patchChecklistEntry(controlId, patch) {
  setAssessment((assessment) => ({
    ...assessment,
    plan: {
      ...assessment.plan,
      checklist: assessment.plan.checklist.map(e => e.control_id === controlId ? { ...e, ...patch } : e),
    },
  }));
}

function renderRow(entry) {
  const textarea = el('textarea', {
    rows: '3',
  }, entry.verification_statement ?? '');

  textarea.addEventListener('blur', () => {
    patchChecklistEntry(entry.control_id, { verification_statement: textarea.value });
  });

  const includeCheckbox = el('input', {
    type: 'checkbox',
    ...(entry.included !== false ? { checked: '' } : {}),
    onchange: (e) => patchChecklistEntry(entry.control_id, { included: e.target.checked }),
  });

  const sourceBadge = entry.source_status === 'MANUAL_REQUIRED'
    ? el('span', { class: 'badge badge-exempt' }, 'немає згенерованої інструкції — заповніть вручну')
    : null;

  return el('div', { class: 'checklist-row' },
    el('header', {},
      el('strong', {}, `${entry.control_id} — ${entry.control_title}`),
      ' ',
      el('label', {}, includeCheckbox, ' включити в оцінювання')),
    sourceBadge,
    el('label', { class: 'field' }, 'Інструкція перевірки', textarea));
}

export function renderPlanReview(container, { onApproved }) {
  const assessment = getAssessment();

  if (!isSubscribed) {
    subscribe(() => { if (currentRerender) currentRerender(); });
    isSubscribed = true;
  }
  currentRerender = () => renderPlanReview(container, { onApproved });

  const groups = groupChecklist(assessment);

  const exportBtn = el('button', { type: 'button', onclick: async () => {
    const r = await fetch(`/api/assessments/${encodeURIComponent(assessment.id)}/export/checklist-docx`, { method: 'POST' });
    if (!r.ok) { alert('Помилка експорту чекліста'); return; }
    const blob = await r.blob();
    const url = URL.createObjectURL(blob);
    const a = el('a', { href: url, download: `${assessment.id}-checklist.docx` });
    document.body.append(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  } }, 'Експортувати чекліст (DOCX)');

  const approveBtn = el('button', { type: 'button', class: 'primary', onclick: async () => {
    const r = await fetch(`/api/assessments/${encodeURIComponent(assessment.id)}/approve-plan`, { method: 'POST', body: '{}' });
    if (!r.ok) { alert((await r.json()).error ?? 'помилка погодження плану'); return; }
    onApproved();
  } }, 'Погодити план і розпочати оцінювання');

  const sections = groups.map(group => el('section', { class: 'checklist-family' },
    el('h3', {}, `${group.family} — ${group.family_title}`),
    ...group.entries.map(renderRow)));

  container.replaceChildren(
    el('section', { class: 'assessment-header' },
      el('h2', {}, `План оцінювання «${assessment.metadata.ics_name}» (${assessment.id})`),
      el('p', {}, el('span', { class: 'badge badge-planning' }, 'План')),
      el('div', { class: 'actions' }, exportBtn, approveBtn)),
    ...sections);
}
