# VoxLibris Аналитика и KPI

**Статус:** Current  
**Дата обновления:** 2026-07-04  
**Версия:** 1.0

## Содержание

1. [Обзор](#обзор)
2. [KPI Calculator](#kpi-calculator)
3. [Метрики](#метрики)
4. [API Endpoints](#api-endpoints)
5. [Таблицы базы данных](#таблицы-базы-данных)

## Обзор

Система аналитики VoxLibris собирает и агрегирует ключевые показатели эффективности (KPI) проекта. Данные используются для мониторинга здоровья платформы и принятия решений.

## KPI Calculator

### Назначение

Вычисление ключевых метрик проекта за указанный период.

**Файл:** `server/analytics/kpi-calculator.ts`

### Архитектура

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   База данных   │────▶│  KPICalculator  │────▶│   API / Admin   │
│  (PostgreSQL)   │     │  (Агрегация)    │     │   (Визуализация)│
└─────────────────┘     └─────────────────┘     └─────────────────┘
```

### Использование

```typescript
import { kpiCalculator } from './analytics/kpi-calculator.js';

// Вычислить KPI за 30 дней
const kpis = await kpiCalculator.calculateKPIs(30);

// Вычислить KPI за 7 дней
const weeklyKpis = await kpiCalculator.calculateKPIs(7);
```

## Метрики

### Пользовательские метрики

| Метрика | Описание | Единица |
|---------|----------|---------|
| `totalUsers` | Общее количество пользователей | шт. |
| `activeUsers` | Активные пользователи за период | шт. |
| `newUsersThisMonth` | Новые пользователи за период | шт. |
| `userRetention` | Возврат пользователей через 7 дней | % |
| `avgSessionDuration` | Средняя длительность сессии | мин. |

### Контентные метрики

| Метрика | Описание | Единица |
|---------|----------|---------|
| `totalBooks` | Общее количество книг | шт. |
| `personalBooksCount` | Личные книги пользователей | шт. |
| `booksReadThisMonth` | Прочитанные книги за период | шт. |
| `avgReadingProgress` | Средний прогресс чтения | % |
| `completionRate` | Процент завершённых книг | % |

### Клубные метрики

| Метрика | Описание | Единица |
|---------|----------|---------|
| `totalClubs` | Общее количество клубов | шт. |
| `activeClubs` | Активные клубы за период | шт. |
| `avgClubSize` | Средний размер клуба | шт. |
| `clubEngagement` | Среднее количество событий на клуб | шт. |

### Бизнес-метрики

| Метрика | Описание | Единица |
|---------|----------|---------|
| `conversionRate` | Конверсия в читателей | % |
| `readerUtilization` | Утилизация читателей | % |
| `contentGrowth` | Рост контента за период | % |

### Метрики активности

| Метрика | Описание | Единица |
|---------|----------|---------|
| `totalReadingSessions` | Всего сессий чтения | шт. |
| `totalReadingTime` | Общее время чтения | ч. |
| `avgBooksPerUser` | Среднее количество книг на пользователя | шт. |
| `avgChaptersPerBook` | Среднее количество глав на книгу | шт. |

## API Endpoints

### Аналитика

| Метод | Путь | Описание |
|-------|------|----------|
| GET | `/api/analytics/kpis` | KPI метрики за период |
| GET | `/api/analytics/events` | События аналитики |
| POST | `/api/analytics/events` | Записать событие |

### Параметры запроса

```http
GET /api/analytics/kpis?period=30
Authorization: Bearer {token}
```

**Response:**
```json
{
  "totalUsers": 1250,
  "activeUsers": 340,
  "newUsersThisMonth": 45,
  "userRetention": 65,
  "avgSessionDuration": 23,
  "totalBooks": 520,
  "personalBooksCount": 180,
  "booksReadThisMonth": 89,
  "avgReadingProgress": 45,
  "completionRate": 12,
  "totalClubs": 25,
  "activeClubs": 18,
  "avgClubSize": 12,
  "clubEngagement": 45,
  "conversionRate": 78,
  "readerUtilization": 45,
  "contentGrowth": 15,
  "totalReadingSessions": 1200,
  "totalReadingTime": 450,
  "avgBooksPerUser": 2.3,
  "avgChaptersPerBook": 8
}
```

## Таблицы базы данных

```sql
-- События аналитики
analytics_events (
  id uuid PRIMARY KEY,
  user_id uuid REFERENCES users(id),
  book_id uuid REFERENCES books(id),
  club_id uuid REFERENCES clubs(id),
  event_type text NOT NULL,
  duration integer,
  metadata jsonb,
  created_at timestamp DEFAULT now()
);

-- Индексы для агрегации
CREATE INDEX idx_analytics_events_user ON analytics_events(user_id, created_at);
CREATE INDEX idx_analytics_events_type ON analytics_events(event_type, created_at);
CREATE INDEX idx_analytics_events_club ON analytics_events(club_id, created_at);
```

## Мониторинг

### Алерты

- Падение retention ниже 50%
- Снижение активности пользователей
- Рост количества ошибок
- Проблемы с производительностью

### Дашборд

Административный дашборд доступен по пути `/admin/analytics`.