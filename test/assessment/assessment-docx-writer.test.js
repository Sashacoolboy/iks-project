import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { buildAssessmentDocx } from '../../core/docx/assessment-docx-writer.js';
import { buildReportProjection } from '../../core/assessment/report-projection.js';

const assessment = {
  id: 'ASSESS-2026-077',
  metadata: {
    ics_name: 'АС-2',
    as_class: 2,
    info_type: 'open_confidential',
    assessment_body: 'Орган оцінювання',
    assessor_name: 'Оцінювач І.І.',
    assessment_start_date: '2026-08-15'
  },
  cpb_snapshot: { source_approved_name: 'as2', hash: 'abc123' },
  warnings: [{ code: 'ODP_UNRESOLVED', control_id: 'AC-02', local_odp_id: 'ac-2_odp.01' }],
  plan: {
    items: [
      {
        assessment_source_id: 'AC-02e',
        control_id: 'AC-02',
        family: 'AC',
        family_title: 'ДОСТУП',
        control_title: 'ОБЛІК',
        resolved_objective: 'перевірити наявність схвалення керівником СЗІ',
        odp_values: []
      }
    ]
  },
  results: [
    {
      assessment_source_id: 'AC-02e',
      result: 'NOT_SATISFIED',
      evidence_ids: ['EV-001'],
      finding_ids: ['F-001'],
      conclusion: 'захід не виконується належним чином',
      assessor_comment: ''
    }
  ],
  evidence: [
    {
      evidence_id: 'EV-001',
      type: 'ORDER',
      title: 'Наказ про СЗІ',
      reference: 'п.4.2',
      collected_by: 'Оцінювач',
      collected_at: '2026-08-15'
    }
  ],
  findings: [
    {
      finding_id: 'F-001',
      assessment_source_id: 'AC-02e',
      severity: 'MAJOR',
      title: 'Відсутність схвалення',
      description: 'Не виявлено документів із схваленням керівника СЗІ',
      recommendation: 'Забезпечити процедуру схвалення',
      status: 'OPEN'
    }
  ]
};

const cpbSnapshot = { state: {} };
const projection = buildReportProjection({ assessment, cpbSnapshot });

test('DOCX має валідну PK сигнатуру та розумний розмір', () => {
  const buf = buildAssessmentDocx({ projection });
  assert.equal(buf.slice(0, 2).toString(), 'PK', 'ZIP signature');
  assert.ok(buf.length > 2000, `Expected > 2000 bytes, got ${buf.length}`);
});

test('DOCX проходить unzip -t валідацію', () => {
  const buf = buildAssessmentDocx({ projection });
  const dir = mkdtempSync(join(tmpdir(), 'assess-docx-'));
  const file = join(dir, 'report.docx');
  writeFileSync(file, buf);
  const out = execFileSync('unzip', ['-t', file], { encoding: 'utf8' });
  assert.match(out, /No errors detected/);
});

test('document.xml містить обовʼязкові розділи та українські лейбли', () => {
  const buf = buildAssessmentDocx({ projection });
  const dir = mkdtempSync(join(tmpdir(), 'assess-docx-'));
  const file = join(dir, 'report.docx');
  writeFileSync(file, buf);
  const xml = execFileSync('unzip', ['-p', file, 'word/document.xml'], { encoding: 'utf8' });

  // Титул
  assert.match(xml, /Звіт за результатами оцінювання/, 'title heading');
  assert.match(xml, /АС-2/, 'ICS name');
  assert.match(xml, /ASSESS-2026-077/, 'assessment ID');

  // Resolved objective
  assert.match(xml, /перевірити наявність схвалення керівником СЗІ/, 'resolved objective');

  // Секції перенумеровані після видалення «Методів оцінювання»
  assert.match(xml, /4\. Результати оцінювання за класами заходів захисту/, 'section 4 renumbered');
  assert.match(xml, /8\. Додатки/, 'section 8 renumbered');
  assert.ok(!xml.includes('Методи оцінювання'), 'методи-секція видалена');

  // Загальний висновок
  assert.match(xml, /ІКС не відповідає вимогам ЦПБ/, 'overall conclusion');
});

test('відтворюваність: дві послідовні генерації → ідентичні байти', () => {
  const a = buildAssessmentDocx({ projection });
  const b = buildAssessmentDocx({ projection });
  assert.ok(a.equals(b), 'identical buffers');
});
