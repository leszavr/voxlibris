import { Router, type Request, type Response } from 'express';
import { db } from '../../db.js';
import { analyticsEvents, books, users, personalBooks, clubBooks, clubs, clubMembers } from '../../../shared/schema.js';
import { jwtAuth, requireAdmin } from '../../jwt-middleware.js';
import { eq, sql, and, gte, desc, count, inArray } from 'drizzle-orm';

const router = Router();
const CLUB_ANALYTICS_EVENT_TYPES = ['club_join', 'club_leave', 'reading_session'] as const;

router.get('/club/:clubId', jwtAuth, requireAdmin, async (req: Request, res: Response) => {
  try {
    const { clubId } = req.params;
    const { period = '30d' } = req.query;

    // Вычисляем дату начала периода
    let startDate = new Date();
    if (period === '7d') {
      startDate.setDate(startDate.getDate() - 7);
    } else if (period === '30d') {
      startDate.setDate(startDate.getDate() - 30);
    } else if (period === '90d') {
      startDate.setDate(startDate.getDate() - 90);
    } else if (period === 'all') {
      startDate = new Date('2020-01-01');
    }

    const [clubInfo] = await db
      .select({
        id: clubs.id,
        title: clubs.title,
      })
      .from(clubs)
      .where(eq(clubs.id, clubId))
      .limit(1);

    if (!clubInfo) {
      return res.status(404).json({ error: 'Club not found' });
    }

    const [eventsSummary] = await db
      .select({
        totalEvents: count(),
        joinEvents: sql<number>`COUNT(*) FILTER (WHERE ${analyticsEvents.eventType} = 'club_join')::int`,
        leaveEvents: sql<number>`COUNT(*) FILTER (WHERE ${analyticsEvents.eventType} = 'club_leave')::int`,
        totalSessions: sql<number>`COUNT(*) FILTER (WHERE ${analyticsEvents.eventType} = 'reading_session')::int`,
        lastActivityAt: sql<Date | null>`MAX(${analyticsEvents.createdAt})`,
      })
      .from(analyticsEvents)
      .where(
        and(
          eq(analyticsEvents.clubId, clubId),
          gte(analyticsEvents.createdAt, startDate),
          inArray(analyticsEvents.eventType, CLUB_ANALYTICS_EVENT_TYPES)
        )
      );

    const [activeMembersResult] = await db
      .select({ count: count() })
      .from(clubMembers)
      .where(
        and(
          eq(clubMembers.clubId, clubId),
          eq(clubMembers.isActive, true)
        )
      );

    const eventsTrend = await db
      .select({
        date: sql<string>`DATE(${analyticsEvents.createdAt})`,
        count: count(),
      })
      .from(analyticsEvents)
      .where(
        and(
          eq(analyticsEvents.clubId, clubId),
          gte(analyticsEvents.createdAt, startDate),
          inArray(analyticsEvents.eventType, CLUB_ANALYTICS_EVENT_TYPES)
        )
      )
      .groupBy(sql`DATE(${analyticsEvents.createdAt})`)
      .orderBy(sql`DATE(${analyticsEvents.createdAt})`);

    const eventsByTypeRaw = await db
      .select({
        eventType: analyticsEvents.eventType,
        count: count(),
      })
      .from(analyticsEvents)
      .where(
        and(
          eq(analyticsEvents.clubId, clubId),
          gte(analyticsEvents.createdAt, startDate),
          inArray(analyticsEvents.eventType, CLUB_ANALYTICS_EVENT_TYPES)
        )
      )
      .groupBy(analyticsEvents.eventType)
      .orderBy(desc(count()));

    const eventsByType = eventsByTypeRaw.map((item) => ({
      eventType: item.eventType,
      count: Number(item.count) || 0,
    }));

    const recentEvents = await db
      .select({
        id: analyticsEvents.id,
        eventType: analyticsEvents.eventType,
        createdAt: analyticsEvents.createdAt,
        username: users.username,
        bookTitle: sql<string | null>`COALESCE(${personalBooks.title}, ${clubBooks.title}, ${books.title})`,
      })
      .from(analyticsEvents)
      .leftJoin(users, eq(analyticsEvents.userId, users.id))
      .leftJoin(books, eq(analyticsEvents.bookId, books.id))
      .leftJoin(personalBooks, eq(analyticsEvents.bookId, personalBooks.id))
      .leftJoin(clubBooks, eq(analyticsEvents.bookId, clubBooks.id))
      .where(
        and(
          eq(analyticsEvents.clubId, clubId),
          gte(analyticsEvents.createdAt, startDate),
          inArray(analyticsEvents.eventType, CLUB_ANALYTICS_EVENT_TYPES)
        )
      )
      .orderBy(desc(analyticsEvents.createdAt))
      .limit(30);

    res.json({
      clubId,
      clubTitle: clubInfo.title,
      period,
      totalEvents: Number(eventsSummary?.totalEvents) || 0,
      joinEvents: Number(eventsSummary?.joinEvents) || 0,
      leaveEvents: Number(eventsSummary?.leaveEvents) || 0,
      totalSessions: Number(eventsSummary?.totalSessions) || 0,
      activeMembers: Number(activeMembersResult?.count) || 0,
      lastActivityAt: eventsSummary?.lastActivityAt ? new Date(eventsSummary.lastActivityAt).toISOString() : null,
      eventsTrend,
      eventsByType,
      recentEvents,
    });
  } catch (error) {
    console.error('[Analytics] Error fetching club stats:', error);
    res.status(500).json({ error: 'Failed to fetch club analytics' });
  }
});

/**
 * GET /api/v1/analytics/user/:userId
 * Детальная аналитика по пользователю (для админов)
 */
router.get('/user/:userId', jwtAuth, requireAdmin, async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;
    const { period = '30d' } = req.query;

    // Вычисляем дату начала периода
    let startDate = new Date();
    if (period === '7d') {
      startDate.setDate(startDate.getDate() - 7);
    } else if (period === '30d') {
      startDate.setDate(startDate.getDate() - 30);
    } else if (period === '90d') {
      startDate.setDate(startDate.getDate() - 90);
    } else if (period === 'all') {
      startDate = new Date('2020-01-01');
    }

    const [userInfo] = await db
      .select({
        id: users.id,
        username: users.username,
      })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    if (!userInfo) {
      return res.status(404).json({ error: 'User not found' });
    }

    const [totalBooksStartedResult] = await db
      .select({ count: sql<number>`COUNT(DISTINCT ${analyticsEvents.bookId})` })
      .from(analyticsEvents)
      .where(
        and(
          eq(analyticsEvents.userId, userId),
          gte(analyticsEvents.createdAt, startDate),
          eq(analyticsEvents.eventType, 'book_open'),
          sql`${analyticsEvents.bookId} IS NOT NULL`
        )
      );

    const [totalBooksCompletedResult] = await db
      .select({ count: sql<number>`COUNT(DISTINCT ${analyticsEvents.bookId})` })
      .from(analyticsEvents)
      .where(
        and(
          eq(analyticsEvents.userId, userId),
          gte(analyticsEvents.createdAt, startDate),
          eq(analyticsEvents.eventType, 'book_complete'),
          sql`${analyticsEvents.bookId} IS NOT NULL`
        )
      );

    const [readingStatsResult] = await db
      .select({
        totalDuration: sql<number>`COALESCE(SUM(${analyticsEvents.duration}), 0)`,
        avgDuration: sql<number>`AVG(${analyticsEvents.duration})`,
      })
      .from(analyticsEvents)
      .where(
        and(
          eq(analyticsEvents.userId, userId),
          gte(analyticsEvents.createdAt, startDate),
          eq(analyticsEvents.eventType, 'reading_session')
        )
      );

    const booksRaw = await db
      .select({
        bookId: analyticsEvents.bookId,
        title: sql<string>`COALESCE(${personalBooks.title}, ${clubBooks.title}, ${books.title}, 'Неизвестная книга')`,
        author: sql<string | null>`COALESCE(${personalBooks.author}, ${clubBooks.author}, ${books.author})`,
        events: count(),
        maxProgress: sql<number | null>`MAX(${analyticsEvents.progress})`,
        started: sql<boolean>`BOOL_OR(${analyticsEvents.eventType} = 'book_open')`,
        completed: sql<boolean>`BOOL_OR(${analyticsEvents.eventType} = 'book_complete')`,
        lastActivityAt: sql<Date | null>`MAX(${analyticsEvents.createdAt})`,
      })
      .from(analyticsEvents)
      .leftJoin(books, eq(analyticsEvents.bookId, books.id))
      .leftJoin(personalBooks, eq(analyticsEvents.bookId, personalBooks.id))
      .leftJoin(clubBooks, eq(analyticsEvents.bookId, clubBooks.id))
      .where(
        and(
          eq(analyticsEvents.userId, userId),
          gte(analyticsEvents.createdAt, startDate),
          sql`${analyticsEvents.bookId} IS NOT NULL`
        )
      )
      .groupBy(
        analyticsEvents.bookId,
        personalBooks.title,
        personalBooks.author,
        clubBooks.title,
        clubBooks.author,
        books.title,
        books.author
      )
      .orderBy(desc(sql`MAX(${analyticsEvents.createdAt})`))
      .limit(100);

    const userBooks = booksRaw
      .filter((item) => Boolean(item.bookId))
      .map((item) => {
        const completed = Boolean(item.completed);
        const maxProgress = Math.max(0, Math.min(100, Number(item.maxProgress) || 0));
        const progress = completed ? 100 : maxProgress;

        return {
          bookId: item.bookId as string,
          title: item.title,
          author: item.author || undefined,
          progress,
          events: Number(item.events) || 0,
          started: Boolean(item.started),
          completed,
          lastActivityAt: item.lastActivityAt ? new Date(item.lastActivityAt).toISOString() : null,
        };
      });

    const userClubsRaw = await db
      .select({
        clubId: clubMembers.clubId,
        clubTitle: clubs.title,
        role: clubMembers.role,
      })
      .from(clubMembers)
      .innerJoin(clubs, eq(clubMembers.clubId, clubs.id))
      .where(
        and(
          eq(clubMembers.userId, userId),
          eq(clubMembers.isActive, true)
        )
      );

    const userClubActivityRaw = await db
      .select({
        clubId: analyticsEvents.clubId,
        events: count(),
        lastActivityAt: sql<Date | null>`MAX(${analyticsEvents.createdAt})`,
      })
      .from(analyticsEvents)
      .where(
        and(
          eq(analyticsEvents.userId, userId),
          gte(analyticsEvents.createdAt, startDate),
          sql`${analyticsEvents.clubId} IS NOT NULL`
        )
      )
      .groupBy(analyticsEvents.clubId);

    const clubActivityMap = new Map(
      userClubActivityRaw
        .filter((item) => Boolean(item.clubId))
        .map((item) => [
          item.clubId as string,
          {
            events: Number(item.events) || 0,
            lastActivityAt: item.lastActivityAt ? new Date(item.lastActivityAt).toISOString() : null,
          },
        ])
    );

    const clubsList = userClubsRaw
      .map((club) => {
        const activity = clubActivityMap.get(club.clubId);
        return {
          clubId: club.clubId,
          clubTitle: club.clubTitle,
          role: club.role,
          events: activity?.events || 0,
          lastActivityAt: activity?.lastActivityAt || null,
        };
      })
      .sort((a, b) => b.events - a.events || a.clubTitle.localeCompare(b.clubTitle, 'ru'));

    const activityTrend = await db
      .select({
        date: sql<string>`DATE(${analyticsEvents.createdAt})`,
        events: count(),
      })
      .from(analyticsEvents)
      .where(
        and(
          eq(analyticsEvents.userId, userId),
          gte(analyticsEvents.createdAt, startDate)
        )
      )
      .groupBy(sql`DATE(${analyticsEvents.createdAt})`)
      .orderBy(sql`DATE(${analyticsEvents.createdAt})`);

    const eventsByTypeRaw = await db
      .select({
        eventType: analyticsEvents.eventType,
        count: count(),
      })
      .from(analyticsEvents)
      .where(
        and(
          eq(analyticsEvents.userId, userId),
          gte(analyticsEvents.createdAt, startDate)
        )
      )
      .groupBy(analyticsEvents.eventType)
      .orderBy(desc(count()));

    const eventsByType = eventsByTypeRaw.map((item) => ({
      eventType: item.eventType,
      count: Number(item.count) || 0,
    }));

    const recentEvents = await db
      .select({
        id: analyticsEvents.id,
        eventType: analyticsEvents.eventType,
        createdAt: analyticsEvents.createdAt,
        bookTitle: sql<string | null>`COALESCE(${personalBooks.title}, ${clubBooks.title}, ${books.title})`,
        clubTitle: clubs.title,
      })
      .from(analyticsEvents)
      .leftJoin(books, eq(analyticsEvents.bookId, books.id))
      .leftJoin(personalBooks, eq(analyticsEvents.bookId, personalBooks.id))
      .leftJoin(clubBooks, eq(analyticsEvents.bookId, clubBooks.id))
      .leftJoin(clubs, eq(analyticsEvents.clubId, clubs.id))
      .where(
        and(
          eq(analyticsEvents.userId, userId),
          gte(analyticsEvents.createdAt, startDate)
        )
      )
      .orderBy(desc(analyticsEvents.createdAt))
      .limit(40);

    const totalReadingTimeSeconds = Number(readingStatsResult?.totalDuration) || 0;

    res.json({
      userId: userInfo.id,
      username: userInfo.username,
      period,
      totalBooksStarted: Number(totalBooksStartedResult?.count) || 0,
      totalBooksCompleted: Number(totalBooksCompletedResult?.count) || 0,
      totalReadingTime: Math.round(totalReadingTimeSeconds / 60), // минуты
      avgSessionDuration: Math.round(Number(readingStatsResult?.avgDuration) || 0),
      books: userBooks,
      clubs: clubsList,
      activityTrend,
      eventsByType,
      recentEvents: recentEvents.map((event) => ({
        ...event,
        createdAt: new Date(event.createdAt).toISOString(),
      })),
    });
  } catch (error) {
    console.error('[Analytics] Error fetching user stats:', error);
    res.status(500).json({ error: 'Failed to fetch user analytics' });
  }
});

/**
 * GET /api/v1/analytics/book/:bookId
 * Получение статистики по конкретной книге (для админов)
 */
router.get('/book/:bookId', jwtAuth, requireAdmin, async (req: Request, res: Response) => {
  try {
    const { bookId } = req.params;
    const { period = '30d' } = req.query;

    // Вычисляем дату начала периода
    let startDate = new Date();
    if (period === '7d') {
      startDate.setDate(startDate.getDate() - 7);
    } else if (period === '30d') {
      startDate.setDate(startDate.getDate() - 30);
    } else if (period === '90d') {
      startDate.setDate(startDate.getDate() - 90);
    } else if (period === 'all') {
      startDate = new Date('2020-01-01');
    }

    // Общее количество открытий
    const [openCount] = await db
      .select({ count: count() })
      .from(analyticsEvents)
      .where(
        and(
          eq(analyticsEvents.bookId, bookId),
          eq(analyticsEvents.eventType, 'book_open'),
          gte(analyticsEvents.createdAt, startDate)
        )
      );

    // Количество завершений
    const [completeCount] = await db
      .select({ count: count() })
      .from(analyticsEvents)
      .where(
        and(
          eq(analyticsEvents.bookId, bookId),
          eq(analyticsEvents.eventType, 'book_complete'),
          gte(analyticsEvents.createdAt, startDate)
        )
      );

    // Уникальные читатели
    const [uniqueReaders] = await db
      .select({ count: sql<number>`COUNT(DISTINCT ${analyticsEvents.userId})` })
      .from(analyticsEvents)
      .where(
        and(
          eq(analyticsEvents.bookId, bookId),
          eq(analyticsEvents.eventType, 'book_open'),
          gte(analyticsEvents.createdAt, startDate)
        )
      );

    // Среднее время чтения
    const [avgTime] = await db
      .select({
        avgDuration: sql<number>`AVG(${analyticsEvents.duration})`,
      })
      .from(analyticsEvents)
      .where(
        and(
          eq(analyticsEvents.bookId, bookId),
          eq(analyticsEvents.eventType, 'reading_session'),
          gte(analyticsEvents.createdAt, startDate)
        )
      );

    // Средний прогресс
    const [avgProgress] = await db
      .select({
        avgProgress: sql<number>`AVG(${analyticsEvents.progress})`,
      })
      .from(analyticsEvents)
      .where(
        and(
          eq(analyticsEvents.bookId, bookId),
          eq(analyticsEvents.eventType, 'book_complete'),
          gte(analyticsEvents.createdAt, startDate)
        )
      );

    // Популярные главы (события начала/завершения глав)
    const chapterStats = await db
      .select({
        chapterNumber: analyticsEvents.chapterNumber,
        eventType: analyticsEvents.eventType,
        events: count(),
      })
      .from(analyticsEvents)
      .where(
        and(
          eq(analyticsEvents.bookId, bookId),
          inArray(analyticsEvents.eventType, ['chapter_start', 'chapter_complete']),
          gte(analyticsEvents.createdAt, startDate)
        )
      )
      .groupBy(analyticsEvents.chapterNumber, analyticsEvents.eventType);

    // Группируем по главам
    const chaptersMap = new Map<number, { start: number; complete: number }>();
    chapterStats.forEach((stat) => {
      if (stat.chapterNumber === null) return;
      const existing = chaptersMap.get(stat.chapterNumber) || { start: 0, complete: 0 };
      if (stat.eventType === 'chapter_start') {
        existing.start = Number(stat.events);
      } else if (stat.eventType === 'chapter_complete') {
        existing.complete = Number(stat.events);
      }
      chaptersMap.set(stat.chapterNumber, existing);
    });

    const popularChapters = Array.from(chaptersMap.entries())
      .map(([chapterNumber, data]) => ({
        chapterNumber,
        starts: data.start,
        completions: data.complete,
        completionRate: data.start > 0 ? Math.round((data.complete / data.start) * 100) : 0,
      }))
      .sort((a, b) => a.chapterNumber - b.chapterNumber);

    // Временной график активности по дням (общий)
    const eventsTrend = await db
      .select({
        date: sql<string>`DATE(${analyticsEvents.createdAt})`,
        count: count(),
      })
      .from(analyticsEvents)
      .where(
        and(
          eq(analyticsEvents.bookId, bookId),
          gte(analyticsEvents.createdAt, startDate)
        )
      )
      .groupBy(sql`DATE(${analyticsEvents.createdAt})`)
      .orderBy(sql`DATE(${analyticsEvents.createdAt})`);

    // Детализация событий по дням (с разбивкой по типам)
    const dailyEvents = await db
      .select({
        date: sql<string>`DATE(${analyticsEvents.createdAt})`,
        eventType: analyticsEvents.eventType,
        count: count(),
      })
      .from(analyticsEvents)
      .where(
        and(
          eq(analyticsEvents.bookId, bookId),
          gte(analyticsEvents.createdAt, startDate)
        )
      )
      .groupBy(sql`DATE(${analyticsEvents.createdAt})`, analyticsEvents.eventType)
      .orderBy(sql`DATE(${analyticsEvents.createdAt})`);

    // Группируем по датам
    const dailyEventsMap = new Map<string, { [key: string]: number }>();
    dailyEvents.forEach((event) => {
      const existing = dailyEventsMap.get(event.date) || {};
      existing[event.eventType] = Number(event.count);
      dailyEventsMap.set(event.date, existing);
    });

    const dailyEventsList = Array.from(dailyEventsMap.entries()).map(([date, events]) => ({
      date,
      ...events,
    }));

    // Топ читателей этой книги
    const topReaders = await db
      .select({
        userId: analyticsEvents.userId,
        username: users.username,
        events: count(),
      })
      .from(analyticsEvents)
      .leftJoin(users, eq(analyticsEvents.userId, users.id))
      .where(
        and(
          eq(analyticsEvents.bookId, bookId),
          gte(analyticsEvents.createdAt, startDate)
        )
      )
      .groupBy(analyticsEvents.userId, users.username)
      .orderBy(desc(count()))
      .limit(10);

    // Получаем информацию о книге
    const [bookInfo] = await db
      .select({
        title: books.title,
        author: books.author,
        coverUrl: books.coverUrl,
      })
      .from(books)
      .where(eq(books.id, bookId));

    res.json({
      bookId,
      period,
      book: bookInfo || null,
      opens: openCount.count,
      completions: completeCount.count,
      uniqueReaders: uniqueReaders.count || 0,
      avgReadingTime: Math.round(avgTime.avgDuration || 0),
      avgProgress: Math.round(avgProgress.avgProgress || 0),
      completionRate: openCount.count > 0 ? Math.round((completeCount.count / openCount.count) * 100) : 0,
      popularChapters: popularChapters.slice(0, 30), // Ограничиваем 30 главами
      eventsTrend,
      dailyEvents: dailyEventsList,
      topReaders: topReaders.filter((r) => r.userId),
    });
  } catch (error) {
    console.error('[Analytics] Error fetching book stats:', error);
    res.status(500).json({ error: 'Failed to fetch book analytics' });
  }
});

export default router;
