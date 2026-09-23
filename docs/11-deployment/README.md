# VoxLibris: промышленный деплой на чистую Ubuntu 24.04

Документация описывает воспроизводимое развертывание VoxLibris из репозитория:

```bash
https://github.com/leszav/voxlibris
```

## Главный принцип управления

После первичного деплоя проектом нужно управлять через `xlibris-manager.sh`.

Основные команды:

```bash
bash ../xlibris-manager.sh start
bash ../xlibris-manager.sh restart
bash ../xlibris-manager.sh status
bash ../xlibris-manager.sh stop
bash ../xlibris-manager.sh check
bash ../xlibris-manager.sh build
```

Низкоуровневые `docker compose` и `pnpm` команды в документации оставлены только как fallback/диагностика.

## Требования

- Ubuntu 24.04 x86_64/aarch64.
- Node.js `>=22.0.0`.
- pnpm `9.0.0`.
- Docker Engine.
- Docker Compose v2: команда `docker compose`.
- Backend использует Docker-network hostnames:
  - `xlibris-postgres`
  - `xlibris-minio`
  - `xlibris-redis`
  - `xlibris-icecast`

## Документы

- [`quickstart.md`](quickstart.md) — короткий путь установки с приоритетом `xlibris-manager.sh`.
- [`deployment-guide.md`](deployment-guide.md) — подробный регламент.
- [`environment.md`](environment.md) — переменные окружения.
- [`superadmin.md`](superadmin.md) — создание первого администратора.
- [`operations.md`](operations.md) — эксплуатация через `xlibris-manager.sh`.
- [`troubleshooting.md`](troubleshooting.md) — диагностика.
- [`infra/nginx/caprover-templates.conf`](../../infra/nginx/caprover-templates.conf) — versioned-шаблоны кастомного NGINX для CapRover.
- [`scripts/deploy.sh`](scripts/deploy.sh) — автоматизированный первичный деплой.
- [`scripts/create-superadmin.sh`](scripts/create-superadmin.sh) — создание суперадмина.
- [`scripts/run-migrations.sh`](scripts/run-migrations.sh) — legacy/fallback миграционный скрипт.

## Рекомендуемый порядок

```bash
# 1. Автоматическое развертывание (все фазы)
bash 11-deployment/scripts/deploy.sh all

# 2. Запуск приложения через менеджер
bash ../xlibris-manager.sh start

# 3. Проверка статуса
bash ../xlibris-manager.sh status

# 4. Создание суперадмина
bash 11-deployment/scripts/create-superadmin.sh
```

После создания администратора открыть:

```text
http://localhost:3000
```

## Кастомный NGINX в CapRover

Для production-приложений CapRover используются шаблоны из [`infra/nginx/caprover-templates.conf`](../../infra/nginx/caprover-templates.conf):

- `**voxlibris**` — приложение `voxlibris`, порт контейнера `5000`, домены `voxlibris.ru` и `www.voxlibris.ru`;
- `**radio**` — приложение `radio`, порт контейнера `8000`, домен `radio.voxlibris.ru`.

При переносе на другой сервер скопировать содержимое соответствующей секции без строки-заголовка `**...**` в CapRover: `Apps → приложение → HTTP Settings → Custom Nginx Configuration`.

Шаблон `voxlibris` отключает буферизацию длинного `POST` на `/api/studio/stream/` и задаёт таймауты потоковой передачи. Шаблон `radio` отключает буферизацию Icecast и задаёт увеличенные таймауты для live-аудио.

После сохранения проверить сгенерированный конфиг внутри `captain-nginx` командой `nginx -t` и запросами к `/api/health` и `/status-json.xsl`.

В Git не должны попадать пароли, токены, `.env`, TLS-ключи, сертификаты и сгенерированные production-конфиги.

## Важные замечания

1. **verdaccio исключён** из обязательного деплоя — это резервный сервис для локальной npm-registry
2. **xlibris-manager.sh** — основной инструмент управления после деплоя
3. Скрипт `deploy.sh` автоматически генерирует безопасные ключи для JWT, сессий и MASTER_KEY

## Почему deploy и create-superadmin не объединены

Их лучше держать раздельно:

1. деплой — инфраструктурная операция;
2. создание администратора — операция управления доступом;
3. админские credentials не должны быть частью автоматического деплоя;
4. отдельный запуск проще аудировать и безопаснее повторять.
