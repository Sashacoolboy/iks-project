/**
 * Pure projection from persisted v3 assessment to report data.
 * No fs imports, no Date.now(), no live catalog imports.
 * Exports dictionaries for UI reuse.
 */

export const RESULT_LABELS = {
  NOT_ASSESSED: 'Не оцінено',
  SATISFIED: 'Відповідає',
  PARTIALLY_SATISFIED: 'Частково відповідає',
  NOT_SATISFIED: 'Не відповідає',
  NOT_APPLICABLE: 'Не застосовується'
};

export const METHOD_LABELS = {
  EXAMINE: 'Дослідження',
  INTERVIEW: 'Співбесіда',
  TEST: 'Перевірка'
};

export const SEVERITY_LABELS = {
  OBSERVATION: 'Спостереження',
  MINOR: 'Незначний',
  MAJOR: 'Значний',
  CRITICAL: 'Критичний'
};

/**
 * Groups plan items by family and control, joining with results.
 * Same logic as public/js/assessment/assessment-table.js groupPlanItems.
 * @param {Object} assessment - The assessment object
 * @returns {Array<{family, family_title, controls: Array<{control_id, control_title, items}>}>}
 */
function groupPlanItems(assessment) {
  const resultsById = new Map((assessment.results ?? []).map(r => [r.assessment_source_id, r]));
  const groups = [];
  const groupByFamily = new Map();

  for (const planItem of assessment.plan?.items ?? []) {
    let familyGroup = groupByFamily.get(planItem.family);
    if (!familyGroup) {
      familyGroup = {
        family: planItem.family,
        family_title: planItem.family_title,
        controls: [],
        _byControl: new Map()
      };
      groupByFamily.set(planItem.family, familyGroup);
      groups.push(familyGroup);
    }

    let controlGroup = familyGroup._byControl.get(planItem.control_id);
    if (!controlGroup) {
      controlGroup = {
        control_id: planItem.control_id,
        control_title: planItem.control_title,
        items: []
      };
      familyGroup._byControl.set(planItem.control_id, controlGroup);
      familyGroup.controls.push(controlGroup);
    }

    controlGroup.items.push({
      planItem,
      result: resultsById.get(planItem.assessment_source_id)
    });
  }

  // Clean up temporary _byControl maps
  for (const group of groups) {
    delete group._byControl;
  }

  return groups;
}

/**
 * Projects persisted assessment to report data structure.
 * @param {Object} opts - { assessment, cpbSnapshot }
 * @returns {Object} Projection with title, system_info, basis_scope, families, evidence, findings, overall, appendices
 */
export function buildReportProjection({ assessment, cpbSnapshot }) {
  const groups = groupPlanItems(assessment);
  const resultsMap = new Map((assessment.results ?? []).map(r => [r.assessment_source_id, r]));
  const evidenceMap = new Map((assessment.evidence ?? []).map(e => [e.evidence_id, e]));
  const findingsMap = new Map((assessment.findings ?? []).map(f => [f.finding_id, f]));

  // Title section
  const title = {
    ics_name: assessment.metadata?.ics_name ?? '',
    assessment_id: assessment.id,
    date: assessment.metadata?.assessment_start_date ?? '',
    assessment_body: assessment.metadata?.assessment_body ?? '',
    assessor_name: assessment.metadata?.assessor_name ?? ''
  };

  // System info
  const system_info = {
    ics_name: assessment.metadata?.ics_name ?? '',
    as_class: assessment.metadata?.as_class ?? 0,
    info_type: assessment.metadata?.info_type ?? ''
  };

  // Basis scope - count items and unique controls
  let items_total = 0;
  const controls_set = new Set();
  for (const group of groups) {
    for (const control of group.controls) {
      controls_set.add(control.control_id);
      items_total += control.items.length;
    }
  }

  const basis_scope = {
    cpb_source: assessment.cpb_snapshot?.source_approved_name ?? '',
    cpb_hash: assessment.cpb_snapshot?.hash ?? '',
    items_total,
    controls_total: controls_set.size
  };

  // CPB version
  const cpb_version = {
    hash: assessment.cpb_snapshot?.hash ?? '',
    approved_name: assessment.cpb_snapshot?.source_approved_name ?? ''
  };

  // Count method usage
  const methodCounts = {
    EXAMINE: 0,
    INTERVIEW: 0,
    TEST: 0
  };
  for (const result of assessment.results ?? []) {
    for (const method of result.methods_used ?? []) {
      if (methodCounts.hasOwnProperty(method)) {
        methodCounts[method]++;
      }
    }
  }

  const methods = Object.entries(methodCounts).map(([key, used_count]) => ({
    key,
    label: METHOD_LABELS[key],
    used_count
  }));

  // Build families with items, including result labels and methods labels
  const families = groups.map(group => ({
    family: group.family,
    family_title: group.family_title,
    controls: group.controls.map(control => ({
      control_id: control.control_id,
      control_title: control.control_title,
      items: control.items.map(item => {
        const result = item.result;
        return {
          assessment_source_id: item.planItem.assessment_source_id,
          resolved_objective: item.planItem.resolved_objective,
          result: result?.result ?? 'NOT_ASSESSED',
          result_label: RESULT_LABELS[result?.result ?? 'NOT_ASSESSED'],
          methods_used_labels: (result?.methods_used ?? []).map(m => METHOD_LABELS[m]),
          evidence_ids: result?.evidence_ids ?? [],
          conclusion: result?.conclusion ?? ''
        };
      })
    }))
  }));

  // Evidence register (all evidence from assessment)
  const evidence_register = (assessment.evidence ?? []).map(e => ({
    evidence_id: e.evidence_id,
    type: e.type,
    title: e.title,
    reference: e.reference,
    collected_by: e.collected_by,
    collected_at: e.collected_at
  }));

  // Findings with severity labels
  const findings = (assessment.findings ?? []).map(f => ({
    finding_id: f.finding_id,
    severity_label: SEVERITY_LABELS[f.severity] ?? f.severity,
    title: f.title,
    description: f.description,
    recommendation: f.recommendation,
    assessment_source_id: f.assessment_source_id
  }));

  // Count results by type for overall section
  const counts = {
    satisfied: 0,
    partially_satisfied: 0,
    not_satisfied: 0,
    not_applicable: 0,
    not_assessed: 0
  };

  for (const result of assessment.results ?? []) {
    const resultType = result.result;
    if (resultType === 'SATISFIED') counts.satisfied++;
    else if (resultType === 'PARTIALLY_SATISFIED') counts.partially_satisfied++;
    else if (resultType === 'NOT_SATISFIED') counts.not_satisfied++;
    else if (resultType === 'NOT_APPLICABLE') counts.not_applicable++;
    else if (resultType === 'NOT_ASSESSED') counts.not_assessed++;
  }

  // Build conclusion text deterministically
  let conclusion_text = '';
  if (counts.not_satisfied > 0) {
    conclusion_text = `ІКС не відповідає вимогам ЦПБ: ${counts.not_satisfied} заходів не відповідають`;
  } else if (counts.partially_satisfied > 0) {
    conclusion_text = 'частково відповідає';
  } else if (counts.not_assessed > 0) {
    conclusion_text = 'оцінювання не завершено';
  } else {
    conclusion_text = 'відповідає';
  }

  const overall = {
    counts,
    conclusion_text
  };

  // Appendices - unresolved ODP
  const unresolved_odp = (assessment.warnings ?? [])
    .filter(w => w.code === 'ODP_UNRESOLVED')
    .map(w => ({
      local_odp_id: w.local_odp_id,
      control_id: w.control_id
    }));

  const appendices = {
    unresolved_odp
  };

  return {
    title,
    system_info,
    basis_scope,
    cpb_version,
    methods,
    families,
    evidence_register,
    findings,
    overall,
    appendices
  };
}
