import { Router, type Request, type Response } from 'express';
import { db } from '../db.js';
import { users, userProfiles, userFollows } from '../../shared/schema.js';
import { eq, and, sql, ilike, or, ne } from 'drizzle-orm';
import { logger } from '../lib/logger.js';
import { repositories } from '../repositories/index.js';
import { optionalJwtAuth } from '../jwt-middleware.js';

const router = Router();

/**
 * GET /api/users/search?q=&type=all|readers|listeners&limit=20&cursor=
 * Полнотекстовый поиск пользователей.
 * JWT опционален — гости тоже могут искать, но не видят статус подписки.
 */
router.get('/search', optionalJwtAuth, async (req: Request, res: Response) => {
  const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
  const type = (req.query.type as string) || 'all';
  const limit = Math.min(Number(req.query.limit) || 20, 50);
  const cursor = typeof req.query.cursor === 'string' ? req.query.cursor : undefined;
  const viewerId = req.user?.id ?? null;

  if (q.length < 2) {
    return res.status(400).json({ success: false, error: 'Query must be at least 2 characters' });
  }

  try {
    const conditions = [
      eq(users.status, 'active'),
      or(
        sql`to_tsvector('russian', ${users.username}) @@ plainto_tsquery('russian', ${q})`,
        sql`to_tsvector('russian', COALESCE(${userProfiles.displayName}, '')) @@ plainto_tsquery('russian', ${q})`,
        ilike(users.username, `%${q}%`),
        ilike(userProfiles.displayName, `%${q}%`),
      ),
    ];

    // Фильтр по типу
    if (type === 'readers') {
      conditions.push(eq(userProfiles.isReader, true));
    } else if (type === 'listeners') {
      conditions.push(eq(userProfiles.isReader, false));
    }

    // Исключить себя из результатов
    if (viewerId) {
      conditions.push(ne(users.id, viewerId));
    }

    // Cursor-based пагинация по id
    if (cursor) {
      conditions.push(sql`${users.id} > ${cursor}`);
    }

    const rows = await db
      .select({
        id: users.id,
        username: users.username,
        displayName: userProfiles.displayName,
        avatar: userProfiles.avatar,
        bio: userProfiles.bio,
        isReader: userProfiles.isReader,
        followersCount: userProfiles.followersCount,
        followingCount: userProfiles.followingCount,
      })
      .from(users)
      .innerJoin(userProfiles, eq(userProfiles.userId, users.id))
      .where(and(...conditions))
      .orderBy(
        sql`ts_rank(to_tsvector('russian', ${users.username}), plainto_tsquery('russian', ${q})) DESC`,
        userProfiles.followersCount,
      )
      .limit(limit + 1);

    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;
    const nextCursor = hasMore ? items.at(-1)?.id ?? null : null;

    // Для авторизованных добавляем isFollowing
    let results: Array<(typeof items)[number] & { isFollowing?: boolean }> = items;

    if (viewerId && items.length > 0) {
      const targetIds = items.map((r) => r.id);
      const arrayLiteral = sql.join(targetIds.map((id) => sql`${id}`), sql`, `);
      const follows = await db
        .select({ followingId: userFollows.followingId })
        .from(userFollows)
        .where(
          and(
            eq(userFollows.followerId, viewerId),
            sql`${userFollows.followingId} = ANY(ARRAY[${arrayLiteral}]::text[])`,
          ),
        );
      const followingSet = new Set(follows.map((f) => f.followingId));
      results = items.map((r) => ({ ...r, isFollowing: followingSet.has(r.id) }));
    }

    res.json({ success: true, users: results, nextCursor, total: items.length });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    logger.error({ error: msg }, '[users] search error');
    res.status(500).json({ success: false, error: 'Search failed' });
  }
});

/**
 * GET /api/users/:userId/profile
 * Публичный профиль пользователя.
 */
router.get('/:userId/profile', optionalJwtAuth, async (req: Request, res: Response) => {
  const { userId } = req.params;
  const viewerId = req.user?.id ?? null;

  try {
    const canView = await repositories.social.canViewProfile(viewerId, userId);
    if (!canView) {
      return res.status(403).json({ success: false, error: 'Profile is private' });
    }

    const rows = await db
      .select({
        id: users.id,
        username: users.username,
        displayName: userProfiles.displayName,
        avatar: userProfiles.avatar,
        bio: userProfiles.bio,
        isReader: userProfiles.isReader,
        followersCount: userProfiles.followersCount,
        followingCount: userProfiles.followingCount,
        createdAt: users.createdAt,
      })
      .from(users)
      .innerJoin(userProfiles, eq(userProfiles.userId, users.id))
      .where(and(eq(users.id, userId), eq(users.status, 'active')))
      .limit(1);

    if (rows.length === 0) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    const profile = rows[0];
    let followStatus = { isFollowing: false, isFollower: false };
    if (viewerId && viewerId !== userId) {
      followStatus = await repositories.social.getFollowStatus(viewerId, userId);
    }

    res.json({ success: true, profile: { ...profile, ...followStatus } });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    logger.error({ error: msg }, '[users] profile error');
    res.status(500).json({ success: false, error: 'Failed to get profile' });
  }
});

export default router;
