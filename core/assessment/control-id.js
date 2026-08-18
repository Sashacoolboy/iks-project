export function normalizeControlId(id) {
  return String(id ?? '')
    .replace(/^([A-Z]+-)0+(\d+)/, '$1$2')
    .replace(/\(0+(\d+)\)/, '($1)');
}

export function denormalizeControlId(id) {
  return String(id ?? '')
    .replace(/^([A-Z]+-)(\d+)/, (m, p, n) => p + n.padStart(2, '0'))
    .replace(/\((\d+)\)/, (m, n) => `(${n.padStart(2, '0')})`);
}
