import { el } from '../render/dom.js';
import { getAssessment, setAssessment } from './assessment-state.js';
import { EVIDENCE_TYPES, addEvidence, removeEvidence } from '../../../core/assessment/evidence.js';

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
    container.replaceChildren(el('p', {}, 'Result not found'));
    return;
  }

  const isFinalized = assessment.status === 'FINALIZED';
  const evidenceList = result.evidence_ids.map(evidId => 
    assessment.evidence.find(e => e.evidence_id === evidId)
  ).filter(Boolean);

  const listEl = el('div', { class: 'evidence-list' },
    evidenceList.length === 0
      ? el('p', { class: 'hint' }, 'Докази відсутні')
      : el('ul', { class: 'custom-list' },
          ...evidenceList.map(ev => {
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
            }, '✕');

            const sourceInfo = ev.source?.kind === 'LOCAL_FILE'
              ? ` (📎 ${ev.source.path.replace('evidence/', '')})`
              : '';

            return el('li', {},
              `${EVIDENCE_TYPE_LABELS[ev.type] || ev.type}: ${ev.title || '—'}${sourceInfo}`,
              ' ',
              deleteBtn
            );
          })
        )
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

  const form = el('div', { class: 'evidence-form' },
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
