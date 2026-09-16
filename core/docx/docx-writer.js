import { createZip } from './zip-writer.js';

export function escapeXml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

const FONT = 'Times New Roman';
const SZ = 28; // 14pt у half-points

const rpr = (opts = {}) =>
  `<w:rPr><w:rFonts w:ascii="${FONT}" w:hAnsi="${FONT}" w:cs="${FONT}"/><w:sz w:val="${opts.sz ?? SZ}"/><w:szCs w:val="${opts.sz ?? SZ}"/>` +
  `${opts.bold ? '<w:b/>' : ''}${opts.italic ? '<w:i/>' : ''}${opts.underline ? '<w:u w:val="single"/>' : ''}</w:rPr>`;

export const run = (text, opts) => `<w:r>${rpr(opts)}<w:t xml:space="preserve">${escapeXml(text)}</w:t></w:r>`;

export const par = (text, opts = {}) =>
  `<w:p><w:pPr>${opts.align ? `<w:jc w:val="${opts.align}"/>` : ''}${opts.indent ? `<w:ind w:left="${opts.indent}"/>` : ''}</w:pPr>${text ? run(text, opts) : ''}</w:p>`;

// Параграф із готових run-ів (для змішаного форматування підстановок)
export const parRuns = (runsXml, opts = {}) =>
  `<w:p><w:pPr>${opts.align ? `<w:jc w:val="${opts.align}"/>` : ''}${opts.indent ? `<w:ind w:left="${opts.indent}"/>` : ''}</w:pPr>${runsXml}</w:p>`;

const tcPr = (opts = {}) =>
  `<w:tcPr>` +
  `${opts.pct ? `<w:tcW w:w="${Math.round(opts.pct * 50)}" w:type="pct"/>` : ''}` +
  `${opts.span ? `<w:gridSpan w:val="${opts.span}"/>` : ''}` +
  `${opts.merge === 'restart' ? '<w:vMerge w:val="restart"/>' : opts.merge === 'continue' ? '<w:vMerge/>' : ''}` +
  `</w:tcPr>`;

export const cell = (text, opts = {}) => {
  const lines = String(text || '').split('\n');
  const paragraphs = lines.map(line => par(line, opts)).join('');
  return `<w:tc>${tcPr(opts)}${paragraphs}</w:tc>`;
};

// Клітинка з готовим XML параграфів
export const cellXml = (paragraphsXml, opts = {}) =>
  `<w:tc>${tcPr(opts)}${paragraphsXml || '<w:p/>'}</w:tc>`;

export const row = (cells, opts = {}) => `<w:tr>${opts.header ? '<w:trPr><w:tblHeader/></w:trPr>' : ''}${cells.join('')}</w:tr>`;

export const table = (rows, opts = {}) =>
  `<w:tbl><w:tblPr><w:tblBorders>` +
  ['top', 'left', 'bottom', 'right', 'insideH', 'insideV']
    .map(b => `<w:${b} w:val="single" w:sz="4" w:color="000000"/>`).join('') +
  `</w:tblBorders><w:tblW w:w="5000" w:type="pct"/></w:tblPr>${rows.join('')}</w:tbl>`;

// Розрив секції: portrait (титул/політики/активи) → landscape (ризики/профіль)
const SECT_PORTRAIT_BREAK =
  `<w:p><w:pPr><w:sectPr><w:headerReference w:type="default" r:id="rIdHdr"/>` +
  `<w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1134" w:right="850" w:bottom="1134" w:left="1701"/></w:sectPr></w:pPr></w:p>`;
const SECT_LANDSCAPE_FINAL =
  `<w:sectPr><w:headerReference w:type="default" r:id="rIdHdr"/>` +
  `<w:pgSz w:w="16838" w:h="11906" w:orient="landscape"/><w:pgMar w:top="850" w:right="1134" w:bottom="850" w:left="1134"/></w:sectPr>`;

function headerXml(infoType) {
  const stamp = infoType === 'service'
    ? `<w:p><w:pPr><w:jc w:val="right"/></w:pPr>${run('Для службового користування', { bold: true })}</w:p>` +
      `<w:p><w:pPr><w:jc w:val="right"/></w:pPr>${run('Прим. № ___')}</w:p>`
    : '<w:p/>';
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<w:hdr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">${stamp}</w:hdr>`;
}

// Пакування одного document.xml у повний DOCX
function packDocx(documentXml, infoType) {
  return createZip([
    { path: '[Content_Types].xml', content:
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
      `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
      `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
      `<Default Extension="xml" ContentType="application/xml"/>` +
      `<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>` +
      `<Override PartName="/word/header1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml"/></Types>` },
    { path: '_rels/.rels', content:
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
      `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
      `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>` },
    { path: 'word/_rels/document.xml.rels', content:
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
      `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
      `<Relationship Id="rIdHdr" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/header" Target="header1.xml"/></Relationships>` },
    { path: 'word/document.xml', content:
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
      `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" ` +
      `xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">` +
      `<w:body>${documentXml}</w:body></w:document>` },
    { path: 'word/header1.xml', content: headerXml(infoType) },
  ]);
}

/** Ширини колонок таблиці профілю, % (за зразком стандарту) */
const PROFILE_COL_PCT = [4, 16, 30, 8, 42];

// Рядок statement: label + runs, підстановки — жирним з підкресленням (порожні — жирним)
function statementParXml(line) {
  const runs = [line.label ? run(`${line.label} `) : '']
    .concat((line.parts ?? []).map(p => {
      if (p.type === 'text') return run(p.value);
      return p.source === 'empty'
        ? run(p.value, { bold: true })
        : run(p.value, { bold: true, underline: true });
    }));
  // Fallback: parts відсутні (напр. старі тести) — plain text
  const runsXml = (line.parts?.length ? runs.join('') : run(`${line.label} ${line.text}`.trim()));
  return parRuns(runsXml, { indent: line.depth ? line.depth * 280 : 0 });
}

// Клітинки 5-колонкового рядка контролю: id + зміст
function controlRowsFor(item) {
  const entries = [];
  for (const c of item.controls) {
    const paragraphs = c.statementLines.map(statementParXml).join('') || '<w:p/>';
    entries.push({ id: c.id, note: null, paragraphs });
  }
  for (const e of item.enhancements) {
    const paragraphs = (e.lines ?? []).map(statementParXml).join('') || par(e.title);
    entries.push({ id: e.id, note: '(додано)', paragraphs });
  }
  return entries;
}

export function buildDocx({ state, profileDoc, assets, policyMapping }) {
  const constantMeta = new Map(
    (policyMapping?.global_constants ?? []).map(gc => [gc.key, gc.label]));
  const body = [];
  // 1. Титул
  body.push(par('ЦІЛЬОВИЙ ПРОФІЛЬ БЕЗПЕКИ', { bold: true, align: 'center' }));
  body.push(par(state.passport.ics_name, { bold: true, align: 'center' }));
  if (state.passport.designation) body.push(par(`Умовне позначення: ${state.passport.designation}`, { align: 'center' }));
  if (state.passport.system_id) body.push(par(`Ідентифікатор системи: ${state.passport.system_id}`, { align: 'center' }));
  if (state.passport.owner_info) body.push(par(`Власник або розпорядник системи: ${state.passport.owner_info}`, { align: 'center' }));
  if (state.passport.developer_info) body.push(par(`Виконавець робіт з розробки ЦПБ: ${state.passport.developer_info}`, { align: 'center' }));
  if (state.passport.development_basis) body.push(par(`Підстава розробки: ${state.passport.development_basis}`, { align: 'center' }));
  if (state.passport.baseline_profile_info) body.push(par(`Базовий профіль безпеки: ${state.passport.baseline_profile_info}`, { align: 'center' }));
  body.push(par(`Орган сертифікації: ${state.passport.cert_body}`, { align: 'center' }));
  body.push(par(`Клас автоматизованої системи: АС-${state.passport.as_class}`, { align: 'center' }));
  if (state.passport.normative_acts) body.push(par(`Перелік нормативно-правових актів: ${state.passport.normative_acts}`, { align: 'center' }));
  if (state.global_constants.organization_policy_id)
    body.push(par(`Введено в дію: ${state.global_constants.organization_policy_id}`, { align: 'center' }));
  // 2. Глобальні політики (людські назви з мапінгу, лише заповнені)
  body.push(par('1. Глобальні політики безпеки організації', { bold: true }));
  const policyRows = Object.entries(state.global_constants)
    .filter(([, v]) => v && String(v).trim())
    .map(([k, v]) => row([cell(constantMeta.get(k) ?? k), cell(v)]));
  body.push(table([
    row([cell('Політика', { bold: true }), cell('Значення', { bold: true })]),
    ...policyRows,
  ]));
  // 3. Активи
  body.push(par('2. Реєстр активів', { bold: true }));
  body.push(table([
    row([cell('ID', { bold: true }), cell('Актив', { bold: true }), cell('Категорія', { bold: true })]),
    ...state.selected_assets.map(id => {
      const a = assets.find(x => x.id === id);
      return row([cell(id), cell(a?.name ?? id), cell(a?.category ?? '')]);
    }),
  ]));
  body.push(SECT_PORTRAIT_BREAK);
  // 4. Таблиця цільового профілю за зразком стандарту (5 колонок, альбомна)
  body.push(par('3. Цільовий профіль безпеки', { bold: true, align: 'center' }));
  const [w1, w2, w3, w4, w5] = PROFILE_COL_PCT;
  const profileRows = [row([
    cell('№ з/п', { bold: true, align: 'center', pct: w1 }),
    cell('Вимога з безпеки інформації', { bold: true, align: 'center', pct: w2 }),
    cell('Вимоги Базового профілю безпеки', { bold: true, align: 'center', pct: w3 }),
    cell('Захід захисту', { bold: true, align: 'center', pct: w4 }),
    cell('Налаштований зміст заходу захисту', { bold: true, align: 'center', pct: w5 }),
  ], { header: true })];
  let currentClass = null;
  for (const item of profileDoc.items) {
    if (item.classId !== currentClass) {
      currentClass = item.classId;
      profileRows.push(row([
        cell(`${item.className.toUpperCase()} (${item.classId})`, { bold: true, align: 'center', span: 5 }),
      ]));
    }
    if (item.status !== 'Застосовується (автозаповнено)') {
      const note = item.exemptionNote ?? 'Не застосовується (вручну)';
      profileRows.push(row([
        cell(item.actionNumber, { align: 'center', pct: w1 }),
        cell(item.actionName, { pct: w2 }),
        cell(item.bpbRequirements ?? '', { pct: w3 }),
        cell('—', { align: 'center', pct: w4 }),
        cellXml(par(note), { pct: w5 }),
      ]));
      continue;
    }
    const entries = controlRowsFor(item);
    if (!entries.length) {
      profileRows.push(row([
        cell(item.actionNumber, { align: 'center', pct: w1 }),
        cell(item.actionName, { pct: w2 }),
        cell(item.bpbRequirements ?? '', { pct: w3 }),
        cell('—', { align: 'center', pct: w4 }), cell('—', { pct: w5 }),
      ]));
      continue;
    }
    entries.forEach((entry, i) => {
      const first = i === 0;
      const merge = entries.length > 1 ? (first ? 'restart' : 'continue') : undefined;
      const idParagraphs = par(entry.id, { align: 'center' }) +
        (entry.note ? par(entry.note, { italic: true, align: 'center', sz: 20 }) : '');
      profileRows.push(row([
        cell(first ? item.actionNumber : '', { align: 'center', pct: w1, merge }),
        cell(first ? item.actionName : '', { pct: w2, merge }),
        cell(first ? (item.bpbRequirements ?? '') : '', { pct: w3, merge }),
        cellXml(idParagraphs, { pct: w4 }),
        cellXml(entry.paragraphs, { pct: w5 }),
      ]));
    });
  }
  body.push(table(profileRows));
  // 5. Підписи
  body.push(par(''));
  body.push(par('Адміністратор безпеки: _________________'));
  body.push(par('Керівник організації: _________________'));

  return packDocx(body.join('') + SECT_LANDSCAPE_FINAL, state.info_type);
}

/** Окремий документ «Реєстр ризиків» (зберігається на Кроці 4, не входить у ЦПБ) */
export function buildRisksDocx({ state, annotatedRisks, assets }) {
  const assetName = (id) => assets.find(a => a.id === id)?.name ?? id;
  const body = [];
  body.push(par('РЕЄСТР РИЗИКІВ БЕЗПЕКИ ІНФОРМАЦІЇ', { bold: true, align: 'center' }));
  body.push(par(state.passport.ics_name, { bold: true, align: 'center' }));
  body.push(par(`Клас автоматизованої системи: АС-${state.passport.as_class} (за методикою Наказу № 402)`, { align: 'center' }));
  body.push(par(''));
  body.push(table([
    row(['ID', 'Актив', 'Загроза', 'Вразливість', 'Вплив', 'Ймовірність', 'Рівень', 'Стратегія', 'Заходи', 'Відп.', 'Залишковий']
      .map(h => cell(h, { bold: true, align: 'center' })), { header: true }),
    ...annotatedRisks.map(r => row([
      cell(r.id), cell(assetName(r.asset_id)), cell(r.threat), cell(r.vulnerability),
      cell(String(r.impact), { align: 'center' }), cell(`${r.likelihood_label} / ${r.likelihood}`),
      cell(r.level, { align: 'center' }), cell(r.treatment_strategy), cell(r.treatment_plan),
      cell(r.responsible), cell(r.residual_risk ?? ''),
    ])),
  ]));
  body.push(par(''));
  body.push(par('Начальник підрозділу захисту інформації: _________________'));

  return packDocx(body.join('') + SECT_LANDSCAPE_FINAL, state.info_type);
}
