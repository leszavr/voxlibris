import express from 'express';
import { and, asc, desc, eq, sql } from 'drizzle-orm';
import type { SQL } from 'drizzle-orm';
import { jwtAuth, requireAdmin } from '../../jwt-middleware.js';
import { authService } from '../../auth-service.js';
import { pushService } from '../../services/push-service.js';
import { storage } from '../../repositories/index.js';
import { db } from '../../db.js';
import { logger } from '../../lib/logger.js';
import { getPublicBaseUrl } from '../../lib/public-base-url.js';
import { clubs, clubMembers, notifications, readingHistory, readingProgress, userProfiles, users } from '../../../shared/schema.js';
import type { AdminActionTargetType, AdminActionType, UserRole, UserStatus } from '../../../shared/schema.js';

type FullAdminMiddleware = express.RequestHandler;
type LogAction = (
  req: express.Request,
  actionType: AdminActionType,
  targetType: AdminActionTargetType,
  targetId: string,
  reason?: string,
  previousValue?: string,
  newValue?: string,
) => Promise<void>;

interface AdminUsersRouterDeps {
  requireFullAdmin: FullAdminMiddleware;
  logAction: LogAction;
}

function isMissingRelationError(error: unknown): boolean {
  const maybeError = error as { code?: string; cause?: { code?: string } };
  return maybeError.code === '42P01' || maybeError.cause?.code === '42P01';
}

const DEFAULT_ADMIN_PAGE_LIMIT = 20;
const MAX_ADMIN_PAGE_LIMIT = 100;

function parsePositiveInt(value: unknown, fallback: number, max?: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  const normalized = Math.floor(parsed);
  if (normalized < 1) return fallback;
  return max ? Math.min(normalized, max) : normalized;
}

function parseAdminPagination(pageRaw: unknown, limitRaw: unknown) {
  const page = parsePositiveInt(pageRaw, 1);
  const limit = parsePositiveInt(limitRaw, DEFAULT_ADMIN_PAGE_LIMIT, MAX_ADMIN_PAGE_LIMIT);
  return { page, limit, offset: (page - 1) * limit };
}

function getAdminPushSkipMessage(reason: string | undefined): string {
  switch (reason) {
    case 'not_configured':
      return 'Push не отправлен: VAPID-переменные не настроены или backend не был перезапущен после их добавления.';
    case 'disabled_by_settings':
      return 'Push не отправлен: уведомления отключены в настройках пользователя.';
    case 'quiet_hours':
      return 'Push не отправлен: сейчас у пользователя включены тихие часы.';
    case 'daily_limit':
      return 'Push не отправлен: достигнут дневной лимит push-уведомлений для пользователя.';
    case 'no_active_subscriptions':
      return 'Push не отправлен: у пользователя нет активной серверной push-подписки. Попросите пользователя снова нажать «Включить push-уведомления» в личном кабинете.';
    case 'send_failed':
      return 'Push не отправлен: push-сервис браузера отклонил все активные подписки. Попробуйте пересоздать подписку у пользователя.';
    default:
      return 'Push не отправлен: причина не определена.';
  }
}

export function createAdminUsersRouter(deps: AdminUsersRouterDeps) {
  const router = express.Router();
  const { requireFullAdmin, logAction } = deps;

function buildAdminUsersWhere(params: {
  search?: string;
  role?: string;
  status?: string;
  includeDeleted: boolean;
}): SQL<unknown>[] {
  const conditions: SQL<unknown>[] = [];

  if (!params.includeDeleted) {
    conditions.push(sql`${users.status} != 'deleted'`);
  }

  if (params.search) {
    const searchPattern = `%${params.search.toLowerCase()}%`;
    conditions.push(sql`LOWER(${users.username}) LIKE ${searchPattern}`);
  }

  if (params.role) {
    conditions.push(eq(users.role, params.role as UserRole));
  }

  if (params.status) {
    conditions.push(eq(users.status, params.status as UserStatus));
  }

  return conditions;
}

type AdminUserRow = {
  id: string;
  username: string;
  email: string;
  role: UserRole;
  status: UserStatus;
  createdAt: Date | null;
  lastActivityAt: Date | null;
  booksRead: number;
  clubsJoined: number;
  clubsCreated: number;
  canCreateReaderLedClubs: boolean;
};

type AdminUserSortKey = 'created_at' | 'last_active' | 'username' | 'email' | 'role' | 'status' | 'books_read' | 'clubs_created' | 'clubs_joined';
type AdminUserSortDirection = 'asc' | 'desc';

const adminUserSortKeys = new Set<AdminUserSortKey>(['created_at', 'last_active', 'username', 'email', 'role', 'status', 'books_read', 'clubs_created', 'clubs_joined']);

function parseAdminUserSort(query: { sortBy?: unknown; sortDirection?: unknown }) {
  const sortBy = typeof query.sortBy === 'string' && adminUserSortKeys.has(query.sortBy as AdminUserSortKey)
    ? query.sortBy as AdminUserSortKey
    : 'created_at';
  const sortDirection: AdminUserSortDirection = query.sortDirection === 'asc' ? 'asc' : 'desc';
  return { sortBy, sortDirection };
}

function parseCanCreateReaderLedClubs(readerSettings: string | null): boolean {
  if (!readerSettings) return false;

  try {
    const parsed: unknown = JSON.parse(readerSettings);
    return typeof parsed === 'object'
      && parsed !== null
      && (parsed as { canCreateReaderLedClubs?: unknown }).canCreateReaderLedClubs === true;
  } catch {
    return false;
  }
}

function formatAdminUserForResponse(user: AdminUserRow) {
  return {
    id: user.id,
    username: user.username,
    email: user.email,
    role: user.role,
    status: user.status,
    created_at: user.createdAt?.toISOString() || null,
    last_active: user.lastActivityAt?.toISOString() || null,
    books_read: Number(user.booksRead || 0),
    clubs_joined: Number(user.clubsJoined || 0),
    clubs_created: Number(user.clubsCreated || 0),
    can_create_reader_led_clubs: user.canCreateReaderLedClubs,
  };
}

async function queryAdminUsersWithStats(params: {
  conditions: SQL<unknown>[];
  limit?: number;
  offset?: number;
  sortBy?: AdminUserSortKey;
  sortDirection?: AdminUserSortDirection;
}) {
  let whereClause: SQL<unknown>;
  if (params.conditions.length === 0) {
    whereClause = sql`true`;
  } else if (params.conditions.length === 1) {
    whereClause = params.conditions[0];
  } else {
    whereClause = and(...params.conditions) as SQL<unknown>;
  }
  
  const [totalRow] = await db
    .select({
      count: sql<number>`COUNT(*)::int`,
    })
    .from(users)
    .where(whereClause);

  const booksReadExpr = sql<number>`(
    SELECT COUNT(DISTINCT completed.book_id)::int
    FROM (
      SELECT ${readingHistory.bookId} AS book_id
      FROM ${readingHistory}
      WHERE ${readingHistory.userId} = users.id
      UNION
      SELECT ${readingProgress.bookId} AS book_id
      FROM ${readingProgress}
      WHERE ${readingProgress.userId} = users.id
        AND ${readingProgress.progress} >= 100
    ) completed
  )`;
  const clubsJoinedExpr = sql<number>`(
    SELECT COUNT(DISTINCT "club_members"."club_id")::int
    FROM ${clubMembers}
    LEFT JOIN ${clubs} member_clubs ON member_clubs.id = "club_members"."club_id"
    WHERE "club_members"."user_id" = users.id
      AND "club_members"."is_active" = true
      AND ("club_members"."role" != 'owner' OR member_clubs.owner_id IS DISTINCT FROM users.id)
  )`;
  const clubsCreatedExpr = sql<number>`(
    SELECT COUNT(*)::int
    FROM ${clubs}
    WHERE ${clubs.ownerId} = users.id
  )`;
  const sortBy = params.sortBy ?? 'created_at';
  const sortDirection = params.sortDirection ?? 'desc';
  const sortColumn = {
    created_at: users.createdAt,
    last_active: users.lastActivityAt,
    username: users.username,
    email: users.email,
    role: users.role,
    status: users.status,
    books_read: booksReadExpr,
    clubs_created: clubsCreatedExpr,
    clubs_joined: clubsJoinedExpr,
  }[sortBy];
  const orderBy = sortDirection === 'asc' ? asc(sortColumn) : desc(sortColumn);

  const baseUsersQuery = db
    .select({
      id: users.id,
      username: users.username,
      email: users.email,
      role: users.role,
      status: users.status,
      createdAt: users.createdAt,
      lastActivityAt: users.lastActivityAt,
      booksRead: booksReadExpr,
      clubsJoined: clubsJoinedExpr,
      clubsCreated: clubsCreatedExpr,
      canCreateReaderLedClubs: sql<boolean>`EXISTS (
        SELECT 1
        FROM user_profiles p
        WHERE p.user_id = users.id
          AND p.reader_settings::jsonb ->> 'canCreateReaderLedClubs' = 'true'
      )`,
    })
    .from(users)
    .where(whereClause)
    .orderBy(orderBy, desc(users.createdAt));

  const rows = typeof params.limit === 'number' && typeof params.offset === 'number'
    ? await baseUsersQuery.limit(params.limit).offset(params.offset)
    : await baseUsersQuery;

  return {
    total: Number(totalRow?.count || 0),
    users: rows.map(formatAdminUserForResponse),
  };
}

// Получить список всех пользователей
router.get('/users', jwtAuth, requireAdmin, async (req, res) => {
  try {
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.set('Pragma', 'no-cache');
    res.set('Expires', '0');

    const search = typeof req.query.search === 'string' ? req.query.search.trim() : '';
    const role = typeof req.query.role === 'string' ? req.query.role : undefined;
    const status = typeof req.query.status === 'string' ? req.query.status : undefined;
    const sort = parseAdminUserSort(req.query);
    const { page, limit, offset } = parseAdminPagination(req.query.page, req.query.limit);

    const conditions = buildAdminUsersWhere({
      search: search || undefined,
      role,
      status,
      includeDeleted: false,
    });

    const result = await queryAdminUsersWithStats({ conditions, limit, offset, ...sort });

    res.json({
      users: result.users,
      total: result.total,
      page,
      limit,
    });
  } catch (error) {
    console.error('Error fetching users:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Изменить роль пользователя
router.put('/users/:username/role', jwtAuth, requireFullAdmin, async (req, res) => {
  try {
    const { username } = req.params;
    const { role } = req.body;

    if (!['user', 'admin', 'moderator'].includes(role)) {
      return res.status(400).json({ message: 'Invalid role' });
    }

    const updatedUser = await storage.updateUserRole(username, role as UserRole);

    if (!updatedUser) {
      return res.status(404).json({ message: 'User not found' });
    }

    await logAction(
      req,
      'change_user_role',
      'user',
      updatedUser.id,
      `Changed role to ${role}`,
      updatedUser.role,
      role
    );

    const { password: _password, ...safeUser } = updatedUser;
    res.json({ user: safeUser });
  } catch (error) {
    console.error('Error updating user role:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Изменить статус пользователя
router.put('/users/:username/status', jwtAuth, requireAdmin, async (req, res) => {
  try {
    const { username } = req.params;
    const { status } = req.body;

    if (!['pending', 'active', 'suspended', 'deleted'].includes(status)) {
      return res.status(400).json({ message: 'Invalid status' });
    }

    const existingUser = await storage.getUserByUsername(username);
    if (!existingUser) {
      return res.status(404).json({ message: 'User not found' });
    }

    const updatedUser = await storage.updateUserStatus(username, status as UserStatus);

    if (!updatedUser) {
      return res.status(404).json({ message: 'User not found' });
    }

    if (status === 'suspended' || status === 'deleted') {
      await storage.revokeAllUserRefreshTokens(updatedUser.id);
    }

    await logAction(
      req,
      'change_user_status',
      'user',
      updatedUser.id,
      `Changed status to ${status}`,
      existingUser.status,
      status
    );

    const { password: _password, ...safeUser } = updatedUser;
    res.json({ user: safeUser });
  } catch (error) {
    console.error('Error updating user status:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Выдать или отозвать право создания клубов чтецов без повышения роли пользователя.
router.put('/users/:id/reader-led-permission', jwtAuth, requireFullAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { allowed } = req.body;

    if (typeof allowed !== 'boolean') {
      return res.status(400).json({ message: 'allowed must be boolean' });
    }

    const user = await storage.getUser(id);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    const existingProfile = await storage.getUserProfile(id).catch(() => undefined);
    let existingSettings: Record<string, unknown> = {};
    if (existingProfile?.readerSettings) {
      try {
        const parsed: unknown = JSON.parse(existingProfile.readerSettings);
        if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
          existingSettings = parsed as Record<string, unknown>;
        }
      } catch {
        existingSettings = {};
      }
    }

    const nextReaderSettings = JSON.stringify({
      ...existingSettings,
      canCreateReaderLedClubs: allowed,
    });

    if (existingProfile) {
      await db
        .update(userProfiles)
        .set({ readerSettings: nextReaderSettings, updatedAt: new Date() })
        .where(eq(userProfiles.userId, id));
    } else {
      await db
        .insert(userProfiles)
        .values({
          userId: id,
          displayName: user.username,
          isReader: false,
          readerSettings: nextReaderSettings,
        });
    }

    await logAction(
      req,
      'change_user_role',
      'user',
      id,
      allowed ? 'Granted reader-led club creation permission' : 'Revoked reader-led club creation permission',
      parseCanCreateReaderLedClubs(existingProfile?.readerSettings ?? null) ? 'allowed' : 'denied',
      allowed ? 'allowed' : 'denied'
    );

    res.json({ success: true, can_create_reader_led_clubs: allowed });
  } catch (error) {
    console.error('Error updating reader-led permission:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Сбросить пароль пользователя (отправка письма)
router.post('/users/:id/reset-password', jwtAuth, requireFullAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body || {};

    const user = await storage.getUser(id);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    const baseUrl = await getPublicBaseUrl();
    const result = await authService.requestPasswordReset(
      user.email,
      baseUrl,
      req.user!.userId,
      req.ip
    );

    await logAction(
      req,
      'reset_password',
      'user',
      user.id,
      reason || 'Password reset requested by admin'
    );

    if (!result.emailSent) {
      return res.status(500).json({ message: 'Не удалось отправить письмо для сброса пароля' });
    }

    res.json({ success: true, message: 'Письмо для сброса пароля отправлено' });
  } catch (error) {
    console.error('Error requesting password reset:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Отправить тестовое push-уведомление выбранному пользователю
router.post('/users/:id/test-push', jwtAuth, requireFullAdmin, async (req, res) => {
  try {
    const { id } = req.params;

    const user = await storage.getUser(id);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    const result = await pushService.sendToUser(
      id,
      {
        type: 'test',
        title: 'VoxLibris',
        body: 'Тестовое push-уведомление от администратора',
        url: '/dashboard?tab=notifications',
        tag: 'admin-push-test',
      },
      { bypassLimits: true },
    );

    if (result.sent > 0) {
      await db.insert(notifications).values({
        userId: id,
        type: 'mention',
        kind: 'mention',
        actorUserId: req.user!.userId,
        entityType: 'admin_test_push',
        entityId: user.id,
        actionUrl: '/dashboard?tab=notifications',
        payload: { sent: result.sent },
        message: 'Тестовое push-уведомление от администратора',
      });
    }

    await logAction(
      req,
      'send_test_push',
      'user',
      user.id,
      `Admin sent test push notification to ${user.username}: sent=${result.sent}, skipped=${result.skipped}`
    );

    res.json({
      success: true,
      sent: result.sent,
      skipped: result.skipped,
      reason: result.reason,
      message: result.sent > 0
        ? 'Тестовое push-уведомление отправлено'
        : getAdminPushSkipMessage(result.reason),
    });
  } catch (error) {
    if (isMissingRelationError(error)) {
      return res.status(503).json({
        message: 'Push-таблицы ещё не созданы. Примените миграцию migrations/0047_add_push_notifications.sql и повторите отправку.',
      });
    }

    console.error('Error sending admin test push:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// "Зайти как..." - получить токены для входа под другим пользователем
router.post('/users/:id/impersonate', jwtAuth, requireFullAdmin, async (req, res) => {
  try {
    const { id } = req.params;

    // Проверяем, включена ли функция имперсонации в настройках безопасности
    const impersonationSetting = await storage.getSetting('security.impersonation.enabled');
    if (impersonationSetting?.value !== 'true') {
      return res.status(403).json({ 
        message: 'Функция входа от имени другого пользователя отключена администратором',
        code: 'IMPERSONATION_DISABLED'
      });
    }

    // Получаем целевого пользователя
    const user = await storage.getUser(id);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Нельзя имперсонировать другого админа
    if (user.role === 'admin') {
      return res.status(403).json({ message: 'Cannot impersonate another admin' });
    }

    // Генерируем токены для целевого пользователя
    const tokens = await authService.generateTokens(user, false);

    // Логируем действие
    await logAction(
      req,
      'impersonate',
      'user',
      user.id,
      `Admin impersonated user ${user.username}`
    );

    logger.info({
      adminId: req.user!.userId,
      adminUsername: req.user!.username,
      targetUserId: user.id,
      targetUsername: user.username
    }, '[Admin] Impersonation initiated');

    // Устанавливаем cookies для токенов, как при обычном логине
    const refreshMaxAge = 7 * 24 * 60 * 60 * 1000; // 7 дней
    const accessMaxAge = 15 * 60 * 1000; // 15 минут
    const isProduction = process.env.NODE_ENV === 'production';

    res.cookie('accessToken', tokens.accessToken, {
      httpOnly: false, // Доступен для JavaScript
      secure: isProduction,
      sameSite: 'strict',
      maxAge: accessMaxAge,
      path: '/',
    });

    res.cookie('refreshToken', tokens.refreshToken, {
      httpOnly: true, // Защищен от XSS
      secure: isProduction,
      sameSite: 'strict',
      maxAge: refreshMaxAge,
      path: '/',
    });

    res.json({
      success: true,
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        role: user.role,
        status: user.status
      }
    });
  } catch (error) {
    console.error('Error impersonating user:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Получить ожидающих активации пользователей
router.get('/users/pending', jwtAuth, requireAdmin, async (req, res) => {
  try {
    const pendingUsers = await storage.getPendingUsers();
    const safeUsers = pendingUsers.map(({ password: _password, ...user }) => user);

    res.json({ users: safeUsers });
  } catch (error) {
    console.error('Error fetching pending users:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Удалить пользователя (мягкое удаление)
router.delete('/users/:id', jwtAuth, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;

    // Проверяем, существует ли пользователь
    const user = await storage.getUser(id);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Запрещаем удалять самого себя
    if (id === req.user!.userId) {
      return res.status(400).json({ message: 'Cannot delete yourself' });
    }

    // Выполняем мягкое удаление
    const success = await storage.deleteUser(id);

    if (!success) {
      return res.status(500).json({ message: 'Failed to delete user' });
    }

    await logAction(
      req,
      'delete_user',
      'user',
      id,
      'User deleted by admin',
      user.status,
      'deleted'
    );

    res.json({ message: 'User deleted successfully' });
  } catch (error) {
    console.error('Error deleting user:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Восстановить удаленного пользователя
router.put('/users/:id/restore', jwtAuth, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;

    // Проверяем, существует ли пользователь
    const user = await storage.getUser(id);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Проверяем, что пользователь действительно удален
    if (user.status !== 'deleted') {
      return res.status(400).json({ message: 'User is not deleted' });
    }

    // Восстанавливаем пользователя
    const restoredUser = await storage.restoreUser(id);

    if (!restoredUser) {
      return res.status(500).json({ message: 'Failed to restore user' });
    }

    await logAction(
      req,
      'restore_user',
      'user',
      id,
      'User restored by admin',
      'deleted',
      'active'
    );

    const { password: _password, ...safeUser } = restoredUser;
    res.json({ user: safeUser, message: 'User restored successfully' });
  } catch (error) {
    console.error('Error restoring user:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Редактировать поля пользователя (admin only)
const USERNAME_REGEX_ADMIN = /^[A-Za-z0-9_-]{3,32}$/;
const EMAIL_REGEX_ADMIN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
router.put('/users/:id/fields', jwtAuth, requireFullAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { username, email } = req.body as { username?: string; email?: string };

    const user = await storage.getUser(id);
    if (!user) return res.status(404).json({ message: 'User not found' });

    if (username !== undefined) {
      if (!USERNAME_REGEX_ADMIN.test(username)) {
        return res.status(400).json({ message: 'Некорректный username: только A-Za-z0-9_-, 3–32 символа' });
      }
      const existing = await storage.getUserByUsername(username);
      if (existing && existing.id !== id) {
        return res.status(409).json({ message: 'Username уже занят' });
      }
      await storage.updateUserUsername(id, username);
    }

    if (email !== undefined) {
      if (!EMAIL_REGEX_ADMIN.test(email)) {
        return res.status(400).json({ message: 'Некорректный email' });
      }
      const existingByEmail = await storage.getUserByEmail(email);
      if (existingByEmail && existingByEmail.id !== id) {
        return res.status(409).json({ message: 'Email уже занят' });
      }
      // Для смены email через админку не требуем подтверждения
      await db.update(users).set({ email }).where(eq(users.id, id));
    }

    await logAction(req, 'edit_user_fields', 'user', id, `Fields updated: ${Object.keys(req.body).join(', ')}`);
    const updated = await storage.getUser(id);
    if (!updated) return res.status(404).json({ message: 'User not found after update' });
    const { password: _p, ...safeUser } = updated;
    res.json({ user: safeUser });
  } catch (error) {
    console.error('Error updating user fields:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Удалить пользователя окончательно (физическое удаление)
router.delete('/users/:id/permanent', jwtAuth, requireFullAdmin, async (req, res) => {
  try {
    const { id } = req.params;

    // Проверяем, существует ли пользователь
    const user = await storage.getUser(id);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Запрещаем удалять самого себя
    if (id === req.user!.userId) {
      return res.status(400).json({ message: 'Cannot delete yourself' });
    }

    // Рекомендуем сначала сделать мягкое удаление
    if (user.status !== 'deleted') {
      return res.status(400).json({ 
        message: 'User must be soft-deleted first. Use DELETE /users/:id instead.' 
      });
    }

    // Выполняем физическое удаление
    const result = await storage.permanentDeleteUser(id);

    if (!result.success) {
      if (result.clubsWithMembers && result.clubsWithMembers.length > 0) {
        return res.status(400).json({ 
          message: result.error,
          clubs: result.clubsWithMembers
        });
      }
      return res.status(500).json({ message: result.error || 'Failed to permanently delete user' });
    }

    await logAction(
      req,
      'permanent_delete_user',
      'user',
      id,
      'User permanently deleted by admin',
      'deleted',
      'permanently_deleted'
    );

    res.json({ message: 'User permanently deleted successfully' });
  } catch (error) {
    console.error('Error permanently deleting user:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Получить список удаленных пользователей
router.get('/users/deleted', jwtAuth, requireAdmin, async (req, res) => {
  try {
    const sort = parseAdminUserSort(req.query);
    const conditions = buildAdminUsersWhere({
      includeDeleted: true,
      status: 'deleted',
    });

    const result = await queryAdminUsersWithStats({ conditions, ...sort });
    res.json({ users: result.users });
  } catch (error) {
    console.error('Error fetching deleted users:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});


  return router;
}
