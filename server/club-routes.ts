import express from 'express';
import { z } from 'zod';
import { jwtAuth, optionalJwtAuth, requireActiveUser } from './jwt-middleware.js';
import { storage } from './repositories/index.js';
import { db } from './db.js';
import { clubs, clubMembers, clubTypes, commercePrices, commerceProductFeatures, commerceProducts, readerClubTariffAssignments, readerClubTariffRequests, readerClubTariffTemplates, readerRatings, readingSessions, sessionQuestions, users } from '../shared/schema.js';
import { and, desc, eq, ne, sql } from 'drizzle-orm';
import type { InsertClub, ClubMemberRole, Club, UserRole, ClubType } from '../shared/schema.js';
import { emailService } from './services/email-service.js';
import { logger } from './lib/logger.js';
import { serializeClub, serializeClubList, serializeClubMembers } from './lib/client-serializers.js';
import { sanitizeClubSettingsInput } from './lib/club-settings-sanitizer.js';
import { storeOptimizedImageIfNeeded } from './lib/uploaded-image-storage.js';
import { liveSessionsStore } from './lib/live-sessions-store.js';
import { gamificationService } from './services/gamification-service.js';
import { canCreateReaderLedClubForUser, isReaderLedClub } from './lib/reader-club-access.js';
import { getFeatureFlag } from './lib/feature-flags.js';
import { sessionAnalyticsService } from './services/session-analytics-service.js';
import { EntitlementError, EntitlementService } from './services/commerce/entitlement-service.js';
import clubCalendarRoutes from './routes/clubs/calendar.js';
import clubInvitationRoutes from './routes/clubs/invitations.js';
import clubOwnershipRoutes from './routes/clubs/ownership.js';

function isFuture(value: Date | string | null | undefined): boolean {
  return value ? new Date(value).getTime() > Date.now() : false;
}
import { CommerceService } from './services/monetization.js';

const router = express.Router();

router.use('/', clubCalendarRoutes);

const tariffRequestSchema = z.object({
  title: z.string().min(1).max(180),
  description: z.string().optional().nullable(),
  requestedAmountRub: z.number().int().positive(),
  requestedPeriod: z.enum(['week', 'month', 'quarter', 'year']),
  message: z.string().optional().nullable(),
});

const memberModerationSchema = z.object({
  action: z.enum(['mute', 'unmute', 'deactivate', 'reactivate']),
  until: z.string().datetime().optional().nullable(),
  reason: z.string().max(500).optional().nullable(),
});

function normalizeClubType(value: unknown): ClubType {
  if (typeof value === 'string' && (clubTypes as readonly string[]).includes(value)) {
    return value as ClubType;
  }

  return 'standard';
}

function normalizeClubPrivacy(type: ClubType, requestedIsPrivate: unknown): boolean {
  if (type === 'reader-led') {
    return true;
  }

  return requestedIsPrivate === true;
}

// Helper: проверка доступа к приватному клубу
// Админы и модераторы системы имеют доступ ко всем клубам
async function canAccessPrivateClub(
  club: Club,
  userId: string,
  userRole: UserRole
): Promise<{ allowed: boolean; reason?: string }> {
  // Админы и модераторы системы имеют доступ ко всем клубам
  if (userRole === 'admin' || userRole === 'moderator') {
    return { allowed: true };
  }

  // Публичные клубы доступны всем
  if (!club.isPrivate) {
    return { allowed: true };
  }

  // Для приватных клубов проверяем членство
  const membership = await storage.getUserClubMembership(club.id, userId);
  if (membership?.isActive) {
    return { allowed: true };
  }

  return { 
    allowed: false, 
    reason: 'Это закрытый клуб. Для доступа необходимо получить приглашение от участника клуба.' 
  };
}

async function canAccessReaderLedClub(club: Club, userId: string, userRole: UserRole) {
  if (!isReaderLedClub(club) || userRole === 'admin' || userRole === 'moderator' || club.ownerId === userId) {
    return true;
  }

  return (await new EntitlementService().can(userId, 'reader_club_access', { scopeType: 'reader_club', scopeId: club.id })).allowed;
}

function isElevatedRole(role: string | undefined) {
  return role === 'admin' || role === 'moderator';
}

async function countOwnedStandardClubs(userId: string) {
  const [row] = await db.select({ count: sql<number>`count(*)::int` }).from(clubs)
    .where(and(eq(clubs.ownerId, userId), ne(clubs.type, 'reader-led')));
  return row?.count ?? 0;
}

function entitlementDenied(error: EntitlementError) {
  return { message: error.message, code: error.code, featureKey: error.featureKey, upgradeUrl: '/pricing' };
}

async function requireReaderClubOwner(clubId: string, userId: string) {
  const club = await storage.getClub(clubId);
  if (!club) return { error: { status: 404, message: 'Club not found' } };
  if (!isReaderLedClub(club)) return { error: { status: 400, message: 'Монетизация доступна только клубам чтецов' } };

  const membership = await storage.getUserClubMembership(club.id, userId);
  if (club.ownerId !== userId && membership?.role !== 'owner') {
    return { error: { status: 403, message: 'Only club owner can manage monetization' } };
  }

  return { club };
}


/**
 * POST /api/clubs
 * Создание нового клуба (только для активных пользователей)
 */
  router.post('/', jwtAuth, requireActiveUser, async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    const sanitizedSettings = sanitizeClubSettingsInput(req.body.settings);
    const coverImage = await storeOptimizedImageIfNeeded(req.body.coverImage, {
      type: 'background',
      keyPrefix: `clubs/${req.user.userId}`,
      filenamePrefix: 'cover',
    });

    const clubType = normalizeClubType(req.body.type);

    if (clubType === 'reader-led' && !await canCreateReaderLedClubForUser(req.user.userId, req.user.role)) {
      return res.status(403).json({
        message: 'Создание клуба чтецов доступно только после одобрения администрацией платформы.',
        code: 'READER_LED_CLUB_CREATION_REQUIRES_APPROVAL',
      });
    }

    if (clubType !== 'reader-led' && !isElevatedRole(req.user.role)) {
      try {
        await new EntitlementService().assertLimit(req.user.userId, 'clubs.owned.max_count', await countOwnedStandardClubs(req.user.userId), { scopeType: 'platform' });
      } catch (error) {
        if (error instanceof EntitlementError) return res.status(403).json(entitlementDenied(error));
        throw error;
      }
    }

    if (clubType !== 'reader-led' && Boolean(req.body.isPrivate) && !isElevatedRole(req.user.role)) {
      try {
        await new EntitlementService().assertCan(req.user.userId, 'club.private.enabled', { scopeType: 'club' });
      } catch (error) {
        if (error instanceof EntitlementError) return res.status(403).json(entitlementDenied(error));
        throw error;
      }
    }

    // Валидация данных
    const clubData: InsertClub & { ownerId: string; status: Club['status'] } = {
      title: req.body.title,
      description: req.body.description,
      coverImage,
      bookId: req.body.bookId, // необязательное - книга загружается отдельно
      ownerId: req.user.userId,
      type: clubType,
      maxMembers: req.body.maxMembers || 50,
      isPrivate: normalizeClubPrivacy(clubType, req.body.isPrivate),
      schedule: req.body.schedule,
      settings: sanitizedSettings,
      // Обычные пользователи создают клубы со статусом pending (требуется модерация).
      // Админы и модераторы создают клубы со статусом recruiting (без модерации).
      status: (req.user.role === 'admin' || req.user.role === 'moderator') ? 'recruiting' : 'pending',
    };

    // Проверяем обязательное поле title
    if (!clubData.title) {
      return res.status(400).json({ 
        message: 'Title is required' 
      });
    }

    // Проверяем уникальность названия клуба
    const existingClub = await storage.getClubByTitle(clubData.title);
    if (existingClub) {
      return res.status(409).json({ 
        message: 'Клуб с таким названием уже существует' 
      });
    }

    // Книга загружается отдельно через /api/clubs/:id/books/upload после создания клуба
    // bookId не используется при создании
    clubData.bookId = undefined;

    // Создаем клуб (владелец автоматически добавляется в createClub)
    const club = await storage.createClub(clubData);

    if (club.status === 'pending') {
      logger.info(`[Clubs] Club "${club.title}" created by user ${req.user.username} - pending moderation`);
      
      // Отправляем уведомление администраторам о новом клубе на модерации
      try {
        const admins = await storage.getUsersByRole('admin');
        const adminEmails = admins
          .filter(admin => admin.email && admin.emailConfirmed)
          .map(admin => admin.email);
        const creator = await storage.getUser(req.user.userId);
        const creatorEmail = creator?.email ?? '';

        if (adminEmails.length > 0) {
          await emailService.sendClubModerationNotification({
            adminEmails,
            clubId: club.id,
            clubTitle: club.title,
            clubDescription: club.description || undefined,
            clubType: club.type,
            isPrivate: club.isPrivate,
            creatorUsername: req.user.username,
            creatorEmail,
            createdAt: club.createdAt,
          });
        } else {
          logger.warn('[Clubs] No admin emails available for moderation notification');
        }
      } catch (emailError) {
        // Не прерываем создание клуба, если email не отправлен
        logger.error({ error: emailError }, '[Clubs] Failed to send moderation notification to admins');
      }
    } else {
      logger.info(`[Clubs] Club "${club.title}" created by ${req.user.role} ${req.user.username}`);
    }

    res.status(201).json(club);
  } catch (error) {
    console.error('Error creating club:', error);
    res.status(500).json({ message: 'Failed to create club' });
  }
});

/**
 * GET /api/clubs/catalog
 * Получить все клубы для каталога (публичные и приватные)
 * Не требует аутентификации
 */
router.get('/catalog', async (req, res) => {
  try {
    const rawLimit = typeof req.query.limit === 'string' ? Number.parseInt(req.query.limit, 10) : undefined;
    const limit = Number.isFinite(rawLimit) && rawLimit && rawLimit > 0 ? rawLimit : undefined;
    const rawOffset = typeof req.query.offset === 'string' ? Number.parseInt(req.query.offset, 10) : undefined;
    const offset = Number.isFinite(rawOffset) && rawOffset !== undefined && rawOffset >= 0 ? rawOffset : undefined;
    const searchQuery = typeof req.query.q === 'string' ? req.query.q.trim() : undefined;
    const type = typeof req.query.type === 'string' ? req.query.type : undefined;
    const clubs = await storage.getPublicCatalogClubs(limit, offset, searchQuery, type);

    // Поисковые запросы не кэшируем, общий каталог можно кэшировать.
    if (searchQuery) {
      res.setHeader('Cache-Control', 'no-store');
    } else {
      res.setHeader('Cache-Control', 'public, max-age=300, stale-while-revalidate=3600');
    }
    res.json(clubs);
  } catch (error) {
    console.error('Error getting catalog clubs:', error);
    res.status(500).json({ message: 'Failed to get clubs' });
  }
});

/**
 * GET /api/clubs/landing-reader-clubs/status
 * Публичный флаг видимости секции клубов чтецов на лендинге.
 */
router.get('/landing-reader-clubs/status', async (_req, res) => {
  try {
    const enabled = await getFeatureFlag('landing.readerClubs.enabled', false);
    res.setHeader('Cache-Control', 'public, max-age=60, stale-while-revalidate=300');
    res.json({ enabled });
  } catch (error) {
    console.error('Error getting landing reader clubs status:', error);
    res.status(500).json({ message: 'Failed to get landing reader clubs status' });
  }
});

/**
 * GET /api/clubs
 * Получить список клубов пользователя
 */
router.get('/', jwtAuth, async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    const clubs = await storage.getClubsByUser(req.user.userId);
    res.json(serializeClubList(clubs));
  } catch (error) {
    console.error('Error getting clubs:', error);
    res.status(500).json({ message: 'Failed to get clubs' });
  }
});

/**
 * GET /api/clubs/:id
 * Получить детали клуба
 */
router.get('/:id', optionalJwtAuth, async (req, res) => {
  try {
    const club = await storage.getClub(req.params.id);
    if (!club) {
      return res.status(404).json({ message: 'Club not found' });
    }

    const paidReaderClub = isReaderLedClub(club)
      && (await new CommerceService().listPublicProducts({ type: 'reader_club_subscription', scopeType: 'reader_club', scopeId: club.id })).length > 0;

    if (!req.user) {
      if (paidReaderClub) {
        return res.status(403).json({
          message: 'Для доступа к клубу чтеца нужна активная подписка.',
          code: 'READER_CLUB_ACCESS_REQUIRED',
          feature: 'reader_club_access',
        });
      }

      if (club.isPrivate) {
        return res.status(403).json({
          message: 'Это закрытый клуб. Для доступа необходимо получить приглашение от участника клуба.',
          code: 'PRIVATE_CLUB_ACCESS_DENIED',
          isPrivate: true,
        });
      }

      return res.json(serializeClub(club, null));
    }

    if (paidReaderClub && !await canAccessReaderLedClub(club, req.user.userId, req.user.role as UserRole)) {
      return res.status(403).json({
        message: 'Для доступа к клубу чтеца нужна активная подписка.',
        code: 'READER_CLUB_ACCESS_REQUIRED',
        feature: 'reader_club_access',
      });
    }

    // Проверяем доступ к приватному клубу
    const access = await canAccessPrivateClub(club, req.user.userId, req.user.role as UserRole);
    if (!access.allowed) {
      return res.status(403).json({ 
        message: access.reason,
        code: 'PRIVATE_CLUB_ACCESS_DENIED',
        isPrivate: true
      });
    }

    if (!paidReaderClub && !await canAccessReaderLedClub(club, req.user.userId, req.user.role as UserRole)) {
      return res.status(403).json({
        message: 'Для доступа к клубу чтеца нужна активная подписка.',
        code: 'READER_CLUB_ACCESS_REQUIRED',
        feature: 'reader_club_access',
      });
    }

    const membership = await storage.getUserClubMembership(club.id, req.user.userId);
    res.json(serializeClub(club, membership?.isActive ? membership.role : null));
  } catch (error) {
    console.error('Error getting club:', error);
    res.status(500).json({ message: 'Failed to get club' });
  }
});

/**
 * PUT /api/clubs/:id
 * Обновить клуб (только владелец)
 */
router.put('/:id', jwtAuth, async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    const club = await storage.getClub(req.params.id);
    if (!club) {
      return res.status(404).json({ message: 'Club not found' });
    }

    // Проверяем, является ли пользователь владельцем
    const membership = await storage.getUserClubMembership(club.id, req.user.userId);
    if (membership?.role !== 'owner') {
      return res.status(403).json({ message: 'Only club owner can update club' });
    }

    if (!isReaderLedClub(club) && req.body.isPrivate === true && !club.isPrivate && !isElevatedRole(req.user.role)) {
      try {
        await new EntitlementService().assertCan(req.user.userId, 'club.private.enabled', { scopeType: 'club', scopeId: club.id });
      } catch (error) {
        if (error instanceof EntitlementError) return res.status(403).json(entitlementDenied(error));
        throw error;
      }
    }

    const sanitizedSettings = sanitizeClubSettingsInput(req.body.settings);
    const coverImage = await storeOptimizedImageIfNeeded(req.body.coverImage, {
      type: 'background',
      keyPrefix: `clubs/${club.id}`,
      filenamePrefix: 'cover',
    });

    const updates: Partial<InsertClub> = {
      title: req.body.title,
      description: req.body.description,
      coverImage,
      maxMembers: req.body.maxMembers,
      isPrivate: isReaderLedClub(club) ? true : req.body.isPrivate,
      schedule: req.body.schedule,
      settings: sanitizedSettings,
    };

    logger.info('[Clubs] Sanitized settings preview: %s', sanitizedSettings?.slice(0, 200));

    // Удаляем undefined значения
    Object.keys(updates).forEach(key => 
      updates[key as keyof typeof updates] === undefined && delete updates[key as keyof typeof updates]
    );

    const updatedClub = await storage.updateClub(club.id, updates);

    if (!updatedClub) {
      return res.status(500).json({ message: 'Ошибка при обновлении клуба' });
    }

    logger.info(`[Clubs] Club "${club.title}" updated by user ${req.user.username}`);
    logger.info('[Clubs] Updated club settings: %s', updatedClub.settings?.slice(0, 200));

    res.json(updatedClub);
  } catch (error) {
    console.error('Error updating club:', error);
    res.status(500).json({ message: 'Failed to update club' });
  }
});

router.get('/:id/monetization', jwtAuth, async (req, res) => {
  try {
    const access = await requireReaderClubOwner(req.params.id, req.user!.userId);
    if (access.error) return res.status(access.error.status).json({ message: access.error.message });

    const [assignmentRow] = await db.select({
      assignment: readerClubTariffAssignments,
      product: commerceProducts,
      price: commercePrices,
    })
      .from(readerClubTariffAssignments)
      .leftJoin(commerceProducts, eq(commerceProducts.id, readerClubTariffAssignments.productId))
      .leftJoin(commercePrices, and(eq(commercePrices.productId, readerClubTariffAssignments.productId), eq(commercePrices.isDefault, true), eq(commercePrices.status, 'active')))
      .where(and(eq(readerClubTariffAssignments.clubId, req.params.id), eq(readerClubTariffAssignments.status, 'active')))
      .limit(1);
    const templates = await db.select().from(readerClubTariffTemplates)
      .where(and(eq(readerClubTariffTemplates.status, 'active'), eq(readerClubTariffTemplates.visibility, 'public')))
      .orderBy(readerClubTariffTemplates.sortOrder, readerClubTariffTemplates.createdAt);
    const requests = await db.select().from(readerClubTariffRequests)
      .where(eq(readerClubTariffRequests.clubId, req.params.id))
      .orderBy(desc(readerClubTariffRequests.createdAt));

    res.json({
      assignment: assignmentRow ? {
        ...assignmentRow.assignment,
        productTitle: assignmentRow.product?.title ?? null,
        productDescription: assignmentRow.product?.description ?? null,
        amountRub: assignmentRow.price?.amountRub ?? null,
        period: assignmentRow.price?.period ?? null,
      } : null,
      templates,
      requests,
    });
  } catch (error) {
    console.error('Error getting club monetization:', error);
    res.status(500).json({ message: 'Failed to get club monetization' });
  }
});

router.post('/:id/monetization/select-template', jwtAuth, async (req, res) => {
  try {
    const access = await requireReaderClubOwner(req.params.id, req.user!.userId);
    if (access.error) return res.status(access.error.status).json({ message: access.error.message });

    const { templateId } = z.object({ templateId: z.string().min(1) }).parse(req.body);
    const [template] = await db.select().from(readerClubTariffTemplates)
      .where(and(eq(readerClubTariffTemplates.id, templateId), eq(readerClubTariffTemplates.status, 'active'), eq(readerClubTariffTemplates.visibility, 'public')))
      .limit(1);
    if (!template) return res.status(404).json({ message: 'Tariff template not found' });

    const [assignment] = await db.transaction(async (tx) => {
      await tx.update(readerClubTariffAssignments)
        .set({ status: 'inactive', updatedAt: new Date() })
        .where(and(eq(readerClubTariffAssignments.clubId, req.params.id), eq(readerClubTariffAssignments.status, 'active')));

      const [product] = await tx.insert(commerceProducts).values({
        type: 'reader_club_subscription',
        scopeType: 'reader_club',
        scopeId: req.params.id,
        code: `reader_club_${req.params.id}_${Date.now()}`,
        title: template.title,
        description: template.description,
        status: 'active',
        visibility: 'public',
        metadata: { tariffTemplateId: template.id },
      }).returning();
      await tx.insert(commercePrices).values({ productId: product.id, amountRub: template.amountRub, period: template.period, isDefault: true });
      await tx.insert(commerceProductFeatures).values({ productId: product.id, label: 'Доступ к клубу чтеца', featureKey: 'reader_club_access', valueType: 'boolean', valueBool: true, isHighlighted: true });
      return tx.insert(readerClubTariffAssignments).values({
        clubId: req.params.id,
        templateId: template.id,
        productId: product.id,
        selectedBy: req.user!.userId,
        readerShareBps: template.readerShareBps,
        acquiringFeeBps: template.acquiringFeeBps,
      }).returning();
    });

    res.status(201).json(assignment);
  } catch (error) {
    console.error('Error selecting club tariff:', error);
    res.status(500).json({ message: 'Failed to select club tariff' });
  }
});

router.post('/:id/monetization/tariff-requests', jwtAuth, async (req, res) => {
  try {
    const access = await requireReaderClubOwner(req.params.id, req.user!.userId);
    if (access.error) return res.status(access.error.status).json({ message: access.error.message });
    const payload = tariffRequestSchema.parse(req.body);
    const [request] = await db.insert(readerClubTariffRequests).values({ ...payload, clubId: req.params.id, requestedBy: req.user!.userId }).returning();
    res.status(201).json(request);
  } catch (error) {
    console.error('Error creating tariff request:', error);
    res.status(500).json({ message: 'Failed to create tariff request' });
  }
});

/**
 * DELETE /api/clubs/:id
 * Удалить клуб (только владелец)
 */
router.delete('/:id', jwtAuth, async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    const club = await storage.getClub(req.params.id);
    if (!club) {
      return res.status(404).json({ message: 'Club not found' });
    }

    // Проверяем, является ли пользователь владельцем
    const membership = await storage.getUserClubMembership(club.id, req.user.userId);
    if (membership?.role !== 'owner') {
      return res.status(403).json({ message: 'Only club owner can delete club' });
    }

    await storage.deleteClub(club.id);

    logger.info(`[Clubs] Club "${club.title}" deleted by user ${req.user.username}`);

    res.json({ success: true, message: 'Club deleted successfully' });
  } catch (error) {
    console.error('Error deleting club:', error);
    res.status(500).json({ message: 'Failed to delete club' });
  }
});

/**
 * GET /api/clubs/:id/members
 * Получить список участников клуба
 */
router.get('/:id/members', jwtAuth, async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    const club = await storage.getClub(req.params.id);
    if (!club) {
      return res.status(404).json({ message: 'Club not found' });
    }

    const userRole = req.user.role as UserRole;
    const isSystemAdmin = userRole === 'admin' || userRole === 'moderator';
    const membership = await storage.getUserClubMembership(club.id, req.user.userId);

    if (!isSystemAdmin && !membership) {
      return res.status(403).json({
        message: 'Список участников доступен только участникам клуба',
        code: 'CLUB_MEMBERSHIP_REQUIRED'
      });
    }

    const members = await storage.getClubMembersWithRoles(req.params.id);
    const membersWithAchievements = await Promise.all(
      members.map(async (member) => {
        const awarded = await gamificationService.listAwardedAchievements(member.id);
        const muted = isFuture(member.mutedUntil);
        const deactivated = isFuture(member.deactivatedUntil);
        return {
          ...member,
          isActive: !deactivated,
          mutedUntil: muted ? member.mutedUntil : null,
          deactivatedUntil: deactivated ? member.deactivatedUntil : null,
          restrictionReason: muted || deactivated ? member.restrictionReason : null,
          achievements: awarded.slice(0, 3),
        };
      }),
    );

    res.json(serializeClubMembers(membersWithAchievements));
  } catch (error) {
    console.error('Error getting club members:', error);
    res.status(500).json({ message: 'Failed to get club members' });
  }
});

/**
 * GET /api/clubs/:id/leaderboard
 * Лидерборд клуба по активности участников
 */
router.get('/:id/leaderboard', jwtAuth, async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    const club = await storage.getClub(req.params.id);
    if (!club) {
      return res.status(404).json({ message: 'Club not found' });
    }

    const userRole = req.user.role as UserRole;
    const isSystemAdmin = userRole === 'admin' || userRole === 'moderator';
    const membership = await storage.getUserClubMembership(club.id, req.user.userId);

    if (!isSystemAdmin && !membership) {
      return res.status(403).json({
        message: 'Рейтинг клуба доступен только участникам клуба',
        code: 'CLUB_MEMBERSHIP_REQUIRED',
      });
    }

    const members = await storage.getClubMembersWithRoles(req.params.id);
    const withProfiles = await Promise.all(
      members.map(async (member) => {
        const profile = await storage.getUserProfile(member.id);
        const readerRating = profile?.readerRating ?? 0;
        const totalReadingSessions = profile?.totalReadingSessions ?? 0;
        const totalListeners = profile?.totalListeners ?? 0;
        const score = readerRating + (totalReadingSessions * 20) + (totalListeners * 2);

        return {
          userId: member.id,
          username: member.username,
          displayName: member.displayName ?? null,
          avatar: member.avatar ?? null,
          role: member.role,
          joinedAt: member.joinedAt,
          readerRating,
          totalReadingSessions,
          totalListeners,
          score,
        };
      }),
    );

    const sortedProfiles = [...withProfiles].sort((a, b) => b.score - a.score);

    const leaderboard = sortedProfiles
      .slice(0, 10)
      .map((entry, index) => ({
        rank: index + 1,
        ...entry,
      }));

    return res.json({
      club: {
        id: club.id,
        title: club.title,
      },
      leaderboard,
    });
  } catch (error) {
    console.error('Error getting club leaderboard:', error);
    return res.status(500).json({ message: 'Failed to get club leaderboard' });
  }
});

/**
 * PUT /api/clubs/:id/members/:userId/role
 * Изменить роль участника (только владелец и модераторы)
 */
router.put('/:id/members/:userId/role', jwtAuth, async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    const club = await storage.getClub(req.params.id);
    if (!club) {
      return res.status(404).json({ message: 'Club not found' });
    }

    // Проверяем права: владелец может менять любые роли, модератор только member
    const requesterMembership = await storage.getUserClubMembership(club.id, req.user.userId);
    if (!requesterMembership) {
      return res.status(403).json({ message: 'You are not a member of this club' });
    }

    if (requesterMembership.role !== 'owner' && requesterMembership.role !== 'moderator') {
      return res.status(403).json({ message: 'Only club owner or moderator can change roles' });
    }

    const newRole: ClubMemberRole = req.body.role;
    if (!['owner', 'moderator', 'member'].includes(newRole)) {
      return res.status(400).json({ message: 'Invalid role' });
    }

    // Модератор не может назначать владельцев или модераторов
    if (requesterMembership.role === 'moderator' && newRole !== 'member') {
      return res.status(403).json({ message: 'Moderators can only change role to member' });
    }

    if (isReaderLedClub(club) && newRole !== 'member') {
      return res.status(403).json({
        message: 'В клубе чтецов владелец-чтец единственный; назначение второго владельца или модератора запрещено.',
        code: 'READER_LED_SINGLE_READER_ONLY',
      });
    }

    const updatedMember = await storage.updateMemberRole(club.id, req.params.userId, newRole);

    logger.info(`[Clubs] User ${req.params.userId} role changed to ${newRole} in club "${club.title}"`);

    res.json(updatedMember);
  } catch (error) {
    console.error('Error updating member role:', error);
    res.status(500).json({ message: 'Failed to update member role' });
  }
});

/**
 * DELETE /api/clubs/:id/members/:userId
 * Удалить участника из клуба (владелец, модератор или сам участник)
 */
router.delete('/:id/members/:userId', jwtAuth, async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    const club = await storage.getClub(req.params.id);
    if (!club) {
      return res.status(404).json({ message: 'Club not found' });
    }

    const requesterMembership = await storage.getUserClubMembership(club.id, req.user.userId);
    if (!requesterMembership) {
      return res.status(403).json({ message: 'You are not a member of this club' });
    }

    const targetUserId = req.params.userId;

    // Пользователь может удалить себя
    if (targetUserId === req.user.userId) {
      await storage.removeMember(club.id, targetUserId);
      logger.info(`[Clubs] User ${req.user.username} left club "${club.title}"`);
      return res.json({ success: true, message: 'Successfully left the club' });
    }

    // Только владелец и модератор могут удалять других
    if (requesterMembership.role !== 'owner' && requesterMembership.role !== 'moderator') {
      return res.status(403).json({ message: 'Only club owner or moderator can remove members' });
    }

    // Владельца нельзя удалить
    const targetMembership = await storage.getUserClubMembership(club.id, targetUserId);
    if (targetMembership?.role === 'owner') {
      return res.status(403).json({ message: 'Cannot remove club owner' });
    }

    // Модератор не может удалять других модераторов
    if (requesterMembership.role === 'moderator' && targetMembership?.role === 'moderator') {
      return res.status(403).json({ message: 'Moderators cannot remove other moderators' });
    }

    await storage.removeMember(club.id, targetUserId);

    logger.info(`[Clubs] User ${targetUserId} removed from club "${club.title}" by ${req.user.username}`);

    res.json({ success: true, message: 'Member removed successfully' });
  } catch (error) {
    console.error('Error removing member:', error);
    res.status(500).json({ message: 'Failed to remove member' });
  }
});

router.patch('/:id/members/:userId/moderation', jwtAuth, async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    const club = await storage.getClub(req.params.id);
    if (!club) {
      return res.status(404).json({ message: 'Club not found' });
    }

    const requesterMembership = await storage.getUserClubMembership(club.id, req.user.userId);
    if (!requesterMembership || !['owner', 'moderator'].includes(requesterMembership.role)) {
      return res.status(403).json({ message: 'Only club owner or moderator can moderate members' });
    }

    const targetMembership = await storage.getUserClubMembership(club.id, req.params.userId);
    if (!targetMembership) {
      return res.status(404).json({ message: 'Member not found' });
    }

    if (targetMembership.role === 'owner' || (requesterMembership.role === 'moderator' && targetMembership.role === 'moderator')) {
      return res.status(403).json({ message: 'Cannot moderate this member' });
    }

    const payload = memberModerationSchema.parse(req.body);
    const until = payload.until ? new Date(payload.until) : null;
    if (until && Number.isNaN(until.getTime())) {
      return res.status(400).json({ message: 'Invalid until date' });
    }

    const base = {
      restrictionReason: payload.reason ?? null,
      restrictedBy: req.user.userId,
      restrictedAt: new Date(),
    };
    const changes = payload.action === 'mute'
      ? { ...base, mutedUntil: until }
      : payload.action === 'deactivate'
        ? { ...base, isActive: false, deactivatedUntil: until }
        : payload.action === 'unmute'
          ? { mutedUntil: null, restrictionReason: null, restrictedBy: null, restrictedAt: null }
          : { isActive: true, deactivatedUntil: null, restrictionReason: null, restrictedBy: null, restrictedAt: null };

    const [updated] = await db.update(clubMembers)
      .set(changes)
      .where(and(eq(clubMembers.clubId, club.id), eq(clubMembers.userId, req.params.userId)))
      .returning();

    res.json({
      ...targetMembership,
      role: updated.role,
      joinedAt: updated.joinedAt,
      isActive: updated.isActive,
      mutedUntil: updated.mutedUntil,
      deactivatedUntil: updated.deactivatedUntil,
      restrictionReason: updated.restrictionReason,
    });
  } catch (error) {
    console.error('Error moderating member:', error);
    res.status(500).json({ message: 'Failed to moderate member' });
  }
});

router.use('/', clubInvitationRoutes);

router.use('/', clubOwnershipRoutes);

/**
 * GET /api/clubs/:clubId/live-readers
 * Список активных чтецов клуба.
 * Источник истины для активных сессий - Redis, а очистка выполняется
 * через stop/disconnect/heartbeat TTL, а не через хрупкий per-request
 * опрос Icecast admin endpoint.
 */
router.get('/:clubId/live-readers', optionalJwtAuth, async (req, res) => {
  try {
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.set('Pragma', 'no-cache');
    res.set('Expires', '0');

    const { clubId } = req.params;
    const activeReaders = await liveSessionsStore.getByClub(clubId);

    res.json({ readers: activeReaders });
  } catch (error) {
    logger.error({ error }, '[Clubs] Error fetching live readers');
    res.status(500).json({ readers: [] });
  }
});

/**
 * GET /api/clubs/:clubId/reader-analytics
 * Краткая пост-аналитика клуба чтецов для владельца и системных модераторов.
 */
router.get('/:clubId/reader-analytics', jwtAuth, async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    const { clubId } = req.params;
    const club = await storage.getClub(clubId);
    if (!club) {
      return res.status(404).json({ message: 'Club not found' });
    }

    if (!isReaderLedClub(club)) {
      return res.status(404).json({ message: 'Reader-led club not found' });
    }

    const userRole = req.user.role as UserRole;
    const isSystemModerator = userRole === 'admin' || userRole === 'moderator';
    const isOwner = club.ownerId === req.user.userId;

    if (!isOwner && !isSystemModerator) {
      return res.status(403).json({ message: 'Only the reader club owner can view analytics' });
    }

    const summary = await sessionAnalyticsService.getClubAnalytics(clubId);
    const ratings = await db
      .select({
        id: readerRatings.id,
        sessionId: readerRatings.sessionId,
        sessionTitle: readingSessions.title,
        rating: readerRatings.rating,
        feedback: readerRatings.feedback,
        createdAt: readerRatings.createdAt,
        rater: {
          id: users.id,
          username: users.username,
        },
      })
      .from(readerRatings)
      .innerJoin(readingSessions, eq(readerRatings.sessionId, readingSessions.id))
      .innerJoin(users, eq(readerRatings.raterId, users.id))
      .where(eq(readingSessions.clubId, clubId))
      .orderBy(desc(readerRatings.createdAt))
      .limit(10);
    const questions = await db
      .select({
        id: sessionQuestions.id,
        sessionId: sessionQuestions.sessionId,
        sessionTitle: readingSessions.title,
        question: sessionQuestions.question,
        answer: sessionQuestions.answer,
        isAnswered: sessionQuestions.isAnswered,
        createdAt: sessionQuestions.createdAt,
        answeredAt: sessionQuestions.answeredAt,
        user: {
          id: users.id,
          username: users.username,
        },
      })
      .from(sessionQuestions)
      .innerJoin(readingSessions, eq(sessionQuestions.sessionId, readingSessions.id))
      .innerJoin(users, eq(sessionQuestions.userId, users.id))
      .where(eq(readingSessions.clubId, clubId))
      .orderBy(desc(sessionQuestions.createdAt))
      .limit(10);

    res.json({ summary, ratings, questions });
  } catch (error) {
    logger.error({ error }, '[Clubs] Error fetching reader club analytics');
    res.status(500).json({ message: 'Failed to get reader club analytics' });
  }
});

export default router;
