import { el, option } from '../render/dom.js';
import { getState, setState } from '../state.js';
import { catalogs } from '../app.js';
import { threatDirectory, buildCustomRisk, computeRiskScore, riskLevel } from '/core/risk-engine.js';

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

export const step = {
  id: 'custom-risks', title: 'Кастомні ризики та тип інформації',
  validate(state) { return state.info_type ? [] : ['Оберіть тип інформації']; },
  render(container) {
    const state = getState();
    const scale = catalogs.threatsRisks.scale;
    const assetSel = el('select', {}, ...state.selected_assets.map(id =>
      option(id, catalogs.assets.find(a => a.id === id)?.name ?? id)));
    const allThreatsChk = el('input', { type: 'checkbox' });
    const threatSel = el('select', {});
    // Довідник загроз залежить від обраного активу (або всі — за чекбоксом)
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
    const addBtn = el('button', { type: 'button', onclick: () => {
      const t = dir[Number(threatSel.value)];
      if (!t) return;
      const existing = [...getState().risks.custom.map(r => r.id)];
      const risk = buildCustomRisk({ asset_id: assetSel.value, threat: t.threat, vulnerability: t.vulnerability,
        impact: Number(impSel.value), likelihood: Number(likSel.value),
        likelihood_label: scale.likelihood_options.find(o => o.value === Number(likSel.value)).label }, existing, scale);
      setState(s => ({ ...s, risks: { ...s.risks, custom: [...s.risks.custom, risk] } }));
      container.replaceChildren();
      step.render(container);
    } }, '+ Додати ризик');
    const saveRisksBtn = el('button', { type: 'button', onclick: async () => {
      const r = await fetch('/api/export/risks-docx', { method: 'POST', body: JSON.stringify({ state: getState() }) });
      if (!r.ok) { alert('Помилка експорту: ' + (await r.json()).error); return; }
      const blob = await r.blob();
      const a = el('a', { href: URL.createObjectURL(blob),
        download: decodeURIComponent(r.headers.get('Content-Disposition')?.match(/filename\*=UTF-8''(.+)/)?.[1] ?? 'реєстр-ризиків.docx') });
      a.click();
      URL.revokeObjectURL(a.href);
    } }, '💾 Зберегти реєстр ризиків (DOCX)');
    const assetName = (id) => catalogs.assets.find(a => a.id === id)?.name ?? id;
    const customRows = getState().risks.custom.map(r => el('tr', {},
      el('td', {}, r.id),
      el('td', {}, assetName(r.asset_id)),
      el('td', {}, el('span', { title: r.vulnerability }, r.threat)),
      el('td', {}, String(r.impact)),
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
        container.replaceChildren();
        step.render(container);
      } }, '✕'))));
    const customTable = customRows.length
      ? el('table', { class: 'risk-table' },
          el('tr', {}, ...['ID', 'Актив', 'Загроза', 'Вплив', 'Ймовірність', 'Рівень', 'Стратегія', 'Заходи обробки', 'Відповідальний', 'Залишковий', '']
            .map(h => el('th', {}, h))),
          ...customRows)
      : el('p', { class: 'hint' }, 'Додані вручну ризики зʼявляться тут таблицею з полями для дозаповнення.');
    const infoRadios = INFO_OPTIONS.map(o => el('label', { class: 'radio' },
      el('input', { type: 'radio', name: 'info_type', value: o.value,
        ...(o.disabled ? { disabled: '' } : {}),
        ...(state.info_type === o.value ? { checked: '' } : {}),
        onchange: () => setState(s => ({ ...s, info_type: o.value })) }),
      o.label));
    container.replaceChildren(el('section', {},
      el('h2', {}, 'Крок 4. Конструктор ризиків та Тип інформації'),
      el('div', { class: 'constructor' },
        el('label', {}, 'Актив: ', assetSel), el('label', {}, 'Загроза: ', threatSel),
        el('label', { class: 'checkbox' }, allThreatsChk, 'усі загрози'),
        el('label', {}, 'Ймовірність: ', likSel), el('label', {}, 'Вплив: ', impSel),
        el('label', {}, 'Рівень: ', preview), addBtn),
      customTable,
      el('div', { class: 'actions' }, saveRisksBtn),
      el('h3', {}, 'Тип інформації, що обробляється (обовʼязково)'),
      ...infoRadios));
  },
};
