import { el } from '../render/dom.js';
import { getState, setState } from '../state.js';
import { catalogs } from '../app.js';
import { filterAssetsByClass, groupByCategory } from '/core/asset-catalog.js';
import { baseRisksFor } from '/core/risk-engine.js';
import { openRiskFormModal } from '../risk-form.js';

const assetName = (id) => catalogs.assets.find(a => a.id === id)?.name ?? id;

export const step = {
  id: 'assets', title: 'Активи',
  validate(state) { return state.selected_assets.length ? [] : ['Оберіть щонайменше один актив']; },
  render(container) {
    const rerender = () => { container.replaceChildren(); step.render(container); };
    const hidden0 = new Set(getState().risks.hidden_base ?? []);
    const risksForAsset0 = (assetId, asClass) =>
      baseRisksFor(catalogs.threatsRisks, [assetId], asClass).filter(r => !hidden0.has(r.id));
    // Активи, обрані поза цим кроком (завантажений шаблон ІКС, старий локальний стан
    // до появи цієї фічі) ще не мають запису в defaulted_assets — донараховуємо їм
    // типове включення ризиків тут-таки, при рендері, а не лише в toggleAsset.
    setState(s => {
      const defaulted = new Set(s.risks.defaulted_assets ?? []);
      const pending = s.selected_assets.filter(id => !defaulted.has(id));
      if (!pending.length) return s;
      let accepted = [...s.risks.accepted_base];
      for (const assetId of pending) {
        for (const r of risksForAsset0(assetId, s.passport.as_class)) {
          if (!accepted.includes(r.id)) accepted.push(r.id);
        }
        defaulted.add(assetId);
      }
      return { ...s, risks: { ...s.risks, accepted_base: accepted, defaulted_assets: [...defaulted] } };
    });

    const state = getState();
    const visible = filterAssetsByClass(catalogs.assets, state.passport.as_class);
    const groups = groupByCategory(visible);
    const hidden = new Set(state.risks.hidden_base ?? []);
    const risksForAsset = (assetId, asClass) =>
      baseRisksFor(catalogs.threatsRisks, [assetId], asClass).filter(r => !hidden.has(r.id));

    // При першому виборі активу його (ще не приховані) базові ризики за замовчуванням
    // включаються в роботу на Кроці 3 (accepted_base) — далі користувач сам знімає
    // чекбокси на непотрібних. При знятті активу accepted_base не чіпаємо: ризики
    // просто перестають з'являтись (бо їх активу немає серед selected_assets), а
    // попередній вибір користувача відновлюється, якщо актив обрати знову.
    const toggleAsset = (assetId, checked) => setState(s => {
      if (!checked) return { ...s, selected_assets: s.selected_assets.filter(x => x !== assetId) };
      const defaulted = new Set(s.risks.defaulted_assets ?? []);
      // Автозаповнення accepted_base відбувається лише РАЗ на актив (перше позначення) —
      // повторне позначення того самого активу довіряє поточному accepted_base як є,
      // інакше явно знятий користувачем ризик мовчки повертався б при кожному повторному виборі активу.
      if (defaulted.has(assetId)) {
        return { ...s, selected_assets: [...s.selected_assets, assetId] };
      }
      const toAdd = risksForAsset(assetId, s.passport.as_class)
        .map(r => r.id).filter(id => !s.risks.accepted_base.includes(id));
      return { ...s, selected_assets: [...s.selected_assets, assetId],
        risks: { ...s.risks, accepted_base: [...s.risks.accepted_base, ...toAdd],
          defaulted_assets: [...defaulted, assetId] } };
    });

    const sections = [...groups.entries()].map(([category, assets]) =>
      el('fieldset', {}, el('legend', {}, category),
        ...assets.map(a => el('label', { class: 'checkbox' },
          el('input', { type: 'checkbox', value: a.id,
            ...(state.selected_assets.includes(a.id) ? { checked: '' } : {}),
            onchange: (e) => { toggleAsset(a.id, e.target.checked); rerender(); } }),
          `${a.id}. ${a.name}`))));

    const riskPanel = state.selected_assets.length
      ? el('div', { class: 'risk-preview' },
          el('h3', {}, `Ризики обраних активів (${state.selected_assets.reduce((n, id) =>
            n + risksForAsset(id, state.passport.as_class).length, 0)})`),
          ...state.selected_assets.map(assetId => {
            const risks = risksForAsset(assetId, state.passport.as_class);
            return el('fieldset', {}, el('legend', {}, assetName(assetId)),
              risks.length
                ? el('div', {}, ...risks.map(r => el('label', { class: 'checkbox' },
                    el('input', { type: 'checkbox',
                      ...(state.risks.accepted_base.includes(r.id) ? { checked: '' } : {}),
                      onchange: (e) => setState(s => ({ ...s, risks: { ...s.risks,
                        accepted_base: e.target.checked
                          ? [...s.risks.accepted_base, r.id]
                          : s.risks.accepted_base.filter(x => x !== r.id) } })) }),
                    `${r.threat} — ${r.vulnerability}`,
                    el('span', { class: `badge lvl-${r.level.replace(/ /g, '-')}` }, r.level))))
                : el('p', { class: 'hint' }, 'Немає готових загроз у довіднику для цього активу.'),
              el('button', { type: 'button',
                onclick: () => openRiskFormModal({ presetAssetId: assetId, onSaved: rerender }) },
                '+ Додати свій ризик до цього активу'));
          }))
      : null;

    container.replaceChildren(
      el('section', {},
        el('h2', {}, `Крок 2. Вибір активів (доступно для АС-${state.passport.as_class}: ${visible.length} із ${catalogs.assets.length})`),
        ...sections,
        riskPanel));
  },
};
