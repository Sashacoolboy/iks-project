import { test } from 'node:test';
import assert from 'node:assert/strict';
import { groupPlanItems, RESULT_LABELS, METHOD_LABELS, relevantOdpEntries, odpColumnTexts } from '../../public/js/assessment/assessment-table.js';

test('relevantOdpEntries + odpColumnTexts: фільтр за relevant_local_odp_ids і підписи', () => {
  const odpValues = [
    { local_odp_id: 'ac-2_odp.01', baseline_value: null, target_value: null },
    { local_odp_id: 'ac-2_odp.02', baseline_value: null, target_value: 'зі списку' },
    { local_odp_id: 'ac-2_odp.04', baseline_value: 'мінімум щоквартально', target_value: 'мінімум щоквартально' },
  ];
  // один релевантний ODP → значення без підпису
  const single = { odp_values: odpValues, relevant_local_odp_ids: ['ac-2_odp.04'] };
  assert.deepEqual(relevantOdpEntries(single).map(v => v.local_odp_id), ['ac-2_odp.04']);
  assert.deepEqual(odpColumnTexts(single), { baseline: 'мінімум щоквартально', target: 'мінімум щоквартально' });
  // кілька релевантних → з підписами local ODP id
  const multi = { odp_values: odpValues, relevant_local_odp_ids: ['ac-2_odp.01', 'ac-2_odp.02'] };
  assert.deepEqual(odpColumnTexts(multi), {
    baseline: 'ac-2_odp.01: —; ac-2_odp.02: —',
    target: 'ac-2_odp.01: [НЕ ВИЗНАЧЕНО]; ac-2_odp.02: зі списку',
  });
  // жодного релевантного → «—»
  const none = { odp_values: odpValues, relevant_local_odp_ids: [] };
  assert.deepEqual(odpColumnTexts(none), { baseline: '—', target: '—' });
  // legacy-записи без relevant_local_odp_ids → лише непорожні значення, з підписами
  const legacy = { odp_values: odpValues };
  assert.deepEqual(relevantOdpEntries(legacy).map(v => v.local_odp_id), ['ac-2_odp.02', 'ac-2_odp.04']);
  assert.equal(odpColumnTexts(legacy).baseline, 'ac-2_odp.02: —; ac-2_odp.04: мінімум щоквартально');
});

test('groupPlanItems: groups by family then control, preserves plan order', () => {
  const assessment = {
    plan: {
      items: [
        {
          assessment_source_id: 'AC-01_ODP[01]',
          control_id: 'AC-01',
          family: 'AC',
          family_title: 'УПРАВЛІННЯ ДОСТУПОМ',
          control_title: 'ПОЛІТИКА УПРАВЛІННЯ ДОСТУПОМ',
          odp_values: [],
          available_methods: ['EXAMINE']
        },
        {
          assessment_source_id: 'AC-02_ODP[01]',
          control_id: 'AC-02',
          family: 'AC',
          family_title: 'УПРАВЛІННЯ ДОСТУПОМ',
          control_title: 'УПРАВЛІННЯ ОБЛІКОВИМИ ЗАПИСАМИ',
          odp_values: [],
          available_methods: ['EXAMINE', 'TEST']
        },
        {
          assessment_source_id: 'AU-01_ODP[01]',
          control_id: 'AU-01',
          family: 'AU',
          family_title: 'АУДИТ І ПІДЗВІТНІСТЬ',
          control_title: 'ПОЛІТИКА АУДИТУ',
          odp_values: [],
          available_methods: []
        }
      ]
    },
    results: [
      {
        assessment_source_id: 'AC-01_ODP[01]',
        result: 'SATISFIED',
        methods_used: ['EXAMINE'],
        evidence_ids: [],
        finding_ids: [],
        assessor_comment: '',
        conclusion: ''
      },
      {
        assessment_source_id: 'AC-02_ODP[01]',
        result: 'NOT_ASSESSED',
        methods_used: [],
        evidence_ids: [],
        finding_ids: [],
        assessor_comment: '',
        conclusion: ''
      },
      {
        assessment_source_id: 'AU-01_ODP[01]',
        result: 'NOT_ASSESSED',
        methods_used: [],
        evidence_ids: [],
        finding_ids: [],
        assessor_comment: '',
        conclusion: ''
      }
    ]
  };

  const groups = groupPlanItems(assessment);

  assert.equal(groups.length, 2, 'should have 2 families');
  assert.deepEqual(
    groups.map(g => g.family),
    ['AC', 'AU'],
    'families in plan order'
  );
  assert.equal(groups[0].family_title, 'УПРАВЛІННЯ ДОСТУПОМ');
  assert.equal(groups[0].controls.length, 2, 'AC family has 2 controls');
  assert.equal(groups[0].controls[0].control_id, 'AC-01');
  assert.equal(groups[0].controls[1].control_id, 'AC-02');
  assert.equal(groups[0].controls[0].items.length, 1);
  assert.equal(groups[0].controls[0].items[0].planItem.assessment_source_id, 'AC-01_ODP[01]');
  assert.equal(groups[0].controls[0].items[0].result.result, 'SATISFIED');
  assert.equal(groups[1].controls.length, 1, 'AU family has 1 control');
});

test('groupPlanItems: handles missing results gracefully', () => {
  const assessment = {
    plan: {
      items: [
        {
          assessment_source_id: 'AC-01_ODP[01]',
          control_id: 'AC-01',
          family: 'AC',
          family_title: 'УПРАВЛІННЯ ДОСТУПОМ',
          control_title: 'ПОЛІТИКА',
          odp_values: [],
          available_methods: []
        }
      ]
    },
    results: []
  };

  const groups = groupPlanItems(assessment);

  assert.equal(groups.length, 1);
  assert.equal(groups[0].controls[0].items[0].result, undefined, 'missing result is undefined');
});

test('groupPlanItems: handles empty plan', () => {
  const assessment = { plan: { items: [] }, results: [] };
  const groups = groupPlanItems(assessment);
  assert.deepEqual(groups, []);
});

test('RESULT_LABELS: Ukrainian labels', () => {
  assert.equal(RESULT_LABELS.NOT_ASSESSED, 'Не оцінено');
  assert.equal(RESULT_LABELS.SATISFIED, 'Відповідає');
  assert.equal(RESULT_LABELS.PARTIALLY_SATISFIED, 'Частково відповідає');
  assert.equal(RESULT_LABELS.NOT_SATISFIED, 'Не відповідає');
  assert.equal(RESULT_LABELS.NOT_APPLICABLE, 'Не застосовується');
});

test('METHOD_LABELS: Ukrainian labels', () => {
  assert.equal(METHOD_LABELS.EXAMINE, 'Дослідження');
  assert.equal(METHOD_LABELS.INTERVIEW, 'Співбесіда');
  assert.equal(METHOD_LABELS.TEST, 'Перевірка');
});
