import { el } from '../render/dom.js';
import { getAssessment, setAssessment, subscribe, loadAssessment, getLastSaveError } from './assessment-state.js';
import { updateResult } from '../../../core/assessment/assessment-run.js';
import { buildAssessmentSummary } from '../../../core/assessment/assessment-summary.js';
import { renderAssessmentTable } from './assessment-table.js';
import { renderEvidenceEditor } from './evidence-editor.js';
import { renderFindingDialog } from './finding-dialog.js';
import { renderTraceabilityDrawer } from './traceability-drawer.js';

let openItemSourceId = null;
let isDashboardSubscribed = false;
let currentDashboardRerender = null;

function renderItemDetailPanel(sourceId) {
  const assessment = getAssessment();
  const planItem = assessment.plan.items.find(p => p.assessment_source_id === sourceId);
  const result = assessment.results.find(r => r.assessment_source_id === sourceId);

  if (!planItem || !result) {
    return el('aside', { class: 'item-detail-panel' },
      el('p', {}, 'Пункт не знайдено'),
      el('button', { type: 'button', onclick: () => { openItemSourceId = null; renderDashboard(document.querySelector('.assessment-container'), { onBack: () => {} }); } }, 'Закрити')
    );
  }

  const isFinalized = assessment.status === 'FINALIZED';

  // ODP values table
  const odpTable = planItem.odp_values?.length > 0
    ? el('table', { class: 'odp-detail-table' },
        el('thead', {},
          el('tr', {},
            el('th', {}, 'Assessment ODP ID'),
            el('th', {}, 'Local ODP ID'),
            el('th', {}, 'БПБ'),
            el('th', {}, 'ЦПБ'),
            el('th', {}, 'Джерело'),
            el('th', {}, 'Статус')
          )
        ),
        el('tbody', {},
          ...planItem.odp_values.map(odp => {
            const baseline = Array.isArray(odp.baseline_value)
              ? odp.baseline_value.join('; ')
              : (odp.baseline_value ?? '—');
            const target = Array.isArray(odp.target_value)
              ? odp.target_value.join('; ')
              : (odp.target_value ?? '[НЕ ВИЗНАЧЕНО]');
            return el('tr', {},
              el('td', {}, odp.assessment_odp_id ?? ''),
              el('td', {}, odp.local_odp_id ?? ''),
              el('td', {}, baseline),
              el('td', {}, target),
              el('td', {}, odp.effective_source ?? '—'),
              el('td', {}, odp.status ?? '')
            );
          })
        )
      )
    : el('p', {}, 'Немає значень параметрів визначення організації (ODP)');

  // Assessor comment textarea
  const commentArea = el('textarea', {
    rows: '3',
    disabled: isFinalized ? '' : null,
    placeholder: 'Коментар оцінювача...'
  }, result.assessor_comment ?? '');

  commentArea.addEventListener('blur', () => {
    const current = getAssessment();
    const { assessment: updated } = updateResult(current, sourceId, {
      assessor_comment: commentArea.value
    });
    setAssessment(updated);
  });

  // Conclusion textarea
  const conclusionArea = el('textarea', {
    rows: '3',
    disabled: isFinalized ? '' : null,
    placeholder: 'Висновок...'
  }, result.conclusion ?? '');

  conclusionArea.addEventListener('blur', () => {
    const current = getAssessment();
    const { assessment: updated } = updateResult(current, sourceId, {
      conclusion: conclusionArea.value
    });
    setAssessment(updated);
  });

  const closeBtn = el('button', {
    type: 'button',
    onclick: () => {
      openItemSourceId = null;
      renderDashboard(document.querySelector('.assessment-container'), { onBack: () => {} });
    }
  }, 'Закрити');

  // Evidence editor section
  const evidenceSection = el('section', {});
  renderEvidenceEditor(evidenceSection, { sourceId });

  // Findings dialog section
  const findingsSection = el('section', {});
  renderFindingDialog(findingsSection, { sourceId });

  // Traceability drawer section
  const traceabilitySection = el('section', {});
  renderTraceabilityDrawer(traceabilitySection, planItem);

  return el('aside', { class: 'item-detail-panel' },
    el('header', {},
      el('h3', {}, sourceId),
      closeBtn
    ),
    el('section', {},
      el('h4', {}, 'Шаблон мети'),
      el('p', { class: 'objective-template' }, planItem.objective_template ?? ''),
      el('h4', {}, 'Розв\'язана мета оцінювання'),
      el('p', { class: 'resolved-objective' }, planItem.resolved_objective ?? '')
    ),
    el('section', {},
      el('h4', {}, 'Значення параметрів ODP'),
      odpTable
    ),
    el('section', {},
      el('label', { class: 'field' },
        'Коментар оцінювача',
        commentArea
      )
    ),
    el('section', {},
      el('label', { class: 'field' },
        'Висновок',
        conclusionArea
      )
    ),
    evidenceSection,
    findingsSection,
    traceabilitySection
  );
}

function renderWarningsBlock(assessment) {
  const unresolvedWarnings = (assessment.warnings ?? []).filter(w => w.code === 'ODP_UNRESOLVED');

  if (unresolvedWarnings.length === 0) {
    return null;
  }

  let showDetails = false;

  const toggleBtn = el('button', {
    type: 'button',
    class: 'link',
    onclick: () => {
      showDetails = !showDetails;
      const detailsList = warningsBlock.querySelector('.warnings-list');
      detailsList.style.display = showDetails ? 'block' : 'none';
      toggleBtn.textContent = showDetails ? 'Сховати' : 'Показати';
    }
  }, 'Показати');

  const warningsList = el('ul', {
    class: 'warnings-list',
    style: 'display: none;'
  }, ...unresolvedWarnings.map(w =>
    el('li', {}, `${w.control_id}: ${w.local_odp_id}`)
  ));

  const warningsBlock = el('div', { class: 'warnings-block' },
    el('p', { class: 'warning' },
      `⚠️ Нерозв'язані параметри ODP: ${unresolvedWarnings.length}`,
      ' ',
      toggleBtn
    ),
    warningsList
  );

  return warningsBlock;
}

export function renderDashboard(container, { onBack }) {
  const assessment = getAssessment();

  // Set up subscription for dashboard re-render (once only)
  if (!isDashboardSubscribed) {
    subscribe(() => {
      // Skip re-render if user is typing in a detail panel input/select/textarea
      const activeEl = document.activeElement;
      const isTypingInPanel = ['INPUT', 'SELECT', 'TEXTAREA'].includes(activeEl?.tagName) && 
                               activeEl?.closest('.item-detail-panel');
      if (!isTypingInPanel && currentDashboardRerender) {
        currentDashboardRerender();
      }
    });
    isDashboardSubscribed = true;
  }
  currentDashboardRerender = () => renderDashboard(container, { onBack });

  // Header with metadata and status
  const statusBadge = el('span', {
    class: assessment.status === 'FINALIZED' ? 'badge badge-finalized' : 'badge badge-in-progress'
  }, assessment.status === 'FINALIZED' ? 'Фіналізовано' : 'В процесі');

  const saveError = getLastSaveError();
  const saveErrorBadge = saveError
    ? el('span', { class: 'badge badge-error', title: saveError }, '⚠️ Не збережено')
    : null;

  const summary = buildAssessmentSummary(assessment);
  const assessed = summary.total - summary.not_assessed;
  const progressText = `${assessed} / ${summary.total} оцінено`;

  const backBtn = el('button', { type: 'button', onclick: onBack }, '← До реєстру оцінювань');

  const exportBtn = el('button', {
    type: 'button',
    onclick: async () => {
      try {
        const r = await fetch(`/api/assessments/${encodeURIComponent(assessment.id)}/export/docx`, { method: 'POST' });
        if (!r.ok) {
          const body = await r.json();
          alert(`Помилка експорту: ${body.error ?? 'невідома помилка'}`);
          return;
        }
        const blob = await r.blob();
        const a = el('a', { href: URL.createObjectURL(blob), download: `${assessment.id}.docx` });
        a.click();
        URL.revokeObjectURL(a.href);
      } catch (err) {
        alert(`Помилка мережі: ${err.message}`);
      }
    }
  }, '🖨️ Експорт звіту (DOCX)');

  // Finalize button
  const finalizeBtn = assessment.status === 'FINALIZED'
    ? null
    : el('div', { class: 'finalize-section' },
        el('label', { class: 'field' },
          'Фіналізувати оцінювання (введіть ПІБ):',
          el('input', {
            type: 'text',
            id: 'finalize-by-input',
            placeholder: 'ПІБ особи, що фіналізує'
          })
        ),
        (() => {
          const finalizeButton = el('button', {
            type: 'button',
            class: 'primary'
          }, 'Фіналізувати');
          
          finalizeButton.onclick = async () => {
            const finalizedBy = document.getElementById('finalize-by-input')?.value || '';
            if (!finalizedBy.trim()) {
              alert('Введіть ПІБ особи, що фіналізує оцінювання');
              return;
            }
            try {
              finalizeButton.disabled = true;
              const r = await fetch(`/api/assessments/${encodeURIComponent(assessment.id)}/finalize`, {
                method: 'POST',
                body: JSON.stringify({ finalized_by: finalizedBy })
              });
              if (!r.ok) {
                const body = await r.json();
                if (r.status === 400 && body.errors) {
                  const errorsBlock = el('div', { class: 'validation-errors' },
                    el('h4', {}, 'Помилки валідації:'),
                    el('ul', {}, ...body.errors.map(err => el('li', {}, err)))
                  );
                  const existingErrors = document.querySelector('.validation-errors');
                  if (existingErrors) existingErrors.remove();
                  document.querySelector('.finalize-section')?.after(errorsBlock);
                } else {
                  alert(`Помилка фіналізації: ${body.error ?? 'невідома помилка'}`);
                }
                return;
              }
              await loadAssessment(assessment.id);
            } catch (err) {
              alert(`Помилка мережі: ${err.message}`);
            } finally {
              finalizeButton.disabled = false;
            }
          };
          
          return finalizeButton;
        })()
      );

  const header = el('section', { class: 'assessment-header' },
    el('h2', {}, `Оцінювання «${assessment.metadata.ics_name}» (${assessment.id})`),
    el('p', {}, statusBadge, saveErrorBadge ? [' ', saveErrorBadge] : [], ' ', progressText),
    el('div', { class: 'actions' }, backBtn, exportBtn),
    finalizeBtn
  );

  // Warnings block
  const warningsBlock = renderWarningsBlock(assessment);

  // Table container
  const tableContainer = el('div', { class: 'assessment-table-container' });

  // Detail panel (if item is open)
  const detailPanel = openItemSourceId ? renderItemDetailPanel(openItemSourceId) : null;

  // Render the table
  renderAssessmentTable(tableContainer, {
    onOpenItem: (sourceId) => {
      openItemSourceId = sourceId;
      renderDashboard(container, { onBack });
    }
  });

  const children = [header];
  if (warningsBlock) children.push(warningsBlock);
  children.push(tableContainer);
  if (detailPanel) children.push(detailPanel);

  container.replaceChildren(el('div', { class: 'assessment-container' }, ...children));
}
