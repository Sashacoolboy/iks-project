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
  };
}

let current = 0;
export let catalogs = null;

function renderStepper() {
  const nav = document.getElementById('stepper');
  nav.replaceChildren(...steps.map((s, i) =>
    el('button', {
      class: `step-tab${i === current ? ' active' : ''}${i < current ? ' done' : ''}`,
      type: 'button',
      onclick: () => { if (i <= current) go(i); },
    }, `${i + 1}. ${s.title}`)));
}

function go(index) {
  current = index;
  renderStepper();
  const container = document.getElementById('step-container');
  container.replaceChildren();
  steps[current].render(container);
  document.getElementById('btn-back').disabled = current === 0;
  document.getElementById('btn-next').style.display = current === steps.length - 1 ? 'none' : '';
}

document.getElementById('btn-back').addEventListener('click', () => current > 0 && go(current - 1));
document.getElementById('btn-next').addEventListener('click', () => {
  const errors = steps[current].validate?.(getState()) ?? [];
  if (errors.length) { alert(errors.join('\n')); return; }
  if (current < steps.length - 1) go(current + 1);
});

(async () => {
  catalogs = await loadCatalogs();
  const modules = await Promise.all([
    import('./steps/step1-passport.js'), import('./steps/step2-assets.js'),
    import('./steps/step3-base-risks.js'), import('./steps/step4-custom-risks.js'),
    import('./steps/step5-generate.js'), import('./steps/step6-verify.js'),
    import('./steps/step7-export.js'),
  ]);
  for (const m of modules) registerStep(m.step);
  go(0);
})();
