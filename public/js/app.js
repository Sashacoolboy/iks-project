import { el } from './render/dom.js';
import { getState } from './state.js';

const steps = [];
export function registerStep(step) { steps.push(step); }

export async function loadCatalogs() {
  const get = async (p) => (await fetch('/data/' + p)).json();
  return {
    ndTzi: await get('nd_tzi.json'),
    bpb: { service: await get('bpb_service.json'), open_confidential: await get('bpb_open_confidential.json') },
    exemptions: await get('as_class_exemptions.json'),
    policyMapping: await get('policy_mapping.json'),
    genericDefaults: await get('generic_parameter_defaults.json'),
    assets: (await get('assets_catalog.json')).assets,
    threatsRisks: await get('threats_risks.json'),
    odpDictionary: await (await fetch('/api/dictionary')).json(),
  };
}

let current = 0;
export let catalogs = null;

// Перехід уперед дозволено, якщо всі проміжні кроки валідні (перегляд затверджених)
function canJump(target) {
  for (let k = current; k < target; k++) {
    if ((steps[k].validate?.(getState()) ?? []).length) return false;
  }
  return true;
}

function renderStepper() {
  const nav = document.getElementById('stepper');
  nav.replaceChildren(...steps.map((s, i) =>
    el('button', {
      class: `step-tab${i === current ? ' active' : ''}${i < current ? ' done' : ''}`,
      type: 'button',
      onclick: () => { if (i <= current || canJump(i)) go(i); },
    }, i === 0 ? s.title : `${i}. ${s.title}`)));
}

function go(index) {
  current = index;
  renderStepper();
  const container = document.getElementById('step-container');
  container.replaceChildren();
  const locked = Boolean(getState().approved_view) && current > 0;
  if (locked) {
    const banner = el('div', { class: 'view-banner' },
      el('span', {}, `🔒 Затверджений профіль «${getState().approved_view}» — лише перегляд. Для змін створіть дублікат у Реєстрі.`),
      el('button', { type: 'button', onclick: () => go(0) }, 'До реєстру'));
    const body = el('div', { class: 'locked' });
    steps[current].render(body);
    // Формені елементи вимикаємо; клікабельні span (редагування параметрів) блокує CSS
    for (const c of body.querySelectorAll('input, textarea, select, button:not(.collapse-safe)')) c.disabled = true;
    container.replaceChildren(banner, body);
  } else {
    steps[current].render(container);
  }
  document.getElementById('btn-back').disabled = current === 0;
  document.getElementById('btn-next').style.display = current === steps.length - 1 ? 'none' : '';
}

export const goToStep = (i) => go(i);

document.getElementById('btn-back').addEventListener('click', () => current > 0 && go(current - 1));
document.getElementById('btn-next').addEventListener('click', () => {
  const errors = steps[current].validate?.(getState()) ?? [];
  if (errors.length) { alert(errors.join('\n')); return; }
  if (current < steps.length - 1) go(current + 1);
});

(async () => {
  catalogs = await loadCatalogs();
  const modules = await Promise.all([
    import('./steps/step0-registry.js'),
    import('./steps/step1-passport.js'), import('./steps/step2-assets.js'),
    import('./steps/step3-base-risks.js'),
    import('./steps/step5-generate.js'), import('./steps/step6-verify.js'),
    import('./steps/step7-export.js'),
  ]);
  for (const m of modules) registerStep(m.step);
  go(0);
})();

document.getElementById('mode-assessment').addEventListener('click', async () => {
  document.getElementById('mode-assessment').classList.add('active');
  document.getElementById('mode-cpb').classList.remove('active');
  document.getElementById('step-container').hidden = true;
  document.getElementById('stepper').hidden = true;
  document.querySelector('footer').hidden = true;
  const assessContainer = document.getElementById('assessment-container');
  assessContainer.hidden = false;
  const { mountAssessmentApp } = await import('./assessment/assessment-app.js');
  mountAssessmentApp(assessContainer);
});
document.getElementById('mode-cpb').addEventListener('click', () => {
  document.getElementById('mode-cpb').classList.add('active');
  document.getElementById('mode-assessment').classList.remove('active');
  document.getElementById('step-container').hidden = false;
  document.getElementById('stepper').hidden = false;
  document.querySelector('footer').hidden = false;
  document.getElementById('assessment-container').hidden = true;
});
