/**
 * KPI Calculator - Вычисление ключевых показателей эффективности VoxLibris
 */

import { db } from '../db.js';
import { 
  users, 
  books, 
  clubBooks,
  personalBooks,
  clubs, 
  clubMembers, 
  readingHistory,
  readingProgress,
  readingSessions,
  analyticsEvents 
} from '../../shared/schema.js';
import { sql, count, avg, sum, gte, eq, and, lte } from 'drizzle-orm';

export interface ProjectKPIs {
  // Пользовательские метрики
  totalUsers: number;
  activeUsers: number; // активны за выбранный период
  newUsersThisMonth: number;
  userRetention: number; // % пользователей, вернувшихся через неделю
  avgSessionDuration: number; // в минутах
  
  // Контентные метрики
  totalBooks: number;
  personalBooksCount: number;
  booksReadThisMonth: number;
  avgReadingProgress: number; // средний прогресс по всем книгам (0-100)
  completionRate: number; // % завершенных книг
  
  // Клубные метрики
  totalClubs: number;
  activeClubs: number; // с активностью за выбранный период
  avgClubSize: number;
  clubEngagement: number; // среднее количество событий на клуб
  
  // Бизнес метрики
  conversionRate: number; // % пользователей, которые начали читать
  readerUtilization: number; // % пользователей с активным чтением
  contentGrowth: number; // рост контента за месяц (%)
  
  // Метрики активности
  totalReadingSessions: number;
  totalReadingTime: number; // в часах
  avgBooksPerUser: number;
  avgChaptersPerBook: number;
}

/**
 * Класс для вычисления KPI метрик проекта
 */
export class KPICalculator {
  /**
   * Вычисляет все KPI метрики за указанный период
   * @param period - период в днях (по умолчанию 30)
   */
  async calculateKPIs(period: number = 30): Promise<ProjectKPIs> {
    const startDate = this.getPeriodStartDate(period);
    
    const [
      userMetrics,
      contentMetrics,
      clubMetrics,
      businessMetrics,
      activityMetrics
    ] = await Promise.all([
      this.calculateUserMetrics(startDate),
      this.calculateContentMetrics(startDate),
      this.calculateClubMetrics(startDate),
      this.calculateBusinessMetrics(startDate),
      this.calculateActivityMetrics(startDate)
    ]);

    return {
      ...userMetrics,
      ...contentMetrics,
      ...clubMetrics,
      ...businessMetrics,
      ...activityMetrics
    };
  }

  /**
   * Вычисление пользовательских метрик
   */
  private async calculateUserMetrics(startDate: Date) {
    // Общее количество пользователей
    const totalUsersResult = await db
      .select({ count: count() })
      .from(users)
      .where(sql`${users.status} != 'deleted'`);
    const totalUsers = totalUsersResult[0]?.count || 0;

    const activeUsersResult = await db.execute(sql<{ count: number }>`
      SELECT COUNT(DISTINCT user_id)::int AS count
      FROM (
        SELECT ${readingProgress.userId} AS user_id FROM ${readingProgress} WHERE ${readingProgress.lastReadAt} >= ${startDate.toISOString()}::timestamp
        UNION
        SELECT ${readingHistory.userId} AS user_id FROM ${readingHistory} WHERE ${readingHistory.completedAt} >= ${startDate.toISOString()}::timestamp
        UNION
        SELECT ${analyticsEvents.userId} AS user_id FROM ${analyticsEvents} WHERE ${analyticsEvents.createdAt} >= ${startDate.toISOString()}::timestamp AND ${analyticsEvents.userId} IS NOT NULL
        UNION
        SELECT ${readingSessions.readerId} AS user_id FROM ${readingSessions} WHERE ${readingSessions.startedAt} >= ${startDate.toISOString()}::timestamp
      ) active
    `);
    const activeUsers = Number(activeUsersResult[0]?.count) || 0;

    // Новые пользователи за выбранный период
    const newUsersResult = await db
      .select({ count: count() })
      .from(users)
      .where(and(gte(users.createdAt, startDate), sql`${users.status} != 'deleted'`));
    const newUsersThisMonth = newUsersResult[0]?.count || 0;

    const retentionRows = await db.execute(sql<{ cohort: number; returned: number }>`
      WITH cohort AS (
        SELECT ${users.id} AS user_id
        FROM ${users}
        WHERE ${users.createdAt} >= ${startDate.toISOString()}::timestamp
          AND ${users.createdAt} < (NOW() - INTERVAL '7 days')
          AND ${users.status} != 'deleted'
      ), returned AS (
        SELECT DISTINCT activity.user_id
        FROM (
          SELECT ${readingProgress.userId} AS user_id FROM ${readingProgress} WHERE ${readingProgress.lastReadAt} >= ${startDate.toISOString()}::timestamp
          UNION
          SELECT ${readingHistory.userId} AS user_id FROM ${readingHistory} WHERE ${readingHistory.completedAt} >= ${startDate.toISOString()}::timestamp
          UNION
          SELECT ${analyticsEvents.userId} AS user_id FROM ${analyticsEvents} WHERE ${analyticsEvents.createdAt} >= ${startDate.toISOString()}::timestamp AND ${analyticsEvents.userId} IS NOT NULL
        ) activity
        JOIN cohort ON cohort.user_id = activity.user_id
      )
      SELECT COUNT(cohort.user_id)::int AS cohort, COUNT(returned.user_id)::int AS returned
      FROM cohort
      LEFT JOIN returned ON returned.user_id = cohort.user_id
    `);
    const retention = retentionRows[0];
    const userRetention = retention && Number(retention.cohort) > 0
      ? Math.round((Number(retention.returned) / Number(retention.cohort)) * 100)
      : 0;

    // Средняя длительность сессии (из reading_session событий)
    const avgSessionResult = await db
      .select({ count: count(), totalDuration: sum(analyticsEvents.duration) })
      .from(analyticsEvents)
      .where(
        and(
          eq(analyticsEvents.eventType, 'reading_session'),
          gte(analyticsEvents.createdAt, startDate)
        )
      );
    
    const avgSessionDuration = avgSessionResult[0]?.count && avgSessionResult[0]?.count > 0
      ? Math.round(Number(avgSessionResult[0]?.totalDuration) / 60 / avgSessionResult[0]?.count)
      : 0;

    return {
      totalUsers,
      activeUsers,
      newUsersThisMonth,
      userRetention,
      avgSessionDuration
    };
  }

  /**
   * Вычисление контентных метрик
   */
  private async calculateContentMetrics(startDate: Date) {
    const [regularBooksResult, personalBooksResult, clubBooksResult] = await Promise.all([
      db.select({ count: count() }).from(books),
      db.select({ count: count() }).from(personalBooks),
      db.select({ count: count() }).from(clubBooks),
    ]);
    const regularBooksCount = regularBooksResult[0]?.count || 0;
    const personalBooksCount = personalBooksResult[0]?.count || 0;
    const clubBooksCount = clubBooksResult[0]?.count || 0;
    const totalBooks = regularBooksCount + personalBooksCount + clubBooksCount;

    // Уникальные активные чтения: пользователь+книга за выбранный период
    const booksReadResult = await db.execute(sql<{ count: number }>`
      SELECT COUNT(DISTINCT (user_id, book_id))::int AS count
      FROM (
        SELECT ${readingProgress.userId} AS user_id, ${readingProgress.bookId} AS book_id
        FROM ${readingProgress}
        WHERE ${readingProgress.lastReadAt} >= ${startDate.toISOString()}::timestamp
        UNION
        SELECT ${readingHistory.userId} AS user_id, ${readingHistory.bookId} AS book_id
        FROM ${readingHistory}
        WHERE ${readingHistory.completedAt} >= ${startDate.toISOString()}::timestamp
        UNION
        SELECT ${analyticsEvents.userId} AS user_id, ${analyticsEvents.bookId} AS book_id
        FROM ${analyticsEvents}
        WHERE ${analyticsEvents.eventType} IN ('book_open', 'reading_session', 'chapter_complete', 'book_complete')
          AND ${analyticsEvents.createdAt} >= ${startDate.toISOString()}::timestamp
          AND ${analyticsEvents.userId} IS NOT NULL
          AND ${analyticsEvents.bookId} IS NOT NULL
      ) reads
    `);
    const booksReadThisMonth = Number(booksReadResult[0]?.count) || 0;

    // Средний прогресс чтения
    const progressResult = await db
      .select({ avgProgress: avg(readingProgress.progress) })
      .from(readingProgress);
    const avgReadingProgress = Math.round(Number(progressResult[0]?.avgProgress) || 0);

    // Процент завершённых книг по уникальным парам пользователь+книга
    const completedBooksResult = await db.execute(sql<{ count: number }>`
      SELECT COUNT(DISTINCT (user_id, book_id))::int AS count
      FROM (
        SELECT ${readingHistory.userId} AS user_id, ${readingHistory.bookId} AS book_id
        FROM ${readingHistory}
        WHERE ${readingHistory.completedAt} >= ${startDate.toISOString()}::timestamp
        UNION
        SELECT ${readingProgress.userId} AS user_id, ${readingProgress.bookId} AS book_id
        FROM ${readingProgress}
        WHERE ${readingProgress.progress} >= 100
          AND ${readingProgress.updatedAt} >= ${startDate.toISOString()}::timestamp
        UNION
        SELECT ${analyticsEvents.userId} AS user_id, ${analyticsEvents.bookId} AS book_id
        FROM ${analyticsEvents}
        WHERE ${analyticsEvents.eventType} = 'book_complete'
          AND ${analyticsEvents.createdAt} >= ${startDate.toISOString()}::timestamp
          AND ${analyticsEvents.userId} IS NOT NULL
          AND ${analyticsEvents.bookId} IS NOT NULL
      ) completed
    `);
    const completedBooks = Number(completedBooksResult[0]?.count) || 0;

    const completionRate = booksReadThisMonth > 0
      ? Math.round((completedBooks / booksReadThisMonth) * 100)
      : 0;

    return {
      totalBooks,
      personalBooksCount,
      booksReadThisMonth,
      avgReadingProgress,
      completionRate
    };
  }

  /**
   * Вычисление клубных метрик
   */
  private async calculateClubMetrics(startDate: Date) {
    // Общее количество клубов
    const totalClubsResult = await db
      .select({ count: count() })
      .from(clubs);
    const totalClubs = totalClubsResult[0]?.count || 0;

    const activeClubsResult = await db.execute(sql<{ count: number }>`
      SELECT COUNT(DISTINCT club_id)::int AS count
      FROM (
        SELECT ${analyticsEvents.clubId} AS club_id FROM ${analyticsEvents} WHERE ${analyticsEvents.clubId} IS NOT NULL AND ${analyticsEvents.createdAt} >= ${startDate.toISOString()}::timestamp
        UNION
        SELECT ${clubMembers.clubId} AS club_id FROM ${clubMembers} WHERE ${clubMembers.joinedAt} >= ${startDate.toISOString()}::timestamp
        UNION
        SELECT ${readingSessions.clubId} AS club_id FROM ${readingSessions} WHERE ${readingSessions.startedAt} >= ${startDate.toISOString()}::timestamp
        UNION
        SELECT ${readingProgress.clubId} AS club_id FROM ${readingProgress} WHERE ${readingProgress.clubId} IS NOT NULL AND ${readingProgress.lastReadAt} >= ${startDate.toISOString()}::timestamp
      ) active_clubs
    `);
    const activeClubs = Number(activeClubsResult[0]?.count) || 0;

    // Средний размер клуба
    const clubSizeResult = await db
      .select({ avgSize: avg(sql<number>`(SELECT COUNT(*) FROM ${clubMembers} WHERE club_id = ${clubs.id} AND is_active = true)`) })
      .from(clubs);
    const avgClubSize = Math.round(Number(clubSizeResult[0]?.avgSize) || 0);

    const clubEventsResult = await db.execute(sql<{ count: number }>`
      SELECT COUNT(*)::int AS count
      FROM (
        SELECT ${analyticsEvents.clubId} AS club_id FROM ${analyticsEvents} WHERE ${analyticsEvents.clubId} IS NOT NULL AND ${analyticsEvents.createdAt} >= ${startDate.toISOString()}::timestamp
        UNION ALL
        SELECT ${clubMembers.clubId} AS club_id FROM ${clubMembers} WHERE ${clubMembers.joinedAt} >= ${startDate.toISOString()}::timestamp
        UNION ALL
        SELECT ${readingSessions.clubId} AS club_id FROM ${readingSessions} WHERE ${readingSessions.startedAt} >= ${startDate.toISOString()}::timestamp
        UNION ALL
        SELECT ${readingProgress.clubId} AS club_id FROM ${readingProgress} WHERE ${readingProgress.clubId} IS NOT NULL AND ${readingProgress.lastReadAt} >= ${startDate.toISOString()}::timestamp
      ) club_activity
    `);
    const totalClubEvents = Number(clubEventsResult[0]?.count) || 0;
    
    const clubEngagement = activeClubs > 0
      ? Math.round(totalClubEvents / activeClubs)
      : 0;

    return {
      totalClubs,
      activeClubs,
      avgClubSize,
      clubEngagement
    };
  }

  /**
   * Вычисление бизнес-метрик
   */
  private async calculateBusinessMetrics(startDate: Date) {
    const periodMs = Date.now() - startDate.getTime();
    const previousStartDate = new Date(startDate.getTime() - periodMs);

    // Общее количество пользователей
    const totalUsersResult = await db
      .select({ count: count() })
      .from(users)
      .where(sql`${users.status} != 'deleted'`);
    const totalUsers = totalUsersResult[0]?.count || 0;

    const readersResult = await db.execute(sql<{ count: number }>`
      SELECT COUNT(DISTINCT user_id)::int AS count
      FROM (
        SELECT ${readingProgress.userId} AS user_id FROM ${readingProgress}
        UNION
        SELECT ${readingHistory.userId} AS user_id FROM ${readingHistory}
        UNION
        SELECT ${analyticsEvents.userId} AS user_id FROM ${analyticsEvents} WHERE ${analyticsEvents.eventType} IN ('book_open', 'reading_session', 'chapter_complete', 'book_complete') AND ${analyticsEvents.userId} IS NOT NULL
      ) readers
    `);
    const readers = Number(readersResult[0]?.count) || 0;

    // Конверсия в читателей
    const conversionRate = totalUsers > 0
      ? Math.round((readers / totalUsers) * 100)
      : 0;

    const activeReadersResult = await db.execute(sql<{ count: number }>`
      SELECT COUNT(DISTINCT user_id)::int AS count
      FROM (
        SELECT ${readingProgress.userId} AS user_id FROM ${readingProgress} WHERE ${readingProgress.lastReadAt} >= ${startDate.toISOString()}::timestamp
        UNION
        SELECT ${readingHistory.userId} AS user_id FROM ${readingHistory} WHERE ${readingHistory.completedAt} >= ${startDate.toISOString()}::timestamp
        UNION
        SELECT ${analyticsEvents.userId} AS user_id FROM ${analyticsEvents} WHERE ${analyticsEvents.eventType} IN ('reading_session', 'chapter_complete', 'book_complete') AND ${analyticsEvents.createdAt} >= ${startDate.toISOString()}::timestamp AND ${analyticsEvents.userId} IS NOT NULL
      ) active_readers
    `);
    const activeReaders = Number(activeReadersResult[0]?.count) || 0;

    // Утилизация читателей
    const readerUtilization = readers > 0
      ? Math.round((activeReaders / readers) * 100)
      : 0;

    // Рост контента (сравнение за 30 и 60 дней)
    const booksLastMonthResult = await db
      .select({ count: count() })
      .from(books)
      .where(gte(books.createdAt, startDate));
    const booksLastMonth = booksLastMonthResult[0]?.count || 0;

    const booksPreviousMonthResult = await db
      .select({ count: count() })
      .from(books)
      .where(
        and(
          gte(books.createdAt, previousStartDate),
          lte(books.createdAt, startDate)
        )
      );
    const booksPreviousMonth = booksPreviousMonthResult[0]?.count || 0;

    const contentGrowth = booksPreviousMonth > 0
      ? Math.round(((booksLastMonth - booksPreviousMonth) / booksPreviousMonth) * 100)
      : 0;

    return {
      conversionRate,
      readerUtilization,
      contentGrowth
    };
  }

  /**
   * Вычисление метрик активности
   */
  private async calculateActivityMetrics(startDate: Date) {
    const sessionsResult = await db.execute(sql<{ count: number }>`
      SELECT COUNT(*)::int AS count
      FROM (
        SELECT ${analyticsEvents.id} AS id FROM ${analyticsEvents} WHERE ${analyticsEvents.eventType} = 'reading_session' AND ${analyticsEvents.createdAt} >= ${startDate.toISOString()}::timestamp
        UNION ALL
        SELECT ${readingSessions.id} AS id FROM ${readingSessions} WHERE ${readingSessions.startedAt} >= ${startDate.toISOString()}::timestamp
      ) sessions
    `);
    const totalReadingSessions = Number(sessionsResult[0]?.count) || 0;

    // Общее время чтения (в часах)
    const readingTimeResult = await db.execute(sql<{ total_minutes: number }>`
      SELECT (
        COALESCE((
          SELECT SUM(${analyticsEvents.duration}) / 60.0
          FROM ${analyticsEvents}
          WHERE ${analyticsEvents.eventType} = 'reading_session'
            AND ${analyticsEvents.createdAt} >= ${startDate.toISOString()}::timestamp
        ), 0) + COALESCE((
          SELECT SUM(${readingHistory.readingTimeMinutes})
          FROM ${readingHistory}
          WHERE ${readingHistory.completedAt} >= ${startDate.toISOString()}::timestamp
        ), 0)
      )::int AS total_minutes
    `);
    const totalReadingTime = Math.round(
      (Number(readingTimeResult[0]?.total_minutes) || 0) / 60
    );

    // Среднее количество книг на пользователя
    const totalUsersResult = await db
      .select({ count: count() })
      .from(users)
      .where(sql`${users.status} != 'deleted'`);
    const totalUsers = totalUsersResult[0]?.count || 0;

    const totalBooksResult = await db.execute(sql<{ count: number }>`
      SELECT (
        (SELECT COUNT(*) FROM ${books}) +
        (SELECT COUNT(*) FROM ${personalBooks}) +
        (SELECT COUNT(*) FROM ${clubBooks})
      )::int AS count
    `);
    const totalBooks = Number(totalBooksResult[0]?.count) || 0;

    const avgBooksPerUser = totalUsers > 0
      ? Math.round((totalBooks / totalUsers) * 10) / 10
      : 0;

    const avgChaptersResult = await db.execute(sql<{ avg_chapters: number }>`
      SELECT AVG(max_chapter)::numeric AS avg_chapters
      FROM (
        SELECT ${readingProgress.bookId} AS book_id, MAX(${readingProgress.currentChapter}) AS max_chapter
        FROM ${readingProgress}
        GROUP BY ${readingProgress.bookId}
      ) chapters
    `);
    const avgChaptersPerBook = Math.round(Number(avgChaptersResult[0]?.avg_chapters) || 0);

    return {
      totalReadingSessions,
      totalReadingTime,
      avgBooksPerUser,
      avgChaptersPerBook
    };
  }

  /**
   * Получить дату начала периода
   */
  private getPeriodStartDate(days: number): Date {
    const date = new Date();
    date.setDate(date.getDate() - days);
    return date;
  }
}

// Экспортируем синглтон
export const kpiCalculator = new KPICalculator();
