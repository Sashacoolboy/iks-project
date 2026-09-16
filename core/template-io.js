export function defaultState() {
  return {
    passport: { ics_name: '', cert_body: '', as_class: 1,
      designation: '', system_id: '', owner_info: '', developer_info: '',
      development_basis: '', baseline_profile_info: '', normative_acts: '' },
    global_constants: {},
    selected_assets: [],
    risks: { accepted_base: [], custom: [], base_overrides: {} },
    info_type: null,
    profile: { param_overrides: {}, enhancements: [], excluded: [], exemption_overrides: [], exemption_note_overrides: {} },
  };
}

const clone = (o) => JSON.parse(JSON.stringify(o));

export function makeIcsTemplate(state) {
  return { kind: 'ics', saved_at: new Date().toISOString(),
    passport: clone(state.passport), global_constants: clone(state.global_constants),
    selected_assets: clone(state.selected_assets) };
}

export function applyIcsTemplate(state, tpl) {
  return { ...clone(state), passport: { ...defaultState().passport, ...clone(tpl.passport) },
    global_constants: clone(tpl.global_constants), selected_assets: clone(tpl.selected_assets) };
}

export function makeCpbTemplate(state) {
  return { kind: 'cpb', saved_at: new Date().toISOString(),
    info_type: state.info_type, profile: clone(state.profile) };
}

export function applyCpbTemplate(state, tpl) {
  return { ...clone(state), info_type: tpl.info_type, profile: clone(tpl.profile) };
}

/** Затверджений профіль — повний знімок стану + підсумки на момент затвердження */
export function makeApprovedRecord(state, summary = {}) {
  const st = clone(state);
  delete st.approved_view; // службовий прапорець режиму перегляду не зберігаємо
  return { kind: 'approved', approved_at: new Date().toISOString(),
    summary: clone(summary), state: st };
}

export function applyApprovedRecord(record) {
  const merged = { ...defaultState(), ...clone(record.state) };
  return { ...merged, passport: { ...defaultState().passport, ...merged.passport },
    risks: { ...defaultState().risks, ...merged.risks } };
}

const INFO_TYPE_VALUES = ['open_confidential', 'service', 'state_secret'];

export function validateTemplate(kind, obj) {
  const errors = [];
  if (!obj || typeof obj !== 'object') return ['Шаблон не є об\u02BCєктом'];
  if (obj.kind !== kind) errors.push(`Невірний тип шаблону: очікується "${kind}", отримано "${obj.kind}"`);
  if (kind === 'ics') {
    if (!obj.passport || typeof obj.passport.as_class !== 'number') errors.push('Відсутній паспорт або клас АС');
    if (!Array.isArray(obj.selected_assets)) errors.push('selected_assets має бути масивом');
    if (typeof obj.global_constants !== 'object') errors.push('global_constants має бути об\u02BCєктом');
  }
  if (kind === 'cpb') {
    if (!INFO_TYPE_VALUES.includes(obj.info_type)) errors.push('Невірний info_type');
    if (!obj.profile || typeof obj.profile !== 'object') errors.push('Відсутній блок profile');
  }
  if (kind === 'approved') {
    const st = obj.state;
    if (!st || typeof st !== 'object') errors.push('Відсутній знімок стану');
    else {
      if (typeof st.passport?.as_class !== 'number') errors.push('Відсутній паспорт або клас АС');
      if (!INFO_TYPE_VALUES.includes(st.info_type)) errors.push('Невірний info_type');
      if (!st.profile || typeof st.profile !== 'object') errors.push('Відсутній блок profile');
    }
  }
  return errors;
}
