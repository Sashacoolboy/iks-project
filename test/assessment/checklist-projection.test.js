import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildChecklistProjection } from '../../core/assessment/checklist-projection.js';

const assessment = {
  id: 'ASSESS-2026-010',
  metadata: { ics_name: 'АС-2', as_class: 2, info_type: 'open_confidential', assessment_start_date: '2026-10-06' },
  plan: {
    checklist: [
      { control_id: 'AT-02', control_title: 'НАВЧАННЯ', family: 'AT', family_title: 'Обізнаність',
        statements: [{ id: 'AT-2#1', text: 'Перевірити журнал' }, { id: 'AT-2#2', text: 'Перевірити паролі' }], included: true },
      { control_id: 'AT-03', control_title: 'РОЛЬОВЕ', family: 'AT', family_title: 'Обізнаність', statements: [], included: true },
      { control_id: 'AC-02', control_title: 'ОБЛІК', family: 'AC', family_title: 'Доступ',
        statements: [{ id: 'AC-02#1', text: 'текст' }], included: false },
    ],
  },
};

test('buildChecklistProjection: групує за родиною, виключає included:false', () => {
  const p = buildChecklistProjection({ assessment, cpbSnapshot: { state: {} } });
  assert.equal(p.title.assessment_id, 'ASSESS-2026-010');
  assert.equal(p.system_info.as_class, 2);
  assert.equal(p.families.length, 1, 'лише AT — AC-02 виключено');
  assert.equal(p.families[0].family, 'AT');
  assert.equal(p.families[0].rows.length, 2);
  assert.equal(p.items_total, 2);
});

test('buildChecklistProjection: кілька statements обʼєднуються в нумерований текст', () => {
  const p = buildChecklistProjection({ assessment, cpbSnapshot: { state: {} } });
  const row = p.families[0].rows.find(r => r.control_id === 'AT-02');
  assert.equal(row.verification_statement, '1. Перевірити журнал\n2. Перевірити паролі');
});

test('buildChecklistProjection: порожній statements → заглушка для ручного заповнення', () => {
  const p = buildChecklistProjection({ assessment, cpbSnapshot: { state: {} } });
  const row = p.families[0].rows.find(r => r.control_id === 'AT-03');
  assert.equal(row.verification_statement, '[немає згенерованої інструкції — заповніть вручну]');
});

test('buildChecklistProjection: без plan.checklist → порожні families', () => {
  const p = buildChecklistProjection({ assessment: { ...assessment, plan: {} }, cpbSnapshot: { state: {} } });
  assert.deepEqual(p.families, []);
  assert.equal(p.items_total, 0);
});
