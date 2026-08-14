import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildAssessmentDocx } from '../core/docx/assessment-docx-writer.js';

function sampleAssessment() {
  return {
    id: 'ASSESS-2026-001',
    metadata: { ics_name: 'Тест АС', as_class: 1, info_type: 'service', assessor_name: 'Іванов І.І.' },
    items: [
      {
        id: 'AC-02.e', control_id: 'AC-02', family: 'AC', catalog_missing: false,
        resolved_statement: 'Вимагати схвалення керівником СЗІ запитів.',
        conclusion: 'POSITIVE', assessor_comment: 'Перевірено',
        evidence: [{ method: 'EXAMINE', source_type: 'POLICY', title: 'Політика ІБ', reference: 'п.4.2', observation: 'Відповідає', comment: '' }],
        finding: null,
      },
      {
        id: 'AC-99.z', control_id: 'AC-99', family: 'AC', catalog_missing: true,
        resolved_statement: '', conclusion: null, assessor_comment: '', evidence: [], finding: null,
      },
    ],
  };
}

test('buildAssessmentDocx повертає валідний ZIP/DOCX, що проходить unzip -t', () => {
  const buf = buildAssessmentDocx({ assessment: sampleAssessment() });
  const dir = mkdtempSync(join(tmpdir(), 'assess-docx-'));
  const file = join(dir, 'a.docx');
  writeFileSync(file, buf);
  assert.match(execFileSync('unzip', ['-t', file], { encoding: 'utf8' }), /No errors detected/);
});

test('document.xml містить control id, resolved statement, висновок та докази', () => {
  const buf = buildAssessmentDocx({ assessment: sampleAssessment() });
  const dir = mkdtempSync(join(tmpdir(), 'assess-docx-'));
  const file = join(dir, 'a.docx');
  writeFileSync(file, buf);
  const xml = execFileSync('unzip', ['-p', file, 'word/document.xml'], { encoding: 'utf8' });
  assert.match(xml, /AC-02\.e/);
  assert.match(xml, /Вимагати схвалення керівником СЗІ запитів/);
  assert.match(xml, /Позитивно/);
  assert.match(xml, /Дослідження/);
  assert.match(xml, /Політика ІБ/);
});

test('UNMAPPED_CONTROL item друкує попередження замість resolved_statement', () => {
  const buf = buildAssessmentDocx({ assessment: sampleAssessment() });
  const dir = mkdtempSync(join(tmpdir(), 'assess-docx-'));
  const file = join(dir, 'a.docx');
  writeFileSync(file, buf);
  const xml = execFileSync('unzip', ['-p', file, 'word/document.xml'], { encoding: 'utf8' });
  assert.match(xml, /AC-99\.z/);
  assert.match(xml, /Методика оцінювання для цього заходу не визначена у локальному каталозі/);
});
