# VoxLibris Push Notifications

**Статус:** Current  
**Дата обновления:** 2026-07-04  
**Версия:** 1.0

## Содержание

1. [Обзор](#обзор)
2. [Архитектура](#архитектура)
3. [Типы уведомлений](#типы-уведомлений)
4. [Настройки](#настройки)
5. [API](#api)
6. [Конфигурация](#конфигурация)
7. [Ограничения](#ограничения)

## Обзор

Система push-уведомлений VoxLibris использует Web Push API для отправки браузерных уведомлений пользователям.

## Архитектура

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   Браузер       │◄────│  Push Service   │◄────│   События       │
│  (Service Worker)│     │  (Web Push API) │     │   (Server)      │
└─────────────────┘     └─────────────────┘     └─────────────────┘
```

### Компоненты

| Компонент | Файл | Описание |
|-----------|------|----------|
| PushService | `server/services/push-service.ts` | Серверный сервис отправки |
| Service Worker | `client/public/sw.js` | Клиентский обработчик |
| Settings | `shared/schema.ts` | Настройки пользователя |

## Типы уведомлений

| Тип | Описание | Триггер |
|-----|----------|---------|
| `session_started` | Начало сессии чтения | Чтец начал эфир |
| `session_reminder` | Напоминание о сессии | Запланированная сессия |
| `club_discussion` | Новое обсуждение в клубе | Новое сообщение |
| `mention_in_chat` | Упоминание в чате | @username |
| `dm_received` | Новое личное сообщение | Получено DM |
| `club_moderation` | Модерация клуба | Действие модератора |
| `new_follower` | Новый подписчик | Подписка на пользователя |
| `streak_reminder` | Напоминание о streak | Неактивность |
| `achievement_unlocked` | Новое достижение | Получено достижение |
| `test` | Тестовое уведомление | Ручная отправка |

## Настройки

### Пользовательские настройки

| Настройка | Описание | По умолчанию |
|-----------|----------|--------------|
| `pushEnabled` | Включены ли push | false |
| `sessionStarted` | Уведомления о сессиях | true |
| `sessionReminder` | Напоминания о сессиях | true |
| `clubDiscussion` | Обсуждения клубов | true |
| `mentionInChat` | Упоминания | true |
| `dmReceived` | Личные сообщения | true |
| `newFollower` | Новые подписчики | true |
| `streakReminder` | Напоминания streak | true |
| `achievementUnlocked` | Достижения | true |
| `quietHoursEnabled` | Тихие часы | false |
| `quietHoursStart` | Начало тихих часов | 23 |
| `quietHoursEnd` | Конец тихих часов | 8 |

## API

### Подписка на push

```http
POST /api/push/subscribe
Authorization: Bearer {token}
Content-Type: application/json

{
  "endpoint": "https://fcm.googleapis.com/...",
  "keys": {
    "auth": "base64auth",
    "p256dh": "base64p256dh"
  },
  "deviceName": "Chrome на Windows"
}
```

### Отписка

```http
DELETE /api/push/subscribe
Authorization: Bearer {token}
```

### Получение настроек

```http
GET /api/push/settings
Authorization: Bearer {token}
```

### Обновление настроек

```http
PUT /api/push/settings
Authorization: Bearer {token}
Content-Type: application/json

{
  "sessionStarted": false,
  "quietHoursEnabled": true
}
```

### Отправка тестового уведомления

```http
POST /api/push/test
Authorization: Bearer {token}
```

## Конфигурация

### Переменные окружения

```bash
# VAPID ключи для Web Push
VAPID_PUBLIC_KEY=your_public_key
VAPID_PRIVATE_KEY=your_private_key
VAPID_EMAIL=admin@example.com
```

### Генерация VAPID ключей

```bash
# Установка web-push
npm install -g web-push

# Генерация ключей
web-push generate-vapid-keys
```

## Ограничения

### Лимиты

| Ограничение | Значение | Описание |
|-------------|----------|----------|
| Daily limit | 3 | Максимум уведомлений в день |
| Quiet hours | 23:00 - 08:00 | Тихие часы по умолчанию |
| TTL | 3600 сек | Время жизни уведомления |

### Обработка ошибок

| Код | Действие |
|-----|----------|
| 404 | Подписка удалена, деактивировать |
| 410 | Подписка устарела, деактивировать |
| Другие | Логировать, продолжить |

## Таблицы базы данных

```sql
-- Подписки
push_subscriptions (
  id uuid PRIMARY KEY,
  user_id uuid REFERENCES users(id),
  endpoint text NOT NULL,
  auth text NOT NULL,
  p256dh text NOT NULL,
  user_agent text,
  device_name text,
  is_active boolean DEFAULT true,
  last_used_at timestamp,
  created_at timestamp DEFAULT now()
);

-- Настройки
push_notification_settings (
  user_id uuid PRIMARY KEY REFERENCES users(id),
  push_enabled boolean DEFAULT false,
  session_started boolean DEFAULT true,
  session_reminder boolean DEFAULT true,
  club_discussion boolean DEFAULT true,
  mention_in_chat boolean DEFAULT true,
  dm_received boolean DEFAULT true,
  new_follower boolean DEFAULT true,
  streak_reminder boolean DEFAULT true,
  achievement_unlocked boolean DEFAULT true,
  quiet_hours_enabled boolean DEFAULT false,
  quiet_hours_start integer DEFAULT 23,
  quiet_hours_end integer DEFAULT 8,
  updated_at timestamp DEFAULT now()
);

-- Лог
push_notification_log (
  id uuid PRIMARY KEY,
  user_id uuid REFERENCES users(id),
  type text NOT NULL,
  title text NOT NULL,
  body text NOT NULL,
  url text,
  sent_at timestamp DEFAULT now()
);
```

## Связанная документация

- [API Reference](API_REFERENCE.md) — эндпоинты push-уведомлений
- [Админ-руководство](12-admin-manual/README.md) — настройка VAPID