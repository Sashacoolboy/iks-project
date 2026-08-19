let assessment = null;
const listeners = new Set();
let saveTimer = null;
let lastSaveError = null;

export const computeDebounceDelay = () => 500;

export const getLastSaveError = () => lastSaveError;

export const getAssessment = () => assessment;

export function setAssessment(patch) {
  assessment = typeof patch === 'function' ? patch(assessment) : { ...assessment, ...patch };
  for (const fn of listeners) fn(assessment);
  scheduleSave();
}

export function subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); }

export async function loadAssessment(id) {
  const r = await fetch(`/api/assessments/${encodeURIComponent(id)}`);
  if (!r.ok) throw new Error((await r.json()).error ?? 'не вдалося завантажити оцінювання');
  assessment = await r.json();
  for (const fn of listeners) fn(assessment);
  return assessment;
}

function scheduleSave() {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(saveAssessment, computeDebounceDelay());
}

export async function saveAssessment() {
  if (!assessment) return;
  try {
    const r = await fetch(`/api/assessments/${encodeURIComponent(assessment.id)}`, { method: 'PUT', body: JSON.stringify(assessment) });
    if (!r.ok) {
      const body = await r.json();
      lastSaveError = body.error ?? 'помилка збереження';
      for (const fn of listeners) fn(assessment);
      return;
    }
    lastSaveError = null;
    for (const fn of listeners) fn(assessment);
  } catch (err) {
    lastSaveError = err.message ?? 'помилка мережі';
    for (const fn of listeners) fn(assessment);
  }
}
