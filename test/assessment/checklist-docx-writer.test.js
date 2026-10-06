import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { buildChecklistDocx } from '../../core/docx/checklist-docx-writer.js';
import { buildChecklistProjection } from '../../core/assessment/checklist-projection.js';

const assessment = {
  id: 'ASSESS-2026-011',
  metadata: { ics_name: 'АС-2', as_class: 2, info_type: 'open_confidential', assessment_start_date: '2026-10-06' },
  plan: { checklist: [
    { control_id: 'AT-02', control_title: 'НАВЧАННЯ З ПІДВИЩЕННЯ ОБІЗНАНОСТІ', family: 'AT', family_title: 'Обізнаність та навчання',
      verification_statement: 'Перевірити журнал проведення тренінгів.', included: true },
  ] },
};

test('DOCX проходить unzip -t валідацію', () => {
  const projection = buildChecklistProjection({ assessment });
  const buf = buildChecklistDocx({ projection });
  const file = join(mkdtempSync(join(tmpdir(), 'checklist-docx-')), 'test.docx');
  writeFileSync(file, buf);
  const out = execFileSync('unzip', ['-t', file], { encoding: 'utf8' });
  assert.match(out, /No errors detected/);
});

test('document.xml містить назву ІКС, родину і текст інструкції', () => {
  const projection = buildChecklistProjection({ assessment });
  const buf = buildChecklistDocx({ projection });
  const file = join(mkdtempSync(join(tmpdir(), 'checklist-docx-')), 'test.docx');
  writeFileSync(file, buf);
  const xml = execFileSync('unzip', ['-p', file, 'word/document.xml'], { encoding: 'utf8' });
  assert.match(xml, /АС-2/);
  assert.match(xml, /Обізнаність та навчання/);
  assert.match(xml, /Перевірити журнал проведення тренінгів/);
});
