import { el } from '../render/dom.js';
import { getState, setState } from '../state.js';
import { catalogs } from '../app.js';
import { filterAssetsByClass, groupByCategory } from '/core/asset-catalog.js';

export const step = {
  id: 'assets', title: 'Активи',
  validate(state) { return state.selected_assets.length ? [] : ['Оберіть щонайменше один актив']; },
  render(container) {
    const state = getState();
    const visible = filterAssetsByClass(catalogs.assets, state.passport.as_class);
    const groups = groupByCategory(visible);
    const sections = [...groups.entries()].map(([category, assets]) =>
      el('fieldset', {}, el('legend', {}, category),
        ...assets.map(a => el('label', { class: 'checkbox' },
          el('input', { type: 'checkbox', value: a.id,
            ...(state.selected_assets.includes(a.id) ? { checked: '' } : {}),
            onchange: (e) => setState(s => ({ ...s,
              selected_assets: e.target.checked
                ? [...s.selected_assets, a.id]
                : s.selected_assets.filter(x => x !== a.id) })) }),
          `${a.id}. ${a.name}`))));
    container.replaceChildren(
      el('section', {},
        el('h2', {}, `Крок 2. Вибір активів (доступно для АС-${state.passport.as_class}: ${visible.length} із ${catalogs.assets.length})`),
        ...sections));
  },
};
