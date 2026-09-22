import { el, option, showModal } from '../render/dom.js';
import { getState, setState } from '../state.js';
import { catalogs } from '../app.js';
import { baseRisksFor, applyBaseOverride, annotateRisk } from '/core/risk-engine.js';
import { openRiskFormModal, controlPicker } from '../risk-form.js';

const STRATEGY_OPTIONS = ['Зменшення', 'Прийняття', 'Уникнення', 'Передача'];
const RESIDUAL_OPTIONS = ['', 'Дуже низький', 'Низький', 'Середній', 'Високий', 'Критичний'];

// Оновлення поля кастомного ризику без перерендеру (зберігає фокус в інпуті)
const patchCustomRisk = (id, patch) =>
  setState(s => ({ ...s, risks: { ...s.risks,
    custom: s.risks.custom.map(r => r.id === id ? { ...r, ...patch } : r) } }));

// Редагування кастомного ризику через модалку — перераховує рівень (score/level), на відміну від patchCustomRisk
const saveCustomRiskEdit = (id, patch, scale) =>
  setState(s => ({ ...s, risks: { ...s.risks,
    custom: s.risks.custom.map(r => r.id === id ? annotateRisk({ ...r, ...patch }, scale) : r) } }));

export const setBaseOverride = (id, patch) =>
  setState(s => ({ ...s, risks: { ...s.risks, base_overrides: { ...s.risks.base_overrides, [id]: patch } } }));

const resetBaseOverride = (id) =>
  setState(s => { const o = { ...s.risks.base_overrides }; delete o[id]; return { ...s, risks: { ...s.risks, base_overrides: o } }; });

// Видалення базового ризику зі списку — незворотне (на відміну від Скинути): прибирає з
// accepted_base/base_overrides і ховає рядок назавжди через risks.hidden_base
const deleteBaseRisk = (id) =>
  setState(s => {
    const bo = { ...s.risks.base_overrides }; delete bo[id];
    return { ...s, risks: { ...s.risks, base_overrides: bo,
      accepted_base: s.risks.accepted_base.filter(x => x !== id),
      hidden_base: [...(s.risks.hidden_base ?? []), id] } };
  });

export const step = {
  id: 'risks', title: 'Ризики',
  validate() { return []; },
  render(container) {
    const state = getState();
    const scale = catalogs.threatsRisks.scale;
    const rerender = () => { container.replaceChildren(); step.render(container); };
    const assetName = (id) => catalogs.assets.find(a => a.id === id)?.name ?? id;

    const hidden = new Set(state.risks.hidden_base ?? []);
    const accepted = new Set(state.risks.accepted_base);
    const overrides = getState().risks.base_overrides ?? {};
    // Сортування таблиці: спочатку за активом, далі за загрозою, далі за вразливістю
    const byAssetThreatVuln = (a, b) =>
      assetName(a.asset_id).localeCompare(assetName(b.asset_id), 'uk') ||
      (a.threat ?? '').localeCompare(b.threat ?? '', 'uk') ||
      (a.vulnerability ?? '').localeCompare(b.vulnerability ?? '', 'uk');
    // Позначку "включити в роботу" тепер робить користувач на Кроці 2 (чекбокси в
    // панелі перегляду ризиків активу) — тут просто показуємо те, що вже позначено.
    const baseRisks = baseRisksFor(catalogs.threatsRisks, state.selected_assets, state.passport.as_class)
      .filter(r => !hidden.has(r.id) && accepted.has(r.id))
      .sort((a, b) => byAssetThreatVuln(applyBaseOverride(a, overrides[a.id], scale), applyBaseOverride(b, overrides[b.id], scale)));

    const openEditRiskModal = (risk) => {
      const eff = applyBaseOverride(risk, overrides[risk.id], scale);
      const assetSel = el('select', {}, ...state.selected_assets.map(id => option(id, assetName(id), id === eff.asset_id)));
      const threatInput = el('input', { type: 'text', value: eff.threat });
      const vulnInput = el('input', { type: 'text', value: eff.vulnerability });
      const impSel = el('select', {}, ...scale.impact_options.map(o => option(String(o.value), `${o.value} (${o.label})`, o.value === eff.impact)));
      const likSel = el('select', {}, ...scale.likelihood_options.map(o => option(String(o.value), `${o.label} / ${o.value}`, o.value === eff.likelihood)));
      const stratSel = el('select', {}, ...STRATEGY_OPTIONS.map(v => option(v, v, v === eff.treatment_strategy)));
      const planInput = el('input', { type: 'text', value: eff.treatment_plan ?? '', placeholder: 'опишіть заходи обробки…' });
      const respInput = el('input', { type: 'text', value: eff.responsible ?? '' });
      const residSel = el('select', {}, ...RESIDUAL_OPTIONS.map(v => option(v, v === '' ? '—' : v, v === (eff.residual_risk ?? ''))));
      const picker = controlPicker(catalogs.ndTzi, eff.control_refs ?? []);
      const saveBtn = el('button', { type: 'button', class: 'primary', onclick: () => {
        const likelihood = Number(likSel.value);
        setBaseOverride(risk.id, {
          asset_id: assetSel.value, threat: threatInput.value, vulnerability: vulnInput.value,
          impact: Number(impSel.value), likelihood,
          likelihood_label: scale.likelihood_options.find(o => o.value === likelihood)?.label ?? '',
          treatment_strategy: stratSel.value, treatment_plan: planInput.value, responsible: respInput.value,
          residual_risk: residSel.value, control_refs: picker.getSelected(),
        });
        modal.close();
        rerender();
      } }, 'Зберегти');
      const deleteBtn = el('button', { type: 'button', class: 'link-btn', onclick: () => {
        if (!confirm(`Видалити загрозу «${eff.threat}» (${risk.id}) зі списку? Її не можна буде повернути.`)) return;
        deleteBaseRisk(risk.id);
        modal.close();
        rerender();
      } }, 'Видалити');
      const modal = showModal(el('div', { class: 'field-grid' },
        el('label', {}, 'Актив: ', assetSel), el('label', {}, 'Загроза: ', threatInput),
        el('label', {}, 'Вразливість: ', vulnInput), el('label', {}, 'Вплив: ', impSel),
        el('label', {}, 'Ймовірність: ', likSel), el('label', {}, 'Стратегія: ', stratSel),
        el('label', {}, 'Заходи обробки: ', planInput), el('label', {}, 'Відповідальний: ', respInput),
        el('label', {}, 'Залишковий ризик: ', residSel),
        el('label', {}, 'Заходи захисту (НД ТЗІ): ', picker.el),
        el('div', { class: 'actions' }, saveBtn,
          el('button', { type: 'button', onclick: () => modal.close() }, 'Скасувати'), deleteBtn)),
        { title: `Редагування загрози ${risk.id}` });
    };

    const header = el('tr', {}, ...['ID', 'Актив', 'Загроза', 'Вразливість', 'Вплив', 'Ймовірність', 'Рівень', 'Стратегія', 'Заходи обробки', 'Відповідальний', 'Залишковий', 'Заходи захисту', 'Дії']
      .map(h => el('th', {}, h)));

    const baseRows = baseRisks.map(r => {
      const eff = applyBaseOverride(r, overrides[r.id], scale);
      return el('tr', {},
        el('td', {}, r.id), el('td', {}, assetName(eff.asset_id)), el('td', {}, eff.threat),
        el('td', {}, eff.vulnerability), el('td', {}, String(eff.impact)),
        el('td', {}, `${eff.likelihood_label} / ${eff.likelihood}`),
        el('td', {}, el('span', { class: `badge lvl-${eff.level.replace(/ /g, '-')}` }, eff.level)),
        el('td', {}, eff.treatment_strategy), el('td', {}, eff.treatment_plan ?? ''),
        el('td', {}, eff.responsible), el('td', {}, eff.residual_risk ?? ''),
        el('td', {}, (eff.control_refs ?? []).join(', ') || '—'),
        el('td', {},
          el('div', { class: 'row-actions' },
            el('button', { type: 'button', class: 'icon-btn', title: 'Редагувати', 'aria-label': 'Редагувати',
              onclick: () => openEditRiskModal(r) }, '✎'),
            overrides[r.id] ? el('button', { type: 'button', onclick: () => { resetBaseOverride(r.id); rerender(); } }, 'Скинути') : null,
            el('button', { type: 'button', class: 'icon-btn danger', title: 'Видалити', 'aria-label': 'Видалити',
              onclick: () => {
                if (!confirm(`Видалити загрозу «${eff.threat}» (${r.id}) зі списку? Її не можна буде повернути.`)) return;
                deleteBaseRisk(r.id);
                rerender();
              } }, '🗑'))));
    });

    const addRiskBtn = el('button', { type: 'button', onclick: () => openRiskFormModal({ onSaved: rerender }) }, '+ Додати ризик');

    // Редагування кастомного ризику — усі поля (на відміну від точкового редагування
    // стратегії/заходів/відповідального прямо в таблиці нижче)
    const openEditCustomRiskModal = (risk) => {
      const assetSel = el('select', {}, ...state.selected_assets.map(id => option(id, assetName(id), id === risk.asset_id)));
      const threatInput = el('input', { type: 'text', value: risk.threat });
      const vulnInput = el('input', { type: 'text', value: risk.vulnerability });
      const impSel = el('select', {}, ...scale.impact_options.map(o => option(String(o.value), `${o.value} (${o.label})`, o.value === risk.impact)));
      const likSel = el('select', {}, ...scale.likelihood_options.map(o => option(String(o.value), `${o.label} / ${o.value}`, o.value === risk.likelihood)));
      const stratSel = el('select', {}, ...STRATEGY_OPTIONS.map(v => option(v, v, v === risk.treatment_strategy)));
      const planInput = el('input', { type: 'text', value: risk.treatment_plan ?? '', placeholder: 'опишіть заходи обробки…' });
      const respInput = el('input', { type: 'text', value: risk.responsible ?? '' });
      const residSel = el('select', {}, ...RESIDUAL_OPTIONS.map(v => option(v, v === '' ? '—' : v, v === (risk.residual_risk ?? ''))));
      const picker = controlPicker(catalogs.ndTzi, risk.control_refs ?? []);
      const saveBtn = el('button', { type: 'button', class: 'primary', onclick: () => {
        const likelihood = Number(likSel.value);
        saveCustomRiskEdit(risk.id, {
          asset_id: assetSel.value, threat: threatInput.value, vulnerability: vulnInput.value,
          impact: Number(impSel.value), likelihood,
          likelihood_label: scale.likelihood_options.find(o => o.value === likelihood)?.label ?? '',
          treatment_strategy: stratSel.value, treatment_plan: planInput.value, responsible: respInput.value,
          residual_risk: residSel.value, control_refs: picker.getSelected(),
        }, scale);
        modal.close();
        rerender();
      } }, 'Зберегти');
      const deleteBtn = el('button', { type: 'button', class: 'link-btn', onclick: () => {
        if (!confirm(`Видалити загрозу «${risk.threat}» (${risk.id}) зі списку?`)) return;
        setState(s => ({ ...s, risks: { ...s.risks, custom: s.risks.custom.filter(x => x.id !== risk.id) } }));
        modal.close();
        rerender();
      } }, 'Видалити');
      const modal = showModal(el('div', { class: 'field-grid' },
        el('label', {}, 'Актив: ', assetSel), el('label', {}, 'Загроза: ', threatInput),
        el('label', {}, 'Вразливість: ', vulnInput), el('label', {}, 'Вплив: ', impSel),
        el('label', {}, 'Ймовірність: ', likSel), el('label', {}, 'Стратегія: ', stratSel),
        el('label', {}, 'Заходи обробки: ', planInput), el('label', {}, 'Відповідальний: ', respInput),
        el('label', {}, 'Залишковий ризик: ', residSel),
        el('label', {}, 'Заходи захисту (НД ТЗІ): ', picker.el),
        el('div', { class: 'actions' }, saveBtn,
          el('button', { type: 'button', onclick: () => modal.close() }, 'Скасувати'), deleteBtn)),
        { title: `Редагування загрози ${risk.id}` });
    };

    const customRows = [...getState().risks.custom].sort(byAssetThreatVuln).map(r => el('tr', {},
      el('td', {}, r.id), el('td', {}, assetName(r.asset_id)),
      el('td', {}, el('span', { title: r.vulnerability }, r.threat)),
      el('td', {}, r.vulnerability), el('td', {}, r.impact != null ? String(r.impact) : '—'),
      el('td', {}, r.likelihood != null ? `${r.likelihood_label} / ${r.likelihood}` : '—'),
      el('td', {}, r.level
        ? el('span', { class: `badge lvl-${r.level.replace(/ /g, '-')}` }, r.level)
        : el('span', { class: 'badge' }, 'Не оцінено')),
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
      el('td', {}, (r.control_refs ?? []).join(', ') || '—'),
      el('td', {},
        el('div', { class: 'row-actions' },
          el('button', { type: 'button', class: 'icon-btn', title: 'Редагувати', 'aria-label': 'Редагувати',
            onclick: () => openEditCustomRiskModal(r) }, '✎'),
          el('button', { type: 'button', class: 'icon-btn danger', title: 'Видалити', 'aria-label': 'Видалити',
            onclick: () => {
              if (!confirm(`Видалити загрозу «${r.threat}» (${r.id}) зі списку?`)) return;
              setState(s => ({ ...s, risks: { ...s.risks, custom: s.risks.custom.filter(x => x.id !== r.id) } }));
              rerender();
            } }, '🗑')))));

    const saveRisksBtn = el('button', { type: 'button', class: 'collapse-safe', onclick: async () => {
      const r = await fetch('/api/export/risks-docx', { method: 'POST', body: JSON.stringify({ state: getState() }) });
      if (!r.ok) { alert('Помилка експорту: ' + (await r.json()).error); return; }
      const blob = await r.blob();
      const a = el('a', { href: URL.createObjectURL(blob),
        download: decodeURIComponent(r.headers.get('Content-Disposition')?.match(/filename\*=UTF-8''(.+)/)?.[1] ?? 'реєстр-ризиків.docx') });
      a.click();
      URL.revokeObjectURL(a.href);
    } }, '💾 Зберегти реєстр ризиків (DOCX)');

    // Аналітика покриття: скільки заходів захисту визначено ризиками (базовими+кастомними
    // з урахуванням override) відповідають БПБ, і які заходи БПБ ще не мають обґрунтування ризиком
    const bpbCatalog = catalogs.bpb[state.info_type];
    const bpbIds = new Set();
    if (bpbCatalog)
      for (const sc of bpbCatalog.security_classes)
        for (const action of sc.actions)
          for (const sa of action.security_actions) bpbIds.add(sa.control.base_id);
    const ndControlTitles = new Map();
    for (const fam of catalogs.ndTzi.document.security_families)
      for (const c of fam.controls) ndControlTitles.set(c.canonical_id, c.title);
    const riskControlIds = new Set([
      ...baseRisks.flatMap(r => applyBaseOverride(r, overrides[r.id], scale).control_refs ?? []),
      ...getState().risks.custom.flatMap(r => r.control_refs ?? []),
    ]);
    const matchedCount = [...riskControlIds].filter(id => bpbIds.has(id)).length;
    const extraCount = riskControlIds.size - matchedCount;
    const uncoveredIds = [...bpbIds].filter(id => !riskControlIds.has(id)).sort((a, b) => a.localeCompare(b));
    // Архітектурні винятки для поточного класу АС — без них захід мандований безумовно і потрапить у ЦПБ автоматично
    const exemptBaseIds = new Set((catalogs.exemptions.exemptions ?? [])
      .filter(e => e.applies_to_classes.includes(state.passport.as_class))
      .map(e => e.control_ref));

    const uncoveredList = el('div', { class: 'analytics-uncovered', hidden: true },
      ...uncoveredIds.map(id => el('div', { class: 'analytics-uncovered-item' },
        el('span', { class: 'badge badge-bpb-class' }, id), ' ', ndControlTitles.get(id) ?? id,
        !exemptBaseIds.has(id) ? el('span', { class: 'badge badge-auto-bpb' }, 'Буде включено БПБ') : null)));
    const toggleUncoveredBtn = el('button', { type: 'button', class: 'link-btn', onclick: () => {
      uncoveredList.hidden = !uncoveredList.hidden;
      toggleUncoveredBtn.textContent = uncoveredList.hidden
        ? `Переглянути невключені заходи (${uncoveredIds.length})`
        : 'Сховати невключені заходи';
    } }, `Переглянути невключені заходи (${uncoveredIds.length})`);
    const analyticsBlock = bpbCatalog
      ? el('div', { class: 'risk-analytics' },
          el('p', {}, 'Заходів захисту визначено ризиками: ', el('strong', {}, String(riskControlIds.size)),
            ` (з них відповідають БПБ: ${matchedCount}, додатково поза БПБ: ${extraCount})`),
          el('p', {}, 'БПБ містить: ', el('strong', {}, String(bpbIds.size)), ' заходів захисту'),
          el('div', { class: 'actions' }, toggleUncoveredBtn), uncoveredList)
      : el('p', { class: 'hint' }, 'Немає каталогу БПБ для цього типу інформації — аналітика недоступна.');

    container.replaceChildren(el('section', {},
      el('h2', {}, `Крок 3. Ризики (${baseRows.length + customRows.length} у переліку — базові та кастомні)`),
      el('div', { class: 'actions' }, addRiskBtn),
      el('table', { class: 'risk-table' }, header, ...baseRows, ...customRows),
      el('div', { class: 'actions' }, saveRisksBtn),
      analyticsBlock));
  },
};
