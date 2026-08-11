import { el } from '../render/dom.js';
import { getState } from '../state.js';
import { catalogs } from '../app.js';
import { makeIcsTemplate, makeCpbTemplate, makeApprovedRecord } from '/core/template-io.js';
import { buildProfile } from '/core/profile-engine.js';

async function saveTemplate(kind, tpl) {
  const name = prompt('Імʼя шаблону (літери, цифри, дефіс, підкреслення):');
  if (!name) return;
  const r = await fetch(`/api/templates/${kind}/${encodeURIComponent(name)}`, {
    method: 'POST', body: JSON.stringify(tpl) });
  const body = await r.json();
  alert(r.ok ? `Шаблон «${name}» збережено` : `Помилка: ${body.error}`);
}

export const step = {
  id: 'export', title: 'Шаблони та експорт',
  validate() { return []; },
  render(container) {
    const state = getState();
    let warnings;
    let canExport = true;
    if (!state.info_type) {
      warnings = el('p', { class: 'warn' }, 'Спершу оберіть тип інформації на Кроці 4 та згенеруйте профіль.');
      canExport = false;
    } else {
      const doc = buildProfile(state, catalogs);
      warnings = doc.summary.empty
        ? el('p', { class: 'warn' }, `Увага: ${doc.summary.empty} пунктів мають незаповнені параметри — поверніться до Кроку 6 або експортуйте з позначкою [не визначено].`)
        : el('p', { class: 'ok' }, 'Усі параметри заповнено.');
    }
    const exportBtn = el('button', { type: 'button', ...(canExport ? {} : { disabled: '' }), onclick: async () => {
      const r = await fetch('/api/export/docx', { method: 'POST', body: JSON.stringify({ state: getState() }) });
      if (!r.ok) { alert('Помилка експорту: ' + (await r.json()).error); return; }
      const blob = await r.blob();
      const a = el('a', { href: URL.createObjectURL(blob),
        download: decodeURIComponent(r.headers.get('Content-Disposition')?.match(/filename\*=UTF-8''(.+)/)?.[1] ?? 'профіль.docx') });
      a.click();
      URL.revokeObjectURL(a.href);
    } }, '🖨️ Експорт у DOCX');
    container.replaceChildren(el('section', {},
      el('h2', {}, 'Крок 7. Шаблонізація та Експорт'),
      warnings,
      el('div', { class: 'actions' },
        el('button', { type: 'button', onclick: () => saveTemplate('ics', makeIcsTemplate(getState())) }, '💾 Зберегти як шаблон ІКС'),
        el('button', { type: 'button', ...(canExport ? {} : { disabled: '' }), onclick: () => saveTemplate('cpb', makeCpbTemplate(getState())) }, '💾 Зберегти як шаблон ЦПБ'),
        exportBtn,
        el('button', { type: 'button', ...(canExport ? {} : { disabled: '' }), onclick: () => {
          const doc = buildProfile(getState(), catalogs);
          const summary = { ...doc.summary,
            risks_count: getState().risks.accepted_base.length + getState().risks.custom.length,
            enhancements_count: getState().profile.enhancements.length };
          saveTemplate('approved', makeApprovedRecord(getState(), summary));
        } }, '✅ Затвердити профіль (в реєстр)'))));
  },
};
