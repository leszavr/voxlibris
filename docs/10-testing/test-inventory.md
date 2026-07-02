# Инвентаризация тестов VoxLibris

## Что запускается в CI

GitHub Actions запускает `pnpm test`, а root-скрипт выполняет только:

```bash
node --test --experimental-strip-types server/__tests__/**/*.test.ts
```

Поэтому в CI попадают только файлы `server/__tests__/**/*.test.ts`. Интеграционные API-smoke с суффиксом `.integration.test.ts` тоже попадают, потому что оканчиваются на `.test.ts`; если API-сервер недоступен, они делают `skip`.

## Активные серверные тесты

- `server/__tests__/book-parser.test.ts` — базовые проверки парсинга метаданных и реальные smoke-проверки FB2: обложка через namespaced `l:href`, inline-картинки из `binary`.
- `server/__tests__/client-serializers.test.ts` — проверяет, что клиентские сериализаторы не отдают пароль, confirmation token, crypto-поля книг и лишние данные участников.
- `server/__tests__/club-member-moderation.test.ts` — unit-проверки mute/deactivate helpers для участников клуба.
- `server/__tests__/entitlement-service.test.ts` — unit-проверки Freemium/paid entitlement логики, лимитов и typed feature values.
- `server/__tests__/monetization.test.ts` — helper-проверки периодов подписки, продления доступа и renewal reminder.
- `server/__tests__/security-upload.test.ts` — изолированные security-checks для upload threat model: MIME/magic bytes, path traversal, XSS/SQL strings, extensions, ZIP bomb признаки.
- `server/__tests__/validation.test.ts` — базовые regex/validation smoke для email, UUID, password strength и определения EPUB/FB2.

## Активные интеграционные API-smoke

- `server/__tests__/integration/auth-and-access.integration.test.ts` — публичные auth/protected API boundaries: `/me`, защищённые clubs/books endpoints, login/register/reset/logout validation.
- `server/__tests__/integration/public-api.integration.test.ts` — публичные endpoints: health, books, search, catalog, presence, users search, 404 для отсутствующей книги.
- `server/__tests__/integration/reader-club-tariffs.integration.test.ts` — commerce/reader-club tariff API. Часть тестов требует `TEST_*` env и скипается без подготовленного окружения.

## Отдельный Playwright UI runner, не CI

Перенесён из `.tmp/ui-test-runner` в `tests/ui-runner/`, чтобы сценарии хранились в репозитории, но не запускались root `pnpm test` и CI.

- `tests/ui-runner/tests/api-db-moderation.spec.ts` — API + DB проверки модерации участников клуба.
- `tests/ui-runner/tests/commerce-dashboard-paywall.spec.ts` — UI-smoke commerce dashboard и paywall платного клуба чтеца.
- `tests/ui-runner/tests/reader-club-moderation.spec.ts` — браузерный сценарий mute в клубе чтецов и запрет отправки сообщений.
- `tests/ui-runner/tests/ui-moderation-coverage.spec.ts` — расширенный UI coverage модерации обычного клуба/клуба чтецов, мобильная адаптация, нагрузочный список участников.

Запуск вручную:

```bash
cd tests/ui-runner
pnpm install
pnpm exec playwright install chromium
pnpm test
```

## `.skip` файлы

Эти файлы не запускаются CI, потому что не оканчиваются на `.test.ts`:

- `server/__tests__/crypto-service.test.ts.skip` — хорошие unit-тесты CryptoService; можно восстановить после проверки актуального API и env setup.
- `server/__tests__/logger.test.ts.skip` — устаревшие logger-тесты с monkey-patch console; лучше переписать под текущий logger, если понадобится.
- `server/__tests__/gamification.test.ts.skip` — mostly mock/spec-style проверки, не тестируют реальную систему; лучше не включать как есть.
- `server/__tests__/gamification-api.test.ts.skip` — документированные сценарии API, не исполняемый тест.
- `server/__tests__/gamification-smoke.test.ts.skip` — реальный DB smoke, но мутирует dev БД; запускать только вручную или после перевода на отдельную test DB.

## Временные/служебные найденные файлы

- `.tmp/` — локальные временные артефакты; актуальные Playwright сценарии перенесены в `tests/ui-runner/`.
- `.skills/` и `.tmp/.skills/` — служебные материалы агента/skills, к проектным тестам VoxLibris не относятся.
- `scripts/*test*` — ручные сценарии/диагностические скрипты; не подключены к CI.
