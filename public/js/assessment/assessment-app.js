import { el } from '../render/dom.js';
import { loadAssessment } from './assessment-state.js';
import { renderLanding } from './assessment-dashboard.js';

export function mountAssessmentApp(rootEl) {
  const view = (id) => {
    rootEl.replaceChildren();
    if (!id) return renderLanding(rootEl, { onOpen: (openedId) => view(openedId) });
    loadAssessment(id).then(() => import('./assessment-item.js')).then(({ renderDashboard }) =>
      renderDashboard(rootEl, { onBack: () => view(null) }));
  };
  view(null);
}
