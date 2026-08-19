import { el } from '../render/dom.js';
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

export function renderFindingDialog(container, { sourceId }) {
  const assessment = getAssessment();
  const result = assessment.results.find(r => r.assessment_source_id === sourceId);
  if (!result) {
    container.replaceChildren(el('p', {}, 'Result not found'));
    return;
  }

  const isFinalized = assessment.status === 'FINALIZED';
  const findings = result.finding_ids.map(fId =>
    assessment.findings.find(f => f.finding_id === fId)
  ).filter(Boolean);

  const resultEvidence = result.evidence_ids.map(evidId =>
    assessment.evidence.find(e => e.evidence_id === evidId)
  ).filter(Boolean);

  const listEl = el('div', { class: 'findings-list' },
    findings.length === 0
      ? el('p', { class: 'hint' }, 'Недоліки відсутні')
      : el('div', {},
          ...findings.map(finding => {
            const severitySelect = el('select', {
              disabled: isFinalized ? '' : null,
              onchange: () => {
                if (isFinalized) return;
                const { assessment: updated } = updateFinding(getAssessment(), finding.finding_id, {
                  severity: severitySelect.value
                });
                setAssessment(updated);
              }
            }, ...SEVERITIES.map(s => el('option', { value: s, selected: s === finding.severity ? '' : null },
              SEVERITY_LABELS[s] || s))
            );

            const statusSelect = el('select', {
              disabled: isFinalized ? '' : null,
              onchange: () => {
                if (isFinalized) return;
                const { assessment: updated } = updateFinding(getAssessment(), finding.finding_id, {
                  status: statusSelect.value
                });
                setAssessment(updated);
              }
            }, ...FINDING_STATUSES.map(st => el('option', { value: st, selected: st === finding.status ? '' : null },
              STATUS_LABELS[st] || st))
            );

            const titleInput = el('input', {
              type: 'text',
              value: finding.title,
              placeholder: 'Назва недоліку',
              disabled: isFinalized ? '' : null,
              onblur: () => {
                if (isFinalized) return;
                const { assessment: updated } = updateFinding(getAssessment(), finding.finding_id, {
                  title: titleInput.value
                });
                setAssessment(updated);
              }
            });

            const descTextarea = el('textarea', {
              rows: '2',
              placeholder: 'Опис',
              disabled: isFinalized ? '' : null,
              onblur: () => {
                if (isFinalized) return;
                const { assessment: updated } = updateFinding(getAssessment(), finding.finding_id, {
                  description: descTextarea.value
                });
                setAssessment(updated);
              }
            }, finding.description);

            const recoTextarea = el('textarea', {
              rows: '2',
              placeholder: 'Рекомендація',
              disabled: isFinalized ? '' : null,
              onblur: () => {
                if (isFinalized) return;
                const { assessment: updated } = updateFinding(getAssessment(), finding.finding_id, {
                  recommendation: recoTextarea.value
                });
                setAssessment(updated);
              }
            }, finding.recommendation);

            const evidenceCheckboxes = resultEvidence.map(ev => {
              const isLinked = (finding.evidence_ids ?? []).includes(ev.evidence_id);
              const checkbox = el('input', {
                type: 'checkbox',
                checked: isLinked ? '' : null,
                disabled: isFinalized ? '' : null,
                onchange: () => {
                  if (isFinalized) return;
                  const current = getAssessment();
                  const currentFinding = current.findings.find(f => f.finding_id === finding.finding_id);
                  const currentEvIds = currentFinding?.evidence_ids ?? [];
                  const newEvIds = checkbox.checked
                    ? [...currentEvIds, ev.evidence_id]
                    : currentEvIds.filter(id => id !== ev.evidence_id);
                  const { assessment: updated } = updateFinding(current, finding.finding_id, {
                    evidence_ids: newEvIds
                  });
                  setAssessment(updated);
                }
              });
              return el('label', { class: 'checkbox' },
                checkbox,
                ` ${ev.title || ev.evidence_id}`
              );
            });

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

            return el('div', { class: 'finding-item' },
              el('div', { class: 'finding-header' },
                el('strong', {}, finding.finding_id),
                ' ',
                severitySelect,
                ' ',
                statusSelect,
                ' ',
                deleteBtn
              ),
              el('label', { class: 'field' }, 'Назва', titleInput),
              el('label', { class: 'field' }, 'Опис', descTextarea),
              el('label', { class: 'field' }, 'Рекомендація', recoTextarea),
              el('fieldset', {},
                el('legend', {}, 'Пов\'язані докази'),
                resultEvidence.length === 0
                  ? el('p', { class: 'hint' }, 'Немає доказів для цього результату')
                  : el('div', {}, ...evidenceCheckboxes)
              )
            );
          })
        )
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

  const addForm = el('div', { class: 'finding-form' },
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
