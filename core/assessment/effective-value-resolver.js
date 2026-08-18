// Пріоритет ТЗ §7: CPB_OVERRIDE → BPB_INHERITED → GENERIC_DEFAULT → UNRESOLVED
export function baselineValue({ adapterEntry, infoType }) {
  const bindings = adapterEntry.bpb_bindings?.[infoType] ?? [];
  if (!bindings.length) return null;
  const values = bindings.map(b => b.value ?? '');
  return values.length === 1 ? values[0] : values;
}

export function resolveEffectiveValue({ adapterEntry, cpb, genericDefaults }) {
  const localOdpId = adapterEntry.binding?.cpb_ref ?? adapterEntry.local_odp_id;
  const override = cpb?.profile?.param_overrides?.[localOdpId];
  if (override != null && override !== '')
    return { status: 'RESOLVED', source: 'CPB_OVERRIDE', value: override, evidence: [] };

  const infoType = cpb?.info_type;
  const bindings = adapterEntry.bpb_bindings?.[infoType] ?? [];
  if (bindings.length) {
    const values = bindings.map(b => b.value ?? '');
    return { status: 'RESOLVED', source: 'BPB_INHERITED',
      value: values.length === 1 ? values[0] : values, evidence: bindings };
  }

  const def = genericDefaults?.parameters?.[localOdpId];
  if (def && def.defaultValue != null && def.defaultValue !== '')
    return { status: 'RESOLVED', source: 'GENERIC_DEFAULT', value: def.defaultValue,
      evidence: [{ type: 'generic_default', locator: localOdpId, value: def.defaultValue }] };

  const out = { status: 'UNRESOLVED', source: null, value: null, evidence: [] };
  if (def?.requiresInput) out.requires_input = true;
  return out;
}
