# Переменные окружения VoxLibris

`deploy.sh` генерирует `.env` для принятого проектом режима: инфраструктура в Docker Compose v2, backend работает с Docker-network именами сервисов.

## Обязательные переменные

| Переменная | Назначение | Генерация/значение |
|---|---|---|
| `NODE_ENV` | режим приложения | `development` |
| `PORT` | порт backend | `5000` |
| `DATABASE_URL` | подключение к PostgreSQL | `postgresql://xlibris:xlibris_dev@xlibris-postgres:5432/xlibris` |
| `JWT_SECRET` | подпись access JWT | `openssl rand -base64 64` |
| `JWT_REFRESH_SECRET` | refresh JWT/session secret | `openssl rand -base64 64` |
| `SESSION_SECRET` | session/cookie secret | `openssl rand -base64 64` |
| `MASTER_KEY` | шифрование контента | `openssl rand -hex 32`, ровно 64 hex символа |

`server/env.ts` требует:

```text
DATABASE_URL
JWT_SECRET
JWT_REFRESH_SECRET
SESSION_SECRET
```

`server/config/validate.ts` дополнительно требует `MASTER_KEY` и проверяет, что он равен 64 hex-символам.

## Storage / MinIO

```env
S3_ENDPOINT=http://xlibris-minio:9000
S3_ACCESS_KEY=minioadmin
S3_SECRET_KEY=minioadmin123
S3_BUCKET=voxlibris
S3_REGION=us-east-1
MINIO_ROOT_USER=minioadmin
MINIO_ROOT_PASSWORD=minioadmin123
```

## Redis / rate limiting

```env
REDIS_PASSWORD=redis_dev
REDIS_URL=redis://:redis_dev@xlibris-redis:6379
RATE_LIMIT_REDIS_URL=redis://:redis_dev@xlibris-redis:6379
RATE_LIMIT_REDIS_ENABLED=true
RATE_LIMIT_REDIS_PREFIX=rl:voxlibris
```

## URLs

```env
APP_BASE_URL=http://localhost:3000
CLIENT_URL=http://localhost:3000
ALLOWED_ORIGINS=http://localhost:3000,http://localhost:5000
```

## Icecast / Studio

```env
ICECAST_SOURCE_PASSWORD=dev_source_pass
ICECAST_ADMIN_PASSWORD=dev_admin_pass
ICECAST_INTERNAL_HOST=xlibris-icecast
ICECAST_INTERNAL_PORT=8000
ICECAST_PUBLIC_URL=http://localhost:8000
VITE_ICECAST_PUBLIC_URL=http://localhost:8000
STUDIO_RECORDINGS_DIR=uploads/recordings
STUDIO_STREAM_INTENT_TTL_SECONDS=1800
LIVE_SESSION_TTL_SECONDS=90
```

## Проверка сгенерированного `.env`

```bash
grep -E '^(DATABASE_URL|S3_ENDPOINT|REDIS_URL|ICECAST_INTERNAL_HOST|MASTER_KEY)=' .env
awk -F= '/^MASTER_KEY=/{print length($2)}' .env
```

Ожидаемо:

- `MASTER_KEY` length = `64`;
- `DATABASE_URL` содержит `xlibris-postgres`;
- `S3_ENDPOINT` содержит `xlibris-minio`;
- `REDIS_URL` содержит `xlibris-redis`;
- `ICECAST_INTERNAL_HOST=xlibris-icecast`.
