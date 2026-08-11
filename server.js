import { createServer } from 'node:http';
import { readFile, writeFile, readdir, mkdir } from 'node:fs/promises';
import { join, extname, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDocx } from './core/docx/docx-writer.js';
import { buildProfile } from './core/profile-engine.js';
import { baseRisksFor, annotateRisk } from './core/risk-engine.js';
import { validateTemplate } from './core/template-io.js';

const ROOT = fileURLToPath(new URL('.', import.meta.url));
const PORT = Number(process.env.PORT ?? 3000);
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json' };
const NAME_RE = /^[a-zа-яіїєґ0-9_\-]+$/i;
const KINDS = new Set(['ics', 'cpb']);

const readBody = (req, limit = 5_000_000) => new Promise((resolve, reject) => {
  let size = 0; const chunks = [];
  req.on('data', (c) => { size += c.length; if (size > limit) reject(new Error('too large')); else chunks.push(c); });
  req.on('end', () => resolve(Buffer.concat(chunks)));
  req.on('error', reject);
});

const json = (res, code, obj) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(obj)); };

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
      if (parts[1] === 'templates') {
        const kind = parts[2];
        if (!KINDS.has(kind)) return json(res, 400, { error: 'невідомий тип шаблону' });
        const dir = join(ROOT, 'templates', kind);
        if (parts.length === 3 && req.method === 'GET') {
          const names = (await readdir(dir)).filter(f => f.endsWith('.json')).map(f => f.slice(0, -5));
          return json(res, 200, { names });
        }
        const name = parts[3];
        if (!name || !NAME_RE.test(name)) return json(res, 400, { error: 'некоректне ім\u02BCя шаблону' });
        const file = join(dir, name + '.json');
        if (req.method === 'GET') return json(res, 200, JSON.parse(await readFile(file, 'utf8')));
        if (req.method === 'POST') {
          const body = JSON.parse((await readBody(req)).toString('utf8'));
          const errors = validateTemplate(kind, body);
          if (errors.length) return json(res, 400, { error: errors.join('; ') });
          await writeFile(file, JSON.stringify(body, null, 2));
          return json(res, 200, { ok: true });
        }
      }
      if (parts[1] === 'export' && parts[2] === 'docx' && req.method === 'POST') {
        const { state } = JSON.parse((await readBody(req)).toString('utf8'));
        const catalogs = await catalogsPromise;
        const profileDoc = buildProfile(state, catalogs);
        const accepted = new Set(state.risks.accepted_base);
        const annotatedRisks = [
          ...baseRisksFor(catalogs.threatsRisks, state.selected_assets, state.passport.as_class).filter(r => accepted.has(r.id)),
          ...state.risks.custom.map(r => annotateRisk(r, catalogs.threatsRisks.scale)),
        ];
        const buf = buildDocx({ state, profileDoc, annotatedRisks, assets: catalogs.assets, policyMapping: catalogs.policyMapping });
        const safeName = (state.passport.ics_name || 'профіль').replace(/[^a-zа-яіїєґ0-9_\- ]/gi, '').trim() || 'профіль';
        const fileName = `${safeName}_${new Date().toISOString().slice(0, 10)}.docx`;
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
