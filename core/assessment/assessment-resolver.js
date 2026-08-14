import { PARAM_RE, buildPolicyParamIndex, resolveParamValue } from '../policy-autofill.js';
import { indexNdParams, bpbValuesFor } from '../profile-engine.js';

const EMPTY_TEXT_TAG = (paramId) => `[НЕ ВИЗНАЧЕНО: ${paramId}]`;

export function resolveStatement(text, odpValues) {
  const unresolved = [];
  const out = String(text ?? '').replace(PARAM_RE, (match, paramId) => {
    if (odpValues.has(paramId)) return odpValues.get(paramId);
    unresolved.push(paramId);
    return EMPTY_TEXT_TAG(paramId);
  });
  return { text: out, unresolved };
}

function indexNdControls(ndTzi) {
  const map = new Map();
  for (const fam of ndTzi.document.security_families)
    for (const c of fam.controls) {
      map.set(c.canonical_id, c);
      for (const ch of c.children ?? []) map.set(ch.canonical_id, ch);
    }
  return map;
}

// Знаходить nd_tzi control за canonical_id ("AC-2", "AC-2(2)") незалежно від формату дужок або leading zeros
function findNdControl(ndControls, controlId) {
  // Normalize: strip leading zeros from control number (AC-02 → AC-2)
  const normalized = controlId.replace(/^([A-Z]+-)0+(\d+)/, '$1$2');
  return ndControls.get(normalized) ?? ndControls.get(controlId);
}

export function collectControlOdpValues(approvedState, catalogs, controlId) {
  const bpbKey = approvedState.info_type;
  const bpb = catalogs.bpb[bpbKey];
  const ndControls = indexNdControls(catalogs.ndTzi);
  const ndControl = findNdControl(ndControls, controlId);
  const values = new Map();
  if (!ndControl) return values;

  const policyIndex = buildPolicyParamIndex(catalogs.policyMapping, approvedState.global_constants ?? {});

  // Знайти bpb security_action(s), що відповідають цьому control id, щоб зібрати bpb-locator значення
  const bpbValues = new Map();
  if (bpb) {
    for (const sc of bpb.security_classes)
      for (const action of sc.actions)
        for (const sa of action.security_actions)
          if (sa.control.id === controlId)
            for (const [k, v] of bpbValuesFor(ndControl, sa)) bpbValues.set(k, v);
  }

  const paramIds = new Set();
  const collect = (items) => {
    for (const it of items ?? []) {
      for (const m of String(it.text ?? '').matchAll(PARAM_RE)) paramIds.add(m[1]);
      collect(it.children);
    }
  };
  collect(ndControl.catalog?.statement?.items);

  for (const paramId of paramIds) {
    const r = resolveParamValue(paramId, {
      overrides: approvedState.profile?.param_overrides ?? {},
      policyIndex,
      bpbValues,
      genericDefaults: catalogs.genericDefaults ?? {},
    });
    if (r.source !== 'empty') values.set(paramId, r.value);
  }
  return values;
}
