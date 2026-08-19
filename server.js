import { createServer } from 'node:http';
import { readFile, writeFile, readdir, mkdir, stat } from 'node:fs/promises';
import { join, extname, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDocx, buildRisksDocx } from './core/docx/docx-writer.js';
import { buildProfile } from './core/profile-engine.js';
import { baseRisksFor, annotateRisk } from './core/risk-engine.js';
import { validateTemplate } from './core/template-io.js';
import { mergeRecord, emptyDictionary } from './core/odp-dictionary.js';
import { buildAssessmentPlan } from './core/assessment/assessment-plan.js';
import { makeAssessment, serializeAssessment, deserializeAssessment, validateAssessmentSchema, nextAssessmentId, migrateAssessment } from './core/assessment/assessment-io.js';
import { finalizeAssessment } from './core/assessment/assessment-run.js';
import { validateAssessment } from './core/assessment/assessment-validator.js';
import { makeAuditEntry, appendAuditEntry } from './core/assessment/audit-trail.js';
import { sha256, buildCatalogVersion } from './core/assessment/versioning.js';
import { buildAssessmentDocx } from './core/docx/assessment-docx-writer.js';
import { buildReportProjection } from './core/assessment/report-projection.js';

const ROOT = fileURLToPath(new URL('.', import.meta.url));
const PORT = Number(process.env.PORT ?? 3000);
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json' };
const NAME_RE = /^[a-zа-яіїєґ0-9_\-]+$/i;
const KINDS = new Set(['ics', 'cpb', 'approved']);
const ASSESSMENT_ID_RE = /^ASSESS-\d{4}-\d{3,4}$/;
const EVIDENCE_EXT_ALLOWLIST = new Set(['.pdf', '.png', '.jpg', '.jpeg', '.txt', '.log', '.json']);

const readBody = (req, limit = 5_000_000) => new Promise((resolve, reject) => {
  let size = 0; const chunks = [];
  req.on('data', (c) => { size += c.length; if (size > limit) reject(new Error('too large')); else chunks.push(c); });
  req.on('end', () => resolve(Buffer.concat(chunks)));
  req.on('error', reject);
});

const json = (res, code, obj) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(obj)); };

async function appendAudit(dir, entry) {
  const file = join(dir, 'audit-log.json');
  let log = [];
  try { log = JSON.parse(await readFile(file, 'utf8')); } catch { /* нового запису ще немає */ }
  await writeFile(file, JSON.stringify(appendAuditEntry(log, entry), null, 2));
}

async function readAssessmentGuarded(dir) {
  const raw = JSON.parse(await readFile(join(dir, 'assessment.json'), 'utf8'));
  const migrated = migrateAssessment(raw);
  if (migrated !== raw) await writeFile(join(dir, 'assessment.json'), serializeAssessment(migrated));
  return migrated;
}

async function loadCatalogs() {
  const read = async (p) => JSON.parse(await readFile(join(ROOT, 'data', p), 'utf8'));
  return {
    ndTzi: await read('nd_tzi.json'),
    bpb: { service: await read('bpb_service.json'), open_confidential: await read('bpb_open_confidential.json') },
    exemptions: await read('as_class_exemptions.json'),
    policyMapping: await read('policy_mapping.json'),
    genericDefaults: await read('generic_parameter_defaults.json'),
    assets: (await read('assets_catalog.json')).assets,
    threatsRisks: await read('threats_risks.json'),
  };
}
const catalogsPromise = loadCatalogs();

createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://127.0.0.1:${PORT}`);
    const parts = url.pathname.split('/').filter(Boolean).map(decodeURIComponent);

    if (parts[0] === 'api') {
      if (parts[1] === 'dictionary') {
        const dictFile = join(ROOT, 'dictionary', 'odp_dictionary.json');
        if (req.method === 'GET') {
          try { return json(res, 200, JSON.parse(await readFile(dictFile, 'utf8'))); }
          catch { return json(res, 200, emptyDictionary()); }
        }
        if (parts[2] === 'record' && req.method === 'POST') {
          const rec = JSON.parse((await readBody(req)).toString('utf8'));
          if (typeof rec?.paramId !== 'string' || typeof rec?.value !== 'string')
            return json(res, 400, { error: 'потрібні paramId та value' });
          let dict;
          try { dict = JSON.parse(await readFile(dictFile, 'utf8')); } catch { dict = emptyDictionary(); }
          dict = mergeRecord(dict, rec);
          await mkdir(join(ROOT, 'dictionary'), { recursive: true });
          await writeFile(dictFile, JSON.stringify(dict, null, 2));
          return json(res, 200, { ok: true });
        }
        return json(res, 404, { error: 'not found' });
      }
      if (parts[1] === 'templates') {
        const kind = parts[2];
        if (!KINDS.has(kind)) return json(res, 400, { error: 'невідомий тип шаблону' });
        const dir = join(ROOT, 'templates', kind);
        if (parts.length === 3 && req.method === 'GET') {
          await mkdir(dir, { recursive: true });
          const files = (await readdir(dir)).filter(f => f.endsWith('.json'));
          const items = [];
          for (const f of files) {
            const name = f.slice(0, -5);
            let meta = { name, info_type: null };
            try {
              const obj = JSON.parse(await readFile(join(dir, f), 'utf8'));
              if (kind === 'approved') {
                meta = { name, info_type: obj.state?.info_type ?? null,
                  ics_name: obj.state?.passport?.ics_name ?? '', as_class: obj.state?.passport?.as_class ?? null,
                  approved_at: obj.approved_at ?? null, summary: obj.summary ?? {} };
              } else {
                meta.info_type = obj.info_type ?? null;
              }
            } catch { /* пошкоджений файл — без метаданих */ }
            items.push(meta);
          }
          return json(res, 200, { names: items.map(i => i.name), items });
        }
        const name = parts[3];
        if (!name || !NAME_RE.test(name)) return json(res, 400, { error: 'некоректне ім\u02BCя шаблону' });
        const file = join(dir, name + '.json');
        if (req.method === 'GET') return json(res, 200, JSON.parse(await readFile(file, 'utf8')));
        if (req.method === 'POST') {
          const body = JSON.parse((await readBody(req)).toString('utf8'));
          const errors = validateTemplate(kind, body);
          if (errors.length) return json(res, 400, { error: errors.join('; ') });
          // Затверджені записи незмінні — редагування лише через дублікат під новим імʼям
          if (kind === 'approved') {
            let exists = false;
            try { await stat(file); exists = true; } catch { /* немає — можна писати */ }
            if (exists) return json(res, 409, { error: `запис «${name}» вже затверджено і не підлягає змінам — збережіть під новим імʼям` });
          }
          await mkdir(dir, { recursive: true });          await writeFile(file, JSON.stringify(body, null, 2));
          return json(res, 200, { ok: true });
        }
      }
      if (parts[1] === 'assessments') {
        const assessDir = join(ROOT, 'assessments');
        if (parts.length === 2 && req.method === 'GET') {
          await mkdir(assessDir, { recursive: true });
          const dirs = await readdir(assessDir, { withFileTypes: true });
          const items = [];
          for (const d of dirs) {
            if (!d.isDirectory()) continue;
            try {
              const a = JSON.parse(await readFile(join(assessDir, d.name, 'assessment.json'), 'utf8'));
              items.push({ id: a.id, ics_name: a.metadata?.ics_name, as_class: a.metadata?.as_class,
                info_type: a.metadata?.info_type, status: a.status, created_at: a.created_at, updated_at: a.updated_at });
            } catch { /* пошкоджений запис — пропустити */ }
          }
          return json(res, 200, { items });
        }
        if (parts.length === 2 && req.method === 'POST') {
          const body = JSON.parse((await readBody(req)).toString('utf8'));
          const approvedName = body.approved_name;
          if (!approvedName || !NAME_RE.test(approvedName)) return json(res, 400, { error: 'некоректне ім\u02BCя затвердженого запису' });
          let approvedRecord;
          try { approvedRecord = JSON.parse(await readFile(join(ROOT, 'templates', 'approved', approvedName + '.json'), 'utf8')); }
          catch { return json(res, 404, { error: 'затверджений запис не знайдено' }); }
          if (validateTemplate('approved', approvedRecord).length) return json(res, 400, { error: 'затверджений запис пошкоджено' });
          const catalogs = await catalogsPromise;
          const assessmentCatalog = JSON.parse(await readFile(join(ROOT, 'data', 'assessment', 'assessment_catalog.json'), 'utf8'));
          const adapter = JSON.parse(await readFile(join(ROOT, 'data', 'assessment', 'assessment_odp_adapter.json'), 'utf8'));
          const { items, warnings } = buildAssessmentPlan({ approvedState: approvedRecord.state, catalogs, assessmentCatalog, adapter });
          await mkdir(assessDir, { recursive: true });
          const existing = (await readdir(assessDir, { withFileTypes: true })).filter(d => d.isDirectory()).map(d => d.name);
          const id = nextAssessmentId(existing);
          const assessment = makeAssessment({ approvedRecord, approvedName, plan: { items }, warnings, id });
          const dir = join(assessDir, id);
          await mkdir(join(dir, 'evidence'), { recursive: true });
          const snapshotText = JSON.stringify(approvedRecord, null, 2);
          assessment.cpb_snapshot.hash = sha256(snapshotText);
          const dataFiles = {
            'nd_tzi.json': await readFile(join(ROOT, 'data', 'nd_tzi.json'), 'utf8'),
            'assessment_odp_adapter.json': await readFile(join(ROOT, 'data', 'assessment', 'assessment_odp_adapter.json'), 'utf8'),
            'assessment_catalog.json': await readFile(join(ROOT, 'data', 'assessment', 'assessment_catalog.json'), 'utf8'),
            'assessment_reference.json': await readFile(join(ROOT, 'data', 'assessment', 'assessment_reference.json'), 'utf8'),
            'generic_parameter_defaults.json': await readFile(join(ROOT, 'data', 'generic_parameter_defaults.json'), 'utf8'),
          };
          await writeFile(join(dir, 'catalog-version.json'), JSON.stringify(buildCatalogVersion({ files: dataFiles }), null, 2));
          await writeFile(join(dir, 'assessment.json'), serializeAssessment(assessment));
          await writeFile(join(dir, 'cpb-snapshot.json'), snapshotText);
          await appendAudit(dir, makeAuditEntry({ actor: body.actor ?? '', action: 'ASSESSMENT_CREATED', entity_id: id }));
          return json(res, 201, { id });
        }
        const id = parts[2];
        if (id && !ASSESSMENT_ID_RE.test(id)) return json(res, 400, { error: 'некоректний assessment id' });
        const dir = id ? join(assessDir, id) : null;
        if (parts.length === 3 && req.method === 'GET') {
          try {
            return json(res, 200, await readAssessmentGuarded(dir));
          } catch { return json(res, 404, { error: 'оцінювання не знайдено' }); }
        }
        if (parts.length === 3 && req.method === 'PUT') {
          const existing = await readAssessmentGuarded(dir);
          if (existing.status === 'FINALIZED') return json(res, 409, { error: 'оцінювання фіналізовано — зміни заборонені' });
          let body;
          try { body = deserializeAssessment((await readBody(req)).toString('utf8')); }
          catch { return json(res, 400, { error: 'некоректний JSON' }); }
          const errors = validateAssessmentSchema(body);
          if (errors.length) return json(res, 400, { error: errors.join('; ') });
          // Примусове встановлення server-owned полів
          body.id = existing.id;
          body.status = existing.status;
          body.finalized_at = existing.finalized_at;
          body.finalized_by = existing.finalized_by;
          body.created_at = existing.created_at;
          body.cpb_snapshot = existing.cpb_snapshot;
          body.updated_at = new Date().toISOString();
          await writeFile(join(dir, 'assessment.json'), serializeAssessment(body));
          await appendAudit(dir, makeAuditEntry({ actor: body.actor_name ?? '', action: 'RESULT_UPDATED', entity_id: body.id,
            before: { updated_at: existing.updated_at }, after: { updated_at: body.updated_at } }));
          return json(res, 200, { ok: true });
        }
        if (parts[3] === 'evidence' && parts.length === 4 && req.method === 'POST') {
          const existing = await readAssessmentGuarded(dir);
          if (existing.status === 'FINALIZED') return json(res, 409, { error: 'оцінювання фіналізовано — зміни заборонені' });
          const filename = url.searchParams.get('filename');
          if (!filename || filename.includes('/') || filename.includes('..'))
            return json(res, 400, { error: 'некоректне ім\u02BCя файлу' });
          if (!EVIDENCE_EXT_ALLOWLIST.has(extname(filename).toLowerCase()))
            return json(res, 400, { error: 'заборонене розширення файлу' });
          const buf = await readBody(req, 20_000_000);
          const evDir = join(dir, 'evidence');
          await mkdir(evDir, { recursive: true });
          await writeFile(join(evDir, filename), buf);
          await appendAudit(dir, makeAuditEntry({ actor: '', action: 'EVIDENCE_ADDED', entity_id: existing.id,
            after: { filename } }));
          return json(res, 200, { ok: true, filename });
        }
        if (parts[3] === 'evidence' && parts.length === 5 && req.method === 'DELETE') {
          const existing = await readAssessmentGuarded(dir);
          if (existing.status === 'FINALIZED') return json(res, 409, { error: 'оцінювання фіналізовано — зміни заборонені' });
          const filename = parts[4];
          if (filename.includes('/') || filename.includes('..')) return json(res, 400, { error: 'некоректне ім\u02BCя файлу' });
          try {
            await (await import('node:fs/promises')).unlink(join(dir, 'evidence', filename));
            await appendAudit(dir, makeAuditEntry({ actor: '', action: 'EVIDENCE_REMOVED', entity_id: existing.id,
              before: { filename } }));
            return json(res, 200, { ok: true });
          }
          catch { return json(res, 404, { error: 'файл не знайдено' }); }
        }
        if (parts[3] === 'finalize' && parts.length === 4 && req.method === 'POST') {
          const body = JSON.parse((await readBody(req)).toString('utf8') || '{}');
          const a = await readAssessmentGuarded(dir);
          if (a.status === 'FINALIZED') return json(res, 409, { error: 'вже фіналізовано' });
          const errors = validateAssessment(a);
          if (errors.length) return json(res, 400, { error: errors.join('; '), errors });
          const finalized = finalizeAssessment(a, { finalizedBy: body.finalized_by ?? '' });
          await writeFile(join(dir, 'assessment.json'), serializeAssessment(finalized));
          await appendAudit(dir, makeAuditEntry({ actor: body.finalized_by ?? '', action: 'ASSESSMENT_FINALIZED', entity_id: a.id }));
          return json(res, 200, { ok: true });
        }
        if (parts[3] === 'audit' && parts.length === 4 && req.method === 'GET') {
          try { return json(res, 200, { entries: JSON.parse(await readFile(join(dir, 'audit-log.json'), 'utf8')) }); }
          catch { return json(res, 200, { entries: [] }); }
        }
        if (parts[3] === 'export' && parts[4] === 'docx' && req.method === 'POST') {
          let assessment;
          try { assessment = JSON.parse(await readFile(join(dir, 'assessment.json'), 'utf8')); }
          catch { return json(res, 404, { error: 'оцінювання не знайдено' }); }
          let cpbSnapshot;
          try { cpbSnapshot = JSON.parse(await readFile(join(dir, 'cpb-snapshot.json'), 'utf8')); }
          catch { cpbSnapshot = { state: {} }; }
          const projection = buildReportProjection({ assessment, cpbSnapshot });
          const buf = buildAssessmentDocx({ projection });
          await mkdir(join(ROOT, 'exports', 'assessments'), { recursive: true });
          await writeFile(join(ROOT, 'exports', 'assessments', `${assessment.id}.docx`), buf);
          await appendAudit(dir, makeAuditEntry({ actor: '', action: 'REPORT_GENERATED', entity_id: assessment.id }));
          res.writeHead(200, {
            'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(assessment.id + '.docx')}`,
          });
          return res.end(buf);
        }
        return json(res, 404, { error: 'not found' });
      }
      if (parts[1] === 'export' && (parts[2] === 'docx' || parts[2] === 'risks-docx') && req.method === 'POST') {
        const { state } = JSON.parse((await readBody(req)).toString('utf8'));
        const catalogs = await catalogsPromise;
        const accepted = new Set(state.risks.accepted_base);
        const annotatedRisks = [
          ...baseRisksFor(catalogs.threatsRisks, state.selected_assets, state.passport.as_class).filter(r => accepted.has(r.id)),
          ...state.risks.custom.map(r => annotateRisk(r, catalogs.threatsRisks.scale)),
        ];
        let buf, prefix;
        if (parts[2] === 'risks-docx') {
          buf = buildRisksDocx({ state, annotatedRisks, assets: catalogs.assets });
          prefix = 'Реєстр ризиків';
        } else {
          const profileDoc = buildProfile(state, catalogs);
          buf = buildDocx({ state, profileDoc, assets: catalogs.assets, policyMapping: catalogs.policyMapping });
          prefix = 'ЦПБ';
        }
        const safeName = (state.passport.ics_name || 'профіль').replace(/[^a-zа-яіїєґ0-9_\- ]/gi, '').trim() || 'профіль';
        const fileName = `${prefix} ${safeName}_${new Date().toISOString().slice(0, 10)}.docx`;
        await mkdir(join(ROOT, 'exports'), { recursive: true });
        await writeFile(join(ROOT, 'exports', fileName), buf);
        res.writeHead(200, {
          'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(fileName)}`,
        });
        return res.end(buf);
      }
      return json(res, 404, { error: 'not found' });
    }

    // Статика: public/ + data/ та core/ (read-only)
    let filePath = url.pathname === '/' ? '/index.html' : url.pathname;
    const base = (filePath.startsWith('/data/') || filePath.startsWith('/core/')) ? ROOT : join(ROOT, 'public');
    const resolved = normalize(join(base, filePath));
    if (!resolved.startsWith(base)) { res.writeHead(403); return res.end(); }
    try {
      const content = await readFile(resolved);
      res.writeHead(200, { 'Content-Type': MIME[extname(resolved)] ?? 'application/octet-stream' });
      return res.end(content);
    } catch { res.writeHead(404); return res.end('not found'); }
  } catch (err) {
    return json(res, 500, { error: String(err.message ?? err) });
  }
}).listen(PORT, '127.0.0.1', () => console.log(`listening on http://127.0.0.1:${PORT}`));
