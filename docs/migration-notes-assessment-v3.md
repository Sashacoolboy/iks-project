# Міграція Assessment v1 → v3

## Автоматична міграція при GET

Assessment v1-записи автоматично мігрують до v3 при зчитуванні через GET `/api/assessments/:id`. Сервер зберігає мігровану версію на диск одразу після міграції.

## Enum-мапінг результатів

| v1 Enum | v3 Enum |
|---------|---------|
| `POSITIVE` | `SATISFIED` |
| `PARTIALLY_POSITIVE` | `PARTIALLY_SATISFIED` |
| `NEGATIVE` | `NOT_SATISFIED` |
| `NOT_APPLICABLE` | `NOT_APPLICABLE` |
| `null` (відсутній) | `NOT_ASSESSED` |

## Структурні зміни

### Переміщення items → plan.items + results

- v1: `items[]` — плоский масив з plan + results разом
- v3: `plan.items[]` — immutable план (ODP, objectives, methods); `results[]` — mutable результати з `item_ref` на план

### Evidence: локальна нумерація

- v1: `evidence` — вбудований масив у кожному item
- v3: `evidence[]` — глобальний масив на рівні assessment з `evidence_id: 'EV-001'`, `collected_by: 'migration:v1'`

### Findings: структуровані записи

- v1: `finding.description` — вільний текст
- v3: `findings[]` — глобальний масив, кожен finding має `finding_id: 'F-001'`, `type: 'OBSERVATION' | 'OPEN'`, `description`, `affected_items`

## Сумісність

- **Локальні ODP ID незмінні**: `ac-2_odp.01` залишається `ac-2_odp.01`.
- **Старі CPB/approved-записи повністю сумісні**: жодних змін у форматі `cpb-snapshot.json` або approved state.
- **cpb_snapshot.hash перевіряється**: при міграції immutability snapshot збережена.

## Що НЕ мігрує

- Metadata (created_at, started_by, finalized_at) — копіюються без змін.
- cpb_snapshot — копіюється як є.
- Каталог evidence/ — файли залишаються на місці.
