import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

export function parseSelection(text) {
  const m = String(text ?? '').trim().match(/^\[ВИБІР:\s*([\s\S]*?)\]\.?$/);
  if (!m) return text ? [String(text).trim()] : [];
  return m[1].split(';').map(s => s.trim()).filter(Boolean);
}

export function buildAssessmentReference(records) {
  const families = {};
  const byId = new Map();
  const order = [];
  for (const r of records) {
    if (r.model === 'ndtzi36006.family') families[r.pk] = { title: r.fields.title };
    if (r.model === 'ndtzi36006.control') {
      byId.set(r.pk, { control_id: r.pk, family: r.fields.family, title: r.fields.title,
        enhancement: !!r.fields.enhancement, parent: r.fields.parent ?? null,
        determinations: [], examine_objects: [], interview_objects: [], test_objects: [] });
      order.push(r.pk);
    }
  }
  for (const r of records) {
    const ctrl = byId.get(r.fields?.control);
    if (!ctrl) continue;
    if (r.model === 'ndtzi36006.determinationcontrol') ctrl.determinations.push({ code: r.fields.code, text: r.fields.text });
    if (r.model === 'ndtzi36006.examinecontrol') ctrl.examine_objects.push(...parseSelection(r.fields.text));
    if (r.model === 'ndtzi36006.interviewcontrol') ctrl.interview_objects.push(...parseSelection(r.fields.text));
    if (r.model === 'ndtzi36006.testcontrol') ctrl.test_objects.push(...parseSelection(r.fields.text));
  }
  return {
    schema: { id: 'ua.ics.assessment-reference', version: '1.0.0', language: 'uk', source: 'ndtzi36006(1).json' },
    families,
    controls: order.map(id => byId.get(id)),
  };
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  const ROOT = fileURLToPath(new URL('..', import.meta.url));
  const src = JSON.parse(await readFile(join(ROOT, 'data', 'ASSESSMENT_SOURCES', 'ndtzi36006(1).json'), 'utf8'));
  const out = buildAssessmentReference(src);
  await mkdir(join(ROOT, 'data', 'assessment'), { recursive: true });
  await writeFile(join(ROOT, 'data', 'assessment', 'assessment_reference.json'), JSON.stringify(out, null, 2));
  console.log(`controls: ${out.controls.length}, determinations: ${out.controls.reduce((n, c) => n + c.determinations.length, 0)}`);
}
