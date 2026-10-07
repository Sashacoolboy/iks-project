import { el } from '../render/dom.js';
import { loadAssessment } from './assessment-state.js';
import { renderLanding } from './assessment-dashboard.js';

export function mountAssessmentApp(rootEl) {
  const view = (id) => {
    rootEl.replaceChildren();
    if (!id) return renderLanding(rootEl, { onOpen: (openedId) => view(openedId) });
    loadAssessment(id).then((assessment) => {
      if (assessment.status === 'PLANNING') {
        return import('./plan-review.js').then(({ renderPlanReview }) =>
          renderPlanReview(rootEl, { onApproved: () => view(id) }));
      }
      return import('./assessment-item.js').then(({ renderDashboard }) =>
        renderDashboard(rootEl, { onBack: () => view(null) }));
    });
  };
  view(null);
}
