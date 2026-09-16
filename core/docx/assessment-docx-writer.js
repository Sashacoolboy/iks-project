import { createZip } from './zip-writer.js';
import { par, cell, row, table } from './docx-writer.js';

/**
 * Builds v3 assessment report DOCX from report projection.
 * No Date.now()/new Date() calls — reproducible output.
 * @param {Object} opts - { projection }
 * @returns {Buffer} DOCX file
 */
export function buildAssessmentDocx({ projection }) {
  const sections = [];

  // Section 1: Title page
  sections.push(par('Звіт за результатами оцінювання', { bold: true, sz: 32, align: 'center' }));
  sections.push(par('інформаційно-комунікаційної системи', { align: 'center' }));
  sections.push(par(''));
  sections.push(par(`«${projection.title.ics_name}»`, { bold: true, align: 'center' }));
  sections.push(par(''));
  sections.push(par(`Номер оцінювання: ${projection.title.assessment_id}`));
  sections.push(par(`Дата: ${projection.title.date}`));
  sections.push(par(`Орган оцінювання: ${projection.title.assessment_body}`));
  sections.push(par(`Оцінювач: ${projection.title.assessor_name}`));
  sections.push(par(''));

  // Section 2: System information
  sections.push(par('1. Відомості про інформаційно-комунікаційну систему', { bold: true, sz: 32 }));
  sections.push(par(''));
  sections.push(par(`Найменування ІКС: ${projection.system_info.ics_name}`));
  if (projection.system_info.designation) sections.push(par(`Умовне позначення: ${projection.system_info.designation}`));
  if (projection.system_info.system_id) sections.push(par(`Ідентифікатор системи: ${projection.system_info.system_id}`));
  if (projection.system_info.owner_info) sections.push(par(`Власник або розпорядник системи: ${projection.system_info.owner_info}`));
  if (projection.system_info.developer_info) sections.push(par(`Виконавець робіт з розробки ЦПБ: ${projection.system_info.developer_info}`));
  if (projection.system_info.development_basis) sections.push(par(`Підстава розробки: ${projection.system_info.development_basis}`));
  if (projection.system_info.baseline_profile_info) sections.push(par(`Базовий профіль безпеки: ${projection.system_info.baseline_profile_info}`));
  sections.push(par(`Клас автоматизованої системи: ${projection.system_info.as_class}`));
  sections.push(par(`Тип інформації: ${projection.system_info.info_type}`));
  if (projection.system_info.normative_acts) sections.push(par(`Перелік нормативно-правових актів: ${projection.system_info.normative_acts}`));
  sections.push(par(''));

  // Section 3: Basis and scope
  sections.push(par('2. Підстава та область оцінювання', { bold: true, sz: 32 }));
  sections.push(par(''));
  sections.push(par(`Профіль захисту: ${projection.basis_scope.cpb_source}`));
  sections.push(par(`Хеш профілю: ${projection.basis_scope.cpb_hash}`));
  sections.push(par(`Кількість заходів захисту: ${projection.basis_scope.items_total}`));
  sections.push(par(`Кількість заходів контролю: ${projection.basis_scope.controls_total}`));
  sections.push(par(''));

  // Section 4: CPB version
  sections.push(par('3. Версія центрального профілю базового захисту', { bold: true, sz: 32 }));
  sections.push(par(''));
  sections.push(par(`Затверджена назва: ${projection.cpb_version.approved_name}`));
  sections.push(par(`Хеш: ${projection.cpb_version.hash}`));
  sections.push(par(''));

  // Section 4: Results by families
  sections.push(par('4. Результати оцінювання за класами заходів захисту', { bold: true, sz: 32 }));
  sections.push(par(''));

  for (const family of projection.families) {
    sections.push(par(`Клас ${family.family}: ${family.family_title}`, { bold: true, sz: 30 }));
    sections.push(par(''));

    for (const control of family.controls) {
      sections.push(par(`Захід ${control.control_id}: ${control.control_title}`, { bold: true }));
      sections.push(par(''));

      const itemRows = [
        row([
          cell('Позначення', { header: true }),
          cell('Мета оцінювання', { header: true }),
          cell('Оцінка', { header: true }),
          cell('Висновок', { header: true })
        ], { header: true }),
        ...control.items.map(item => {
          const evidenceText = item.evidence_ids.length > 0
            ? `Докази: ${item.evidence_ids.join(', ')}`
            : '';
          const conclusionFull = [item.conclusion, evidenceText].filter(Boolean).join('\n');
          return row([
            cell(item.assessment_source_id, {}),
            cell(item.resolved_objective, {}),
            cell(item.result_label, {}),
            cell(conclusionFull, {})
          ]);
        })
      ];
      sections.push(table(itemRows));
      sections.push(par(''));
    }
  }

  // Section 5: Evidence register
  sections.push(par('5. Реєстр доказів', { bold: true, sz: 32 }));
  sections.push(par(''));
  if (projection.evidence_register.length > 0) {
    const evidenceRows = [
      row([
        cell('ID', { header: true }),
        cell('Тип', { header: true }),
        cell('Назва', { header: true }),
        cell('Посилання', { header: true }),
        cell('Зібрано', { header: true }),
        cell('Дата', { header: true })
      ], { header: true }),
      ...projection.evidence_register.map(e => row([
        cell(e.evidence_id, {}),
        cell(e.type, {}),
        cell(e.title, {}),
        cell(e.reference, {}),
        cell(e.collected_by, {}),
        cell(e.collected_at, {})
      ]))
    ];
    sections.push(table(evidenceRows));
  } else {
    sections.push(par('Докази відсутні.'));
  }
  sections.push(par(''));

  // Section 6: Findings
  sections.push(par('6. Недоліки', { bold: true, sz: 32 }));
  sections.push(par(''));
  if (projection.findings.length > 0) {
    const findingRows = [
      row([
        cell('ID', { header: true }),
        cell('Серйозність', { header: true }),
        cell('Назва', { header: true }),
        cell('Опис', { header: true }),
        cell('Рекомендація', { header: true }),
        cell('Захід', { header: true })
      ], { header: true }),
      ...projection.findings.map(f => row([
        cell(f.finding_id, {}),
        cell(f.severity_label, {}),
        cell(f.title, {}),
        cell(f.description, {}),
        cell(f.recommendation, {}),
        cell(f.assessment_source_id, {})
      ]))
    ];
    sections.push(table(findingRows));
  } else {
    sections.push(par('Недоліків не виявлено.'));
  }
  sections.push(par(''));

  // Section 7: Overall conclusion
  sections.push(par('7. Загальний висновок', { bold: true, sz: 32 }));
  sections.push(par(''));
  sections.push(par(`Відповідає: ${projection.overall.counts.satisfied}`));
  //sections.push(par(`Частково відповідає: ${projection.overall.counts.partially_satisfied}`));
  sections.push(par(`Не відповідає: ${projection.overall.counts.not_satisfied}`));
  //sections.push(par(`Не застосовується: ${projection.overall.counts.not_applicable}`));
  sections.push(par(`Не оцінено: ${projection.overall.counts.not_assessed}`));
  sections.push(par(''));
  sections.push(par(`Висновок: ${projection.overall.conclusion_text}`, { bold: true }));
  sections.push(par(''));

  // Section 8: Appendices - unresolved ODP
  sections.push(par('8. Додатки', { bold: true, sz: 32 }));
  sections.push(par(''));
  sections.push(par('8.1. Нерозвʼязані параметри (ODP)', { bold: true }));
  sections.push(par(''));
  if (projection.appendices.unresolved_odp.length > 0) {
    const odpRows = [
      row([
        cell('ID параметра', { header: true }),
        cell('Захід', { header: true })
      ], { header: true }),
      ...projection.appendices.unresolved_odp.map(odp => row([
        cell(odp.local_odp_id, {}),
        cell(odp.control_id, {})
      ]))
    ];
    sections.push(table(odpRows));
  } else {
    sections.push(par('Усі параметри розвʼязано.'));
  }

  const documentXml = sections.join('');
  return packAssessmentDocx(documentXml, projection.title.date);
}

function packAssessmentDocx(documentXml, dateStr) {
  // Parse date for reproducibility (YYYY-MM-DD)
  let fixedDate;
  if (dateStr) {
    const parts = dateStr.split('-').map(Number);
    if (parts.length === 3) {
      fixedDate = new Date(parts[0], parts[1] - 1, parts[2], 12, 0, 0);
    }
  }

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
  ], { fixedDate });
}
