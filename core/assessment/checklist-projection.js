// core/assessment/checklist-projection.js
// Pure projection from assessment.plan.checklist to checklist-docx data.
// No fs imports, no Date.now().

const NO_STATEMENT_PLACEHOLDER = '[немає згенерованої інструкції — заповніть вручну]';

export function buildChecklistProjection({ assessment }) {
  const title = {
    ics_name: assessment.metadata?.ics_name ?? '',
    assessment_id: assessment.id,
    date: assessment.metadata?.assessment_start_date ?? '',
  };
  const system_info = {
    ics_name: assessment.metadata?.ics_name ?? '',
    as_class: assessment.metadata?.as_class ?? 0,
    info_type: assessment.metadata?.info_type ?? '',
  };

  const included = (assessment.plan?.checklist ?? []).filter(c => c.included !== false);
  const groupByFamily = new Map();
  const families = [];
  for (const entry of included) {
    let group = groupByFamily.get(entry.family);
    if (!group) {
      group = { family: entry.family, family_title: entry.family_title, rows: [] };
      groupByFamily.set(entry.family, group);
      families.push(group);
    }
    const joined = (entry.statements ?? []).map((s, i) => `${i + 1}. ${s.text}`).join('\n');
    group.rows.push({
      control_id: entry.control_id,
      control_title: entry.control_title,
      verification_statement: joined || NO_STATEMENT_PLACEHOLDER,
    });
  }

  return { title, system_info, families, items_total: included.length };
}
