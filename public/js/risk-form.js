import { el, option, showModal } from './render/dom.js';
import { getState, setState } from './state.js';
import { catalogs } from './app.js';
import { threatDirectory, buildCustomRisk, computeRiskScore, riskLevel, findCatalogRisk } from '/core/risk-engine.js';

const assetName = (id) => catalogs.assets.find(a => a.id === id)?.name ?? id;

// Спільний модал додавання ризику — викликається і з Кроку 2 (для конкретного активу),
// і з Кроку 3 (без прив'язки до активу). Два режими: "З переліку" (вибір із каталогу,
// повне автозаповнення полів) і "Власна загроза" (вільний текст, без оцінки — користувач
// довизначає вплив/ймовірність пізніше через модал редагування на Кроці 3).
export function openRiskFormModal({ presetAssetId, onSaved } = {}) {
  const state = getState();
  const scale = catalogs.threatsRisks.scale;
  const assetIds = state.selected_assets;

  // --- Режим 1: "З переліку" ---
  const assetSel = el('select', {}, ...assetIds.map(id => option(id, assetName(id), id === presetAssetId)));
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

  const addFromCatalogBtn = el('button', { type: 'button', class: 'primary', onclick: () => {
    const t = dir[Number(threatSel.value)];
    if (!t) return;
    const existing = [...getState().risks.custom.map(r => r.id)];
    const matched = findCatalogRisk(catalogs.threatsRisks, assetSel.value, t.threat, t.vulnerability)
      ?? findCatalogRisk(catalogs.threatsRisks, null, t.threat, t.vulnerability);
    const likelihood = Number(likSel.value);
    const risk = buildCustomRisk({
      asset_id: assetSel.value, threat: t.threat, vulnerability: t.vulnerability,
      impact: Number(impSel.value), likelihood,
      likelihood_label: scale.likelihood_options.find(o => o.value === likelihood).label,
      treatment_strategy: matched?.treatment_strategy, treatment_plan: matched?.treatment_plan,
      responsible: matched?.responsible, residual_risk: matched?.residual_risk,
      control_refs: matched?.control_refs ?? [], enhancement_suggestions: matched?.enhancement_suggestions ?? [],
    }, existing, scale);
    setState(s => ({ ...s, risks: { ...s.risks, custom: [...s.risks.custom, risk] } }));
    modal.close();
    onSaved?.();
  } }, 'Додати до переліку');

  const catalogBody = el('div', { class: 'field-grid' },
    el('label', {}, 'Актив: ', assetSel), el('label', {}, 'Загроза: ', threatSel),
    el('label', { class: 'checkbox' }, allThreatsChk, 'усі загрози'),
    el('label', {}, 'Ймовірність: ', likSel), el('label', {}, 'Вплив: ', impSel),
    el('label', {}, 'Рівень: ', preview),
    el('div', { class: 'actions' }, addFromCatalogBtn,
      el('button', { type: 'button', onclick: () => modal.close() }, 'Скасувати')));

  // --- Режим 2: "Власна загроза" (немає в довіднику) ---
  const manualAssetSel = el('select', {}, ...assetIds.map(id => option(id, assetName(id), id === presetAssetId)));
  const manualThreatInput = el('input', { type: 'text', placeholder: 'опишіть загрозу…' });
  const manualVulnInput = el('input', { type: 'text', placeholder: 'опишіть вразливість…' });
  const addManualBtn = el('button', { type: 'button', class: 'primary', onclick: () => {
    if (!manualThreatInput.value.trim()) { alert('Вкажіть загрозу'); return; }
    const existing = [...getState().risks.custom.map(r => r.id)];
    const risk = buildCustomRisk({
      asset_id: manualAssetSel.value, threat: manualThreatInput.value.trim(),
      vulnerability: manualVulnInput.value.trim(), likelihood_label: '',
    }, existing, scale);
    setState(s => ({ ...s, risks: { ...s.risks, custom: [...s.risks.custom, risk] } }));
    modal.close();
    onSaved?.();
  } }, 'Додати без оцінки');

  const manualBody = el('div', { class: 'field-grid', hidden: '' },
    el('label', {}, 'Актив: ', manualAssetSel),
    el('label', {}, 'Загроза: ', manualThreatInput),
    el('label', {}, 'Вразливість: ', manualVulnInput),
    el('p', { class: 'hint' }, 'Вплив і ймовірність можна буде задати пізніше, редагуючи цей ризик на Кроці 3.'),
    el('div', { class: 'actions' }, addManualBtn,
      el('button', { type: 'button', onclick: () => modal.close() }, 'Скасувати')));

  const tabCatalog = el('button', { type: 'button', class: 'active', onclick: () => {
    tabCatalog.classList.add('active'); tabManual.classList.remove('active');
    catalogBody.hidden = false; manualBody.hidden = true;
  } }, 'З переліку');
  const tabManual = el('button', { type: 'button', onclick: () => {
    tabManual.classList.add('active'); tabCatalog.classList.remove('active');
    manualBody.hidden = false; catalogBody.hidden = true;
  } }, 'Власна загроза');

  const modal = showModal(el('div', {},
    el('div', { class: 'mode-switch' }, tabCatalog, tabManual),
    catalogBody, manualBody),
    { title: 'Додати ризик' });
}
