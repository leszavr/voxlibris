import express from 'express';
import postgres from 'postgres';
import { and, asc, desc, eq, sql } from 'drizzle-orm';
import type { SQL } from 'drizzle-orm';
import { jwtAuth, requireAdmin } from '../../jwt-middleware.js';
import { storage } from '../../repositories/index.js';
import { db } from '../../db.js';
import { emailService } from '../../services/email-service.js';
import { pushService } from '../../services/push-service.js';
import { logger } from '../../lib/logger.js';
import { books, clubBooks, clubMembers, clubs, users } from '../../../shared/schema.js';
import type { AdminActionTargetType, AdminActionType } from '../../../shared/schema.js';

const PostgresError = postgres.PostgresError;

type LogAction = (
  req: express.Request,
  actionType: AdminActionType,
  targetType: AdminActionTargetType,
  targetId: string,
  reason?: string,
  previousValue?: string,
  newValue?: string,
) => Promise<void>;

interface AdminClubsRouterDeps {
  logAction: LogAction;
}

const ADMIN_CLUB_STATUSES = ['pending', 'recruiting', 'active', 'completed', 'archived'] as const;
type AdminClubStatus = (typeof ADMIN_CLUB_STATUSES)[number];

function isAdminClubStatus(status: unknown): status is AdminClubStatus {
  return typeof status === 'string' && ADMIN_CLUB_STATUSES.includes(status as AdminClubStatus);
}

function parsePositiveInt(value: unknown, fallback: number, max?: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  const normalized = Math.floor(parsed);
  if (normalized < 1) return fallback;
  return max ? Math.min(normalized, max) : normalized;
}

function parseAdminPagination(pageRaw: unknown, limitRaw: unknown) {
  const page = parsePositiveInt(pageRaw, 1);
  const limit = parsePositiveInt(limitRaw, 20, 100);
  return { page, limit, offset: (page - 1) * limit };
}

export function createAdminClubsRouter(deps: AdminClubsRouterDeps) {
  const router = express.Router();
  const { logAction } = deps;

// ==== CLUB MANAGEMENT ====

type AdminClubSortKey = 'created_at' | 'name' | 'book_title' | 'creator' | 'status' | 'participants' | 'max_participants' | 'visibility';
type AdminClubSortDirection = 'asc' | 'desc';
type AdminClubGroupKey = 'none' | 'status' | 'visibility';

function parseAdminClubSort(query: express.Request['query']): {
  sortBy: AdminClubSortKey;
  sortDirection: AdminClubSortDirection;
  groupBy: AdminClubGroupKey;
} {
  const sortBy = typeof query.sortBy === 'string' ? query.sortBy : 'created_at';
  const sortDirection = query.sortDirection === 'asc' ? 'asc' : 'desc';
  const groupBy = typeof query.groupBy === 'string' ? query.groupBy : 'none';

  return {
    sortBy: ['created_at', 'name', 'book_title', 'creator', 'status', 'participants', 'max_participants', 'visibility'].includes(sortBy)
      ? sortBy as AdminClubSortKey
      : 'created_at',
    sortDirection,
    groupBy: ['none', 'status', 'visibility'].includes(groupBy) ? groupBy as AdminClubGroupKey : 'none',
  };
}

// Получить список всех клубов
router.get('/clubs', jwtAuth, requireAdmin, async (req, res) => {
  try {
    const search = typeof req.query.search === 'string' ? req.query.search.trim() : '';
    const status = typeof req.query.status === 'string' ? req.query.status : undefined;
    const sort = parseAdminClubSort(req.query);
    const { page, limit, offset } = parseAdminPagination(req.query.page, req.query.limit);

    const conditions: SQL<unknown>[] = [];
    if (search) {
      const searchPattern = `%${search.toLowerCase()}%`;
      conditions.push(sql`LOWER(${clubs.title}) LIKE ${searchPattern}`);
    }
    if (status) {
      conditions.push(eq(clubs.status, status as typeof clubs.$inferSelect['status']));
    }

    let whereClause: SQL<unknown>;
    if (conditions.length === 0) {
      whereClause = sql`true`;
    } else if (conditions.length === 1) {
      whereClause = conditions[0];
    } else {
      whereClause = and(...conditions) as SQL<unknown>;
    }

    const currentParticipantsExpr = sql<number>`(
      SELECT COUNT(*)::int
      FROM ${clubMembers}
      WHERE ${clubMembers.clubId} = ${clubs.id}
        AND ${clubMembers.isActive} = true
    )`;
    const bookTitleExpr = sql<string>`COALESCE(${books.title}, ${clubBooks.title}, '')`;
    const visibilityExpr = sql<number>`CASE WHEN ${clubs.isPrivate} THEN 1 ELSE 0 END`;
    const sortColumn = {
      created_at: clubs.createdAt,
      name: clubs.title,
      book_title: bookTitleExpr,
      creator: users.username,
      status: clubs.status,
      participants: currentParticipantsExpr,
      max_participants: clubs.maxMembers,
      visibility: visibilityExpr,
    }[sort.sortBy];
    const groupColumn = {
      none: undefined,
      status: clubs.status,
      visibility: visibilityExpr,
    }[sort.groupBy];
    const orderBy = [
      ...(groupColumn ? [asc(groupColumn)] : []),
      sort.sortDirection === 'asc' ? asc(sortColumn) : desc(sortColumn),
      desc(clubs.createdAt),
    ];

    const [totalRows, rows] = await Promise.all([
      db
        .select({ count: sql<number>`COUNT(*)::int` })
        .from(clubs)
        .where(whereClause),
      db
        .select({
          id: clubs.id,
          name: clubs.title,
          description: clubs.description,
          bookId: clubs.bookId,
          regularBookTitle: books.title,
          regularBookAuthor: books.author,
          clubBookTitle: clubBooks.title,
          clubBookAuthor: clubBooks.author,
          creatorUsername: users.username,
          status: clubs.status,
          createdAt: clubs.createdAt,
          maxParticipants: clubs.maxMembers,
          readingSchedule: clubs.schedule,
          isPrivate: clubs.isPrivate,
          currentParticipants: currentParticipantsExpr,
        })
        .from(clubs)
        .leftJoin(users, eq(clubs.ownerId, users.id))
        .leftJoin(books, eq(clubs.bookId, books.id))
        .leftJoin(clubBooks, eq(clubs.bookId, clubBooks.id))
        .where(whereClause)
        .orderBy(...orderBy)
        .limit(limit)
        .offset(offset),
    ]);

    const total = Number(totalRows[0]?.count || 0);
    const formattedClubs = rows.map((club) => ({
      id: club.id,
      name: club.name,
      description: club.description,
      book_id: club.bookId,
      book_title: club.regularBookTitle || club.clubBookTitle || 'N/A',
      book_author: club.regularBookAuthor || club.clubBookAuthor || 'N/A',
      creator_username: club.creatorUsername || 'Unknown',
      status: club.status,
      created_at: club.createdAt.toISOString(),
      max_participants: club.maxParticipants,
      current_participants: Number(club.currentParticipants || 0),
      reading_schedule: club.readingSchedule,
      is_public: !club.isPrivate,
    }));

    res.json({
      clubs: formattedClubs,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Error fetching clubs:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Обновить настройки клуба (максимальное количество участников)
router.put('/clubs/:id', jwtAuth, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { maxMembers } = req.body;

    const club = await storage.getClub(id);
    if (!club) {
      return res.status(404).json({ message: 'Club not found' });
    }

    if (maxMembers !== undefined) {
      const newMaxMembers = Number(maxMembers);
      if (Number.isNaN(newMaxMembers) || newMaxMembers < 2 || newMaxMembers > 2000) {
        return res.status(400).json({ message: 'maxMembers must be between 2 and 2000' });
      }

      await storage.updateClub(id, { maxMembers: newMaxMembers });

      await logAction(
        req,
        'update_club',
        'club',
        id,
        `Changed maxMembers from ${club.maxMembers} to ${newMaxMembers}`,
        String(club.maxMembers),
        String(newMaxMembers)
      );
    }

    const updatedClub = await storage.getClub(id);
    res.json({ message: 'Club updated successfully', club: updatedClub });
  } catch (error) {
    console.error('Error updating club:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Обновить статус клуба
// Переход из pending в non-pending должен идти через approve/reject для сохранения модерационного flow.
router.put('/clubs/:id/status', jwtAuth, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body as { status?: unknown };

    if (!isAdminClubStatus(status)) {
      return res.status(400).json({
        message: 'Invalid club status',
        allowed: ADMIN_CLUB_STATUSES,
      });
    }

    const club = await storage.getClub(id);
    if (!club) {
      return res.status(404).json({ message: 'Club not found' });
    }

    if (club.status === 'pending' && status !== 'pending') {
      return res.status(400).json({
        message: 'Pending clubs must be moderated via approve/reject endpoints',
      });
    }

    if (club.status === status) {
      return res.json({ message: 'Club status unchanged', club });
    }

    const updates: Partial<typeof clubs.$inferInsert> = { status };

    if (status === 'archived') {
      updates.archivedAt = new Date();
    } else if (club.status === 'archived') {
      updates.archivedAt = null;
    }

    const [updatedClub] = await db
      .update(clubs)
      .set({
        ...updates,
        updatedAt: new Date(),
      })
      .where(eq(clubs.id, id))
      .returning();

    if (!updatedClub) {
      return res.status(500).json({ message: 'Failed to update club status' });
    }

    await logAction(
      req,
      'update_club',
      'club',
      id,
      `Changed club status from ${club.status} to ${status}`,
      club.status,
      status
    );

    res.json({
      message: 'Club status updated successfully',
      club: updatedClub,
    });
  } catch (error) {
    console.error('Error updating club status:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Удалить клуб
router.delete('/clubs/:id', jwtAuth, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;

    const club = await storage.getClub(id);
    if (!club) {
      return res.status(404).json({ message: 'Club not found' });
    }

    await storage.deleteClub(id);

    await logAction(
      req,
      'delete_club',
      'club',
      id,
      'Club deleted by admin',
      club.status,
      'deleted'
    );

    res.json({ message: 'Club deleted successfully' });
  } catch (error) {
    console.error('Error deleting club:', error);

    // Специализированная обработка PostgresError
    if (error instanceof PostgresError) {
      switch (error.code) {
        case '23503': // FOREIGN_KEY_VIOLATION
          return res.status(400).json({
            message: 'Cannot delete club: it has active dependencies (members or sessions)',
            code: 'FOREIGN_KEY_VIOLATION'
          });
        case '23505': // UNIQUE_VIOLATION
          return res.status(400).json({
            message: 'Operation failed due to data conflict',
            code: 'UNIQUE_VIOLATION'
          });
        default:
          return res.status(500).json({
            message: 'Database operation failed',
            code: error.code
          });
      }
    }

    res.status(500).json({ message: 'Internal server error' });
  }
});

// ==== CLUB MODERATION ====

// Получить клубы на модерации
router.get('/clubs/pending', jwtAuth, requireAdmin, async (_req, res) => {
  try {
    const pendingClubs = await db
      .select({
        id: clubs.id,
        title: clubs.title,
        description: clubs.description,
        coverImage: clubs.coverImage,
        type: clubs.type,
        isPrivate: clubs.isPrivate,
        status: clubs.status,
        ownerId: users.id,
        ownerUsername: users.username,
        ownerEmail: users.email,
        maxMembers: clubs.maxMembers,
        createdAt: clubs.createdAt,
        memberCount: sql<number>`(
          SELECT COUNT(*)::int
          FROM ${clubMembers}
          WHERE ${clubMembers.clubId} = ${clubs.id}
            AND ${clubMembers.isActive} = true
        )`,
      })
      .from(clubs)
      .leftJoin(users, eq(clubs.ownerId, users.id))
      .where(eq(clubs.status, 'pending'))
      .orderBy(clubs.createdAt);

    const clubsFormatted = pendingClubs.map((club) => ({
      id: club.id,
      title: club.title,
      description: club.description,
      coverImage: club.coverImage,
      type: club.type,
      isPrivate: club.isPrivate,
      status: club.status,
      owner: {
        id: club.ownerId,
        username: club.ownerUsername,
        email: club.ownerEmail,
      },
      memberCount: Number(club.memberCount || 0),
      maxMembers: club.maxMembers,
      createdAt: club.createdAt.toISOString(),
    }));

    res.json({
      clubs: clubsFormatted,
      total: clubsFormatted.length
    });
  } catch (error) {
    console.error('Error fetching pending clubs:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Одобрить клуб
router.put('/clubs/:id/approve', jwtAuth, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    
    const club = await storage.getClub(id);
    if (!club) {
      return res.status(404).json({ message: 'Club not found' });
    }
    
    if (club.status !== 'pending') {
      return res.status(400).json({ 
        message: 'Only pending clubs can be approved',
        currentStatus: club.status
      });
    }

    const clubOwner = await storage.getUser(club.ownerId);
    if (!clubOwner?.email) {
      return res.status(400).json({ message: 'Cannot approve club: owner email not found' });
    }

    const ownerProfile = await storage.getUserProfile(clubOwner.id).catch(() => undefined);
     
    const approvedClub = await storage.approveClub(id);
     
    if (!approvedClub) {
      return res.status(500).json({ message: 'Failed to approve club' });
    }

    const emailSent = await emailService.sendClubApprovalNotification({
      email: clubOwner.email,
      username: clubOwner.username,
      displayName: ownerProfile?.displayName ?? undefined,
      clubId: approvedClub.id,
      clubTitle: approvedClub.title,
    });

    if (!emailSent) {
      logger.warn({ clubId: id, ownerId: clubOwner.id }, 'Club approved, but owner email notification failed');
    }

    const pushResult = await pushService.sendToUser(clubOwner.id, {
      type: 'club_moderation',
      title: 'Клуб одобрен',
      body: `Клуб "${approvedClub.title}" прошел модерацию.`,
      url: `/clubs/${approvedClub.id}`,
      tag: `club-approved-${approvedClub.id}`,
    });

    if (pushResult.skipped) {
      logger.info({ clubId: id, ownerId: clubOwner.id, reason: pushResult.reason }, 'Club approval push notification skipped');
    }
    
    await logAction(
      req,
      'update_club',
      'club',
      id,
      'Club approved by moderator',
      'pending',
      'recruiting'
    );
    
    logger.info({
      clubId: id,
      clubTitle: approvedClub.title,
      moderator: req.user?.username
    }, 'Club approved');
    
    res.json({ 
      message: 'Club approved successfully',
      club: approvedClub
    });
  } catch (error) {
    console.error('Error approving club:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Отклонить клуб
router.put('/clubs/:id/reject', jwtAuth, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const rawReason = typeof req.body?.reason === 'string' ? req.body.reason.trim() : '';
    
    const club = await storage.getClub(id);
    if (!club) {
      return res.status(404).json({ message: 'Club not found' });
    }
    
    if (club.status !== 'pending') {
      return res.status(400).json({ 
        message: 'Only pending clubs can be rejected',
        currentStatus: club.status
      });
    }

    if (!rawReason) {
      return res.status(400).json({ message: 'Rejection reason is required' });
    }

    const clubOwner = await storage.getUser(club.ownerId);
    if (!clubOwner?.email) {
      return res.status(400).json({ message: 'Cannot reject club: owner email not found' });
    }

    const ownerProfile = await storage.getUserProfile(clubOwner.id).catch(() => undefined);

    const emailSent = await emailService.sendClubRejectionNotification({
      email: clubOwner.email,
      username: clubOwner.username,
      displayName: ownerProfile?.displayName ?? undefined,
      clubTitle: club.title,
      reason: rawReason,
    });

    if (!emailSent) {
      return res.status(500).json({ message: 'Failed to send rejection email to club owner' });
    }

    const deleted = await storage.deleteClub(id);
    if (!deleted) {
      return res.status(500).json({ message: 'Failed to delete rejected club' });
    }

    const pushResult = await pushService.sendToUser(clubOwner.id, {
      type: 'club_moderation',
      title: 'Клуб отклонён',
      body: `Клуб "${club.title}" не прошел модерацию. Причина: ${rawReason}`,
      url: '/catalog',
      tag: `club-rejected-${id}`,
    });

    if (pushResult.skipped) {
      logger.info({ clubId: id, ownerId: clubOwner.id, reason: pushResult.reason }, 'Club rejection push notification skipped');
    }
    
    await logAction(
      req,
      'delete_club',
      'club',
      id,
      rawReason,
      'pending',
      'deleted'
    );
    
    logger.info({
      clubId: id,
      clubTitle: club.title,
      ownerEmail: clubOwner.email,
      reason: rawReason,
      moderator: req.user?.username
    }, 'Club rejected and deleted');
    
    res.json({ 
      message: 'Club rejected and deleted successfully'
    });
  } catch (error) {
    console.error('Error rejecting club:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});


  return router;
}
