import { el, option, showModal } from '../render/dom.js';
import { getState, setState } from '../state.js';
import { catalogs } from '../app.js';
import { baseRisksFor, threatDirectory, buildCustomRisk, computeRiskScore, riskLevel, applyBaseOverride } from '/core/risk-engine.js';

const INFO_OPTIONS = [
  { value: 'open_confidential', label: 'Відкрита / Конфіденційна інформація' },
  { value: 'service', label: 'Службова інформація (ДСК)' },
  { value: 'state_secret', label: 'Державна таємниця (каталог буде додано)', disabled: true },
];

const STRATEGY_OPTIONS = ['Зменшення', 'Прийняття', 'Уникнення', 'Передача'];
const RESIDUAL_OPTIONS = ['', 'Дуже низький', 'Низький', 'Середній', 'Високий', 'Критичний'];

// Оновлення поля кастомного ризику без перерендеру (зберігає фокус в інпуті)
const patchCustomRisk = (id, patch) =>
  setState(s => ({ ...s, risks: { ...s.risks,
    custom: s.risks.custom.map(r => r.id === id ? { ...r, ...patch } : r) } }));

const setBaseOverride = (id, patch) =>
  setState(s => ({ ...s, risks: { ...s.risks, base_overrides: { ...s.risks.base_overrides, [id]: patch } } }));

const resetBaseOverride = (id) =>
  setState(s => { const o = { ...s.risks.base_overrides }; delete o[id]; return { ...s, risks: { ...s.risks, base_overrides: o } }; });

// Яка базова карта зараз редагується — переживає re-render (module-level, не частина CPB-стану)
let editingBaseId = null;

export const step = {
  id: 'risks', title: 'Ризики та тип інформації',
  validate(state) { return state.info_type ? [] : ['Оберіть тип інформації']; },
  render(container) {
    const state = getState();
    const scale = catalogs.threatsRisks.scale;
    const rerender = () => { container.replaceChildren(); step.render(container); };
    const assetName = (id) => catalogs.assets.find(a => a.id === id)?.name ?? id;

    const baseRisks = baseRisksFor(catalogs.threatsRisks, state.selected_assets, state.passport.as_class);
    // Перший показ: усі базові ризики прийняті за замовчуванням
    if (!state.risks.accepted_base.length && baseRisks.length) {
      setState(s => ({ ...s, risks: { ...s.risks, accepted_base: baseRisks.map(r => r.id) } }));
    }
    const accepted = new Set(getState().risks.accepted_base);
    const overrides = getState().risks.base_overrides ?? {};

    const editRow = (risk) => {
      const assetSel = el('select', {}, ...state.selected_assets.map(id => option(id, assetName(id), id === risk.asset_id)));
      const threatInput = el('input', { type: 'text', value: risk.threat });
      const vulnInput = el('input', { type: 'text', value: risk.vulnerability });
      const impSel = el('select', {}, ...scale.impact_options.map(o => option(String(o.value), `${o.value} (${o.label})`, o.value === risk.impact)));
      const likSel = el('select', {}, ...scale.likelihood_options.map(o => option(String(o.value), `${o.label} / ${o.value}`, o.value === risk.likelihood)));
      const stratSel = el('select', {}, ...STRATEGY_OPTIONS.map(v => option(v, v, v === risk.treatment_strategy)));
      const planInput = el('input', { type: 'text', value: risk.treatment_plan ?? '', placeholder: 'опишіть заходи обробки…' });
      const respInput = el('input', { type: 'text', value: risk.responsible ?? '' });
      const residSel = el('select', {}, ...RESIDUAL_OPTIONS.map(v => option(v, v === '' ? '—' : v, v === (risk.residual_risk ?? ''))));
      const save = () => {
        const likelihood = Number(likSel.value);
        setBaseOverride(risk.id, {
          asset_id: assetSel.value, threat: threatInput.value, vulnerability: vulnInput.value,
          impact: Number(impSel.value), likelihood,
          likelihood_label: scale.likelihood_options.find(o => o.value === likelihood)?.label ?? '',
          treatment_strategy: stratSel.value, treatment_plan: planInput.value, responsible: respInput.value,
          residual_risk: residSel.value,
        });
        editingBaseId = null;
        rerender();
      };
      const cancel = () => { editingBaseId = null; rerender(); };
      return el('tr', { class: 'risk-edit-row' },
        el('td', { colspan: '13' }, el('div', { class: 'risk-edit-form' },
          el('label', {}, 'Актив: ', assetSel), el('label', {}, 'Загроза: ', threatInput),
          el('label', {}, 'Вразливість: ', vulnInput), el('label', {}, 'Вплив: ', impSel),
          el('label', {}, 'Ймовірність: ', likSel), el('label', {}, 'Стратегія: ', stratSel),
          el('label', {}, 'Заходи обробки: ', planInput), el('label', {}, 'Відповідальний: ', respInput),
          el('label', {}, 'Залишковий ризик: ', residSel),
          el('div', { class: 'actions' },
            el('button', { type: 'button', class: 'primary', onclick: save }, 'Зберегти'),
            el('button', { type: 'button', onclick: cancel }, 'Скасувати')))));
    };

    const header = el('tr', {}, ...['✓', 'ID', 'Актив', 'Загроза', 'Вразливість', 'Вплив', 'Ймовірність', 'Рівень', 'Стратегія', 'Заходи обробки', 'Відповідальний', 'Залишковий', 'Дії']
      .map(h => el('th', {}, h)));

    const baseRows = baseRisks.flatMap(r => {
      if (editingBaseId === r.id) return [editRow(r)];
      const eff = applyBaseOverride(r, overrides[r.id], scale);
      return [el('tr', {},
        el('td', {}, el('input', { type: 'checkbox', ...(accepted.has(r.id) ? { checked: '' } : {}),
          onchange: (e) => setState(s => ({ ...s, risks: { ...s.risks,
            accepted_base: e.target.checked
              ? [...s.risks.accepted_base, r.id]
              : s.risks.accepted_base.filter(x => x !== r.id) } })) })),
        el('td', {}, r.id), el('td', {}, assetName(eff.asset_id)), el('td', {}, eff.threat),
        el('td', {}, eff.vulnerability), el('td', {}, String(eff.impact)),
        el('td', {}, `${eff.likelihood_label} / ${eff.likelihood}`),
        el('td', {}, el('span', { class: `badge lvl-${eff.level.replace(/ /g, '-')}` }, eff.level)),
        el('td', {}, eff.treatment_strategy), el('td', {}, eff.treatment_plan ?? ''),
        el('td', {}, eff.responsible), el('td', {}, eff.residual_risk ?? ''),
        el('td', {},
          el('button', { type: 'button', onclick: () => { editingBaseId = r.id; rerender(); } }, 'Змінити'),
          overrides[r.id] ? el('button', { type: 'button', onclick: () => { resetBaseOverride(r.id); rerender(); } }, 'Скинути') : null))];
    });

    // Конструктор нового (кастомного) ризику — відкривається в модальному вікні,
    // додана карта потрапляє в той самий перелік нижче
    const openAddRiskModal = () => {
      const assetSel = el('select', {}, ...state.selected_assets.map(id => option(id, assetName(id))));
      const allThreatsChk = el('input', { type: 'checkbox' });
      const threatSel = el('select', {});
      let dir = [];
      const refreshThreats = () => {
        dir = threatDirectory(catalogs.threatsRisks, allThreatsChk.checked ? null : assetSel.value);
        threatSel.replaceChildren(...dir.map((t, i) => option(String(i), `${t.threat} / ${t.vulnerability}`)));
      };
      assetSel.addEventListener('change', refreshThreats);
      allThreatsChk.addEventListener('change', refreshThreats);
      refreshThreats();
      const likSel = el('select', {}, ...scale.likelihood_options.map(o => option(String(o.value), `${o.label} / ${o.value}`)));
      const impSel = el('select', {}, ...scale.impact_options.map(o => option(String(o.value), `${o.value} (${o.label})`)));
      const preview = el('span', { class: 'badge' }, '—');
      const updatePreview = () => {
        const score = computeRiskScore(Number(impSel.value), Number(likSel.value));
        preview.textContent = `${riskLevel(score, scale)} (${score})`;
      };
      likSel.addEventListener('change', updatePreview);
      impSel.addEventListener('change', updatePreview);
      updatePreview();
      const addBtn = el('button', { type: 'button', class: 'primary', onclick: () => {
        const t = dir[Number(threatSel.value)];
        if (!t) return;
        const existing = [...getState().risks.custom.map(r => r.id)];
        const risk = buildCustomRisk({ asset_id: assetSel.value, threat: t.threat, vulnerability: t.vulnerability,
          impact: Number(impSel.value), likelihood: Number(likSel.value),
          likelihood_label: scale.likelihood_options.find(o => o.value === Number(likSel.value)).label }, existing, scale);
        setState(s => ({ ...s, risks: { ...s.risks, custom: [...s.risks.custom, risk] } }));
        modal.close();
        rerender();
      } }, 'Додати до переліку');
      const modal = showModal(el('div', { class: 'field-grid' },
        el('label', {}, 'Актив: ', assetSel), el('label', {}, 'Загроза: ', threatSel),
        el('label', { class: 'checkbox' }, allThreatsChk, 'усі загрози'),
        el('label', {}, 'Ймовірність: ', likSel), el('label', {}, 'Вплив: ', impSel),
        el('label', {}, 'Рівень: ', preview),
        el('div', { class: 'actions' }, addBtn,
          el('button', { type: 'button', onclick: () => modal.close() }, 'Скасувати'))),
        { title: 'Додати ризик' });
    };
    const addRiskBtn = el('button', { type: 'button', onclick: openAddRiskModal }, '+ Додати ризик');

    const customRows = getState().risks.custom.map(r => el('tr', {},
      el('td', {}, el('input', { type: 'checkbox', checked: '', disabled: '' })),
      el('td', {}, r.id), el('td', {}, assetName(r.asset_id)),
      el('td', {}, el('span', { title: r.vulnerability }, r.threat)),
      el('td', {}, r.vulnerability), el('td', {}, String(r.impact)),
      el('td', {}, `${r.likelihood_label} / ${r.likelihood}`),
      el('td', {}, el('span', { class: `badge lvl-${r.level.replace(/ /g, '-')}` }, r.level)),
      el('td', {}, el('select', { class: 'cell-edit',
        onchange: (e) => patchCustomRisk(r.id, { treatment_strategy: e.target.value }) },
        ...STRATEGY_OPTIONS.map(v => option(v, v, v === r.treatment_strategy)))),
      el('td', {}, el('input', { type: 'text', class: 'cell-edit', value: r.treatment_plan ?? '',
        placeholder: 'опишіть заходи обробки…',
        oninput: (e) => patchCustomRisk(r.id, { treatment_plan: e.target.value }) })),
      el('td', {}, el('input', { type: 'text', class: 'cell-edit', value: r.responsible ?? '',
        placeholder: 'відповідальний…',
        oninput: (e) => patchCustomRisk(r.id, { responsible: e.target.value }) })),
      el('td', {}, el('select', { class: 'cell-edit',
        onchange: (e) => patchCustomRisk(r.id, { residual_risk: e.target.value }) },
        ...RESIDUAL_OPTIONS.map(v => option(v, v === '' ? '—' : v, v === (r.residual_risk ?? ''))))),
      el('td', {}, el('button', { type: 'button', onclick: () => {
        setState(s => ({ ...s, risks: { ...s.risks, custom: s.risks.custom.filter(x => x.id !== r.id) } }));
        rerender();
      } }, '✕'))));

    const saveRisksBtn = el('button', { type: 'button', class: 'collapse-safe', onclick: async () => {
      const r = await fetch('/api/export/risks-docx', { method: 'POST', body: JSON.stringify({ state: getState() }) });
      if (!r.ok) { alert('Помилка експорту: ' + (await r.json()).error); return; }
      const blob = await r.blob();
      const a = el('a', { href: URL.createObjectURL(blob),
        download: decodeURIComponent(r.headers.get('Content-Disposition')?.match(/filename\*=UTF-8''(.+)/)?.[1] ?? 'реєстр-ризиків.docx') });
      a.click();
      URL.revokeObjectURL(a.href);
    } }, '💾 Зберегти реєстр ризиків (DOCX)');

    const infoRadios = INFO_OPTIONS.map(o => el('label', { class: 'radio' },
      el('input', { type: 'radio', name: 'info_type', value: o.value,
        ...(o.disabled ? { disabled: '' } : {}),
        ...(state.info_type === o.value ? { checked: '' } : {}),
        onchange: () => setState(s => ({ ...s, info_type: o.value })) }),
      o.label));

    container.replaceChildren(el('section', {},
      el('h2', {}, `Крок 3. Ризики (${baseRows.length + customRows.length} у переліку — базові та кастомні)`),
      el('div', { class: 'actions' }, addRiskBtn),
      el('table', { class: 'risk-table' }, header, ...baseRows, ...customRows),
      el('div', { class: 'actions' }, saveRisksBtn),
      el('h3', {}, 'Тип інформації, що обробляється (обовʼязково)'),
      ...infoRadios));
  },
};
