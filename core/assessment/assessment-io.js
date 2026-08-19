// core/assessment/assessment-io.js

export function nextAssessmentId(existingIds) {
  const year = new Date().getFullYear();
  const nums = existingIds
    .map(id => id.match(new RegExp(`^ASSESS-${year}-(\\d+)$`)))
    .filter(Boolean)
    .map(m => Number(m[1]));
  const next = (nums.length ? Math.max(...nums) : 0) + 1;
  return `ASSESS-${year}-${String(next).padStart(3, '0')}`;
}

export const RESULT_VALUES = ['NOT_ASSESSED', 'SATISFIED', 'PARTIALLY_SATISFIED', 'NOT_SATISFIED', 'NOT_APPLICABLE'];

export function emptyResult(assessmentSourceId) {
  return {
    assessment_source_id: assessmentSourceId,
    methods_used: [],
    result: 'NOT_ASSESSED',
    evidence_ids: [],
    source_references: [],
    assessor_comment: '',
    conclusion: '',
    finding_ids: [],
  };
}

export function makeAssessment({ approvedRecord, approvedName, plan, warnings, id, startedBy = '' }) {
  const now = new Date().toISOString();
  return {
    kind: 'assessment',
    schema_version: '3.0.0',
    id: id ?? nextAssessmentId([]),
    created_at: now,
    updated_at: now,
    status: 'IN_PROGRESS',
    started_by: startedBy,
    finalized_at: null,
    finalized_by: null,
    metadata: {
      ics_name: approvedRecord.state.passport?.ics_name ?? '',
      as_class: approvedRecord.state.passport?.as_class ?? null,
      info_type: approvedRecord.state.info_type ?? null,
      assessment_body: '',
      assessor_name: '',
      assessor_position: '',
      assessment_start_date: now.slice(0, 10),
      assessment_end_date: '',
    },
    cpb_snapshot: {
      source_approved_name: approvedName,
      relative_path: 'cpb-snapshot.json',
      hash: '',
    },
    warnings: warnings ?? [],
    plan: { items: plan.items },
    results: plan.items.map(i => emptyResult(i.assessment_source_id)),
    evidence: [],
    findings: [],
  };
}

const V1_CONCLUSION_MAP = {
  POSITIVE: 'SATISFIED',
  PARTIALLY_POSITIVE: 'PARTIALLY_SATISFIED',
  NEGATIVE: 'NOT_SATISFIED',
  NOT_APPLICABLE: 'NOT_APPLICABLE',
  NOT_ASSESSED: 'NOT_ASSESSED',
};

export function migrateAssessment(obj) {
  if (obj?.schema_version?.startsWith('3.')) return obj;
  const now = new Date().toISOString();
  const evidence = [];
  const findings = [];
  const planItems = [];
  const results = [];
  for (const item of obj.items ?? []) {
    planItems.push({
      assessment_source_id: item.id,
      control_id: item.control_id,
      canonical_control_id: item.canonical_control_id ?? null,
      family: item.family ?? null,
      family_title: '',
      control_title: item.control_title ?? '',
      enhancement: !!item.enhancement,
      statement_path: item.statement_path ?? null,
      kind: 'STATEMENT',
      cpb_status: item.cpb_status ?? 'APPLIED',
      objective_template: item.source_statement ?? '',
      resolved_objective: item.resolved_statement ?? '',
      placeholders: [],
      odp_values: (item.odp_refs ?? []).map(ref => ({
        assessment_odp_id: null,
        local_odp_id: ref,
        baseline_value: null,
        target_value: item.odp_values?.[ref] ?? null,
        effective_source: 'LEGACY',
        status: item.odp_values?.[ref] != null ? 'RESOLVED' : 'UNRESOLVED',
      })),
      available_methods: item.recommended_methods ?? [],
    });
    const r = emptyResult(item.id);
    r.result = V1_CONCLUSION_MAP[item.conclusion] ?? 'NOT_ASSESSED';
    r.assessor_comment = item.assessor_comment ?? '';
    for (const ev of item.evidence ?? []) {
      const evidence_id = `EV-${String(evidence.length + 1).padStart(3, '0')}`;
      evidence.push({
        evidence_id,
        type: ev.source_type || 'OTHER',
        title: ev.title ?? '',
        source: ev.attachment
          ? { kind: 'LOCAL_FILE', path: `evidence/${ev.attachment}` }
          : { kind: 'NONE', path: null },
        reference: ev.reference ?? '',
        observation: ev.observation ?? '',
        collected_at: now,
        collected_by: 'migration:v1',
      });
      r.evidence_ids.push(evidence_id);
      if (ev.method && !r.methods_used.includes(ev.method) && ['EXAMINE', 'INTERVIEW', 'TEST'].includes(ev.method))
        r.methods_used.push(ev.method);
    }
    if (item.finding?.description) {
      const finding_id = `F-${String(findings.length + 1).padStart(3, '0')}`;
      findings.push({
        finding_id,
        assessment_source_id: item.id,
        severity: 'OBSERVATION',
        title: 'Перенесено з v1',
        description: item.finding.description,
        evidence_ids: [],
        recommendation: '',
        status: 'OPEN',
      });
      r.finding_ids.push(finding_id);
    }
    results.push(r);
  }
  return {
    ...obj,
    schema_version: '3.0.0',
    started_by: obj.started_by ?? '',
    finalized_at: obj.finalized_at ?? null,
    finalized_by: obj.finalized_by ?? null,
    plan: { items: planItems },
    results,
    evidence,
    findings,
    items: undefined,
  };
}

export function serializeAssessment(assessment) {
  return JSON.stringify(assessment, null, 2);
}

export function deserializeAssessment(jsonText) {
  return JSON.parse(jsonText);
}

export function validateAssessmentSchema(obj) {
  const errs = [];
  if (!obj || typeof obj !== 'object') return ['assessment має бути об\u02BCєктом'];
  if (obj.kind !== 'assessment') errs.push('Відсутній або невірний kind (очікується "assessment")');
  if (!obj.id) errs.push('Відсутній id');
  if (!obj.schema_version?.startsWith('3.')) errs.push('Очікується schema_version 3.x');
  if (!Array.isArray(obj.plan?.items)) errs.push('plan.items має бути масивом');
  if (!Array.isArray(obj.results)) errs.push('results має бути масивом');
  else
    for (const r of obj.results)
      if (!RESULT_VALUES.includes(r.result)) errs.push(`Невідомий result "${r.result}" (${r.assessment_source_id})`);
  if (!Array.isArray(obj.evidence)) errs.push('evidence має бути масивом');
  if (!Array.isArray(obj.findings)) errs.push('findings має бути масивом');
  return errs;
}
