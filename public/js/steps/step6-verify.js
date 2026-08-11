import { el } from '../render/dom.js';
import { getState, setState } from '../state.js';
import { catalogs } from '../app.js';
import { buildProfile, STATUS } from '/core/profile-engine.js';
import { enhancementsForControl, suggestionsFromRisks } from '/core/enhancement-engine.js';
import { baseRisksFor, annotateRisk } from '/core/risk-engine.js';

function acceptedAnnotatedRisks(state) {
  const accepted = new Set(state.risks.accepted_base);
  return [
    ...baseRisksFor(catalogs.threatsRisks, state.selected_assets, state.passport.as_class).filter(r => accepted.has(r.id)),
    ...state.risks.custom.map(r => annotateRisk(r, catalogs.threatsRisks.scale)),
  ];
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

    // Словник дозаповнених значень: override-значення + глобальні політики
    const dictValues = [...new Set([
      ...Object.values(state.profile.param_overrides ?? {}),
      ...Object.values(state.global_constants ?? {}),
    ].filter(v => v && v.trim()))].sort((a, b) => a.localeCompare(b, 'uk'));
    const dictList = el('datalist', { id: 'param-dict' },
      ...dictValues.map(v => el('option', { value: v })));

    const commitOverride = (paramId, raw) => {
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
        const current = getState().profile.param_overrides[part.paramId] ?? (part.source === 'empty' ? '' : part.value);
        const input = el('input', {
          type: 'text', class: 'param-editor', list: 'param-dict', value: current,
          placeholder: part.info?.label ?? 'значення…',
        });
        input.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') commitOverride(part.paramId, input.value);
          if (e.key === 'Escape') rerender();
        });
        input.addEventListener('blur', () => commitOverride(part.paramId, input.value));
        span.replaceChildren(input);
        input.focus();
        input.select();
      });
      return span;
    };

    const renderLines = (lines) => lines.map(line =>
      el('p', { class: 'stmt', style: `margin-left:${line.depth * 1.5}em` },
        `${line.label} `, ...line.parts.map(paramSpan)));

    const sections = [];
    let currentClass = null;
    for (const item of doc.items) {
      if (item.classId !== currentClass) {
        currentClass = item.classId;
        sections.push(el('h3', {}, `${item.classId} — ${item.className}`));
      }
      const statusBadge = el('span', {
        class: item.status === STATUS.EXEMPT ? 'badge badge-exempt' :
               item.status === STATUS.EXCLUDED ? 'badge badge-excluded' : 'badge badge-applied' }, item.status);
      const body = [];
      if (item.status === STATUS.EXEMPT) {
        const noteBox = el('p', { class: 'exemption-note' }, item.exemptionNote);
        const editNoteBtn = el('button', { type: 'button', onclick: () => {
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
        body.push(noteBox);
        body.push(el('div', { class: 'actions' }, editNoteBtn,
          el('button', { type: 'button', onclick: () => {
            setState(s => ({ ...s, profile: { ...s.profile, exemption_overrides: [...s.profile.exemption_overrides, item.key] } }));
            rerender();
          } }, 'Застосовувати попри виняток')));
      } else if (item.status === STATUS.APPLIED) {
        for (const c of item.controls) {
          if (c.isEnhancement)
            body.push(el('p', { class: 'enh-subtitle' }, `Посилення за БПБ: ${c.id} — ${c.title}`));
          body.push(...renderLines(c.statementLines));
        }
        // Додавання посилень (один блок на базовий контроль)
        const presentIds = new Set([
          ...item.controls.map(c => c.id),
          ...item.enhancements.map(e => e.id),
        ]);
        const seenBases = new Set();
        for (const c of item.controls) {
          const baseId = c.id.includes('(') ? c.id.slice(0, c.id.indexOf('(')) : c.id;
          if (seenBases.has(baseId)) continue;
          seenBases.add(baseId);
          const available = enhancementsForControl(catalogs.ndTzi, baseId)
            .filter(e => !presentIds.has(e.id));
          const recommended = suggestions.get(baseId) ?? [];
          if (available.length) {
            const list = el('div', { class: 'enh-list', hidden: '' },
              ...available.map(e => {
                const rec = recommended.find(r => r.enhancementId === e.id);
                return el('button', { type: 'button', class: rec ? 'enh recommended' : 'enh', onclick: () => {
                  setState(s => ({ ...s, profile: { ...s.profile, enhancements: [...s.profile.enhancements, e.id] } }));
                  rerender();
                } }, rec ? `★ ${e.id} ${e.title} (рекомендовано ризиком ${rec.riskId})` : `${e.id} ${e.title}`);
              }));
            body.push(el('button', { type: 'button', onclick: () => { list.hidden = !list.hidden; } },
              `+ Додати посилення (${available.length})`), list);
          }
        }
        for (const e of item.enhancements) {
          body.push(el('div', { class: 'enh-applied' },
            el('p', {}, el('strong', {}, `Посилення: ${e.id} ${e.title} `),
              el('button', { type: 'button', onclick: () => {
                setState(s => ({ ...s, profile: { ...s.profile, enhancements: s.profile.enhancements.filter(x => x !== e.id) } }));
                rerender();
              } }, '✕')),
            ...renderLines(e.lines)));
        }
      }
      const toggleExclude = el('button', { type: 'button', onclick: () => {
        setState(s => ({ ...s, profile: { ...s.profile,
          excluded: s.profile.excluded.includes(item.key)
            ? s.profile.excluded.filter(k => k !== item.key)
            : [...s.profile.excluded, item.key] } }));
        rerender();
      } }, item.status === STATUS.EXCLUDED ? 'Повернути' : 'Не застосовується');
      sections.push(el('article', { class: 'profile-item' },
        el('header', {}, el('strong', {}, `${item.actionNumber}. ${item.actionName}`), statusBadge, toggleExclude),
        ...body));
    }
    container.replaceChildren(el('section', {},
      el('h2', {}, `Крок 6. Верифікація (${doc.summary.total} пунктів, порожніх: ${doc.summary.empty})`),
      dictList,
      ...sections));
  },
};
