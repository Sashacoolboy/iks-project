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

    const paramSpan = (part) => {
      if (part.type === 'text') return part.value;
      const span = el('span', { class: `param src-${part.source}`, title: part.paramId }, part.value);
      span.addEventListener('click', () => {
        const current = getState().profile.param_overrides[part.paramId] ?? (part.source === 'empty' ? '' : part.value);
        const next = prompt(`Значення параметра ${part.paramId}:`, current);
        if (next === null) return;
        setState(s => {
          const overrides = { ...s.profile.param_overrides };
          if (next.trim()) overrides[part.paramId] = next.trim(); else delete overrides[part.paramId];
          return { ...s, profile: { ...s.profile, param_overrides: overrides } };
        });
        rerender();
      });
      return span;
    };

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
        body.push(el('p', { class: 'exemption-note' }, item.exemptionNote));
        body.push(el('button', { type: 'button', onclick: () => {
          setState(s => ({ ...s, profile: { ...s.profile, exemption_overrides: [...s.profile.exemption_overrides, item.key] } }));
          rerender();
        } }, 'Застосовувати попри виняток'));
      } else if (item.status === STATUS.APPLIED) {
        for (const c of item.controls)
          for (const line of c.statementLines)
            body.push(el('p', { class: 'stmt', style: `margin-left:${line.depth * 1.5}em` },
              `${line.label} `, ...line.parts.map(paramSpan)));
        // Посилення
        for (const c of item.controls) {
          const baseId = c.id.includes('(') ? c.id.slice(0, c.id.indexOf('(')) : c.id;
          const available = enhancementsForControl(catalogs.ndTzi, baseId)
            .filter(e => !state.profile.enhancements.includes(e.id));
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
        for (const e of item.enhancements)
          body.push(el('p', { class: 'enh-applied' }, `Посилення: ${e.id} ${e.title} `,
            el('button', { type: 'button', onclick: () => {
              setState(s => ({ ...s, profile: { ...s.profile, enhancements: s.profile.enhancements.filter(x => x !== e.id) } }));
              rerender();
            } }, '✕')));
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
      ...sections));
  },
};
