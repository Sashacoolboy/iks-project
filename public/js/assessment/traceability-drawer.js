import { el } from '../render/dom.js';

export function renderTraceabilityDrawer(container, planItem) {
  let isExpanded = false;

  const odpRows = (planItem.odp_values ?? []).map(odp => {
    const baseline = Array.isArray(odp.baseline_value)
      ? odp.baseline_value.join('; ')
      : (odp.baseline_value ?? '—');
    const target = Array.isArray(odp.target_value)
      ? odp.target_value.join('; ')
      : (odp.target_value ?? '[НЕ ВИЗНАЧЕНО]');

    // Find placeholder info if available
    const placeholder = (planItem.placeholders ?? []).find(p => p.local_odp_id === odp.local_odp_id);
    const nistRef = placeholder?.ref ?? '—';

    return el('tr', {},
      el('td', {}, odp.assessment_odp_id ?? ''),
      el('td', {}, odp.local_odp_id ?? ''),
      el('td', {}, baseline),
      el('td', {}, target),
      el('td', {}, odp.effective_source ?? '—'),
      el('td', {}, nistRef)
    );
  });

  const table = el('table', { class: 'odp-traceability-table' },
    el('thead', {},
      el('tr', {},
        el('th', {}, 'Assessment ODP ID'),
        el('th', {}, 'Local ODP ID'),
        el('th', {}, 'БПБ'),
        el('th', {}, 'ЦПБ'),
        el('th', {}, 'Джерело'),
        el('th', {}, 'NIST ref')
      )
    ),
    el('tbody', {}, ...odpRows)
  );

  const toggleBtn = el('button', {
    type: 'button',
    class: 'link',
    onclick: () => {
      isExpanded = !isExpanded;
      content.style.display = isExpanded ? 'block' : 'none';
      toggleBtn.textContent = isExpanded ? '▼ Сховати' : '▶ Показати';
    }
  }, '▶ Показати');

  const content = el('div', { style: 'display: none;' },
    el('p', { class: 'note' }, 'NIST traceability: інформаційно, не впливає на оцінювання'),
    (planItem.odp_values ?? []).length === 0
      ? el('p', { class: 'hint' }, 'Немає значень параметрів визначення організації (ODP)')
      : table
  );

  container.replaceChildren(
    el('div', { class: 'traceability-drawer' },
      el('h4', {}, 'Трасовність ', toggleBtn),
      content
    )
  );
}
