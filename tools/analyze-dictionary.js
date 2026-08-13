// Аналіз словника ODP: кластери, покриття, кандидати у майбутню комплексну анкету.
// Використання: node tools/analyze-dictionary.js [--min-params=2]
import { readFileSync, existsSync } from 'node:fs';
import { clusterQuestions, labelKey } from '../core/odp-dictionary.js';

const DICT = new URL('../dictionary/odp_dictionary.json', import.meta.url);
const minParams = Number((process.argv.find(a => a.startsWith('--min-params=')) ?? '').split('=')[1] || 1);

if (!existsSync(DICT)) { console.log('Словник порожній (dictionary/odp_dictionary.json відсутній).'); process.exit(0); }
const dict = JSON.parse(readFileSync(DICT, 'utf8'));
const pm = JSON.parse(readFileSync(new URL('../data/policy_mapping.json', import.meta.url), 'utf8'));

const entries = Object.entries(dict.entries ?? {});
const byType = {};
for (const [, e] of entries)
  for (const v of e.values) byType[v.info_type ?? 'без типу'] = (byType[v.info_type ?? 'без типу'] ?? 0) + v.count;

console.log(`Параметрів у словнику: ${entries.length}`);
console.log('Вживань за типом інформації:', byType);
console.log(`Семантичних кластерів (labelKey): ${new Set(entries.map(([, e]) => labelKey(e.label))).size}`);
console.log();

const qs = clusterQuestions(dict, pm).filter(q => q.paramIds.length >= minParams);
console.log(`Кандидати у комплексну анкету (кластери ≥${minParams} параметрів, не покриті policy_mapping): ${qs.length}`);
for (const q of qs) {
  console.log(`\n■ ${q.label}`);
  console.log(`  параметри (${q.paramIds.length}): ${q.paramIds.join(', ')}`);
  console.log(`  значення: ${q.values.slice(0, 3).map(v => `«${v.slice(0, 60)}»`).join('; ')}${q.values.length > 3 ? ` …(+${q.values.length - 3})` : ''}`);
}
