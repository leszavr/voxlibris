# Эксплуатация через xlibris-manager.sh

`xlibris-manager.sh` — основной интерфейс управления VoxLibris в локальном Docker Compose/dev окружении.

## Команды manager

| Команда | Назначение |
|---|---|
| `start` | Запуск Docker-сервисов, storage init, backend, frontend |
| `restart` | Остановка и полный повторный запуск |
| `stop` | Остановка приложения и Docker-сервисов |
| `status` | Статус Docker-сервисов, приложений и портов |
| `services` | Запуск только Docker-инфраструктуры |
| `icecast` | Запуск только Icecast |
| `check` | TypeScript check через `pnpm run check` |
| `build` | Сборка проекта через `pnpm run build` |
| `logs` | Логи manager |
| `clean` | Очистка логов manager |

## Полный запуск

```bash
bash ../xlibris-manager.sh start
```

Что происходит внутри:

1. проверка `docker` и `pnpm`;
2. проверка `.env`;
3. освобождение портов проекта;
4. `docker compose up -d postgres minio redis`;
5. запуск `icecast`;
6. `pnpm run init-storage`;
7. запуск backend через `pnpm run dev:server`;
8. ожидание порта `5000`;
9. запуск frontend через `pnpm run dev:client`.

## Перезапуск

```bash
bash ../xlibris-manager.sh restart
```

Использовать после изменения `.env`, миграций, зависимостей или если сервисы зависли.

## Статус

```bash
bash ../xlibris-manager.sh status
```

Показывает:

- Docker service status;
- backend/frontend/Icecast/YooKassa emulator;
- `docker compose ps`;
- основные порты.

## Запуск только инфраструктуры

```bash
bash ../xlibris-manager.sh services
```

Полезно перед ручными миграциями или диагностикой БД.

## Проверки качества через manager

```bash
bash ../xlibris-manager.sh check
bash ../xlibris-manager.sh build
```

## Логи manager

```bash
bash ../xlibris-manager.sh logs
bash ../xlibris-manager.sh clean
```

## Резервная диагностика напрямую

Использовать только если manager не стартует или нужно проверить конкретный слой:

```bash
docker compose ps
docker compose logs -f postgres
docker compose logs -f redis
docker compose logs -f minio
docker compose logs -f icecast
pnpm run check
pnpm run build
```

## Проверка PostgreSQL напрямую

```bash
docker exec xlibris-postgres psql -U xlibris -d xlibris -c "SELECT now();"
```

## Проверка Redis напрямую

```bash
docker exec xlibris-redis redis-cli -a redis_dev ping
```
