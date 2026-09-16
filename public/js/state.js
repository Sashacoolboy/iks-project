import { defaultState } from '/core/template-io.js';

const KEY = 'offline-profile-state';
let state = load();
const listeners = new Set();

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      const merged = { ...defaultState(), ...parsed };
      return { ...merged, passport: { ...defaultState().passport, ...merged.passport },
        risks: { ...defaultState().risks, ...merged.risks } };
    }
  } catch { /* зіпсований стан — почати заново */ }
  return defaultState();
}

export const getState = () => state;

export function setState(patch) {
  state = typeof patch === 'function' ? patch(state) : { ...state, ...patch };
  localStorage.setItem(KEY, JSON.stringify(state));
  for (const fn of listeners) fn(state);
}

export function resetState() {
  state = defaultState();
  localStorage.setItem(KEY, JSON.stringify(state));
  for (const fn of listeners) fn(state);
}

export const subscribe = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };
