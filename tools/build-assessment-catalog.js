import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { normalizeControlId } from '../core/assessment/control-id.js';

const ODP_REF_RE = /<([A-Z]{2}-\d{2}(?:\(\d{2}\))?_ODP(?:\[\d{2}\])?)\s/g;

export function extractOdpRefs(text) {
  return [...String(text ?? '').matchAll(ODP_REF_RE)].map(m => m[1]);
}

export function splitStatementPath(controlId, code) {
  const rest = String(code ?? '').startsWith(controlId) ? String(code).slice(controlId.length) : String(code ?? '');
  if (rest.startsWith('_ODP')) return { kind: 'ODP_DEFINITION', statement_path: null };
  return { kind: 'STATEMENT', statement_path: rest || null };
}

export function buildAssessmentCatalog(reference) {
  const controls = reference.controls.map(ctrl => {
    const methodsFor = () => {
      const m = {};
      if (ctrl.examine_objects.length) m.EXAMINE = { objects: ctrl.examine_objects };
      if (ctrl.interview_objects.length) m.INTERVIEW = { objects: ctrl.interview_objects };
      if (ctrl.test_objects.length) m.TEST = { objects: ctrl.test_objects };
      return m;
    };
    return {
      control_id: ctrl.control_id,
      canonical_control_id: normalizeControlId(ctrl.control_id),
      family: ctrl.family,
      family_title: reference.families[ctrl.family]?.title ?? '',
      title: ctrl.title,
      enhancement: ctrl.enhancement,
      items: ctrl.determinations.map(d => ({
        assessment_source_id: d.code,
        control_id: ctrl.control_id,
        ...splitStatementPath(ctrl.control_id, d.code),
        objective_template: d.text,
        assessment_odp_refs: extractOdpRefs(d.text),
        methods: methodsFor(),
      })),
    };
  });
  return {
    schema: { id: 'ua.ics.assessment-catalog', version: '3.0.0', language: 'uk' },
    methods_labels: { EXAMINE: 'Дослідження', INTERVIEW: 'Співбесіда', TEST: 'Перевірка' },
    controls,
  };
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  const ROOT = fileURLToPath(new URL('..', import.meta.url));
  const ref = JSON.parse(await readFile(join(ROOT, 'data', 'assessment', 'assessment_reference.json'), 'utf8'));
  const out = buildAssessmentCatalog(ref);
  await mkdir(join(ROOT, 'data', 'assessment'), { recursive: true });
  await writeFile(join(ROOT, 'data', 'assessment', 'assessment_catalog.json'), JSON.stringify(out, null, 2));
  console.log(`controls: ${out.controls.length}, items: ${out.controls.reduce((n, c) => n + c.items.length, 0)}`);
}
