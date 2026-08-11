import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { escapeXml, buildDocx, buildRisksDocx } from '../core/docx/docx-writer.js';

const input = {
  state: {
    passport: { ics_name: 'Тест & <ІКС>', cert_body: 'Орган', as_class: 1 },
    global_constants: { password_rotation_days: '90 днів', organization_policy_id: 'Наказ № 45 від 10.08.2026', crypto_hardware_token: '' },
    selected_assets: ['A-01'],
    info_type: 'service',
    profile: { param_overrides: {}, enhancements: [], excluded: [], exemption_overrides: [] },
  },
  policyMapping: { global_constants: [
    { key: 'password_rotation_days', label: 'Періодичність зміни паролів', example: '', odp_params: [] },
    { key: 'organization_policy_id', label: 'Розпорядчий документ організації', example: '', odp_params: [] },
  ] },
  assets: [{ id: 'A-01', name: 'АРМ', category: 'Фізичні активи', min_as_class: 1 }],
  annotatedRisks: [{ id: 'R-001', asset_id: 'A-01', threat: 'Загроза', vulnerability: 'Вразливість',
    impact: 4, likelihood: 0.5, likelihood_label: 'Середня', level: 'Високий', score: 2,
    treatment_strategy: 'Зменшення', treatment_plan: 'План', responsible: 'НІБ',
    residual_risk: 'Низький', priority: 'Високий' }],
  profileDoc: { items: [{ key: 'AC:1', classId: 'AC', className: 'Управління доступом',
    actionNumber: '1', actionName: 'Дія', bpbRequirements: 'Вимоги БПБ текст', status: 'Застосовується (автозаповнено)',
    controls: [
      { id: 'AC-2', statementLines: [{ label: 'a.', depth: 0, text: 'Текст заходу 90 днів', parts: [
        { type: 'text', value: 'Текст заходу ' },
        { type: 'param', value: '90 днів', paramId: 'x', source: 'policy' } ] }], emptyParams: [] },
      { id: 'AC-2(3)', isEnhancement: true, title: 'Деактивація', statementLines: [{ label: '', depth: 0, text: 'Текст посилення', parts: [] }], emptyParams: [] },
    ],
    enhancements: [] }],
    summary: { total: 1, autofilled: 1, empty: 0, exempted: 0, excluded: 0 } },
};

test('escapeXml екранує спецсимволи', () => {
  assert.equal(escapeXml('a & <b> "c" \u02BCd\u02BC'), 'a &amp; &lt;b&gt; &quot;c&quot; \u02BCd\u02BC');
});

test('buildDocx повертає валідний docx з грифом та назвою ІКС', () => {
  const buf = buildDocx(input);
  const dir = mkdtempSync(join(tmpdir(), 'docxtest-'));
  const file = join(dir, 't.docx');
  writeFileSync(file, buf);
  assert.match(execFileSync('unzip', ['-t', file], { encoding: 'utf8' }), /No errors detected/);
  const xml = execFileSync('unzip', ['-p', file, 'word/document.xml'], { encoding: 'utf8' });
  assert.match(xml, /Тест &amp; &lt;ІКС&gt;/);
  assert.match(xml, /Times New Roman/);
  assert.match(xml, /Введено в дію: Наказ № 45 від 10.08.2026/);
  assert.match(xml, /Періодичність зміни паролів/);
  assert.doesNotMatch(xml, /password_rotation_days/);
  assert.doesNotMatch(xml, /crypto_hardware_token/);
  // Стандартна таблиця профілю: заголовки, секційний рядок класу, vMerge, підстановка жирним+підкресленням
  assert.match(xml, /№ з\/п/);
  assert.match(xml, /Вимога з безпеки інформації/);
  assert.match(xml, /Налаштований зміст заходу захисту/);
  assert.match(xml, /УПРАВЛІННЯ ДОСТУПОМ \(AC\)/);
  assert.match(xml, /vMerge w:val="restart"/);
  assert.match(xml, /<w:b\/><w:u w:val="single"\/>|<w:u w:val="single"\/>/);
  assert.match(xml, /Вимоги БПБ текст/);
  // Реєстр ризиків більше НЕ входить у ЦПБ
  assert.doesNotMatch(xml, /Реєстр ризиків/);
  assert.doesNotMatch(xml, /R-001/);
  const header = execFileSync('unzip', ['-p', file, 'word/header1.xml'], { encoding: 'utf8' });
  assert.match(header, /Для службового користування/);
});

test('для open_confidential гриф відсутній', () => {
  const buf = buildDocx({ ...input, state: { ...input.state, info_type: 'open_confidential' } });
  const dir = mkdtempSync(join(tmpdir(), 'docxtest2-'));
  const file = join(dir, 't.docx');
  writeFileSync(file, buf);
  const header = execFileSync('unzip', ['-p', file, 'word/header1.xml'], { encoding: 'utf8' });
  assert.doesNotMatch(header, /Для службового користування/);
});

test('buildRisksDocx — окремий валідний документ реєстру з грифом', () => {
  const buf = buildRisksDocx({ state: input.state, annotatedRisks: input.annotatedRisks, assets: input.assets });
  const dir = mkdtempSync(join(tmpdir(), 'riskstest-'));
  const file = join(dir, 'r.docx');
  writeFileSync(file, buf);
  assert.match(execFileSync('unzip', ['-t', file], { encoding: 'utf8' }), /No errors detected/);
  const xml = execFileSync('unzip', ['-p', file, 'word/document.xml'], { encoding: 'utf8' });
  assert.match(xml, /РЕЄСТР РИЗИКІВ/);
  assert.match(xml, /R-001/);
  assert.match(xml, /АРМ/); // назва активу, не id
  const header = execFileSync('unzip', ['-p', file, 'word/header1.xml'], { encoding: 'utf8' });
  assert.match(header, /Для службового користування/);
});
