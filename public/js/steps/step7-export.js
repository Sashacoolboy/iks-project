import { el } from '../render/dom.js';
import { getState } from '../state.js';
import { catalogs } from '../app.js';
import { makeIcsTemplate, makeCpbTemplate, makeApprovedRecord } from '/core/template-io.js';
import { buildProfile } from '/core/profile-engine.js';

const NAME_RE = /^[a-zа-яіїєґ0-9_\-]+$/i;
// Дефолтне ім'я з назви ІКС (пробіли → дефіси, недопустимі символи геть)
const suggestName = (icsName) =>
  (icsName || '').trim().replace(/\s+/g, '-').replace(/[^a-zа-яіїєґ0-9_\-]/gi, '').slice(0, 60);

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

    const statusBox = el('p', { class: 'save-status' });
    const showStatus = (ok, text) => {
      statusBox.className = ok ? 'save-status ok' : 'save-status warn';
      statusBox.textContent = text;
    };
    const nameInput = el('input', { type: 'text', class: 'tpl-name',
      value: suggestName(state.passport.ics_name),
      placeholder: 'імʼя запису (літери, цифри, дефіс, підкреслення)' });

    const saveTemplate = async (kind, tpl, label) => {
      const name = nameInput.value.trim();
      if (!name) { showStatus(false, 'Вкажіть імʼя запису у полі вище.'); nameInput.focus(); return; }
      if (!NAME_RE.test(name)) { showStatus(false, 'Імʼя може містити лише літери, цифри, дефіс і підкреслення (без пробілів).'); nameInput.focus(); return; }
      try {
        const r = await fetch(`/api/templates/${kind}/${encodeURIComponent(name)}`, {
          method: 'POST', body: JSON.stringify(tpl) });
        const body = await r.json();
        showStatus(r.ok, r.ok ? `${label} «${name}» збережено.` : `Помилка: ${body.error}`);
      } catch (err) {
        showStatus(false, `Помилка мережі: ${err.message}`);
      }
    };

    const exportBtn = el('button', { type: 'button', ...(canExport ? {} : { disabled: '' }), onclick: async () => {
      const r = await fetch('/api/export/docx', { method: 'POST', body: JSON.stringify({ state: getState() }) });
      if (!r.ok) { showStatus(false, 'Помилка експорту: ' + (await r.json()).error); return; }
      const blob = await r.blob();
      const a = el('a', { href: URL.createObjectURL(blob),
        download: decodeURIComponent(r.headers.get('Content-Disposition')?.match(/filename\*=UTF-8''(.+)/)?.[1] ?? 'профіль.docx') });
      a.click();
      URL.revokeObjectURL(a.href);
      showStatus(true, 'DOCX сформовано (також записано у папку exports/).');
    } }, '🖨️ Експорт у DOCX');

    container.replaceChildren(el('section', {},
      el('h2', {}, 'Крок 7. Шаблонізація та Експорт'),
      warnings,
      el('label', { class: 'field' }, 'Імʼя для збереження шаблону/запису', nameInput),
      el('div', { class: 'actions' },
        el('button', { type: 'button', onclick: () => saveTemplate('ics', makeIcsTemplate(getState()), 'Шаблон ІКС') }, '💾 Зберегти як шаблон ІКС'),
        el('button', { type: 'button', ...(canExport ? {} : { disabled: '' }), onclick: () => saveTemplate('cpb', makeCpbTemplate(getState()), 'Шаблон ЦПБ') }, '💾 Зберегти як шаблон ЦПБ'),
        exportBtn,
        el('button', { type: 'button', class: 'primary', ...(canExport ? {} : { disabled: '' }), onclick: () => {
          const doc = buildProfile(getState(), catalogs);
          const summary = { ...doc.summary,
            risks_count: getState().risks.accepted_base.length + getState().risks.custom.length,
            enhancements_count: getState().profile.enhancements.length };
          saveTemplate('approved', makeApprovedRecord(getState(), summary), 'Затверджений профіль');
        } }, '✅ Затвердити профіль (в реєстр)')),
      statusBox));
  },
};
