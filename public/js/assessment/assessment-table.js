import { el, showModal } from '../render/dom.js';
import { getAssessment, setAssessment, subscribe } from './assessment-state.js';
import { updateResult } from '../../../core/assessment/assessment-run.js';
import { renderControlDocument } from './control-document-view.js';
import { renderEvidenceEditor } from './evidence-editor.js';
import { renderFindingDialog } from './finding-dialog.js';
import { conclusionTextFor, sourcesForConclusion, setConclusionText, linkSource, unlinkSource } from '../../../core/assessment/conclusions.js';

export const RESULT_LABELS = {
  NOT_ASSESSED: 'Не оцінено',
  SATISFIED: 'Позитивно',
  //PARTIALLY_SATISFIED: 'Частково відповідає',
  NOT_SATISFIED: 'Негативно',
  //NOT_APPLICABLE: 'Не застосовується'
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
  const checklistByControlId = new Map((assessment.plan?.checklist ?? []).map(c => [c.control_id, c]));
  const groups = [];
  const groupByFamily = new Map();

  for (const planItem of assessment.plan?.items ?? []) {
    const checklistEntry = checklistByControlId.get(planItem.control_id);
    if (checklistEntry?.included === false) continue;

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
        checklist_statements: (checklistEntry?.statements ?? []).map(s => s.text),
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

// Module-level state for expanded control document-view blocks (family::control_id)
const expandedControlDocs = new Set();

// Module-level state for expanded checklist («План перевірки») blocks (family::control_id)
const expandedChecklists = new Set();

// Рядок-перемикач внутрішнього акордеону («План перевірки» / «ЦПБ»)
function accordionHeaderRow(label, isExpanded, onToggle) {
  return el('tr', { class: 'accordion-header-row', onclick: onToggle },
    el('td', { colspan: '7' }, el('span', { class: 'collapse-mark' }, isExpanded ? '▼' : '▶'), ` ${label}`));
}

// Module-level state for re-render subscription
let isSubscribed = false;
let currentRerenderFn = null;

function patchResult(sourceId, patch) {
  const current = getAssessment();
  const { assessment } = updateResult(current, sourceId, patch);
  setAssessment(assessment);
  const planItem = assessment.plan.items.find(p => p.assessment_source_id === sourceId);
  const rec = planItem ? buildDictionaryRecord(planItem, patch, assessment.metadata?.info_type) : null;
  if (rec) fetch('/api/dictionary/record', { method: 'POST', body: JSON.stringify(rec) }).catch(() => {});
}

function formatOdpValue(value) {
  if (value === null || value === undefined) return null;
  if (Array.isArray(value)) return value.join('; ');
  return String(value);
}

// Запис у словник політик: лише для ODP_DEFINITION-рядків (однозначний ODP), лише коли result дає вердикт
export function buildDictionaryRecord(planItem, patch, infoType) {
  if (planItem.kind !== 'ODP_DEFINITION') return null;
  const verdict = patch.result === 'SATISFIED' || patch.result === 'PARTIALLY_SATISFIED' ? 'VALID'
    : patch.result === 'NOT_SATISFIED' ? 'INVALID' : null;
  if (!verdict) return null;
  const own = (planItem.odp_values ?? []).find(v => v.assessment_odp_id === planItem.assessment_source_id);
  if (!own) return null;
  const value = formatOdpValue(own.target_value);
  if (!value) return null;
  return {
    paramId: own.local_odp_id,
    label: own.semantic_label ?? '',
    source_text: own.semantic_source_text ?? '',
    value,
    info_type: infoType ?? null,
    verdict,
  };
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

export function firstSegmentLabel(path) {
  const seg = String(path ?? '').split('.')[0];
  const wrapped = seg.match(/^[\[(]([a-zA-Zа-яіїєґА-ЯІЇЄҐ0-9]+)[\])]/);
  if (wrapped) return wrapped[1];
  return seg.replace(/[\[(].*$/, '');
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

// Компактний перелік порядкових номерів пов'язаних записів (докази/недоліки); сам текст — у модалці за ✎
function idBadges(ids) {
  if (!ids.length) return el('span', { class: 'hint' }, '—');
  return el('span', { class: 'id-badges' }, ...ids.map((_, i) => el('span', { class: 'id-badge' }, String(i + 1))));
}

// План виправлення — recommendation кожного пов'язаного недоліку, у тому ж нумеруванні, що й колонка «Недоліки»
function remediationBadges(linkedFindings) {
  if (!linkedFindings.length) return el('span', { class: 'hint' }, '—');
  return el('span', { class: 'id-badges' }, ...linkedFindings.map((f, i) =>
    el('span', { class: 'id-badge', title: f.recommendation || '(план виправлення не вказано)' }, String(i + 1))));
}

function pencilBtn(onclick, title) {
  return el('button', { type: 'button', class: 'link pencil-btn', title, onclick }, '✎');
}

// Невелика модалка замість колишньої спільної панелі — перерендерюється при кожній зміні стану, доки відкрита
function openEvidenceModal(sourceId) {
  const body = el('div', {});
  renderEvidenceEditor(body, { sourceId });
  const unsubscribe = subscribe(() => renderEvidenceEditor(body, { sourceId }));
  showModal(body, { title: `Докази — ${sourceId}`, onClose: unsubscribe });
}

function openFindingsModal(sourceId) {
  const body = el('div', {});
  renderFindingDialog(body, { sourceId });
  const unsubscribe = subscribe(() => renderFindingDialog(body, { sourceId }));
  showModal(body, { title: `Недоліки та план виправлення — ${sourceId}`, onClose: unsubscribe });
}

// Пікер інших ODP (checkbox-список з пошуком), щоб долучити/вилучити з поточного висновку
function openOdpPickerModal({ excludeId, initiallySelected, onConfirm }) {
  const assessment = getAssessment();
  const allItems = (assessment.plan?.items ?? []).filter(p => p.assessment_source_id !== excludeId);
  let selected = new Set(initiallySelected);

  const searchInput = el('input', { type: 'text', placeholder: 'пошук за ID, заходом або текстом…' });
  const listBox = el('div', { class: 'ctrl-list' });

  const renderList = () => {
    const q = searchInput.value.trim().toLowerCase();
    const filtered = q
      ? allItems.filter(p => p.assessment_source_id.toLowerCase().includes(q)
          || (p.control_id ?? '').toLowerCase().includes(q)
          || (p.resolved_objective ?? '').toLowerCase().includes(q))
      : allItems;
    listBox.replaceChildren(...filtered.map(p => el('label', { class: 'checkbox' },
      el('input', {
        type: 'checkbox', checked: selected.has(p.assessment_source_id) ? '' : null,
        onchange: (e) => { if (e.target.checked) selected.add(p.assessment_source_id); else selected.delete(p.assessment_source_id); }
      }),
      ` ${p.assessment_source_id} — ${(p.resolved_objective ?? '').slice(0, 90)}`)));
  };
  searchInput.addEventListener('input', renderList);
  renderList();

  const applyBtn = el('button', { type: 'button', onclick: () => { onConfirm([...selected]); modal.close(); } }, 'Застосувати');
  const cancelBtn = el('button', { type: 'button', onclick: () => modal.close() }, 'Скасувати');

  const modal = showModal(
    el('div', {}, searchInput, listBox, el('div', { class: 'actions' }, applyBtn, cancelBtn)),
    { title: 'Додати ODP до висновку' });
}

function openConclusionModal(sourceId) {
  const assessment = getAssessment();
  const result = assessment.results.find(r => r.assessment_source_id === sourceId);
  const isFinalized = assessment.status === 'FINALIZED';
  const conclusionId = result?.conclusion_id ?? null;
  const currentText = conclusionTextFor(assessment, result);
  let linkedOthers = conclusionId ? sourcesForConclusion(assessment, conclusionId).filter(id => id !== sourceId) : [];

  const textarea = el('textarea', { rows: '4', disabled: isFinalized ? '' : null, placeholder: 'Висновок...' }, currentText);

  const linkedList = el('div', { class: 'id-badges' });
  const renderLinkedList = () => {
    linkedList.replaceChildren(
      ...(linkedOthers.length
        ? linkedOthers.map(id => el('span', { class: 'badge ctrl-chip' }, id,
            isFinalized ? null : el('button', {
              type: 'button', class: 'chip-remove',
              onclick: () => { linkedOthers = linkedOthers.filter(x => x !== id); renderLinkedList(); }
            }, '✕')))
        : [el('span', { class: 'hint' }, 'Лише цей пункт')]));
  };
  renderLinkedList();

  const addBtn = el('button', {
    type: 'button',
    disabled: isFinalized ? '' : null,
    onclick: () => openOdpPickerModal({
      excludeId: sourceId,
      initiallySelected: linkedOthers,
      onConfirm: (ids) => { linkedOthers = ids; renderLinkedList(); }
    })
  }, '+ Додати ODP');

  const saveBtn = el('button', {
    type: 'button',
    class: 'primary',
    disabled: isFinalized ? '' : null,
    onclick: () => {
      let current = getAssessment();
      const { assessment: a1, conclusion_id } = setConclusionText(current, sourceId, textarea.value);
      current = a1;
      if (conclusion_id) {
        const nowLinked = new Set(sourcesForConclusion(current, conclusion_id).filter(id => id !== sourceId));
        for (const id of linkedOthers) {
          if (!nowLinked.has(id)) current = linkSource(current, conclusion_id, id).assessment;
        }
        for (const id of nowLinked) {
          if (!linkedOthers.includes(id)) current = unlinkSource(current, id).assessment;
        }
      }
      setAssessment(current);
      modal.close();
    }
  }, 'Зберегти');
  const cancelBtn = el('button', { type: 'button', onclick: () => modal.close() }, 'Скасувати');

  const body = el('div', {},
    el('label', { class: 'field' }, 'Висновок', textarea),
    el('fieldset', {},
      el('legend', {}, 'Охоплює ще ODP'),
      linkedList,
      isFinalized ? null : addBtn),
    isFinalized ? null : el('div', { class: 'actions' }, saveBtn, cancelBtn));

  const modal = showModal(body, { title: `Висновок — ${sourceId}` });
}

function itemRow({ planItem, result }, { rerender, isFinalized }) {
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

  const evidenceIds = result?.evidence_ids ?? [];
  const evidenceCell = el('td', { class: 'evidence' },
    idBadges(evidenceIds),
    ' ',
    pencilBtn(() => openEvidenceModal(sourceId), 'Редагувати докази'));

  const findingIds = result?.finding_ids ?? [];
  const linkedFindings = findingIds
    .map(id => getAssessment().findings.find(f => f.finding_id === id))
    .filter(Boolean);
  const findingsCell = el('td', { class: 'findings' },
    idBadges(findingIds),
    ' ',
    pencilBtn(() => openFindingsModal(sourceId), 'Редагувати недоліки'));

  const remediationCell = el('td', { class: 'remediation' },
    remediationBadges(linkedFindings),
    ' ',
    pencilBtn(() => openFindingsModal(sourceId), 'Редагувати план виправлення'));

  // Conclusion cell with edit button — спільний висновок показує, скільки ще ODP він охоплює
  const conclusionText = conclusionTextFor(getAssessment(), result);
  const sharedCount = result?.conclusion_id ? sourcesForConclusion(getAssessment(), result.conclusion_id).length : 0;
  const conclusionCell = el('td', { class: 'conclusion' },
    el('span', {}, conclusionText),
    sharedCount > 1 ? el('span', { class: 'id-badge', title: 'Спільний висновок для кількох ODP' }, `×${sharedCount}`) : null,
    ' ',
    pencilBtn(() => openConclusionModal(sourceId), 'Редагувати висновок'));

  const row = el('tr', { class: 'assessment-item-row' },
    el('td', {}, toggleBtn),
    el('td', { class: 'objective' }, planItem.resolved_objective ?? ''),
    el('td', {}, resultSelect),
    evidenceCell,
    findingsCell,
    remediationCell,
    conclusionCell
  );

  const subrows = isExpanded ? odpSubrows(planItem) : [];
  return { row, subrows };
}

/**
 * Renders the assessment table with grouped rows
 * @param {HTMLElement} container - The container element
 */
export function renderAssessmentTable(container) {
  const assessment = getAssessment();
  const isFinalized = assessment.status === 'FINALIZED';
  const rerender = () => renderAssessmentTable(container);

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
      el('th', {}, 'Вибір оцінки'),
      el('th', {}, 'Докази'),
      el('th', {}, 'Недоліки'),
      el('th', {}, 'План виправлення'),
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
      const controlKey = `${familyGroup.family}::${controlGroup.control_id}`;
      const isDocExpanded = expandedControlDocs.has(controlKey);
      const isChecklistExpanded = expandedChecklists.has(controlKey);

      // Control header row — лише заголовок, перемикачі акордеонів нижче — окремі
      tbody.append(
        el('tr', { class: 'group-row control' },
          el('td', { colspan: '7' }, `${controlGroup.control_id} — ${controlGroup.control_title}`)
        )
      );

      if (controlGroup.checklist_statements.length) {
        tbody.append(accordionHeaderRow(
          `План перевірки (${controlGroup.checklist_statements.length})`,
          isChecklistExpanded,
          () => { if (isChecklistExpanded) expandedChecklists.delete(controlKey); else expandedChecklists.add(controlKey); rerender(); }));
        if (isChecklistExpanded) {
          tbody.append(
            el('tr', { class: 'checklist-statement-row' },
              el('td', { colspan: '7' },
                ...controlGroup.checklist_statements.map((text, i) => el('div', {}, el('em', {}, `${i + 1}. ${text}`)))))
          );
        }
      }

      tbody.append(accordionHeaderRow(
        'ЦПБ',
        isDocExpanded,
        () => { if (isDocExpanded) expandedControlDocs.delete(controlKey); else expandedControlDocs.add(controlKey); rerender(); }));
      if (isDocExpanded) {
        const docCell = el('td', { colspan: '7' });
        tbody.append(el('tr', { class: 'control-doc-row' }, docCell));
        renderControlDocument(docCell, controlGroup.items);
      }

      // Item rows with optional ODP subrows
      for (const pair of controlGroup.items) {
        const { row, subrows } = itemRow(pair, { rerender, isFinalized });
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
