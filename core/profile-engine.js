import { buildPolicyParamIndex, resolveParamValue, renderText, PARAM_RE } from './policy-autofill.js';
import { dynamicPolicyIndex } from './odp-dictionary.js';

export const INFO_TYPES = { open_confidential: 'bpb_open_confidential', service: 'bpb_service', state_secret: null };

export const STATUS = {
  APPLIED: 'Застосовується (автозаповнено)',
  EXEMPT: 'Виконано архітектурно',
  EXCLUDED: 'Не застосовується (вручну)',
};

function indexNdControls(ndTzi) {
  const map = new Map();
  for (const fam of ndTzi.document.security_families)
    for (const c of fam.controls) {
      map.set(c.canonical_id, c);
      for (const ch of c.children ?? []) map.set(ch.canonical_id, ch);
    }
  return map;
}

export function indexNdParams(ndTzi) {
  const map = new Map();
  for (const fam of ndTzi.document.security_families)
    for (const c of fam.controls)
      for (const node of [c, ...(c.children ?? [])])
        for (const p of node.catalog?.parameters ?? [])
          map.set(p.id, { label: p.label ?? '', source_text: p.source_text ?? '' });
  return map;
}

// Нормалізація сегмента мітки/локатора: 'a.' → 'a', '(a)' → 'a', 'b)' → 'b'
const normSeg = (s) => String(s ?? '').replace(/[^\p{L}\p{N}.]/gu, '').replace(/\.+$/, '');

const paramsIn = (text) => [...String(text ?? '').matchAll(PARAM_RE)].map(m => m[1]);

// Плоский statement; рядок без власних параметрів успадковує параметри найближчого предка
function flattenStatement(items, prefix = [], inherited = []) {
  const out = [];
  for (const it of items ?? []) {
    const seg = normSeg(it.label);
    const path = [...prefix, seg].filter(Boolean);
    const own = paramsIn(it.text);
    const effective = own.length ? own : inherited;
    out.push({ label: path.join('.'), text: it.text ?? '', params: effective });
    out.push(...flattenStatement(it.children, path, effective));
  }
  return out;
}

export function bpbValuesFor(ndControl, securityAction) {
  const values = new Map();
  const flat = flattenStatement(ndControl?.catalog?.statement?.items);
  const allParams = [...new Set(flat.flatMap(l => paramsIn(l.text)))];
  for (const item of securityAction.security_params?.items ?? []) {
    const loc = normSeg(item.locator);
    let assigned = false;
    if (loc) {
      const target = flat.find(l => l.label === loc || l.label.endsWith('.' + loc));
      if (target)
        for (const pid of target.params) { values.set(pid, item.value); assigned = true; }
      // Числовий локатор без збігу мітки — позиційний номер параметра контролю
      if (!assigned && /^\d+$/.test(loc) && allParams[Number(loc) - 1]) {
        values.set(allParams[Number(loc) - 1], item.value);
        assigned = true;
      }
    }
    // Локатор відсутній/не знайдений, але параметр у statement один — значення точно його
    if (!assigned && allParams.length === 1) values.set(allParams[0], item.value);
  }
  return values;
}

export function statementLinesFor(ndControl, resolveFn) {
  const lines = [];
  const walk = (items, depth) => {
    for (const it of items ?? []) {
      const r = renderText(it.text ?? '', resolveFn);
      lines.push({ label: it.label ?? '', depth, text: r.text, parts: r.parts });
      walk(it.children, depth + 1);
    }
  };
  walk(ndControl?.catalog?.statement?.items, 0);
  return lines;
}

export function buildProfile(state, catalogs) {
  const bpbKey = state.info_type;
  const bpb = catalogs.bpb[bpbKey];
  if (!bpb) throw new Error(`Каталог для типу інформації "${state.info_type}" відсутній`);
  const nd = indexNdControls(catalogs.ndTzi);
  const paramInfo = indexNdParams(catalogs.ndTzi);
  const policyIndex = buildPolicyParamIndex(catalogs.policyMapping, state.global_constants);
  // Відповіді на динамічні питання (зі словника ODP) — теж політики, але не перекривають основні
  if (catalogs.odpDictionary)
    for (const [pid, v] of dynamicPolicyIndex(catalogs.odpDictionary, state.global_constants))
      if (!policyIndex.has(pid)) policyIndex.set(pid, v);
  const noteOverrides = state.profile.exemption_note_overrides ?? {};
  const exemptByControl = new Map();
  for (const e of catalogs.exemptions.exemptions)
    if (e.applies_to_classes.includes(state.passport.as_class)) exemptByControl.set(e.control_ref, e);

  const makeResolver = (bpbValues, emptyParams) => (paramId) => {
    const r = resolveParamValue(paramId, {
      overrides: state.profile.param_overrides,
      policyIndex,
      bpbValues,
      genericDefaults: catalogs.genericDefaults,
    });
    if (r.source === 'empty' && !emptyParams.includes(paramId)) emptyParams.push(paramId);
    return { ...r, info: paramInfo.get(paramId) };
  };

  const items = [];
  for (const sc of bpb.security_classes) {
    for (const action of sc.actions) {
      const key = `${sc.security_class.class_id}:${action.number}`;
      const controls = [];
      let exemption = null;
      // Дедуплікація: кожен контроль/посилення рендериться один раз власним текстом
      const byControlId = new Map();
      for (const sa of action.security_actions) {
        if (exemptByControl.has(sa.control.base_id)) exemption = exemptByControl.get(sa.control.base_id);
        if (!byControlId.has(sa.control.id)) byControlId.set(sa.control.id, []);
        byControlId.get(sa.control.id).push(sa);
      }
      for (const [controlId, sas] of byControlId) {
        const ndControl = nd.get(controlId) ?? nd.get(sas[0].control.base_id);
        if (!ndControl) continue;
        const bpbValues = new Map();
        for (const sa of sas)
          for (const [k, v] of bpbValuesFor(ndControl, sa)) bpbValues.set(k, v);
        const emptyParams = [];
        const resolve = makeResolver(bpbValues, emptyParams);
        controls.push({
          id: controlId,
          isEnhancement: Boolean(sas[0].control.is_enhancement),
          title: ndControl.title,
          statementLines: statementLinesFor(ndControl, resolve),
          emptyParams,
        });
      }
      let status = STATUS.APPLIED;
      let exemptionNote;
      if ((state.profile.excluded ?? []).includes(key)) status = STATUS.EXCLUDED;
      else if (exemption && !(state.profile.exemption_overrides ?? []).includes(key)) {
        status = STATUS.EXEMPT;
        exemptionNote = noteOverrides[key] ?? exemption.reason_note;
      }
      const mandatedIds = new Set(action.security_actions.map(sa => sa.control.id));
      const enhancements = (state.profile.enhancements ?? [])
        .filter(eid => !mandatedIds.has(eid)
          && action.security_actions.some(sa => eid.startsWith(sa.control.base_id + '(')))
        .map(eid => {
          const ench = nd.get(eid);
          const emptyParams = [];
          const resolve = makeResolver(new Map(), emptyParams);
          return {
            id: eid,
            title: ench?.title ?? eid,
            lines: ench ? statementLinesFor(ench, resolve) : [],
            emptyParams,
          };
        });
      items.push({
        key, classId: sc.security_class.class_id, className: sc.security_class.name_from_profile,
        actionNumber: action.number, actionName: action.name,
        bpbRequirements: action.content_raw ?? '',
        controls, status, exemptionNote, enhancements,
      });
    }
  }
  const summary = {
    total: items.length,
    exempted: items.filter(i => i.status === STATUS.EXEMPT).length,
    excluded: items.filter(i => i.status === STATUS.EXCLUDED).length,
    empty: items.filter(i => i.status === STATUS.APPLIED && i.controls.some(c => c.emptyParams.length)).length,
    autofilled: items.filter(i => i.status === STATUS.APPLIED && i.controls.every(c => c.emptyParams.length === 0)).length,
  };
  return { items, summary };
}
