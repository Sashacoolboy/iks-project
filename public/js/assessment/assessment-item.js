import { el } from '../render/dom.js';
import { getAssessment, setAssessment, subscribe, loadAssessment, getLastSaveError } from './assessment-state.js';
import { buildAssessmentSummary } from '../../../core/assessment/assessment-summary.js';
import { renderAssessmentTable } from './assessment-table.js';

let activeTab = 'assessment';
let isDashboardSubscribed = false;
let currentDashboardRerender = null;

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

  const stepper = el('nav', { class: 'stepper' },
    el('button', {
      type: 'button',
      class: `step-tab${activeTab === 'plan' ? ' active' : ''}`,
      onclick: () => { activeTab = 'plan'; renderDashboard(container, { onBack }); },
    }, 'План'),
    el('button', {
      type: 'button',
      class: `step-tab${activeTab === 'assessment' ? ' active' : ''}`,
      onclick: () => { activeTab = 'assessment'; renderDashboard(container, { onBack }); },
    }, 'Оцінювання'));

  if (activeTab === 'plan') {
    import('./plan-review.js').then(({ renderPlanReadOnly }) => {
      renderPlanReadOnly(container, { stepper });
    });
    return;
  }

  // Set up subscription for dashboard re-render (once only)
  if (!isDashboardSubscribed) {
    subscribe(() => {
      if (currentDashboardRerender) currentDashboardRerender();
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
    stepper,
    el('p', {}, statusBadge, saveErrorBadge ? [' ', saveErrorBadge] : [], ' ', progressText),
    el('div', { class: 'actions' }, backBtn, exportBtn),
    finalizeBtn
  );

  // Warnings block
  const warningsBlock = renderWarningsBlock(assessment);

  // Table container
  const tableContainer = el('div', { class: 'assessment-table-container' });

  // Render the table
  renderAssessmentTable(tableContainer);

  const children = [header];
  if (warningsBlock) children.push(warningsBlock);
  children.push(tableContainer);

  container.replaceChildren(el('div', { class: 'assessment-container' }, ...children));
}
