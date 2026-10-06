// core/docx/checklist-docx-writer.js
import { par, table, row, cell } from './docx-writer.js';
import { packAssessmentDocx } from './assessment-docx-writer.js';

export function buildChecklistDocx({ projection }) {
  const sections = [];

  sections.push(par('Чекліст перевірки ІКС', { bold: true, sz: 32, align: 'center' }));
  sections.push(par('(для погодження плану оцінювання)', { align: 'center' }));
  sections.push(par(''));
  sections.push(par(`«${projection.title.ics_name}»`, { bold: true, align: 'center' }));
  sections.push(par(''));
  sections.push(par(`Номер оцінювання: ${projection.title.assessment_id}`));
  sections.push(par(`Дата: ${projection.title.date}`));
  sections.push(par(`Клас автоматизованої системи: ${projection.system_info.as_class}`));
  sections.push(par(`Тип інформації: ${projection.system_info.info_type}`));
  sections.push(par(''));

  for (const group of projection.families) {
    sections.push(par(`${group.family} — ${group.family_title}`, { bold: true, sz: 28 }));
    const rows = [
      row([cell('Захід', { header: true }), cell('Інструкція перевірки', { header: true })], { header: true }),
      ...group.rows.map(r => row([
        cell(`${r.control_id} — ${r.control_title}`, {}),
        cell(r.verification_statement, {}),
      ])),
    ];
    sections.push(table(rows));
    sections.push(par(''));
  }

  const documentXml = sections.join('');
  return packAssessmentDocx(documentXml, projection.title.date);
}
