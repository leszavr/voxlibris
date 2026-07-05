# Quickstart: VoxLibris на чистой Ubuntu 24.04

Основной управляющий инструмент проекта — `xlibris-manager.sh`. Низкоуровневые `docker compose` и `pnpm` команды нужны только для диагностики или ручного восстановления.

## 1. Установить базовые пакеты

```bash
sudo apt-get update
sudo apt-get install -y git curl ca-certificates openssl
```

## 2. Клонировать проект

```bash
mkdir -p ~/DEV
cd ~/DEV
git clone https://github.com/leszav/voxlibris.git
cd voxlibris
```

## 3. Выполнить первичный деплой

```bash
bash 11-deployment/scripts/deploy.sh all
```

Скрипт устанавливает Node.js `>=22`, активирует `pnpm@9.0.0`, ставит Docker Engine + Compose v2, генерирует `.env`, устанавливает зависимости, поднимает Docker-инфраструктуру и применяет миграции.

## 4. Управлять проектом через `xlibris-manager.sh`

Полный запуск:

```bash
bash ../xlibris-manager.sh start
```

Перезапуск:

```bash
bash ../xlibris-manager.sh restart
```

Статус:

```bash
bash ../xlibris-manager.sh status
```

Остановка:

```bash
bash ../xlibris-manager.sh stop
```

Проверка типов:

```bash
bash ../xlibris-manager.sh check
```

Сборка:

```bash
bash ../xlibris-manager.sh build
```

## 5. Создать суперадмина

```bash
bash 11-deployment/scripts/create-superadmin.sh
```

## 6. Проверить вход

Открыть:

```text
http://localhost:3000
```

Войти по email/паролю созданного администратора.

## Резервные низкоуровневые команды

Использовать только если нужно диагностировать manager:

```bash
docker compose ps
pnpm run check
pnpm run build
```
