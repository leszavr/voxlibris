# Troubleshooting

## 1. Начинать диагностику с manager

```bash
bash ../xlibris-manager.sh status
bash ../xlibris-manager.sh logs
```

Если нужен полный перезапуск:

```bash
bash ../xlibris-manager.sh restart
```

Если нужно поднять только инфраструктуру:

```bash
bash ../xlibris-manager.sh services
```

## 2. Login возвращает «Неверные данные для входа»

Проверить пользователя:

```bash
docker exec xlibris-postgres psql -U xlibris -d xlibris -c \
  "SELECT username, email, role, status, email_confirmed, length(password) FROM users;"
```

Проверить bcrypt:

```bash
HASH=$(docker exec xlibris-postgres psql -U xlibris -d xlibris -tA -c \
  "SELECT password FROM users WHERE email = 'user@domain.com' LIMIT 1")
HASH="$HASH" node - <<'NODE'
const bcrypt = require('bcrypt');
console.log(bcrypt.compareSync('PaS$SworD', process.env.HASH));
NODE
```

Если `false`, пароль был захэширован не тот. Удалить пользователя и пересоздать через `create-superadmin.sh`.

## 3. В backend логах `No token found in header or cookies`

Это не ошибка логина само по себе. Обычно это запрос к `/api/auth/me` без `accessToken`. После успешного login backend должен вернуть cookies.

Проверить login напрямую:

```bash
curl -i -s -X POST http://localhost:5000/api/auth/login \
  -H 'Content-Type: application/json' \
  --data '{"email":"user@domain.com","password":"PaS$SworD","rememberMe":false}'
```

## 4. Backend не видит PostgreSQL

Сначала:

```bash
bash ../xlibris-manager.sh status
bash ../xlibris-manager.sh services
```

Потом проверить `.env`:

```bash
grep '^DATABASE_URL=' .env
```

Ожидаемо:

```env
DATABASE_URL=postgresql://xlibris:xlibris_dev@xlibris-postgres:5432/xlibris
```

## 5. MinIO/storage не инициализируется

Основной путь:

```bash
bash ../xlibris-manager.sh restart
```

Fallback:

```bash
pnpm run init-storage
```

Проверить `.env`:

```bash
grep -E '^(S3_ENDPOINT|S3_BUCKET|MINIO_ROOT_USER|MINIO_ROOT_PASSWORD)=' .env
```

## 6. Проверка Docker Compose v2

```bash
docker compose version
```

Legacy `docker-compose` не использовать.

## 7. Проверка Node.js/pnpm

```bash
node --version
pnpm --version
```

Требования:

- Node.js `>=22.0.0`;
- pnpm `9.0.0`.
