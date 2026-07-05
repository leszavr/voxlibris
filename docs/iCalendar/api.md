# iCalendar интеграция

Миграция: `migrations/0060_add_calendar_integration.sql`, применяется вручную через pgAdmin.

## Endpoints

- `GET /api/schedule/:scheduleId/calendar.ics` — `.ics` одного публичного события. Для закрытых клубов публичный endpoint возвращает `403`; JWT-защищённый вариант доступен через существующий `/api/schedule` middleware.
- `GET /api/clubs/:clubId/calendar.ics` — публичный feed клуба. Закрытые клубы не раскрываются.
- `POST /api/clubs/:clubId/calendar-subscription` — создать персональную ссылку участника клуба.
- `DELETE /api/clubs/:clubId/calendar-subscription` — отозвать активную ссылку.
- `POST /api/clubs/:clubId/calendar-subscription/rotate` — перевыпустить ссылку.
- `GET /api/calendar/subscription/:token.ics` — feed по персональному токену без JWT для календарных клиентов.

## Поведение

- `UID`: `schedule-{id}@voxlibris`, стабилен между обновлениями.
- `SEQUENCE`: `reading_schedule.calendar_sequence`, увеличивается при обновлении события/статуса.
- `LAST-MODIFIED`: берётся из `updatedAt`.
- Отменённые события остаются в feed с `STATUS:CANCELLED` и пометкой в `DESCRIPTION`.
- `VALARM` добавляется при положительном `reminderMinutes`.

## Безопасность

- Plaintext token не хранится, только SHA-256 hash.
- Персональный feed проверяет hash, `revoked_at` и активное членство пользователя в клубе.
- Публичные endpoints не отдают закрытые клубы.
- Token endpoint ограничен rate limit.

## Автоматический smoke-тест

Smoke-тест не входит в `pnpm run test`, `pnpm run test:integration` и `pnpm run quality:gate`, потому что требует локальную PostgreSQL и запущенный API.

```bash
pnpm run dev:services
DATABASE_URL=postgresql://xlibris:xlibris_dev@localhost:5432/xlibris pnpm run dev:server

# в другом терминале
DATABASE_URL=postgresql://xlibris:xlibris_dev@localhost:5432/xlibris \
ICALENDAR_SMOKE_BASE_URL=http://127.0.0.1:5000 \
pnpm run smoke:icalendar
```

Проверяет:

- `.ics` одного публичного события: `200`, `text/calendar`, `Content-Disposition: attachment`, `UID`, `VALARM`;
- публичный feed клуба: `200`, inline `.ics`;
- публичный feed закрытого клуба: `403`;
- персональный token feed закрытого клуба: `200`, `Cache-Control: no-store`, обновление `last_used_at`;
- revoked/invalid token: `404`.

## Ручное тестирование

1. Применить `migrations/0060_add_calendar_integration.sql` вручную и повторить применение: допустимы только `NOTICE`.
2. Запустить backend и frontend локально.
3. Создать публичный клуб с книгой и будущим событием расписания.
4. Скачать `.ics` одного события из UI/endpoint и импортировать в Google/Apple/Outlook Calendar: проверить название, время, описание, напоминание.
5. Открыть `/api/clubs/:clubId/calendar.ics` публичного клуба: файл должен скачиваться/подписываться и содержать будущие события.
6. Создать закрытый клуб, событие и персональную подписку из UI участника.
7. Убедиться, что `/api/clubs/:privateClubId/calendar.ics` возвращает `403` без токена.
8. Открыть персональную ссылку подписки: должен вернуться `.ics`, при повторном запросе подписка остаётся рабочей.
9. Отозвать или перевыпустить подписку и проверить, что старая ссылка возвращает `404`, новая ссылка работает.
10. Отменить событие и проверить в feed наличие `STATUS:CANCELLED`.
