import { el } from '../render/dom.js';
import { getState, setState } from '../state.js';
import { catalogs } from '../app.js';
import { baseRisksFor } from '/core/risk-engine.js';

export const step = {
  id: 'base-risks', title: 'Базові ризики',
  validate() { return []; },
  render(container) {
    const state = getState();
    const risks = baseRisksFor(catalogs.threatsRisks, state.selected_assets, state.passport.as_class);
    // Перший показ: усі прийняті за замовчуванням
    if (!state.risks.accepted_base.length && risks.length) {
      setState(s => ({ ...s, risks: { ...s.risks, accepted_base: risks.map(r => r.id) } }));
    }
    const accepted = new Set(getState().risks.accepted_base);
    const assetName = (id) => catalogs.assets.find(a => a.id === id)?.name ?? id;
    const header = el('tr', {}, ...['✓', 'ID', 'Актив', 'Загроза', 'Вразливість', 'Вплив', 'Ймовірність', 'Рівень', 'Стратегія', 'Відповідальний', 'Залишковий']
      .map(h => el('th', {}, h)));
    const rows = risks.map(r => el('tr', {},
      el('td', {}, el('input', { type: 'checkbox', ...(accepted.has(r.id) ? { checked: '' } : {}),
        onchange: (e) => setState(s => ({ ...s, risks: { ...s.risks,
          accepted_base: e.target.checked
            ? [...s.risks.accepted_base, r.id]
            : s.risks.accepted_base.filter(x => x !== r.id) } })) })),
      el('td', {}, r.id), el('td', {}, assetName(r.asset_id)), el('td', {}, r.threat),
      el('td', {}, r.vulnerability), el('td', {}, String(r.impact)),
      el('td', {}, `${r.likelihood_label} / ${r.likelihood}`),
      el('td', {}, el('span', { class: `badge lvl-${r.level}` }, r.level)),
      el('td', {}, r.treatment_strategy), el('td', {}, r.responsible), el('td', {}, r.residual_risk ?? '')));
    container.replaceChildren(el('section', {},
      el('h2', {}, `Крок 3. Первинна матриця загроз (${risks.length} ризиків за обраними активами)`),
      el('table', { class: 'risk-table' }, header, ...rows)));
  },
};
