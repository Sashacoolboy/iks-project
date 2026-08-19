# ADR: Нумерація ODP у модулі оцінювання

## Статус: прийнято (2026-08-17)

## Рішення
1. Первинна нумерація assessment ODP — українська локальна (НД ТЗІ): `AC-02_ODP[01]`.
2. `local_odp_id` (`ac-2_odp.01`) — єдине джерело для резолвінгу значень ЦПБ (`assessment_odp_id → local_odp_id` детермінований через adapter binding `DIRECT_LOCAL_ODP`).
3. NIST ODP — виключно optional provenance/traceability; ніколи не primary key, не бере участі в runtime-логіці, нумерації UI, плані чи звіті.
4. Розбіжність нумерації з NIST очікувана: український НД ТЗІ адаптував NIST SP 800-53/53A зі зміною складу і порядку параметрів (валідований приклад AC-02: local [01]-[04] ↔ NIST [03],[04],[06/07/08],[10]).
5. Ordinal inference у runtime заборонений: зв'язок лише через явні verified bindings адаптера.
6. Similarity score у production mapping заборонений; machine-generated кандидати живуть тільки в internal-review файлі поза runtime.
7. Нові VERIFIED NIST-мапінги додаються редагуванням `nist_traceability` в адаптері без міграції даних ЦПБ або assessment-записів.
