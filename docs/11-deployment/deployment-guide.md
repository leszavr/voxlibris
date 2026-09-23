# Подробный регламент деплоя VoxLibris

## 1. Базовая модель

Основной управляющий слой — `xlibris-manager.sh`.

`deploy.sh` нужен для первичной подготовки чистой Ubuntu 24.04:

- установка Node.js `>=22.0.0`;
- активация `pnpm@9.0.0`;
- установка Docker Engine и Docker Compose v2;
- генерация `.env`;
- установка зависимостей;
- запуск инфраструктуры;
- миграции;
- первичная проверка.

После первичной подготовки ежедневное управление выполняется через:

```bash
bash ../xlibris-manager.sh start
bash ../xlibris-manager.sh restart
bash ../xlibris-manager.sh status
bash ../xlibris-manager.sh stop
```

## 2. Клонирование

```bash
mkdir -p ~/DEV
cd ~/DEV
git clone https://github.com/leszav/voxlibris.git
cd voxlibris
```

## 3. Первичный деплой

```bash
bash 11-deployment/scripts/deploy.sh all
```

Фазы `deploy.sh`, если нужен пошаговый режим:

```bash
bash 11-deployment/scripts/deploy.sh verify-env
bash 11-deployment/scripts/deploy.sh setup-node
bash 11-deployment/scripts/deploy.sh setup-docker
bash 11-deployment/scripts/deploy.sh setup-env
bash 11-deployment/scripts/deploy.sh install-deps
bash 11-deployment/scripts/deploy.sh build-images
bash 11-deployment/scripts/deploy.sh start-services
bash 11-deployment/scripts/deploy.sh migrate-db
bash 11-deployment/scripts/deploy.sh verify-all
```

## 4. Запуск через manager

```bash
bash ../xlibris-manager.sh start
```

Внутри manager:

1. проверяет `docker`, `docker compose`, `pnpm`;
2. читает `.env`;
3. освобождает порты проекта;
4. поднимает `postgres`, `minio`, `redis` через `docker compose` v2;
5. запускает `icecast`;
6. выполняет `pnpm run init-storage`;
7. запускает backend;
8. после готовности backend запускает frontend.

## 5. Обязательная схема `.env`

Backend должен использовать Docker-network hostnames:

```env
DATABASE_URL=postgresql://xlibris:xlibris_dev@xlibris-postgres:5432/xlibris
S3_ENDPOINT=http://xlibris-minio:9000
REDIS_URL=redis://:redis_dev@xlibris-redis:6379
ICECAST_INTERNAL_HOST=xlibris-icecast
```

Не заменять эти значения на `localhost` в основном сценарии.

## 6. Кастомный NGINX для CapRover

Versioned-шаблоны находятся в [`infra/nginx/caprover-templates.conf`](../../infra/nginx/caprover-templates.conf).

Соответствие production-приложений:

| Секция | CapRover app | Container HTTP Port | Домен |
|---|---|---:|---|
| `**voxlibris**` | `voxlibris` | `5000` | `voxlibris.ru`, `www.voxlibris.ru` |
| `**radio**` | `radio` | `8000` | `radio.voxlibris.ru` |

При создании приложения на новом сервере вставить соответствующую секцию без заголовка `**...**` в `HTTP Settings → Custom Nginx Configuration`.

Шаблон `voxlibris` обязан сохранять отдельный location `/api/studio/stream/` с `proxy_request_buffering off`, `proxy_buffering off` и длительными таймаутами. Шаблон `radio` обязан отключать proxy buffering для Icecast live-потока.

После сохранения настроек выполнить:

```bash
nginx -t
curl -fsS https://voxlibris.ru/api/health
curl -fsS https://radio.voxlibris.ru/status-json.xsl
```

Не хранить в Git реальные сертификаты, ключи, пароли, токены или сгенерированные конфиги NGINX.

## 7. Миграции

Для локального чистого окружения `deploy.sh` применяет:

```bash
pnpm exec tsx script/run-all-migrations.ts
```

Для production-процесса проекта миграции должны оставаться контролируемыми и последовательными.

Ручной seed admin не применять автоматически:

```text
migrations/manual_create_admin/seed_data.sql
```

## 8. Создание суперадмина

```bash
bash 11-deployment/scripts/create-superadmin.sh
```

Скрипт создания администратора не объединен с deploy намеренно: это отдельная операция управления доступом.

## 9. Проверка

Основная проверка:

```bash
bash ../xlibris-manager.sh status
bash ../xlibris-manager.sh check
```

Fallback API-проверка login:

```bash
curl -i -s -X POST http://localhost:5000/api/auth/login \
  -H 'Content-Type: application/json' \
  --data '{"email":"admin@example.com","password":"YourPassword123!","rememberMe":false}'
```

Успех: HTTP `200 OK`, cookies `accessToken` и `refreshToken`.
