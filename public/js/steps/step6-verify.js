import { el, option } from '../render/dom.js';
import { getState, setState } from '../state.js';
import { catalogs, goToStep } from '../app.js';
import { buildProfile, STATUS } from '/core/profile-engine.js';
import { enhancementsForControl, suggestionsFromRisks } from '/core/enhancement-engine.js';
import { acceptedRisksFor } from '/core/risk-engine.js';
import { mergeRecord, suggestionsFor as dictSuggestions } from '/core/odp-dictionary.js';
import { applyCpbTemplate, validateTemplate, makeIcsTemplate, makeCpbTemplate, makeApprovedRecord } from '/core/template-io.js';

const NAME_RE = /^[a-zа-яіїєґ0-9_\-]+$/i;
// Дефолтне ім'я з назви ІКС (пробіли → дефіси, недопустимі символи геть)
const suggestName = (icsName) =>
  (icsName || '').trim().replace(/\s+/g, '-').replace(/[^a-zа-яіїєґ0-9_\-]/gi, '').slice(0, 60);

function acceptedAnnotatedRisks(state) {
  return acceptedRisksFor(catalogs.threatsRisks, state.selected_assets, state.passport.as_class, state.risks);
}

// Запис факту заповнення у серверний словник (з типом інформації) + локальна копія
function recordToDictionary(paramId, info, value) {
  if (!value?.trim()) return;
  const rec = { paramId, label: info?.label ?? '', source_text: info?.source_text ?? '',
    value: value.trim(), info_type: getState().info_type };
  catalogs.odpDictionary = mergeRecord(catalogs.odpDictionary, rec);
  fetch('/api/dictionary/record', { method: 'POST', body: JSON.stringify(rec) }).catch(() => {});
}

export const step = {
  id: 'verify', title: 'Верифікація та експорт',
  validate() { return []; },
  render(container) {
    const state = getState();
    if (!state.info_type) {
      container.replaceChildren(el('section', {},
        el('h2', {}, 'Крок 4. Верифікація'),
        el('p', { class: 'warn' }, 'Спершу оберіть тип інформації на Кроці 1.')));
      return;
    }
    const doc = buildProfile(state, catalogs);
    const acceptedRisks = acceptedAnnotatedRisks(state);
    const suggestions = suggestionsFromRisks(acceptedRisks);
    const rerender = () => { container.replaceChildren(); step.render(container); };

    // Застосувати раніше збережений шаблонний профіль ЦПБ (ініціація відбувається
    // автоматично — buildProfile вище вже рахує актуальний стан, кнопка лише
    // підвантажує готовий набір param_overrides/enhancements)
    const cpbTplSelect = el('select', {});
    (async () => {
      const { items, names } = await (await fetch('/api/templates/cpb')).json();
      const matching = (items ?? (names ?? []).map(n => ({ name: n, info_type: null })))
        .filter(i => i.info_type === getState().info_type);
      cpbTplSelect.replaceChildren(
        option('', matching.length ? '— шаблон ЦПБ —' : '— немає шаблонів для цього типу інформації —'),
        ...matching.map(i => option(i.name, i.name)));
    })();
    const cpbTplBtn = el('button', { type: 'button', onclick: async () => {
      if (!cpbTplSelect.value) return;
      const tpl = await (await fetch(`/api/templates/cpb/${encodeURIComponent(cpbTplSelect.value)}`)).json();
      if (validateTemplate('cpb', tpl).length) { alert('Шаблон пошкоджено'); return; }
      setState(s => applyCpbTemplate(s, tpl));
      rerender();
    } }, 'Застосувати шаблонний профіль безпеки (ЦПБ)');

    // Мапа «захід → ризики, які він покриває» — лише для екрана, у DOCX не потрапляє
    const risksByRef = new Map();
    for (const r of acceptedRisks)
      for (const ref of [...(r.control_refs ?? []), ...(r.enhancement_suggestions ?? [])]) {
        if (!risksByRef.has(ref)) risksByRef.set(ref, []);
        risksByRef.get(ref).push(r);
      }
    // Довідкова мапа з усього каталогу — коли захід не покриває жодного з ризиків реєстру
    const catalogByRef = new Map();
    for (const r of catalogs.threatsRisks.risks)
      for (const ref of [...(r.control_refs ?? []), ...(r.enhancement_suggestions ?? [])]) {
        if (!catalogByRef.has(ref)) catalogByRef.set(ref, []);
        catalogByRef.get(ref).push(r);
      }
    const lookup = (map, ctrlId) => {
      let found = map.get(ctrlId) ?? [];
      // Посилення без власних посилань успадковує ризики базового контролю
      if (!found.length && ctrlId.includes('('))
        found = map.get(ctrlId.slice(0, ctrlId.indexOf('('))) ?? [];
      return found;
    };
    const riskChips = (ctrlId) => {
      const covered = lookup(risksByRef, ctrlId);
      if (covered.length) return el('div', { class: 'risk-chips' },
        ...covered.map(r => el('span', {
          class: `risk-chip lvl-${r.level.replaceAll(' ', '-')}`,
          'data-tip': `Покриває ризик ${r.id} (${r.level}): ${r.threat}${r.vulnerability ? ' — ' + r.vulnerability : ''}`,
        }, r.id)));
      // Контролі-політики (XX-1) — організаційна основа всього класу, а не окремих ризиків
      if (/^[A-ZА-Я]{2}-1$/.test(ctrlId)) return el('div', { class: 'risk-chips' },
        el('span', { class: 'risk-chip chip-policy', 'data-tip': 'Політика та процедури — організаційна основа всіх заходів цього класу' }, 'основа класу'));
      const typical = lookup(catalogByRef, ctrlId);
      if (!typical.length) return null;
      return el('div', { class: 'risk-chips' },
        ...typical.map(r => el('span', {
          class: 'risk-chip chip-catalog',
          'data-tip': `Сімейство заходів типово покриває ризик ${r.id}: ${r.threat}${r.vulnerability ? ' — ' + r.vulnerability : ''}`,
        }, r.id)));
    };

    // Сегментований словник: підказки з серверного словника ODP (спочатку — цього типу інформації)
    const suggestionsForPart = (part) =>
      dictSuggestions(catalogs.odpDictionary, part.paramId, part.info?.label, state.info_type);
    const dictList = el('datalist', { id: 'param-dict' });

    const commitOverride = (paramId, info, raw) => {
      recordToDictionary(paramId, info, raw);
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
        dictList.replaceChildren(...suggestionsForPart(part).map(v => el('option', { value: v })));
        const current = getState().profile.param_overrides[part.paramId] ?? (part.source === 'empty' ? '' : part.value);
        const input = el('input', {
          type: 'text', class: 'param-editor', list: 'param-dict', value: current,
          placeholder: part.info?.label ?? 'значення…',
        });
        input.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') commitOverride(part.paramId, part.info, input.value);
          if (e.key === 'Escape') rerender();
        });
        input.addEventListener('blur', () => commitOverride(part.paramId, part.info, input.value));
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
      // Лічильники параметрів пункту: заповнені (policy/bpb/generic/override) та порожні
      let filled = 0, empty = 0;
      const allLines = [...item.controls.flatMap(c => c.statementLines), ...item.enhancements.flatMap(e => e.lines)];
      for (const line of allLines)
        for (const part of line.parts) {
          if (part.type !== 'param') continue;
          if (part.source === 'empty') empty++; else filled++;
        }
      const paramStats = (filled || empty) ? el('div', { class: 'param-stats' },
        filled ? el('span', { class: 'badge stat-auto' }, `Заповнено ${filled}`) : null,
        empty ? el('span', { class: 'badge stat-empty' }, `Порожні ${empty}`) : null) : null;
      const reqCell = (rowSpan) => el('td', { class: 'req-cell', ...(rowSpan > 1 ? { rowspan: String(rowSpan) } : {}) },
        el('div', {}, item.actionName), paramStats, excludeBtn);
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
          el('button', { type: 'button', class: 'add link-btn', onclick: () => { list.hidden = !list.hidden; } },
            `Виберіть додаткові посилення для заходу (${available.length})`), list));
      }
      const totalRows = item.controls.length + item.enhancements.length + (enhButtons.length ? 1 : 0);
      let first = true;
      for (const c of item.controls) {
        const cells = [];
        if (first) { cells.push(numCell(totalRows), reqCell(totalRows)); first = false; }
        cells.push(
          el('td', { class: 'ctrl-cell' }, c.id, riskChips(c.id)),
          el('td', {}, ...renderLines(c.statementLines)));
        rows.push(el('tr', {}, ...cells));
      }
      for (const e of item.enhancements) {
        rows.push(el('tr', { class: 'row-enh' },
          el('td', { class: 'ctrl-cell' }, e.id, riskChips(e.id), el('div', { class: 'ctrl-note' }, '(додано)'),
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

    // Шаблони та експорт — фінальна секція внизу сторінки (колишній окремий крок)
    const statusBox = el('p', { class: 'save-status' });
    const showStatus = (ok, text) => {
      statusBox.className = ok ? 'save-status ok' : 'save-status warn';
      statusBox.textContent = text;
    };
    const nameInput = el('input', { type: 'text', class: 'tpl-name',
      value: suggestName(state.passport.ics_name),
      placeholder: 'імʼя запису (літери, цифри, дефіс, підкреслення)' });
    const saveTemplate = async (kind, tpl, label) => {
      const name = nameInput.value.trim();
      if (!name) { showStatus(false, 'Вкажіть імʼя запису у полі вище.'); nameInput.focus(); return false; }
      if (!NAME_RE.test(name)) { showStatus(false, 'Імʼя може містити лише літери, цифри, дефіс і підкреслення (без пробілів).'); nameInput.focus(); return false; }
      try {
        const r = await fetch(`/api/templates/${kind}/${encodeURIComponent(name)}`, {
          method: 'POST', body: JSON.stringify(tpl) });
        const body = await r.json();
        showStatus(r.ok, r.ok ? `${label} «${name}» збережено.` : `Помилка: ${body.error}`);
        return r.ok;
      } catch (err) {
        showStatus(false, `Помилка мережі: ${err.message}`);
        return false;
      }
    };
    const exportBtn = el('button', { type: 'button', class: 'collapse-safe', onclick: async () => {
      const r = await fetch('/api/export/docx', { method: 'POST', body: JSON.stringify({ state: getState() }) });
      if (!r.ok) { showStatus(false, 'Помилка експорту: ' + (await r.json()).error); return; }
      const blob = await r.blob();
      const a = el('a', { href: URL.createObjectURL(blob),
        download: decodeURIComponent(r.headers.get('Content-Disposition')?.match(/filename\*=UTF-8''(.+)/)?.[1] ?? 'профіль.docx') });
      a.click();
      URL.revokeObjectURL(a.href);
      showStatus(true, 'DOCX сформовано (також записано у папку exports/).');
    } }, '🖨️ Експорт у DOCX');
    const approveBtn = el('button', { type: 'button', class: 'primary', onclick: async () => {
      const d = buildProfile(getState(), catalogs);
      const summary = { ...d.summary,
        risks_count: getState().risks.accepted_base.length + getState().risks.custom.length,
        enhancements_count: getState().profile.enhancements.length };
      const ok = await saveTemplate('approved', makeApprovedRecord(getState(), summary), 'Затверджений профіль');
      // Перехід у Реєстр — там одразу видно щойно затверджений заповнений ЦПБ
      if (ok) goToStep(0);
    } }, '✅ Затвердити профіль (в реєстр)');

    container.replaceChildren(el('section', {},
      el('h2', {}, 'Крок 4. Верифікація та експорт'),
      el('div', { class: 'actions' }, cpbTplSelect, cpbTplBtn),
      summaryBar,
      dictList,
      ...cards,
      el('hr'),
      el('h3', {}, 'Шаблони та експорт'),
      el('label', { class: 'field' }, 'Імʼя для збереження шаблону/запису', nameInput),
      el('div', { class: 'actions' },
        el('button', { type: 'button', class: 'collapse-safe', onclick: () => saveTemplate('ics', makeIcsTemplate(getState()), 'Шаблон ІКС') }, '💾 Зберегти як шаблон ІКС'),
        el('button', { type: 'button', class: 'collapse-safe', onclick: () => saveTemplate('cpb', makeCpbTemplate(getState()), 'Шаблон ЦПБ') }, '💾 Зберегти як шаблон ЦПБ'),
        exportBtn, approveBtn),
      statusBox));
  },
};
