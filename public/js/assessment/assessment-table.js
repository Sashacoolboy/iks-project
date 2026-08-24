import { el } from '../render/dom.js';
import { getAssessment, setAssessment, subscribe } from './assessment-state.js';
import { updateResult } from '../../../core/assessment/assessment-run.js';

export const RESULT_LABELS = {
  NOT_ASSESSED: 'Не оцінено',
  SATISFIED: 'Відповідає',
  PARTIALLY_SATISFIED: 'Частково відповідає',
  NOT_SATISFIED: 'Не відповідає',
  NOT_APPLICABLE: 'Не застосовується'
};

export const METHOD_LABELS = {
  EXAMINE: 'Дослідження',
  INTERVIEW: 'Співбесіда',
  TEST: 'Перевірка'
};

/**
 * Groups plan items by family and control, joining with results.
 * @param {Object} assessment - The assessment object
 * @returns {Array<{family, family_title, controls: Array<{control_id, control_title, items}>}>}
 */
export function groupPlanItems(assessment) {
  const resultsById = new Map((assessment.results ?? []).map(r => [r.assessment_source_id, r]));
  const groups = [];
  const groupByFamily = new Map();

  for (const planItem of assessment.plan?.items ?? []) {
    let familyGroup = groupByFamily.get(planItem.family);
    if (!familyGroup) {
      familyGroup = {
        family: planItem.family,
        family_title: planItem.family_title,
        controls: [],
        _byControl: new Map()
      };
      groupByFamily.set(planItem.family, familyGroup);
      groups.push(familyGroup);
    }

    let controlGroup = familyGroup._byControl.get(planItem.control_id);
    if (!controlGroup) {
      controlGroup = {
        control_id: planItem.control_id,
        control_title: planItem.control_title,
        items: []
      };
      familyGroup._byControl.set(planItem.control_id, controlGroup);
      familyGroup.controls.push(controlGroup);
    }

    controlGroup.items.push({
      planItem,
      result: resultsById.get(planItem.assessment_source_id)
    });
  }

  // Clean up temporary _byControl maps
  for (const group of groups) {
    delete group._byControl;
  }

  return groups;
}

// Module-level state for expanded ODP rows
const expandedRows = new Set();

// Module-level state for re-render subscription
let isSubscribed = false;
let currentRerenderFn = null;

function patchResult(sourceId, patch) {
  const current = getAssessment();
  const { assessment } = updateResult(current, sourceId, patch);
  setAssessment(assessment);
}

function formatOdpValue(value) {
  if (value === null || value === undefined) return null;
  if (Array.isArray(value)) return value.join('; ');
  return String(value);
}

// ОДП, релевантні пункту; legacy-записи без relevant_local_odp_ids → лише непорожні значення контроля
export function relevantOdpEntries(planItem) {
  const all = planItem.odp_values ?? [];
  const rel = planItem.relevant_local_odp_ids;
  if (!Array.isArray(rel)) return all.filter(v => v.baseline_value != null || v.target_value != null);
  const set = new Set(rel);
  return all.filter(v => set.has(v.local_odp_id));
}

export const collapsePlaceholders = (t) => String(t ?? '').replace(/\{\{\s*insert:\s*param,\s*([\w.-]+)\s*\}\}/g, '[$1]');

// Текст тултіпа: стейтменти, де вжито цей ODP; плейсхолдери згортаються до [odp-id]
export function usageTitle(odp) {
  const usages = odp.statement_usage ?? [];
  if (!usages.length) return null;
  return 'Використовується в пункті: ' + usages
    .map(u => `${u.statement_path ? u.statement_path + ') ' : ''}${collapsePlaceholders(u.text)}`)
    .join('\n');
}

// Тултіп на позначенні пункту: текст вимоги заходу з НД ТЗІ
export function statementTitle(planItem) {
  if (!planItem.statement_text) return null;
  const label = planItem.statement_path
    ? `${planItem.control_id}.${firstSegmentLabel(planItem.statement_path)} — `
    : '';
  return label + collapsePlaceholders(planItem.statement_text);
}

function firstSegmentLabel(path) {
  return String(path ?? '').split('.')[0].replace(/[\[(].*$/, '');
}

export function odpColumnParts(planItem) {
  const relevant = relevantOdpEntries(planItem);
  const withLabel = relevant.length > 1 || !Array.isArray(planItem.relevant_local_odp_ids);
  const part = (v, raw, fallback) => ({
    text: (withLabel ? `${v.local_odp_id}: ` : '') + (formatOdpValue(raw) ?? fallback),
    title: usageTitle(v),
  });
  return {
    baseline: relevant.map(v => part(v, v.baseline_value, '—')),
    target: relevant.map(v => part(v, v.target_value, '[НЕ ВИЗНАЧЕНО]')),
  };
}

export function odpColumnTexts(planItem) {
  const parts = odpColumnParts(planItem);
  return {
    baseline: parts.baseline.map(p => p.text).join('; ') || '—',
    target: parts.target.map(p => p.text).join('; ') || '—',
  };
}

function odpSubrows(planItem) {
  return (planItem.odp_values ?? []).map(odp => {
    const baseline = formatOdpValue(odp.baseline_value) ?? '—';
    const target = formatOdpValue(odp.target_value) ?? '[НЕ ВИЗНАЧЕНО]';
    const source = odp.effective_source ?? '—';
    const title = usageTitle(odp);

    return el('tr', { class: 'odp-subrow', ...(title ? { title } : {}) },
      el('td', {}, odp.assessment_odp_id ?? ''),
      el('td', { colspan: '6' },
        el('span', { class: 'odp-meta' }, `local: ${odp.local_odp_id}`),
        el('span', { class: 'odp-meta' }, `БПБ: ${baseline}`),
        el('span', { class: 'odp-meta' }, `ЦПБ: ${target}`),
        el('span', { class: 'odp-meta' }, `джерело: ${source}`)
      )
    );
  });
}

function itemRow({ planItem, result }, { onOpenItem, rerender, isFinalized }) {
  const sourceId = planItem.assessment_source_id;
  const isExpanded = expandedRows.has(sourceId);

  // Toggle expand/collapse button; hover — текст вимоги заходу з НД ТЗІ
  const stmtTitle = statementTitle(planItem);
  const toggleBtn = el('button', {
    type: 'button',
    class: 'link',
    ...(stmtTitle ? { title: stmtTitle } : {}),
    onclick: () => {
      if (isExpanded) {
        expandedRows.delete(sourceId);
      } else {
        expandedRows.add(sourceId);
      }
      rerender();
    }
  }, sourceId);

  // Result select dropdown
  const resultSelect = el('select', {
    disabled: isFinalized ? '' : null,
    onchange: (e) => patchResult(sourceId, { result: e.target.value })
  }, ...Object.entries(RESULT_LABELS).map(([value, label]) =>
    el('option', {
      value,
      selected: result?.result === value ? '' : null
    }, label)
  ));

  // БПБ та ЦПБ: лише релевантні цьому пункту ODP; hover — стейтмент, де ODP вживається
  const odpParts = odpColumnParts(planItem);
  const odpCell = (list) => list.length
    ? el('td', {}, ...list.flatMap((p, i) => {
        const span = el('span', { class: 'odp-value', ...(p.title ? { title: p.title } : {}) }, p.text);
        return i ? ['; ', span] : [span];
      }))
    : el('td', {}, '—');

  // Evidence button
  const evidenceCount = result?.evidence_ids?.length ?? 0;
  const evidenceBtn = el('button', {
    type: 'button',
    onclick: () => onOpenItem(sourceId)
  }, `Докази: ${evidenceCount}`);

  // Conclusion cell with edit button
  const conclusionText = result?.conclusion || '';
  const conclusionCell = el('td', { class: 'conclusion' },
    el('span', {}, conclusionText),
    ' ',
    el('button', {
      type: 'button',
      class: 'link',
      onclick: () => onOpenItem(sourceId)
    }, '✎')
  );

  const row = el('tr', { class: 'assessment-item-row' },
    el('td', {}, toggleBtn),
    el('td', { class: 'objective' }, planItem.resolved_objective ?? ''),
    odpCell(odpParts.baseline),
    odpCell(odpParts.target),
    el('td', {}, resultSelect),
    el('td', {}, evidenceBtn),
    conclusionCell
  );

  const subrows = isExpanded ? odpSubrows(planItem) : [];
  return { row, subrows };
}

/**
 * Renders the assessment table with grouped rows
 * @param {HTMLElement} container - The container element
 * @param {Object} options - Options object
 * @param {Function} options.onOpenItem - Callback when item detail is requested
 */
export function renderAssessmentTable(container, { onOpenItem }) {
  const assessment = getAssessment();
  const isFinalized = assessment.status === 'FINALIZED';
  const rerender = () => renderAssessmentTable(container, { onOpenItem });

  // Set up subscription for auto re-render on state changes (once only)
  if (!isSubscribed) {
    subscribe(() => {
      if (currentRerenderFn) {
        currentRerenderFn();
      }
    });
    isSubscribed = true;
  }
  currentRerenderFn = rerender;

  const thead = el('thead', {},
    el('tr', {},
      el('th', {}, 'Позначення мети оцінювання'),
      el('th', {}, 'Мета оцінювання'),
      el('th', {}, el('span', { class: 'step-badge' }, '1'), ' Значення з БПБ'),
      el('th', {}, el('span', { class: 'step-badge' }, '1'), ' Значення з ЦПБ'),
      el('th', {}, 'Вибір оцінки'),
      el('th', {}, 'Докази / джерела'),
      el('th', {}, 'Висновок')
    )
  );

  const tbody = el('tbody', {});
  const groups = groupPlanItems(assessment);

  for (const familyGroup of groups) {
    // Family header row
    tbody.append(
      el('tr', { class: 'group-row family' },
        el('td', { colspan: '7' }, `${familyGroup.family} — ${familyGroup.family_title}`)
      )
    );

    for (const controlGroup of familyGroup.controls) {
      // Control header row
      tbody.append(
        el('tr', { class: 'group-row control' },
          el('td', { colspan: '7' }, `${controlGroup.control_id} — ${controlGroup.control_title}`)
        )
      );

      // Item rows with optional ODP subrows
      for (const pair of controlGroup.items) {
        const { row, subrows } = itemRow(pair, { onOpenItem, rerender, isFinalized });
        tbody.append(row);
        for (const subrow of subrows) {
          tbody.append(subrow);
        }
      }
    }
  }

  const table = el('table', { class: 'assessment-table' }, thead, tbody);
  container.replaceChildren(table);
}
