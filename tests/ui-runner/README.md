# VoxLibris UI Test Runner

Локальный инструмент для автоматизированной проверки UI/UX сценариев.

Важно:

- каталог `tests/ui-runner/` хранится в репозитории;
- runner не подключён к `package.json` проекта;
- runner не подключён к GitHub Actions/CI;
- runner имеет собственные `.npmrc`, `pnpm-workspace.yaml` и `pnpm-lock.yaml`, поэтому `pnpm install` из этого каталога не должен менять root `pnpm-lock.yaml` проекта;
- все отчёты и trace/video остаются внутри `tests/ui-runner/reports/`.

## Установка локальных зависимостей

Выполнять из каталога runner-а:

```bash
cd tests/ui-runner
pnpm install
pnpm exec playwright install chromium
```

Это создаст `node_modules` внутри `tests/ui-runner`, не меняя зависимости основного проекта.

Если нужно обновить только lockfile runner-а:

```bash
cd tests/ui-runner
pnpm install --lockfile-only
```

## Предусловия запуска

1. Запущен backend VoxLibris.
2. Запущен frontend VoxLibris.
3. Есть тестовые аккаунты владельца и участника.
4. Есть тестовый клуб с известными участниками.

Можно использовать уже существующий dev-запуск проекта, например из корня репозитория:

```bash
pnpm run dev
```

## Настройка окружения

Создать локальный `.env` рядом с этим README:

```bash
cp .env.example .env
```

Заполнить значения:

```env
VOXLIBRIS_BASE_URL=http://localhost:3000
VOXLIBRIS_OWNER_EMAIL=...
VOXLIBRIS_OWNER_PASSWORD=...
VOXLIBRIS_MEMBER_EMAIL=...
VOXLIBRIS_MEMBER_PASSWORD=...
VOXLIBRIS_READER_CLUB_ID=f0aef677-dafc-47cb-aa1a-4a5ebc556735
VOXLIBRIS_TARGET_MEMBER_NAME=test_testovich_s3sg
```

## Запуск

```bash
cd tests/ui-runner
pnpm test
```

Headed-режим:

```bash
pnpm test:headed
```

Открыть HTML-отчёт Playwright:

```bash
pnpm report
```

## Что сейчас автоматизировано

Минимальный критический smoke по клубу чтецов:

- вход владельцем;
- открытие клуба чтецов;
- наличие меню модерации у целевого участника;
- открытие модалки запрета писать;
- наличие отдельных полей даты и времени;
- иконка календаря открывает/фокусирует поле даты;
- иконка часов открывает/фокусирует поле времени;
- установка причины и срока;
- применение ограничения;
- появление бейджа `Без права писать` без ручного обновления страницы;
- вход участником;
- проверка, что чат доступен для чтения, но отправка сообщения ограничена.

Дальше runner можно расширять сценариями из `scenarios/moderation-checklist.json`.
