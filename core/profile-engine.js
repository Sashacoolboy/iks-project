import { buildPolicyParamIndex, resolveParamValue, renderText, PARAM_RE } from './policy-autofill.js';

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

function flattenStatement(items, prefix = []) {
  const out = [];
  for (const it of items ?? []) {
    const label = [...prefix, (it.label ?? '').replace(/\.$/, '')].filter(Boolean).join('.');
    out.push({ label, text: it.text ?? '' });
    out.push(...flattenStatement(it.children, [...prefix, (it.label ?? '').replace(/\.$/, '')].filter(Boolean)));
  }
  return out;
}

export function bpbValuesFor(ndControl, securityAction) {
  const values = new Map();
  const flat = flattenStatement(ndControl?.catalog?.statement?.items);
  for (const item of securityAction.security_params?.items ?? []) {
    const target = flat.find(l => l.label === item.locator);
    if (!target) continue;
    for (const m of target.text.matchAll(PARAM_RE)) values.set(m[1], item.value);
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
  const policyIndex = buildPolicyParamIndex(catalogs.policyMapping, state.global_constants);
  const exemptByControl = new Map();
  for (const e of catalogs.exemptions.exemptions)
    if (e.applies_to_classes.includes(state.passport.as_class)) exemptByControl.set(e.control_ref, e);

  const items = [];
  for (const sc of bpb.security_classes) {
    for (const action of sc.actions) {
      const key = `${sc.security_class.class_id}:${action.number}`;
      const controls = [];
      let exemption = null;
      for (const sa of action.security_actions) {
        const ndControl = nd.get(sa.control.base_id) ?? nd.get(sa.control.id);
        if (exemptByControl.has(sa.control.base_id)) exemption = exemptByControl.get(sa.control.base_id);
        if (!ndControl) continue;
        const bpbValues = bpbValuesFor(ndControl, sa);
        const emptyParams = [];
        const resolve = (paramId) => {
          const r = resolveParamValue(paramId, {
            overrides: state.profile.param_overrides,
            policyIndex,
            bpbValues,
            genericDefaults: catalogs.genericDefaults,
          });
          if (r.source === 'empty' && !emptyParams.includes(paramId)) emptyParams.push(paramId);
          return r;
        };
        controls.push({ id: sa.control.id, statementLines: statementLinesFor(ndControl, resolve), emptyParams });
      }
      let status = STATUS.APPLIED;
      let exemptionNote;
      if (state.profile.excluded.includes(key)) status = STATUS.EXCLUDED;
      else if (exemption && !state.profile.exemption_overrides.includes(key)) {
        status = STATUS.EXEMPT;
        exemptionNote = exemption.reason_note;
      }
      const enhancements = (state.profile.enhancements ?? [])
        .filter(eid => action.security_actions.some(sa => eid.startsWith(sa.control.base_id + '(')))
        .map(eid => ({ id: eid, title: nd.get(eid)?.title ?? eid }));
      items.push({
        key, classId: sc.security_class.class_id, className: sc.security_class.name_from_profile,
        actionNumber: action.number, actionName: action.name,
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
