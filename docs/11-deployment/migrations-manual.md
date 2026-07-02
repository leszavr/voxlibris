# Ручное применение миграций БД на production

**Статус:** Current  
**Дата обновления:** 2026-07-02  
**Аудитория:** DevOps, System Administrators, Database Operators  
**Ключевой документ:** `AGENTS.md` секция 4 (Критически важно: миграции базы данных)

---

## 🎯 Введение

Миграции в VoxLibris **применяются вручную, строго по одной, через pgAdmin** на сервере CapRover. Это обеспечивает:

- ✅ Полный контроль над изменениями схемы
- ✅ Возможность остановиться и откатить на любом этапе
- ✅ Явное логирование в операционном журнале
- ✅ Проверку консистентности данных после каждой миграции
- ✅ Синхронизацию с внешними системами (если требуется)

**Критически важно:** Нет автоматического запуска миграций при старте контейнера. Миграции применяются **только вручную**, после явного решения ops.

---

## 📋 Предварительные проверки

### 1. Убедитесь, что сервер запущен и здоров

```bash
# На CapRover
curl -s http://localhost:5000/api/health | jq .
```

Ожидаемый ответ:
```json
{
  "status": "ok",
  "database": { "status": "ok" },
  "server": { "status": "ok" }
}
```

Если `database.status` не `ok` — **не начинайте миграции**, предварительно исправьте проблему.

### 2. Сделайте резервную копию БД

```bash
# На сервере CapRover (в контейнере postgres)
docker exec xlibris-postgres pg_dump -U xlibris xlibris > backup-$(date +%Y%m%d-%H%M%S).sql
```

Или используйте инструмент CapRover для backup'а волюмов.

### 3. Проверьте текущее состояние миграций

```bash
# В pgAdmin на CapRover выполните:
SELECT id, name, hash, installed_on
FROM drizzle_migrations
ORDER BY installed_on DESC
LIMIT 10;
```

Запомните **последний `id`** и **`installed_on`** — это поможет отследить прогресс.

---

## 🚀 Процесс применения миграций

### Шаг 1: Определите, какие миграции нужно применить

На **локальной машине разработчика** (или в CI/CD):

```bash
# Проверьте последний номер миграции в Git
ls migrations/ | grep '\.sql$' | sort | tail -5

# Вывод должен быть похож на:
# 0056_add_commerce_entitlement_actions.sql
# 0057_add_ledger_withdrawn_status.sql
# 0058_commerce_financial_reset_log.sql
# 0059_security_settings.sql
```

Сравните с текущим состоянием production (из запроса к `drizzle_migrations`). Разница — это миграции, которые нужно применить.

### Шаг 2: Откройте pgAdmin на сервере CapRover

1. Откройте pgAdmin в браузере (обычно доступен на CapRover)
2. Подключитесь к PostgreSQL:
   - Host: `postgres` (Docker service name в CapRover)
   - User: `xlibris`
   - Password: (из переменной окружения `POSTGRES_PASSWORD`)
   - Database: `xlibris`

### Шаг 3: Подготовьте SQL миграции

Для каждой миграции, которую нужно применить:

1. Откройте файл миграции из репозитория (например, `migrations/0060_new_feature.sql`)
2. **Скопируйте ВЕСЬ текст файла** (это важно для идемпотентности)
3. В pgAdmin откройте вкладку "Query Tool"
4. **Вставьте текст миграции**

### Шаг 4: Примените миграцию

**Перед выполнением:**
- Прочитайте комментарии в SQL-файле (могут быть особенности)
- Убедитесь, что используются конструкции `IF NOT EXISTS` (для идемпотентности)
- Если миграция содержит `BEGIN; ... COMMIT;` — это транзакция, она атомарна

**Выполните:**
1. В pgAdmin нажмите **Execute** (или Ctrl+Enter)
2. Дождитесь завершения
3. Проверьте результат в разделе "Messages"

**Ожидаемый результат:**
- ✅ Сообщение успеха: `Query returned successfully in XXX ms`
- ⚠️ NOTICE-ы — это нормально: `NOTICE: table "xxx" already exists, skipping`
- ❌ ERROR — это проблема, см. раздел "Восстановление после ошибки"

### Шаг 5: Проверьте результат применения

После каждой миграции выполните:

```sql
-- Проверьте последнюю запись в drizzle_migrations
SELECT id, name, hash, installed_on
FROM drizzle_migrations
ORDER BY installed_on DESC
LIMIT 1;

-- Проверьте структуру (если миграция добавляла таблицу)
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
ORDER BY table_name;

-- Проверьте индексы (если добавляли)
SELECT indexname, tablename
FROM pg_indexes
WHERE schemaname = 'public'
ORDER BY tablename, indexname;
```

### Шаг 6: Повторите процесс для следующей миграции

Вернитесь к шагу 3 для каждой новой миграции. **Применяйте их по одной, в строгом порядке.**

---

## 🔄 Повторная проверка идемпотентности (важно!)

После применения всех миграций выполните их **повторно на тестовой БД** (или на копии):

```bash
# На локальной машине
DATABASE_URL="postgresql://xlibris:password@localhost/xlibris_test" pnpm run db:migrate

# Или вручную через pgAdmin на test-базе
# (если test-база недоступна, пропустите этот шаг)
```

Цель: убедиться, что все миграции идемпотентны и не вызывают ошибок при повторном запуске.

---

## 📝 Логирование применения миграций

Создайте запись в операционном журнале:

```markdown
### Миграция от 2026-07-02 в 20:30 UTC

**Applied by:** ops-team  
**Database:** xlibris  
**Server:** CapRover (prod)

**Migrations applied:**
- 0060_add_payment_gateway.sql ✅
- 0061_add_user_preferences.sql ✅
- 0062_backfill_user_data.sql ✅

**Duration:** 4 min 32 sec  
**Status:** Success

**Verification:**
- SELECT COUNT(*) FROM users; → 15420 rows
- SELECT COUNT(*) FROM payment_methods; → 2134 rows
- Health check: ✅ OK

**Rollback plan:** Revert SQL-files via pgAdmin if needed (detailed in backup-20260702-203000.sql)
```

---

## 🛑 Восстановление после ошибки

### Сценарий 1: Миграция вызвала ERROR

**Симптомы:**
```
ERROR: column "xxx" already exists
```

**Действия:**

1. **Не паникуйте** — миграции используют `IF NOT EXISTS`, ошибка может быть ложной
2. Проверьте в pgAdmin:
   ```sql
   SELECT * FROM pg_attribute WHERE attname = 'xxx';
   ```
3. Если ошибка — откройте миграцию, найдите строку, которая вызвала ошибку
4. Удалите эту строку или проверьте, что она использует `IF NOT EXISTS`

**Если миграция критична:**
1. Откройте резервную копию БД
2. Восстановите её: `psql -d xlibris < backup-YYYYMMDD-HHMMSS.sql`
3. Исправьте миграцию и повторите

### Сценарий 2: Транзакция откатилась (ROLLBACK)

**Симптомы:**
```
ERROR: ... during transaction
[Transaction rolled back]
```

**Действия:**

1. Ошибка произошла в середине миграции — транзакция откатилась автоматически
2. Проверьте, что таблица вернулась в старое состояние:
   ```sql
   SELECT COUNT(*) FROM drizzle_migrations WHERE id = <last_id>;
   ```
3. Исправьте миграцию и повторите целиком

### Сценарий 3: Миграция зависит от другой

**Симптомы:**
```
ERROR: relation "some_table" does not exist
```

**Действия:**

1. Проверьте комментарии в миграции:
   ```sql
   -- ВАЖНО: Зависит от миграции 0059_security_settings.sql
   ```
2. Примените зависимую миграцию первой
3. Повторите эту миграцию

---

## 🔀 Greenfield развёртывание (чистая БД)

Если развёртываете VoxLibris впервые на чистую БД:

### Вариант 1: Быстрое применение всех миграций (скрипт)

На CapRover выполните подготовленный скрипт:

```bash
# Сценарий: из репозитория на dev-машине
docker cp migrations/ <caprover-container>:/app/

# На CapRover в контейнере
docker exec xlibris-postgres bash -c "
for file in /app/migrations/[0-9]*.sql; do
  echo 'Applying: \$(basename \$file)'
  psql -U xlibris -d xlibris -f \"\$file\" || exit 1
  sleep 1
done
"
```

### Вариант 2: Ручное применение (более безопасно)

1. Откройте pgAdmin
2. Выполните миграции в порядке: 0001, 0002, 0003, ... по одной
3. После каждого этапа проверяйте результат (см. Шаг 5)

**Время:** ~10-15 минут для 60+ миграций с проверками

---

## 🎯 Чек-лист перед миграцией

- [ ] Резервная копия БД готова
- [ ] Сервер здоров: `GET /api/health` возвращает OK
- [ ] Список миграций определён (Git ls + pgAdmin query)
- [ ] pgAdmin открыт и подключен к базе
- [ ] Операционный журнал открыт для логирования
- [ ] Тестовая БД подготовлена (если нужна повторная проверка)

## 🎯 Чек-лист после миграции

- [ ] Все миграции применены без ERROR
- [ ] `SELECT COUNT(*) FROM drizzle_migrations` показывает правильное число
- [ ] Проверка структуры: новые таблицы/столбцы видны
- [ ] Health check: `GET /api/health` всё ещё OK
- [ ] Данные в production не повреждены (выборочная проверка)
- [ ] Результат записан в операционный журнал

---

## 📚 Дополнительные ресурсы

- **Основной документ:** `docs/11-deployment/deployment-guide.md`
- **Правила миграций:** `AGENTS.md`, секция 4
- **Структура миграций:** `docs/06-database/migrations.md`
- **Резервная копия:** используйте `pg_dump` или CapRover backup
- **Откат данных:** `psql -d xlibris < backup.sql`

---

## ❓ FAQ

**Q: Можно ли применить несколько миграций сразу?**  
A: Технически да, но **не рекомендуется**. Применяйте по одной — так проще отследить, где возникла проблема.

**Q: Что делать, если миграция зависит от feature flag?**  
A: Миграция вставляет feature flag со значением `false`. Включите его в `settings` таблице после применения: `UPDATE settings SET value = 'true' WHERE key = 'feature.name'`.

**Q: Как откатить миграцию?**  
A: Откройте backup БД или вручную выполните обратные SQL операции. Drizzle не поддерживает автоматический откат. Комментарии в конце SQL-файла содержат примеры откатов.

**Q: Сколько времени занимает применение всех миграций?**  
A: На чистой БД: ~5-10 минут для 60+ миграций (без проверок). С проверками и логированием: ~20-30 минут.

**Q: Нужна ли остановка сервера?**  
A: Нет, сервер можно оставить запущенным. Миграции не блокируют запросы (за исключением добавления/удаления столбцов, но это редко).

---

## 🔗 Ссылки

- PostgreSQL `pg_dump` docs: https://www.postgresql.org/docs/current/app-pgdump.html
- CapRover backups: https://caprover.com/docs/backup.html
- pgAdmin query tool: https://www.pgadmin.org/docs/pgadmin4/latest/query_tool.html
