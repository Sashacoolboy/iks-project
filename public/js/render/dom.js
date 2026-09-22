export function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') node.className = v;
    else if (k === 'dataset') Object.assign(node.dataset, v);
    else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2), v);
    else if (v !== null && v !== undefined) node.setAttribute(k, v);
  }
  for (const c of children.flat()) {
    if (c === null || c === undefined) continue;
    node.append(typeof c === 'string' ? document.createTextNode(c) : c);
  }
  return node;
}

export const option = (value, label, selected = false) =>
  el('option', selected ? { value, selected: '' } : { value }, label);

// Модальне вікно поверх сторінки (fixed overlay). Закриття: ✕, клік по фону, Esc.
export function showModal(contentEl, { title } = {}) {
  const onKeydown = (e) => { if (e.key === 'Escape') close(); };
  const overlay = el('div', { class: 'modal-overlay', onclick: (e) => { if (e.target === overlay) close(); } },
    el('div', { class: 'modal-panel' },
      el('div', { class: 'modal-header' },
        title ? el('h3', {}, title) : el('span', {}),
        el('button', { type: 'button', class: 'modal-close', 'aria-label': 'Закрити', onclick: () => close() }, '✕')),
      el('div', { class: 'modal-body' }, contentEl)));
  const close = () => { overlay.remove(); document.removeEventListener('keydown', onKeydown); };
  document.addEventListener('keydown', onKeydown);
  document.body.append(overlay);
  return { close };
}
