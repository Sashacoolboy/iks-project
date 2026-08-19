import { createZip } from './zip-writer.js';
import { escapeXml, run, par, parRuns, cell, cellXml, row, table } from './docx-writer.js';

const METHOD_LABELS = { EXAMINE: 'Дослідження', INTERVIEW: 'Опитування', TEST: 'Випробування', OBSERVE: 'Спостереження' };
const CONCLUSION_LABELS = {
  POSITIVE: 'Позитивно', PARTIALLY_POSITIVE: 'Частково позитивно', NEGATIVE: 'Негативно',
  NOT_APPLICABLE: 'Не застосовується', NOT_ASSESSED: 'Не оцінено',
};
const RESULT_LABELS = {
  SATISFIED: 'Позитивно', PARTIALLY_SATISFIED: 'Частково позитивно', NOT_SATISFIED: 'Негативно',
  NOT_APPLICABLE: 'Не застосовується', NOT_ASSESSED: 'Не оцінено',
};

function evidenceBlockText(item) {
  const byMethod = new Map();
  for (const ev of item.evidence ?? []) {
    if (!byMethod.has(ev.method)) byMethod.set(ev.method, []);
    byMethod.get(ev.method).push(ev);
  }
  const blocks = [];
  for (const [method, list] of byMethod) {
    const lines = list.map(ev => [ev.title, ev.reference, ev.observation].filter(Boolean).join(' — ')).join('\n');
    blocks.push(`${METHOD_LABELS[method] ?? method}:\n${lines}`);
  }
  if (item.assessor_comment?.trim()) blocks.push(`Коментар оцінювача:\n${item.assessor_comment.trim()}`);
  return blocks.join('\n\n');
}

function itemRow(item) {
  const reqText = item.catalog_missing
    ? `${item.id}\n\nМетодика оцінювання для цього заходу не визначена у локальному каталозі.`
    : `${item.id}\n\n${item.resolved_statement ?? ''}`;
  const conclusionText = item.conclusion ? (CONCLUSION_LABELS[item.conclusion] ?? item.conclusion) : 'Не оцінено';
  return row([
    cell(item.control_id, {}),
    cell(reqText, {}),
    cell(conclusionText, {}),
    cell(evidenceBlockText(item), {}),
  ]);
}

function packAssessmentDocx(documentXml) {
  return createZip([
    { path: '[Content_Types].xml', content:
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
      `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
      `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
      `<Default Extension="xml" ContentType="application/xml"/>` +
      `<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>` },
    { path: '_rels/.rels', content:
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
      `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
      `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>` },
    { path: 'word/_rels/document.xml.rels', content:
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
      `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"></Relationships>` },
    { path: 'word/document.xml', content:
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
      `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" ` +
      `xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">` +
      `<w:body>${documentXml}</w:body></w:document>` },
  ]);
}

export function buildAssessmentDocx({ assessment }) {
  // Minimal v1/v3 compatibility shim until Task 12 full rewrite
  const isV3 = assessment.schema_version?.startsWith('3.');
  const items = isV3
    ? assessment.plan.items.map(planItem => {
        const result = assessment.results.find(r => r.assessment_source_id === planItem.assessment_source_id) ?? {};
        const evidenceRecords = (result.evidence_ids ?? []).map(eid => assessment.evidence.find(e => e.evidence_id === eid)).filter(Boolean);
        return {
          id: planItem.assessment_source_id,
          control_id: planItem.control_id,
          resolved_statement: planItem.resolved_objective,
          conclusion: result.result,
          assessor_comment: result.assessor_comment,
          evidence: evidenceRecords.map(ev => ({
            method: result.methods_used[0] ?? 'EXAMINE',
            source_type: ev.type,
            title: ev.title,
            reference: ev.reference,
            observation: ev.observation,
          })),
        };
      })
    : assessment.items;
  const title = par(`Звіт з оцінювання ІКС «${assessment.metadata?.ics_name ?? ''}»`, { bold: true });
  const meta = par(`Оцінювач: ${assessment.metadata?.assessor_name ?? ''}  Клас АС: ${assessment.metadata?.as_class ?? ''}`);
  const header = row([
    cell('№ заходу захисту', { header: true }),
    cell('Оцінювання', { header: true }),
    cell('Висновок з оцінювання', { header: true }),
    cell('Докази, джерела отримання відомостей, коментарі оцінювача', { header: true }),
  ], { header: true });
  const itemRowsData = items.map(item => {
    const reqText = item.catalog_missing
      ? `${item.id}\n\nМетодика оцінювання для цього заходу не визначена у локальному каталозі.`
      : `${item.id}\n\n${item.resolved_statement ?? ''}`;
    const conclusionText = item.conclusion ? ((isV3 ? RESULT_LABELS : CONCLUSION_LABELS)[item.conclusion] ?? item.conclusion) : 'Не оцінено';
    return row([
      cell(item.control_id, {}),
      cell(reqText, {}),
      cell(conclusionText, {}),
      cell(evidenceBlockText(item), {}),
    ]);
  });
  const rows = [header, ...itemRowsData];
  const body = title + meta + table(rows);
  return packAssessmentDocx(body);
}
