import { el } from '../render/dom.js';
import { getState, setState } from '../state.js';
import { catalogs } from '../app.js';
import { buildProfile, STATUS, indexNdParams } from '/core/profile-engine.js';
import { enhancementsForControl, suggestionsFromRisks } from '/core/enhancement-engine.js';
import { baseRisksFor, annotateRisk } from '/core/risk-engine.js';

function acceptedAnnotatedRisks(state) {
  const accepted = new Set(state.risks.accepted_base);
  return [
    ...baseRisksFor(catalogs.threatsRisks, state.selected_assets, state.passport.as_class).filter(r => accepted.has(r.id)),
    ...state.risks.custom.map(r => annotateRisk(r, catalogs.threatsRisks.scale)),
  ];
}

// Персистентна історія значень за семантикою ODP (ключ — стемізована мітка параметра)
const DICT_KEY = 'offline-profile-param-dict';
// Префікс-стемінг (4 символи) зводить словоформи ("частотою"/"частота", "визначеною"/"визначена") до одного ключа
const labelKey = (label) => [...new Set((label ?? '').toLowerCase()
  .replace(/[^а-яіїєґa-z\s]/g, ' ')
  .split(/\s+/)
  .filter(w => w.length >= 4)
  .map(w => w.slice(0, 4)))].sort().join(' ');
const loadDict = () => { try { return JSON.parse(localStorage.getItem(DICT_KEY)) ?? {}; } catch { return {}; } };
function rememberValue(label, value) {
  const key = labelKey(label);
  if (!key || !value.trim()) return;
  const dict = loadDict();
  dict[key] = [value.trim(), ...(dict[key] ?? []).filter(v => v !== value.trim())].slice(0, 10);
  localStorage.setItem(DICT_KEY, JSON.stringify(dict));
}

export const step = {
  id: 'verify', title: 'Верифікація та посилення',
  validate() { return []; },
  render(container) {
    const state = getState();
    if (!state.info_type) {
      container.replaceChildren(el('section', {},
        el('h2', {}, 'Крок 6. Верифікація'),
        el('p', { class: 'warn' }, 'Спершу оберіть тип інформації на Кроці 4.')));
      return;
    }
    const doc = buildProfile(state, catalogs);
    const suggestions = suggestionsFromRisks(acceptedAnnotatedRisks(state));
    const rerender = () => { container.replaceChildren(); step.render(container); };

    // Сегментований словник: підказки лише для параметрів з такою самою міткою ODP
    const paramInfo = indexNdParams(catalogs.ndTzi);
    const overridesByLabel = new Map();
    for (const [pid, value] of Object.entries(state.profile.param_overrides ?? {})) {
      const key = labelKey(paramInfo.get(pid)?.label);
      if (!key || !value?.trim()) continue;
      if (!overridesByLabel.has(key)) overridesByLabel.set(key, new Set());
      overridesByLabel.get(key).add(value.trim());
    }
    const historyDict = loadDict();
    const suggestionsFor = (part) => {
      const key = labelKey(part.info?.label);
      return [...new Set([
        ...(overridesByLabel.get(key) ?? []),
        ...(historyDict[key] ?? []),
      ])];
    };
    const dictList = el('datalist', { id: 'param-dict' });

    const commitOverride = (paramId, label, raw) => {
      rememberValue(label, raw);
      setState(s => {
        const overrides = { ...s.profile.param_overrides };
        if (raw.trim()) overrides[paramId] = raw.trim(); else delete overrides[paramId];
        return { ...s, profile: { ...s.profile, param_overrides: overrides } };
      });
      rerender();
    };

    const paramSpan = (part) => {
      if (part.type === 'text') return part.value;
      const hint = part.info?.source_text || part.info?.label || '';
      const span = el('span', {
        class: `param src-${part.source}`,
        title: hint ? `${hint}\n\u041aлік — редагувати (${part.paramId})` : `Клік — редагувати (${part.paramId})`,
      }, part.value, part.source === 'empty' && hint ? el('sup', { class: 'param-info', title: hint }, ' ⓘ') : null);
      span.addEventListener('click', (ev) => {
        ev.stopPropagation();
        if (span.querySelector('input')) return;
        // Наповнити datalist підказками саме цього ODP
        dictList.replaceChildren(...suggestionsFor(part).map(v => el('option', { value: v })));
        const current = getState().profile.param_overrides[part.paramId] ?? (part.source === 'empty' ? '' : part.value);
        const input = el('input', {
          type: 'text', class: 'param-editor', list: 'param-dict', value: current,
          placeholder: part.info?.label ?? 'значення…',
        });
        input.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') commitOverride(part.paramId, part.info?.label, input.value);
          if (e.key === 'Escape') rerender();
        });
        input.addEventListener('blur', () => commitOverride(part.paramId, part.info?.label, input.value));
        span.replaceChildren(input);
        input.focus();
        input.select();
      });
      return span;
    };

    const renderLines = (lines) => lines.map(line =>
      el('p', { class: 'stmt', style: `margin-left:${line.depth * 1.5}em` },
        `${line.label} `, ...line.parts.map(paramSpan)));

    // Групування пунктів за класами для карточок-таблиць
    const byClass = new Map();
    for (const item of doc.items) {
      if (!byClass.has(item.classId)) byClass.set(item.classId, { className: item.className, items: [] });
      byClass.get(item.classId).items.push(item);
    }

    const itemRows = (item) => {
      const rows = [];
      const excludeBtn = el('button', { type: 'button', class: 'link-btn', onclick: () => {
        setState(s => ({ ...s, profile: { ...s.profile,
          excluded: s.profile.excluded.includes(item.key)
            ? s.profile.excluded.filter(k => k !== item.key)
            : [...s.profile.excluded, item.key] } }));
        rerender();
      } }, item.status === STATUS.EXCLUDED ? 'Повернути' : 'Не застосовується');
      const reqCell = (rowSpan) => el('td', { class: 'req-cell', ...(rowSpan > 1 ? { rowspan: String(rowSpan) } : {}) },
        el('div', {}, item.actionName), excludeBtn);
      const numCell = (rowSpan) => el('td', { class: 'num-cell', ...(rowSpan > 1 ? { rowspan: String(rowSpan) } : {}) }, item.actionNumber);

      if (item.status === STATUS.EXEMPT) {
        const noteBox = el('div', { class: 'exemption-note' }, item.exemptionNote);
        const editNoteBtn = el('button', { type: 'button', class: 'link-btn', onclick: () => {
          const area = el('textarea', { class: 'note-editor', rows: '3' });
          area.value = item.exemptionNote;
          const save = el('button', { type: 'button', onclick: () => {
            setState(s => ({ ...s, profile: { ...s.profile,
              exemption_note_overrides: { ...(s.profile.exemption_note_overrides ?? {}), [item.key]: area.value.trim() } } }));
            rerender();
          } }, 'Зберегти примітку');
          const cancel = el('button', { type: 'button', onclick: rerender }, 'Скасувати');
          noteBox.replaceChildren(area, el('div', { class: 'actions' }, save, cancel));
        } }, 'Редагувати примітку');
        const applyBtn = el('button', { type: 'button', class: 'link-btn', onclick: () => {
          setState(s => ({ ...s, profile: { ...s.profile, exemption_overrides: [...s.profile.exemption_overrides, item.key] } }));
          rerender();
        } }, 'Застосовувати попри виняток');
        rows.push(el('tr', { class: 'row-exempt' }, numCell(1), reqCell(1),
          el('td', { class: 'ctrl-cell' }, '—'),
          el('td', {}, el('span', { class: 'badge badge-exempt' }, 'Виконано архітектурно'), noteBox,
            el('div', { class: 'actions' }, editNoteBtn, applyBtn))));
        return rows;
      }
      if (item.status === STATUS.EXCLUDED) {
        rows.push(el('tr', { class: 'row-excluded' }, numCell(1), reqCell(1),
          el('td', { class: 'ctrl-cell' }, '—'),
          el('td', {}, el('span', { class: 'badge badge-excluded' }, 'Не застосовується (вручну)'))));
        return rows;
      }

      // APPLIED: рядок на кожен контроль/посилення + рядок «+ Посилення»
      const presentIds = new Set([...item.controls.map(c => c.id), ...item.enhancements.map(e => e.id)]);
      const seenBases = new Set();
      const enhButtons = [];
      for (const c of item.controls) {
        const baseId = c.id.includes('(') ? c.id.slice(0, c.id.indexOf('(')) : c.id;
        if (seenBases.has(baseId)) continue;
        seenBases.add(baseId);
        const available = enhancementsForControl(catalogs.ndTzi, baseId).filter(e => !presentIds.has(e.id));
        const recommended = suggestions.get(baseId) ?? [];
        if (!available.length) continue;
        const list = el('div', { class: 'enh-list', hidden: '' },
          ...available.map(e => {
            const rec = recommended.find(r => r.enhancementId === e.id);
            return el('button', { type: 'button', class: rec ? 'enh recommended' : 'enh', onclick: () => {
              setState(s => ({ ...s, profile: { ...s.profile, enhancements: [...s.profile.enhancements, e.id] } }));
              rerender();
            } }, rec ? `★ ${e.id} ${e.title} (рекомендовано ризиком ${rec.riskId})` : `${e.id} ${e.title}`);
          }));
        enhButtons.push(el('div', {},
          el('button', { type: 'button', class: 'link-btn', onclick: () => { list.hidden = !list.hidden; } },
            `+ Посилення (${available.length})`), list));
      }
      const totalRows = item.controls.length + item.enhancements.length + (enhButtons.length ? 1 : 0);
      let first = true;
      for (const c of item.controls) {
        const cells = [];
        if (first) { cells.push(numCell(totalRows), reqCell(totalRows)); first = false; }
        cells.push(
          el('td', { class: 'ctrl-cell' }, c.id),
          el('td', {}, ...renderLines(c.statementLines)));
        rows.push(el('tr', {}, ...cells));
      }
      for (const e of item.enhancements) {
        rows.push(el('tr', { class: 'row-enh' },
          el('td', { class: 'ctrl-cell' }, e.id, el('div', { class: 'ctrl-note' }, '(додано)'),
            el('button', { type: 'button', class: 'link-btn', onclick: () => {
              setState(s => ({ ...s, profile: { ...s.profile, enhancements: s.profile.enhancements.filter(x => x !== e.id) } }));
              rerender();
            } }, '✕')),
          el('td', {}, ...renderLines(e.lines))));
      }
      if (enhButtons.length)
        rows.push(el('tr', { class: 'row-enh-add' }, el('td', { colspan: '2' }, ...enhButtons)));
      return rows;
    };

    const cards = [];
    for (const [classId, group] of byClass) {
      const tbl = el('table', { class: 'verify-table' },
        el('tr', {}, ...['№', 'Вимога', 'Захід', 'Налаштований зміст заходу захисту'].map(h => el('th', {}, h))),
        ...group.items.flatMap(itemRows));
      const toggle = el('span', { class: 'collapse-mark' }, '▲');
      const header = el('header', { class: 'class-card-header', onclick: () => {
        tbl.hidden = !tbl.hidden;
        toggle.textContent = tbl.hidden ? '▼' : '▲';
      } },
        el('strong', {}, `${group.className} (${classId})`),
        el('span', { class: 'req-count' }, `${group.items.length} вимог `, toggle));
      cards.push(el('div', { class: 'class-card' }, header, tbl));
    }

    const summaryBar = el('div', { class: 'summary-bar' },
      el('span', { class: 'badge badge-applied' }, `Пунктів ${doc.summary.total}`),
      el('span', { class: 'badge stat-auto' }, `Автозаповнено ${doc.summary.autofilled}`),
      el('span', { class: 'badge stat-empty' }, `Порожні ${doc.summary.empty}`),
      el('span', { class: 'badge badge-exempt' }, `Винятків ${doc.summary.exempted}`),
      el('span', { class: 'badge badge-excluded' }, `Виключено ${doc.summary.excluded}`));

    container.replaceChildren(el('section', {},
      el('h2', {}, 'Крок 6. Верифікація та посилення'),
      summaryBar,
      dictList,
      ...cards));
  },
};
