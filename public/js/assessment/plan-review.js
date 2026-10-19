// public/js/assessment/plan-review.js
import { el, showModal } from '../render/dom.js';
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

function addStatement(controlId, text) {
  const entry = getAssessment().plan.checklist.find(e => e.control_id === controlId);
  patchChecklistEntry(controlId, { statements: [...(entry.statements ?? []), { id: crypto.randomUUID(), text }] });
}

function updateStatement(controlId, statementId, text) {
  const entry = getAssessment().plan.checklist.find(e => e.control_id === controlId);
  patchChecklistEntry(controlId, { statements: entry.statements.map(s => s.id === statementId ? { ...s, text } : s) });
}

function removeStatement(controlId, statementId) {
  const entry = getAssessment().plan.checklist.find(e => e.control_id === controlId);
  patchChecklistEntry(controlId, { statements: entry.statements.filter(s => s.id !== statementId) });
}

function openStatementModal({ title, initialText, onSave, onDelete }) {
  const textarea = el('textarea', { rows: '4' }, initialText ?? '');
  const saveBtn = el('button', { type: 'button', class: 'primary', onclick: () => {
    const text = textarea.value.trim();
    if (!text) return;
    onSave(text);
    modal.close();
  } }, 'Зберегти');
  const cancelBtn = el('button', { type: 'button', onclick: () => modal.close() }, 'Скасувати');
  const deleteBtn = onDelete ? el('button', { type: 'button', class: 'link-btn', onclick: () => {
    if (!confirm('Видалити цей пункт перевірки?')) return;
    onDelete();
    modal.close();
  } }, 'Видалити') : null;

  const modal = showModal(el('div', { class: 'field-grid' },
    el('label', { class: 'field' }, 'Текст пункту перевірки', textarea),
    el('div', { class: 'actions' }, saveBtn, cancelBtn, deleteBtn)),
    { title });
  textarea.focus();
}

function renderStatement(entry, statement) {
  return el('div', { class: 'statement-item' },
    el('p', {}, statement.text),
    el('div', { class: 'statement-actions' },
      el('button', { type: 'button', class: 'link-btn', onclick: () => {
        openStatementModal({
          title: 'Редагувати пункт перевірки',
          initialText: statement.text,
          onSave: (text) => updateStatement(entry.control_id, statement.id, text),
          onDelete: () => removeStatement(entry.control_id, statement.id),
        });
      } }, 'Редагувати'),
      el('button', { type: 'button', class: 'link-btn', onclick: () => {
        if (!confirm('Видалити цей пункт перевірки?')) return;
        removeStatement(entry.control_id, statement.id);
      } }, 'Видалити')));
}

function renderRow(entry) {
  const statements = entry.statements ?? [];

  const includeCheckbox = el('input', {
    type: 'checkbox',
    ...(entry.included !== false ? { checked: '' } : {}),
    onchange: (e) => patchChecklistEntry(entry.control_id, { included: e.target.checked }),
  });

  const statementsList = statements.length
    ? el('div', { class: 'statements-list' }, ...statements.map(s => renderStatement(entry, s)))
    : el('p', { class: 'hint' }, 'Немає пунктів перевірки — додайте власний');

  const addBtn = el('button', { type: 'button', class: 'link-btn', onclick: () => {
    openStatementModal({
      title: 'Додати пункт перевірки',
      initialText: '',
      onSave: (text) => addStatement(entry.control_id, text),
    });
  } }, '+ Додати пункт перевірки');

  return el('div', { class: 'checklist-row' },
    el('header', {},
      el('strong', {}, `${entry.control_id} — ${entry.control_title}`),
      ' ',
      el('label', {}, includeCheckbox, ' включити в оцінювання')),
    statementsList,
    addBtn);
}

export function renderPlanReview(container, { onApproved }) {
  const assessment = getAssessment();

  if (!isSubscribed) {
    // перевірка статусу — інакше ця підписка лишається "привидом" і після approve-plan
    // перезаписує dashboard назад на цей екран на кожен setAssessment()
    subscribe((a) => { if (currentRerender && a.status === 'PLANNING') currentRerender(); });
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

function renderReadOnlyRow(entry) {
  const statements = entry.statements ?? [];
  const excludedBadge = entry.included === false ? el('span', { class: 'badge badge-excluded' }, 'Виключено') : null;

  const statementsList = statements.length
    ? el('ul', { class: 'statements-list-readonly' }, ...statements.map(s => el('li', {}, s.text)))
    : el('p', { class: 'hint' }, 'Немає пунктів перевірки');

  return el('div', { class: `checklist-row${entry.included === false ? ' excluded' : ''}` },
    el('header', {},
      el('strong', {}, `${entry.control_id} — ${entry.control_title}`),
      excludedBadge ? [' ', excludedBadge] : []),
    statementsList);
}

export function renderPlanTab(container, { stepper, readOnly }) {
  const assessment = getAssessment();
  const groups = groupChecklist(assessment);

  const sections = groups.map(group => el('section', { class: 'checklist-family' },
    el('h3', {}, `${group.family} — ${group.family_title}`),
    ...group.entries.map(readOnly ? renderReadOnlyRow : renderRow)));

  container.replaceChildren(
    el('section', { class: 'assessment-header' },
      el('h2', {}, `План оцінювання «${assessment.metadata.ics_name}» (${assessment.id})`),
      stepper,
      el('p', {}, el('span', { class: 'badge badge-planning' }, readOnly ? 'План (лише перегляд)' : 'План'))),
    ...sections);
}
