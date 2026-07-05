# Создание суперадмина

## Команда

```bash
bash 11-deployment/scripts/create-superadmin.sh
```

Если команда выполняется из корня репозитория:

```bash
bash docs/11-deployment/scripts/create-superadmin.sh
```

## Что делает скрипт

1. Проверяет Docker и контейнер `xlibris-postgres`.
2. Проверяет подключение:

```bash
docker exec xlibris-postgres psql -U xlibris -d xlibris -c "SELECT 1;"
```

3. Запрашивает username, email, password.
4. Валидирует пароль:
   - минимум 8 символов;
   - lowercase;
   - uppercase;
   - цифра;
   - спецсимвол.
5. Генерирует bcrypt hash через Node.js `bcrypt`.
6. Создает или обновляет пользователя по email:

```sql
role = 'admin'
status = 'active'
email_confirmed = true
```

7. Создает профиль в `user_profiles`.

## Важное про ввод пароля

В ручном режиме вводи спецсимволы как есть. Например `$` не нужно экранировать.

В автоматическом режиме используй single-quoted heredoc, чтобы shell не съел `$`:

```bash
bash 11-deployment/scripts/create-superadmin.sh <<'EOF_INPUT'
Admin_Name
user@domain.com
PaS$SworD
EOF_INPUT
```

## Проверка записи в БД

```bash
docker exec xlibris-postgres psql -U xlibris -d xlibris -c \
  "SELECT id, username, email, role, status, email_confirmed, length(password) AS password_len FROM users;"
```

`password_len` для bcrypt обычно `60`.

## Проверка соответствия пароля хэшу

```bash
HASH=$(docker exec xlibris-postgres psql -U xlibris -d xlibris -tA -c \
  "SELECT password FROM users WHERE email = 'user@domain.com' LIMIT 1")

HASH="$HASH" node - <<'NODE'
const bcrypt = require('bcrypt');
const hash = process.env.HASH;
const password = 'PaS$SworD';
console.log(bcrypt.compareSync(password, hash));
NODE
```

Ожидаемо: `true`.

## Проверка API login

```bash
curl -i -s -X POST http://localhost:5000/api/auth/login \
  -H 'Content-Type: application/json' \
  --data '{"email":"user@domain.com","password":"PaS$SworD","rememberMe":false}'
```

Ожидаемо: HTTP `200 OK`, cookies `accessToken`, `refreshToken`.
