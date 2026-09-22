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
  const manualPicker = controlPicker(catalogs.ndTzi, []);
  const addManualBtn = el('button', { type: 'button', class: 'primary', onclick: () => {
    if (!manualThreatInput.value.trim()) { alert('Вкажіть загрозу'); return; }
    const existing = [...getState().risks.custom.map(r => r.id)];
    const risk = buildCustomRisk({
      asset_id: manualAssetSel.value, threat: manualThreatInput.value.trim(),
      vulnerability: manualVulnInput.value.trim(), likelihood_label: '',
      control_refs: manualPicker.getSelected(),
    }, existing, scale);
    setState(s => ({ ...s, risks: { ...s.risks, custom: [...s.risks.custom, risk] } }));
    modal.close();
    onSaved?.();
  } }, 'Додати без оцінки');

  const manualBody = el('div', { class: 'field-grid', hidden: '' },
    el('label', {}, 'Актив: ', manualAssetSel),
    el('label', {}, 'Загроза: ', manualThreatInput),
    el('label', {}, 'Вразливість: ', manualVulnInput),
    el('label', {}, 'Заходи захисту (НД ТЗІ): ', manualPicker.el),
    el('p', { class: 'hint' }, 'Вплив і ймовірність можна буде задати пізніше, редагуючи цей ризик на Кроці 3.'),
    el('div', { class: 'actions' }, addManualBtn,
      el('button', { type: 'button', onclick: () => modal.close() }, 'Скасувати')));

  const showCatalogTab = () => {
    tabCatalog.classList.add('active'); tabManual.classList.remove('active');
    catalogBody.hidden = false; manualBody.hidden = true;
  };
  const showManualTab = () => {
    tabManual.classList.add('active'); tabCatalog.classList.remove('active');
    manualBody.hidden = false; catalogBody.hidden = true;
  };
  const tabCatalog = el('button', { type: 'button', onclick: showCatalogTab }, 'З переліку');
  const tabManual = el('button', { type: 'button', onclick: showManualTab }, 'Власна загроза');

  const modal = showModal(el('div', {},
    el('div', { class: 'mode-switch' }, tabCatalog, tabManual),
    catalogBody, manualBody),
    { title: 'Додати ризик' });

  // Якщо для активу за замовчуванням у каталозі немає жодної загрози — "З переліку"
  // відкривається порожнім і кнопка додавання мовчки нічого не робить; одразу показуємо
  // "Власна загроза", де додавання завжди можливе.
  if (dir.length === 0) showManualTab(); else showCatalogTab();
}

// Спільний UI-компонент вибору заходів захисту (базових і посилень) з НД ТЗІ —
// використовується і в модалі додавання ризику (вище), і в Кроці 2/3 для редагування
// control_refs існуючого ризику (базового чи кастомного). Посилення показуються одразу
// під своїм базовим заходом; вибір посилення автоматично додає його базовий захід
// (посилення без базового заходу не має сенсу), зняття базового заходу знімає й усі
// вибрані посилення цього заходу.
export function controlPicker(ndTzi, initialIds = []) {
  const controls = ndTzi.document.security_families
    .flatMap(fam => fam.controls.flatMap(c => [
      { id: c.canonical_id, title: c.title, baseId: c.canonical_id, isEnhancement: false },
      ...(c.children ?? []).map(ch => ({ id: ch.canonical_id, title: ch.title, baseId: c.canonical_id, isEnhancement: true })),
    ]))
    .sort((a, b) => a.id.localeCompare(b.id));
  const byId = new Map(controls.map(c => [c.id, c]));
  let selected = [...initialIds];

  const chipsRow = el('div', { class: 'ctrl-chips' });
  const listBox = el('div', { class: 'ctrl-list' });
  const searchInput = el('input', { type: 'text', placeholder: 'пошук за ID або назвою…' });

  const renderChips = () => {
    chipsRow.replaceChildren(...selected.map(id => el('span', { class: 'badge ctrl-chip' }, id,
      el('button', { type: 'button', class: 'chip-remove', onclick: () => toggle(id, false) }, '✕'))));
  };

  const renderList = () => {
    const q = searchInput.value.trim().toLowerCase();
    const filtered = q
      ? controls.filter(c => c.id.toLowerCase().includes(q) || c.title.toLowerCase().includes(q))
      : controls;
    const scrollTop = listBox.scrollTop;
    listBox.replaceChildren(...filtered.map(c => el('label', { class: `checkbox${c.isEnhancement ? ' ctrl-enh' : ''}` },
      el('input', { type: 'checkbox', ...(selected.includes(c.id) ? { checked: '' } : {}),
        onchange: (e) => toggle(c.id, e.target.checked) }),
      `${c.isEnhancement ? '↳ ' : ''}${c.id} — ${c.title}`)));
    listBox.scrollTop = scrollTop;
  };

  function toggle(id, checked) {
    const entry = byId.get(id);
    if (checked) {
      if (!selected.includes(id)) selected = [...selected, id];
      // Посилення без базового заходу не має сенсу — базовий захід додається автоматично
      if (entry?.isEnhancement && !selected.includes(entry.baseId)) selected = [...selected, entry.baseId];
    } else {
      selected = selected.filter(x => x !== id);
      // Зняття базового заходу знімає й усі вибрані посилення цього заходу
      if (entry && !entry.isEnhancement) {
        const enhIds = controls.filter(c => c.isEnhancement && c.baseId === id).map(c => c.id);
        selected = selected.filter(x => !enhIds.includes(x));
      }
    }
    renderChips();
    renderList();
  }

  searchInput.addEventListener('input', renderList);
  renderChips();
  renderList();

  const pickerEl = el('div', { class: 'control-picker' }, chipsRow, searchInput, listBox);
  return { el: pickerEl, getSelected: () => [...selected] };
}

// Легкий модал редагування ЛИШЕ заходів захисту базового ризику — викликається з Кроку 2
// (панель перегляду ризиків активу), де повне редагування ризику не потрібне.
export function openControlsOnlyModal(risk, { onSaved } = {}) {
  const override = getState().risks.base_overrides[risk.id];
  const initialIds = override?.control_refs ?? risk.control_refs ?? [];
  const picker = controlPicker(catalogs.ndTzi, initialIds);
  const saveBtn = el('button', { type: 'button', class: 'primary', onclick: () => {
    setState(s => ({ ...s, risks: { ...s.risks, base_overrides: {
      ...s.risks.base_overrides,
      [risk.id]: { ...(s.risks.base_overrides[risk.id] ?? {}), control_refs: picker.getSelected() },
    } } }));
    modal.close();
    onSaved?.();
  } }, 'Зберегти');
  const modal = showModal(el('div', {}, picker.el,
    el('div', { class: 'actions' }, saveBtn,
      el('button', { type: 'button', onclick: () => modal.close() }, 'Скасувати'))),
    { title: `Заходи захисту — ${risk.id}` });
}
