import { el, option } from '../render/dom.js';
import { getState, setState } from '../state.js';
import { catalogs } from '../app.js';
import { threatDirectory, buildCustomRisk, computeRiskScore, riskLevel } from '/core/risk-engine.js';

const INFO_OPTIONS = [
  { value: 'open_confidential', label: 'Відкрита / Конфіденційна інформація' },
  { value: 'service', label: 'Службова інформація (ДСК)' },
  { value: 'state_secret', label: 'Державна таємниця (каталог буде додано)', disabled: true },
];

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
    const customList = getState().risks.custom.map(r => el('li', {},
      `${r.id}: ${r.threat} → ${r.level}`,
      el('button', { type: 'button', onclick: () => {
        setState(s => ({ ...s, risks: { ...s.risks, custom: s.risks.custom.filter(x => x.id !== r.id) } }));
        container.replaceChildren();
        step.render(container);
      } }, '✕')));
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
      el('ul', { class: 'custom-list' }, ...customList),
      el('div', { class: 'actions' }, saveRisksBtn),
      el('h3', {}, 'Тип інформації, що обробляється (обовʼязково)'),
      ...infoRadios));
  },
};
