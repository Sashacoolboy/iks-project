// Створює sample assessment з data/FIXTURES/АС-2.json без сервера
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { buildAssessmentPlan } from '../core/assessment/assessment-plan.js';
import { makeAssessment, serializeAssessment } from '../core/assessment/assessment-io.js';
import { sha256, buildCatalogVersion } from '../core/assessment/versioning.js';
import { makeAuditEntry } from '../core/assessment/audit-trail.js';
import { buildReportProjection } from '../core/assessment/report-projection.js';
import { buildAssessmentDocx } from '../core/docx/assessment-docx-writer.js';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const read = async (p) => JSON.parse(await readFile(join(ROOT, p), 'utf8'));

const as2 = await read('data/FIXTURES/АС-2.json');
const approvedRecord = {
  kind: 'approved',
  approved_at: '2026-08-17T00:00:00.000Z',
  state: {
    info_type: as2.info_type,
    profile: as2.profile,
    passport: { ics_name: 'АС-2 (fixture)', as_class: 2 }
  },
  summary: {}
};

const catalogs = {
  ndTzi: await read('data/nd_tzi.json'),
  bpb: {
    service: await read('data/bpb_service.json'),
    open_confidential: await read('data/bpb_open_confidential.json')
  },
  exemptions: await read('data/as_class_exemptions.json'),
  genericDefaults: await read('data/generic_parameter_defaults.json')
};

const assessmentCatalog = await read('data/assessment/assessment_catalog.json');
const adapter = await read('data/assessment/assessment_odp_adapter.json');

const { items, warnings } = buildAssessmentPlan({
  approvedState: approvedRecord.state,
  catalogs,
  assessmentCatalog,
  adapter
});

const id = 'ASSESS-2026-900'; // сумісний з ASSESSMENT_ID_RE сервера
const assessment = makeAssessment({
  approvedRecord,
  approvedName: 'as2-fixture',
  plan: { items },
  warnings,
  id,
  startedBy: 'sample-generator'
});

const snapshotText = JSON.stringify(approvedRecord, null, 2);
assessment.cpb_snapshot.hash = sha256(snapshotText);

const dir = join(ROOT, 'assessments', id);
await mkdir(join(dir, 'evidence'), { recursive: true });
await writeFile(join(dir, 'assessment.json'), serializeAssessment(assessment));
await writeFile(join(dir, 'cpb-snapshot.json'), snapshotText);
await writeFile(join(dir, 'catalog-version.json'), JSON.stringify(buildCatalogVersion({
  files: {
    'assessment_catalog.json': JSON.stringify(assessmentCatalog),
    'assessment_odp_adapter.json': JSON.stringify(adapter)
  }
}), null, 2));
await writeFile(join(dir, 'audit-log.json'), JSON.stringify([
  makeAuditEntry({ actor: 'sample-generator', action: 'ASSESSMENT_CREATED', entity_id: id })
], null, 2));

const projection = buildReportProjection({ assessment, cpbSnapshot: approvedRecord });
await mkdir(join(ROOT, 'exports', 'assessments'), { recursive: true });
await writeFile(join(ROOT, 'exports', 'assessments', `${id}.docx`), buildAssessmentDocx({ projection }));

console.log(`sample: ${items.length} items, ${warnings.length} warnings`);
