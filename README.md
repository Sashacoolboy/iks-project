# Офлайн-Профіль

Автономний комплекс формування Цільового профілю безпеки ІКС (АС-1/2/3).
100% офлайн, нуль залежностей. Вимога: Node.js ≥ 18.

Запуск: `npm start` → відкрити http://127.0.0.1:3000
Тести: `npm test`

## Модуль оцінювання ІКС

Модуль оцінювання дозволяє проводити оцінювання безпеки інформаційно-комунікаційних систем на базі затвердженого Цільового профілю безпеки.

### Режим «Оцінювання ІКС»

Доступний у веб-інтерфейсі після створення та затвердження ЦПБ. Забезпечує повний життєвий цикл оцінювання від створення до фіналізації та експорту звіту.

### Життєвий цикл оцінювання

1. **Створення** — генерація assessment-запису з затвердженого approved-запису (POST `/api/assessments`)
2. **Оцінювання** — внесення результатів перевірки (SATISFIED/PARTIALLY_SATISFIED/NOT_SATISFIED/NOT_APPLICABLE/NOT_ASSESSED), завантаження доказів (evidence), фіксація недоліків (findings)
3. **Фіналізація** — перевірка обов'язкових результатів, перехід у read-only режим (PUT `/api/assessments/:id/finalize`)
4. **Експорт DOCX** — генерація звіту оцінювання (GET `/api/assessments/:id/export`)

### Файлова структура `assessments/<id>/`

Кожне оцінювання зберігається у окремій директорії:

- `assessment.json` — основний запис (план, результати, evidence, findings)
- `cpb-snapshot.json` — immutable знімок затвердженого ЦПБ (джерело плану)
- `catalog-version.json` — версії каталогів assessment_catalog.json та assessment_odp_adapter.json
- `audit-log.json` — журнал дій (створення, оновлення, фіналізація)
- `evidence/` — завантажені файли доказів (.pdf, .png, .jpg, .txt тощо)

### Команди для роботи з каталогами

```bash
# Побудова довідника assessment objectives + методів тестування
node tools/build-assessment-reference.js

# Побудова assessment_catalog.json з довідника
node tools/build-assessment-catalog.js
```

### Тести

```bash
npm test
```

Сюїта включає:
- Тести builder-ів (assessment-reference, assessment-catalog)
- Тести resolver-ів (ODP effective values, objectives, methods)
- Золотий стандарт AC-02 (4 VERIFIED NIST-мапінгів)
- Регресійний тест AS-2 (270 рядків, 85.56% resolved)
- Інтеграційні тести server API (CRUD, finalize, export)
- e2e UI-тести (створення, оцінювання, персистентність)
