import { createZip } from './zip-writer.js';

export function escapeXml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

const FONT = 'Times New Roman';
const SZ = 28; // 14pt у half-points

const rpr = (opts = {}) =>
  `<w:rPr><w:rFonts w:ascii="${FONT}" w:hAnsi="${FONT}" w:cs="${FONT}"/><w:sz w:val="${SZ}"/><w:szCs w:val="${SZ}"/>${opts.bold ? '<w:b/>' : ''}</w:rPr>`;

export const run = (text, opts) => `<w:r>${rpr(opts)}<w:t xml:space="preserve">${escapeXml(text)}</w:t></w:r>`;

export const par = (text, opts = {}) =>
  `<w:p><w:pPr>${opts.align ? `<w:jc w:val="${opts.align}"/>` : ''}</w:pPr>${text ? run(text, opts) : ''}</w:p>`;

export const cell = (text, opts = {}) => {
  // Multi-line support: split on '\n' and create separate <w:p> for each line
  const lines = String(text || '').split('\n');
  const paragraphs = lines.map(line => par(line, opts)).join('');
  return `<w:tc><w:tcPr>${opts.width ? `<w:tcW w:w="${opts.width}" w:type="dxa"/>` : ''}</w:tcPr>${paragraphs}</w:tc>`;
};

export const row = (cells) => `<w:tr>${cells.join('')}</w:tr>`;

export const table = (rows, opts = {}) =>
  `<w:tbl><w:tblPr><w:tblBorders>` +
  ['top', 'left', 'bottom', 'right', 'insideH', 'insideV']
    .map(b => `<w:${b} w:val="single" w:sz="4" w:color="000000"/>`).join('') +
  `</w:tblBorders><w:tblW w:w="0" w:type="auto"/></w:tblPr>${rows.join('')}</w:tbl>`;

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

export function buildDocx({ state, profileDoc, annotatedRisks, assets, policyMapping }) {
  const constantMeta = new Map(
    (policyMapping?.global_constants ?? []).map(gc => [gc.key, gc.label]));
  const body = [];
  // 1. Титул
  body.push(par('ЦІЛЬОВИЙ ПРОФІЛЬ БЕЗПЕКИ', { bold: true, align: 'center' }));
  body.push(par(state.passport.ics_name, { bold: true, align: 'center' }));
  body.push(par(`Орган сертифікації: ${state.passport.cert_body}`, { align: 'center' }));
  body.push(par(`Клас автоматизованої системи: АС-${state.passport.as_class}`, { align: 'center' }));
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
  // 4. Ризики (альбомна)
  body.push(par('3. Реєстр ризиків (за методикою Наказу № 402)', { bold: true }));
  body.push(table([
    row(['ID', 'Актив', 'Загроза', 'Вразливість', 'Вплив', 'Ймовірність', 'Рівень', 'Стратегія', 'Заходи', 'Відп.', 'Залишковий']
      .map(h => cell(h, { bold: true }))),
    ...annotatedRisks.map(r => row([
      cell(r.id), cell(r.asset_id), cell(r.threat), cell(r.vulnerability),
      cell(String(r.impact)), cell(`${r.likelihood_label} / ${r.likelihood}`),
      cell(r.level), cell(r.treatment_strategy), cell(r.treatment_plan),
      cell(r.responsible), cell(r.residual_risk ?? ''),
    ])),
  ]));
  // 5. Профіль
  body.push(par('4. Цільовий профіль безпеки', { bold: true }));
  const profileRows = [row(['№', 'Клас заходів', 'Пункт БПБ', 'Зміст заходу', 'Статус', 'Посилення']
    .map(h => cell(h, { bold: true })))];
  for (const item of profileDoc.items) {
    const content = item.exemptionNote
      ? item.exemptionNote
      : item.controls.map(c => c.statementLines.map(l => `${l.label} ${l.text}`.trim()).join('\n')).join('\n');
    profileRows.push(row([
      cell(item.actionNumber), cell(`${item.classId} — ${item.className}`),
      cell(item.actionName), cell(content), cell(item.status),
      cell(item.enhancements.map(e => `${e.id} ${e.title}`).join('; ')),
    ]));
  }
  body.push(table(profileRows));
  // 6. Підписи
  body.push(par(''));
  body.push(par('Адміністратор безпеки: _________________'));
  body.push(par('Керівник організації: _________________'));

  const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" ` +
    `xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">` +
    `<w:body>${body.join('')}${SECT_LANDSCAPE_FINAL}</w:body></w:document>`;

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
    { path: 'word/document.xml', content: documentXml },
    { path: 'word/header1.xml', content: headerXml(state.info_type) },
  ]);
}
