import { el, showModal } from '../render/dom.js';
import { getAssessment, setAssessment } from './assessment-state.js';
import { SEVERITIES, FINDING_STATUSES, addFinding, updateFinding, removeFinding } from '../../../core/assessment/findings.js';

const SEVERITY_LABELS = {
  OBSERVATION: 'Спостереження',
  MINOR: 'Незначний',
  MAJOR: 'Значний',
  CRITICAL: 'Критичний'
};

const STATUS_LABELS = {
  OPEN: 'Відкритий',
  CLOSED: 'Закритий'
};

// Модалка редагування одного недоліку поверх списку; Зберегти — коммітить усі поля разом, Скасувати — без змін
function openEditFindingModal(finding, resultEvidence, isFinalized) {
  const severitySelect = el('select', { disabled: isFinalized ? '' : null },
    ...SEVERITIES.map(s => el('option', { value: s, selected: s === finding.severity ? '' : null }, SEVERITY_LABELS[s] || s)));
  const statusSelect = el('select', { disabled: isFinalized ? '' : null },
    ...FINDING_STATUSES.map(st => el('option', { value: st, selected: st === finding.status ? '' : null }, STATUS_LABELS[st] || st)));
  const titleInput = el('input', { type: 'text', value: finding.title, placeholder: 'Назва недоліку', disabled: isFinalized ? '' : null });
  const descTextarea = el('textarea', { rows: '3', placeholder: 'Опис', disabled: isFinalized ? '' : null }, finding.description);
  const recoTextarea = el('textarea', { rows: '3', placeholder: 'Рекомендація', disabled: isFinalized ? '' : null }, finding.recommendation);

  const linkedIds = new Set(finding.evidence_ids ?? []);
  const evidenceCheckboxes = resultEvidence.map(ev => {
    const checkbox = el('input', {
      type: 'checkbox',
      checked: linkedIds.has(ev.evidence_id) ? '' : null,
      disabled: isFinalized ? '' : null,
      onchange: () => { if (checkbox.checked) linkedIds.add(ev.evidence_id); else linkedIds.delete(ev.evidence_id); }
    });
    return el('label', { class: 'checkbox' }, checkbox, ` ${ev.title || ev.evidence_id}`);
  });

  const saveBtn = el('button', {
    type: 'button',
    disabled: isFinalized ? '' : null,
    onclick: () => {
      const { assessment: updated } = updateFinding(getAssessment(), finding.finding_id, {
        severity: severitySelect.value, status: statusSelect.value, title: titleInput.value,
        description: descTextarea.value, recommendation: recoTextarea.value, evidence_ids: [...linkedIds]
      });
      setAssessment(updated);
      modal.close();
    }
  }, 'Зберегти');
  const cancelBtn = el('button', { type: 'button', onclick: () => modal.close() }, 'Скасувати');

  const body = el('div', {},
    el('label', { class: 'field' }, 'Серйозність', severitySelect),
    el('label', { class: 'field' }, 'Статус', statusSelect),
    el('label', { class: 'field' }, 'Назва', titleInput),
    el('label', { class: 'field' }, 'Опис', descTextarea),
    el('label', { class: 'field' }, 'Рекомендація', recoTextarea),
    el('fieldset', {},
      el('legend', {}, 'Пов\'язані докази'),
      resultEvidence.length === 0
        ? el('p', { class: 'hint' }, 'Немає доказів для цього результату')
        : el('div', {}, ...evidenceCheckboxes)),
    isFinalized ? null : el('div', { class: 'actions' }, saveBtn, cancelBtn));

  const modal = showModal(body, { title: `Редагування недоліку — ${finding.finding_id}` });
}

export function renderFindingDialog(container, { sourceId }) {
  const assessment = getAssessment();
  const result = assessment.results.find(r => r.assessment_source_id === sourceId);
  if (!result) {
    container.replaceChildren(el('p', {}, 'Результат не знайдено'));
    return;
  }

  const isFinalized = assessment.status === 'FINALIZED';
  const findings = result.finding_ids.map(fId =>
    assessment.findings.find(f => f.finding_id === fId)
  ).filter(Boolean);

  const resultEvidence = result.evidence_ids.map(evidId =>
    assessment.evidence.find(e => e.evidence_id === evidId)
  ).filter(Boolean);

  const findingLine = (finding) => {
    const editBtn = el('button', {
      type: 'button',
      class: 'link-btn',
      onclick: () => openEditFindingModal(finding, resultEvidence, isFinalized)
    }, '✎ Редагувати');

    const deleteBtn = el('button', {
      type: 'button',
      class: 'link-btn',
      disabled: isFinalized ? '' : null,
      onclick: () => {
        if (isFinalized) return;
        const { assessment: updated } = removeFinding(getAssessment(), finding.finding_id);
        setAssessment(updated);
      }
    }, '✕ Видалити');

    return el('li', {},
      el('strong', {}, finding.finding_id), ' ',
      `[${SEVERITY_LABELS[finding.severity] || finding.severity} / ${STATUS_LABELS[finding.status] || finding.status}] ${finding.title || '—'}`,
      ' ', editBtn, ' ', deleteBtn
    );
  };

  const listEl = el('fieldset', { class: 'findings-list' },
    el('legend', {}, 'Додані недоліки'),
    findings.length === 0
      ? el('p', { class: 'hint' }, 'Недоліки відсутні')
      : el('ul', { class: 'custom-list' }, ...findings.map(findingLine))
  );

  // Add form
  const addSeveritySelect = el('select', { disabled: isFinalized ? '' : null },
    ...SEVERITIES.map(s => el('option', { value: s }, SEVERITY_LABELS[s] || s))
  );
  const addTitleInput = el('input', { type: 'text', placeholder: 'Назва недоліку', disabled: isFinalized ? '' : null });
  const addDescTextarea = el('textarea', { rows: '2', placeholder: 'Опис', disabled: isFinalized ? '' : null });
  const addRecoTextarea = el('textarea', { rows: '2', placeholder: 'Рекомендація', disabled: isFinalized ? '' : null });

  const addBtn = el('button', {
    type: 'button',
    disabled: isFinalized ? '' : null,
    onclick: () => {
      if (isFinalized) return;

      const { assessment: updated } = addFinding(getAssessment(), {
        assessment_source_id: sourceId,
        severity: addSeveritySelect.value,
        title: addTitleInput.value,
        description: addDescTextarea.value,
        evidence_ids: [],
        recommendation: addRecoTextarea.value
      });
      setAssessment(updated);

      // Reset form
      addTitleInput.value = '';
      addDescTextarea.value = '';
      addRecoTextarea.value = '';
    }
  }, 'Додати недолік');

  const addForm = el('fieldset', { class: 'finding-form' },
    el('legend', {}, 'Додати новий недолік'),
    el('label', { class: 'field' }, 'Серйозність', addSeveritySelect),
    el('label', { class: 'field' }, 'Назва', addTitleInput),
    el('label', { class: 'field' }, 'Опис', addDescTextarea),
    el('label', { class: 'field' }, 'Рекомендація', addRecoTextarea),
    el('div', { class: 'actions' }, addBtn)
  );

  container.replaceChildren(
    el('div', {},
      el('h4', {}, 'Недоліки'),
      listEl,
      isFinalized ? null : addForm
    )
  );
}
