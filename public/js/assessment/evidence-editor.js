import { el } from '../render/dom.js';
import { getAssessment, setAssessment } from './assessment-state.js';
import { EVIDENCE_TYPES, addEvidence, removeEvidence, updateEvidence } from '../../../core/assessment/evidence.js';

const EVIDENCE_TYPE_LABELS = {
  DOCUMENT: 'Документ',
  POLICY: 'Політика',
  PROCEDURE: 'Процедура',
  ORDER: 'Наказ',
  REGISTER: 'Реєстр',
  SYSTEM_CONFIGURATION: 'Конфігурація системи',
  SCREENSHOT: 'Знімок екрана',
  LOG: 'Журнал',
  INTERVIEW_NOTE: 'Нотатка співбесіди',
  TEST_RESULT: 'Результат перевірки',
  PHYSICAL_INSPECTION: 'Фізичний огляд',
  OTHER: 'Інше'
};

export function evidenceFieldsFromForm(values, uploadedFilename) {
  return {
    type: values.type,
    title: values.title ?? '',
    reference: values.reference ?? '',
    observation: values.observation ?? '',
    collected_by: values.collected_by ?? '',
    source: uploadedFilename
      ? { kind: 'LOCAL_FILE', path: `evidence/${uploadedFilename}` }
      : { kind: 'NONE', path: null }
  };
}

function sanitizeFilename(name) {
  return name.replace(/[\/\\:*?"<>|]/g, '_');
}

export function renderEvidenceEditor(container, { sourceId }) {
  const assessment = getAssessment();
  const result = assessment.results.find(r => r.assessment_source_id === sourceId);
  if (!result) {
    container.replaceChildren(el('p', {}, 'Результат не знайдено'));
    return;
  }

  const isFinalized = assessment.status === 'FINALIZED';
  const evidenceList = result.evidence_ids.map(evidId => 
    assessment.evidence.find(e => e.evidence_id === evidId)
  ).filter(Boolean);

  const patchEvidence = (evidenceId, patch) => {
    if (isFinalized) return;
    const { assessment: updated } = updateEvidence(getAssessment(), evidenceId, patch);
    setAssessment(updated);
  };

  const evidenceItemBlock = (ev) => {
    const typeSel = el('select', {
      disabled: isFinalized ? '' : null,
      onchange: () => patchEvidence(ev.evidence_id, { type: typeSel.value })
    }, ...EVIDENCE_TYPES.map(t => el('option', { value: t, selected: t === ev.type ? '' : null }, EVIDENCE_TYPE_LABELS[t] || t)));

    const titleInput = el('input', {
      type: 'text', value: ev.title, placeholder: 'Назва доказу', disabled: isFinalized ? '' : null,
      onblur: () => patchEvidence(ev.evidence_id, { title: titleInput.value })
    });

    const refInput = el('input', {
      type: 'text', value: ev.reference, placeholder: 'Реквізити (номер, дата, розділ)', disabled: isFinalized ? '' : null,
      onblur: () => patchEvidence(ev.evidence_id, { reference: refInput.value })
    });

    const obsTextarea = el('textarea', {
      rows: '2', placeholder: 'Спостереження/висновок з доказу', disabled: isFinalized ? '' : null,
      onblur: () => patchEvidence(ev.evidence_id, { observation: obsTextarea.value })
    }, ev.observation);

    const collectedByInput = el('input', {
      type: 'text', value: ev.collected_by, placeholder: 'Зібрав (ПІБ)', disabled: isFinalized ? '' : null,
      onblur: () => patchEvidence(ev.evidence_id, { collected_by: collectedByInput.value })
    });

    const sourceInfo = ev.source?.kind === 'LOCAL_FILE'
      ? el('span', { class: 'hint' }, ` 📎 ${ev.source.path.replace('evidence/', '')}`)
      : null;

    const deleteBtn = el('button', {
      type: 'button',
      class: 'link-btn',
      disabled: isFinalized ? '' : null,
      onclick: async () => {
        if (isFinalized) return;
        const current = getAssessment();
        const { assessment: updated } = removeEvidence(current, ev.evidence_id);
        setAssessment(updated);

        // Delete uploaded file if exists
        if (ev.source?.kind === 'LOCAL_FILE' && ev.source.path) {
          const filename = ev.source.path.replace('evidence/', '');
          fetch(`/api/assessments/${encodeURIComponent(current.id)}/evidence/${encodeURIComponent(filename)}`, {
            method: 'DELETE'
          }).catch(() => {}); // fire-and-forget, ignore 404
        }
      }
    }, '✕ Видалити');

    return el('div', { class: 'evidence-item' },
      el('div', { class: 'evidence-item-header' },
        el('strong', {}, ev.evidence_id),
        sourceInfo,
        deleteBtn
      ),
      el('label', { class: 'field' }, 'Тип доказу', typeSel),
      el('label', { class: 'field' }, 'Назва', titleInput),
      el('label', { class: 'field' }, 'Реквізити', refInput),
      el('label', { class: 'field' }, 'Спостереження', obsTextarea),
      el('label', { class: 'field' }, 'Зібрав', collectedByInput)
    );
  };

  const listEl = el('fieldset', { class: 'evidence-list' },
    el('legend', {}, 'Додані докази'),
    evidenceList.length === 0
      ? el('p', { class: 'hint' }, 'Докази відсутні')
      : el('div', {}, ...evidenceList.map(evidenceItemBlock))
  );

  const typeSelect = el('select', { disabled: isFinalized ? '' : null },
    ...EVIDENCE_TYPES.map(t => el('option', { value: t }, EVIDENCE_TYPE_LABELS[t] || t))
  );
  const titleInput = el('input', { type: 'text', placeholder: 'Назва доказу', disabled: isFinalized ? '' : null });
  const refInput = el('input', { type: 'text', placeholder: 'Реквізити (номер, дата, розділ)', disabled: isFinalized ? '' : null });
  const obsTextarea = el('textarea', {
    rows: '2',
    placeholder: 'Спостереження/висновок з доказу',
    disabled: isFinalized ? '' : null
  });
  const collectedByInput = el('input', { type: 'text', placeholder: 'Зібрав (ПІБ)', disabled: isFinalized ? '' : null });
  const fileInput = el('input', { type: 'file', disabled: isFinalized ? '' : null });

  const addBtn = el('button', {
    type: 'button',
    disabled: isFinalized ? '' : null,
    onclick: async () => {
      if (isFinalized) return;

      let uploadedFilename = null;
      const file = fileInput.files?.[0];

      if (file) {
        if (file.size > 20_000_000) {
          alert('Файл завеликий (макс. 20 МБ)');
          return;
        }

        const sanitized = sanitizeFilename(file.name);
        try {
          const current = getAssessment();
          const r = await fetch(`/api/assessments/${encodeURIComponent(current.id)}/evidence?filename=${encodeURIComponent(sanitized)}`, {
            method: 'POST',
            body: await file.arrayBuffer()
          });

          if (!r.ok) {
            const body = await r.json();
            alert(`Помилка завантаження: ${body.error ?? 'невідома помилка'}`);
            return;
          }

          const result = await r.json();
          uploadedFilename = result.filename;
        } catch (err) {
          alert(`Помилка мережі: ${err.message}`);
          return;
        }
      }

      const fields = evidenceFieldsFromForm({
        type: typeSelect.value,
        title: titleInput.value,
        reference: refInput.value,
        observation: obsTextarea.value,
        collected_by: collectedByInput.value
      }, uploadedFilename);

      setAssessment(prev => addEvidence(prev, sourceId, fields).assessment);

      // Reset form
      titleInput.value = '';
      refInput.value = '';
      obsTextarea.value = '';
      collectedByInput.value = '';
      fileInput.value = '';
    }
  }, 'Додати доказ');

  const form = el('fieldset', { class: 'evidence-form' },
    el('legend', {}, 'Додати новий доказ'),
    el('label', { class: 'field' },
      'Тип доказу',
      typeSelect
    ),
    el('label', { class: 'field' },
      'Назва',
      titleInput
    ),
    el('label', { class: 'field' },
      'Реквізити',
      refInput
    ),
    el('label', { class: 'field' },
      'Спостереження',
      obsTextarea
    ),
    el('label', { class: 'field' },
      'Зібрав',
      collectedByInput
    ),
    el('label', { class: 'field' },
      'Файл (необов\'язково)',
      fileInput
    ),
    el('div', { class: 'actions' }, addBtn)
  );

  container.replaceChildren(
    el('div', {},
      el('h4', {}, 'Докази'),
      listEl,
      isFinalized ? null : form
    )
  );
}
