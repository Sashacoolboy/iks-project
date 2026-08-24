// public/js/assessment/control-document-view.js
import { firstSegmentLabel } from './assessment-table.js';

const PARAM_RE = /\{\{\s*insert:\s*param,\s*([\w.-]+)\s*\}\}/g;

const SOURCE_CLASS = {
  CPB_OVERRIDE: 'src-override',
  BPB_INHERITED: 'src-bpb',
  GENERIC_DEFAULT: 'src-generic',
};

function formatValue(value) {
  if (value === null || value === undefined) return null;
  return Array.isArray(value) ? value.join('; ') : String(value);
}

function splitStatement(text) {
  const segments = [];
  let last = 0;
  let m;
  PARAM_RE.lastIndex = 0;
  while ((m = PARAM_RE.exec(text)) !== null) {
    if (m.index > last) segments.push({ type: 'text', text: text.slice(last, m.index) });
    segments.push({ type: 'param', paramId: m[1] });
    last = m.index + m[0].length;
  }
  if (last < text.length) segments.push({ type: 'text', text: text.slice(last) });
  return segments;
}

/**
 * @param {Array<{planItem: object}>} items — controlGroup.items з groupPlanItems
 * @returns {{ left: Array, right: Array }}
 */
export function buildControlDocument(items) {
  const statementItems = (items ?? []).filter(({ planItem }) => planItem.kind === 'STATEMENT');
  const odpMap = new Map();
  for (const v of statementItems[0]?.planItem.odp_values ?? []) odpMap.set(v.local_odp_id, v);

  const left = [];
  const right = [];
  for (const { planItem } of statementItems) {
    const label = firstSegmentLabel(planItem.statement_path);
    const segments = splitStatement(planItem.statement_text ?? '');

    left.push({
      label,
      parts: segments.map(s => s.type === 'text'
        ? { type: 'text', text: s.text }
        : { type: 'param', text: `[${s.paramId}]` }),
    });

    right.push({
      label,
      parts: segments.map(s => {
        if (s.type === 'text') return { type: 'text', text: s.text };
        const odp = odpMap.get(s.paramId);
        const value = formatValue(odp?.target_value);
        if (value == null) return { type: 'param', text: 'не визначено', source: 'src-empty' };
        return { type: 'param', text: value, source: SOURCE_CLASS[odp?.effective_source] ?? 'src-empty' };
      }),
    });
  }

  return { left, right };
}
