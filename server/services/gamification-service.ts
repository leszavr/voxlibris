import { and, asc, count, eq, sql } from 'drizzle-orm';
import {
  achievements,
  bookReadingStatus,
  directMessages,
  notes,
  sessionListeners,
  userAchievements,
  userActivityCounters,
  userProfiles,
  userStreaks,
  users,
  type Achievement,
} from '../../shared/schema.js';
import { logger } from '../lib/logger.js';
import { getIO } from '../lib/socket-registry.js';
import { getDbConnection } from '../repositories/BaseRepository.js';
import { activityService } from './activity-service.js';
import {
  compareCondition,
  daysSince,
  isProfileCompleted,
  normalizeExpectedValue,
  parseConditionsPayload,
  parseFavoriteGenres,
  toDateKey,
  toPreviousDateKey,
  type AwardedAchievementSummary,
  type CheckAndAwardResult,
  type ConditionScalar,
  type LiveActivityCounters,
  type NormalizedReconcileOptions,
  type ReconcileGamificationOptions,
  type ReconcileGamificationSummary,
  type UserStreakSummary,
  type UserGamificationSnapshot,
} from './gamification-conditions.js';
export type {
  AwardedAchievementSummary,
  CheckAndAwardResult,
  ReconcileGamificationOptions,
  ReconcileGamificationSummary,
  UserStreakSummary,
} from './gamification-conditions.js';

export class GamificationService {
  private readonly db = getDbConnection();

  private normalizeReconcileOptions(options: ReconcileGamificationOptions): NormalizedReconcileOptions {
    const parsedBatchSize = Number(options.batchSize);
    const parsedMaxUsers = Number(options.maxUsers);

    const batchSize = Number.isFinite(parsedBatchSize) && parsedBatchSize > 0
      ? Math.min(Math.trunc(parsedBatchSize), 500)
      : 100;
    const maxUsers = Number.isFinite(parsedMaxUsers) && parsedMaxUsers > 0
      ? Math.trunc(parsedMaxUsers)
      : null;
    const reason = typeof options.reason === 'string' && options.reason.trim().length > 0
      ? options.reason.trim()
      : 'reconcile_batch';

    return { batchSize, maxUsers, reason };
  }

  private async processReconcileUser(
    userId: string,
    reason: string,
    summary: ReconcileGamificationSummary,
  ): Promise<void> {
    try {
      const result = await this.syncUserStateAndAward(userId, reason);
      summary.processedUsers += 1;
      summary.checkedAchievements += result.checked;
      summary.awardedCount += result.awarded.length;
    } catch (error) {
      summary.failedUsers += 1;
      logger.warn({ err: error, userId }, '[gamification] reconcile user failed');
    }
  }

  async recordUserActivityAndAward(userId: string, reason = 'activity_event', activityAt = new Date()): Promise<CheckAndAwardResult> {
    await this.markUserActive(userId, activityAt);
    return this.syncUserStateAndAward(userId, reason);
  }

  async syncUserStateAndAward(userId: string, reason = 'manual_sync'): Promise<CheckAndAwardResult> {
    await this.syncUserActivityCounters(userId);
    return this.checkAndAward(userId, reason);
  }

  async reconcileUsers(options: ReconcileGamificationOptions = {}): Promise<ReconcileGamificationSummary> {
    const { batchSize, maxUsers, reason } = this.normalizeReconcileOptions(options);
    const summary: ReconcileGamificationSummary = {
      processedUsers: 0,
      checkedAchievements: 0,
      awardedCount: 0,
      failedUsers: 0,
    };
    let offset = 0;

    while (true) {
      const remaining = maxUsers === null ? batchSize : Math.max(maxUsers - summary.processedUsers, 0);
      if (remaining === 0) {
        break;
      }

      const currentBatchSize = Math.min(batchSize, remaining);
      const userRows = await this.db
        .select({ id: users.id })
        .from(users)
        .orderBy(asc(users.createdAt), asc(users.id))
        .limit(currentBatchSize)
        .offset(offset);

      if (userRows.length === 0) {
        break;
      }

      for (const row of userRows) {
        await this.processReconcileUser(row.id, reason, summary);
      }

      offset += userRows.length;
    }

    return summary;
  }

  async markUserActive(userId: string, activityAt = new Date()): Promise<UserStreakSummary> {
    const normalizedUserId = userId.trim();
    if (!normalizedUserId) {
      throw new Error('VALIDATION_ERROR: userId is required');
    }

    const today = toDateKey(activityAt);
    const yesterday = toPreviousDateKey(today);
    const existingRows = await this.db
      .select()
      .from(userStreaks)
      .where(eq(userStreaks.userId, normalizedUserId))
      .limit(1);

    const existing = existingRows[0] ?? null;
    if (!existing) {
      const insertedRows = await this.db
        .insert(userStreaks)
        .values({
          userId: normalizedUserId,
          currentStreakDays: 1,
          bestStreakDays: 1,
          lastActiveDate: today,
          updatedAt: new Date(),
        })
        .returning();

      const inserted = insertedRows[0];
      return {
        currentStreakDays: inserted?.currentStreakDays ?? 1,
        bestStreakDays: inserted?.bestStreakDays ?? 1,
        lastActiveDate: inserted?.lastActiveDate ?? today,
      };
    }

    if (existing.lastActiveDate === today) {
      return {
        currentStreakDays: existing.currentStreakDays,
        bestStreakDays: existing.bestStreakDays,
        lastActiveDate: existing.lastActiveDate,
      };
    }

    const nextCurrent = existing.lastActiveDate === yesterday
      ? existing.currentStreakDays + 1
      : 1;
    const nextBest = Math.max(existing.bestStreakDays, nextCurrent);

    await this.db
      .update(userStreaks)
      .set({
        currentStreakDays: nextCurrent,
        bestStreakDays: nextBest,
        lastActiveDate: today,
        updatedAt: new Date(),
      })
      .where(eq(userStreaks.userId, normalizedUserId));

    return {
      currentStreakDays: nextCurrent,
      bestStreakDays: nextBest,
      lastActiveDate: today,
    };
  }

  async checkStreaksDaily(now = new Date()): Promise<number> {
    const today = toDateKey(now);
    const yesterday = toPreviousDateKey(today);

    const staleRows = await this.db
      .select({ userId: userStreaks.userId })
      .from(userStreaks)
      .where(sql`${userStreaks.currentStreakDays} > 0 AND (${userStreaks.lastActiveDate} IS NULL OR ${userStreaks.lastActiveDate} < ${yesterday})`);

    if (staleRows.length === 0) {
      return 0;
    }

    await this.db
      .update(userStreaks)
      .set({
        currentStreakDays: 0,
        updatedAt: new Date(),
      })
      .where(sql`${userStreaks.currentStreakDays} > 0 AND (${userStreaks.lastActiveDate} IS NULL OR ${userStreaks.lastActiveDate} < ${yesterday})`);

    return staleRows.length;
  }

  async checkAndAward(userId: string, reason = 'manual_check'): Promise<CheckAndAwardResult> {
    const normalizedUserId = userId.trim();
    if (!normalizedUserId) {
      throw new Error('VALIDATION_ERROR: userId is required');
    }

    const activeAchievements = await this.db
      .select()
      .from(achievements)
      .where(eq(achievements.status, 'active'))
      .orderBy(asc(achievements.sortOrder), asc(achievements.createdAt));

    if (activeAchievements.length === 0) {
      return { checked: 0, awarded: [] };
    }

    const snapshot = await this.getUserSnapshot(normalizedUserId);
    const existingAwards = await this.db
      .select({ achievementId: userAchievements.achievementId })
      .from(userAchievements)
      .where(eq(userAchievements.userId, normalizedUserId));

    const awardedIds = new Set(existingAwards.map((item) => item.achievementId));
    const awarded: AwardedAchievementSummary[] = [];

    for (const achievement of activeAchievements) {
      if (awardedIds.has(achievement.id)) {
        continue;
      }

      if (!this.evaluateAchievement(achievement, snapshot)) {
        continue;
      }

      await this.db.insert(userAchievements).values({
        userId: normalizedUserId,
        achievementId: achievement.id,
        meta: {
          source: 'gamification-service',
          reason,
          awardedAt: new Date().toISOString(),
        },
      });

      awardedIds.add(achievement.id);

      const summary: AwardedAchievementSummary = {
        achievementId: achievement.id,
        code: achievement.code,
        titleRu: achievement.titleRu,
        iconType: achievement.iconType,
        badgeImageUrl: achievement.badgeImageUrl,
      };
      awarded.push(summary);

      try {
        await activityService.emitAchievementUnlocked({
          actorId: normalizedUserId,
          achievementId: achievement.id,
          achievementName: achievement.titleRu,
          achievementIcon: achievement.badgeImageUrl ?? undefined,
        });
      } catch (error) {
        logger.warn({ err: error, achievementId: achievement.id, userId: normalizedUserId }, '[gamification] emit achievement activity failed');
      }

      try {
        const io = getIO();
        io.to(`user:${normalizedUserId}`).emit('achievement:unlocked', {
          achievementId: achievement.id,
          code: achievement.code,
          titleRu: achievement.titleRu,
          iconType: achievement.iconType,
          badgeImageUrl: achievement.badgeImageUrl,
          awardedAt: new Date().toISOString(),
        });
      } catch (error) {
        logger.warn({ err: error, achievementId: achievement.id, userId: normalizedUserId }, '[gamification] socket emit failed');
      }
    }

    return {
      checked: activeAchievements.length,
      awarded,
    };
  }

  async syncUserActivityCounters(userId: string): Promise<void> {
    const normalizedUserId = userId.trim();
    if (!normalizedUserId) {
      throw new Error('VALIDATION_ERROR: userId is required');
    }

    const [completedBooksRow, sentDmRow, notesRow, joinedSessionsRow, profileRow] = await Promise.all([
      this.db
        .select({ count: count() })
        .from(bookReadingStatus)
        .where(and(eq(bookReadingStatus.userId, normalizedUserId), eq(bookReadingStatus.status, 'completed'))),
      this.db
        .select({ count: count() })
        .from(directMessages)
        .where(eq(directMessages.senderId, normalizedUserId)),
      this.db
        .select({ count: count() })
        .from(notes)
        .where(eq(notes.userId, normalizedUserId)),
      this.db
        .select({ count: sql<number>`COUNT(DISTINCT ${sessionListeners.sessionId})` })
        .from(sessionListeners)
        .where(eq(sessionListeners.listenerId, normalizedUserId)),
      this.db
        .select({
          followersCount: userProfiles.followersCount,
          followingCount: userProfiles.followingCount,
        })
        .from(userProfiles)
        .where(eq(userProfiles.userId, normalizedUserId))
        .limit(1),
    ]);

    const completedBooksCount = completedBooksRow[0]?.count ?? 0;
    const sentDmCount = sentDmRow[0]?.count ?? 0;
    const notesCreatedCount = notesRow[0]?.count ?? 0;
    const clubSessionsJoinedCount = joinedSessionsRow[0]?.count ?? 0;
    const profile = profileRow[0];

    await this.db
      .insert(userActivityCounters)
      .values({
        userId: normalizedUserId,
        completedBooksCount,
        sentDmCount,
        followingCountSnapshot: profile?.followingCount ?? 0,
        followersCountSnapshot: profile?.followersCount ?? 0,
        clubSessionsJoinedCount,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: userActivityCounters.userId,
        set: {
          completedBooksCount,
          sentDmCount,
          followingCountSnapshot: profile?.followingCount ?? 0,
          followersCountSnapshot: profile?.followersCount ?? 0,
          clubSessionsJoinedCount,
          updatedAt: new Date(),
        },
      });

    logger.debug({
      userId: normalizedUserId,
      completedBooksCount,
      sentDmCount,
      clubSessionsJoinedCount,
      notesCreatedCount,
    }, '[gamification] counters synced');
  }

  private evaluateAchievement(achievement: Achievement, snapshot: UserGamificationSnapshot): boolean {
    const parsed = parseConditionsPayload(achievement.conditionsPayload);
    if (parsed.items.length === 0) {
      return false;
    }

    const results = parsed.items.map((condition) => {
      const actualValue = this.resolveBlockValue(condition.blockCode, snapshot);
      const expectedValue = normalizeExpectedValue(condition.valueType, condition.value);
      return compareCondition(actualValue, condition.operator, expectedValue);
    });

    return parsed.logic === 'OR' ? results.some(Boolean) : results.every(Boolean);
  }

  private resolveBlockValue(blockCode: string, snapshot: UserGamificationSnapshot): ConditionScalar {
    // Сначала попытаемся распознать blockCode как source_key (для обратной совместимости с hardcoded switch)
    // Если blockCode содержит точку, скорее всего это уже source_key
    if (blockCode.includes('.')) {
      return this.resolveFieldValue(blockCode, snapshot);
    }

    // Иначе используем legacy mapping для старых blockCode'ов
    // Это обеспечивает обратную совместимость до полной миграции на source_key
    const legacyMapping: Record<string, string> = {
      'tenure_days': 'derived.tenure_days',
      'completed_books': 'user_activity_counters.completed_books_count',
      'current_streak_days': 'user_streaks.current_streak_days',
      'sent_dm_count': 'user_activity_counters.sent_dm_count',
      'following_count': 'user_activity_counters.following_count_snapshot',
      'followers_count': 'user_activity_counters.followers_count_snapshot',
      'club_sessions_joined': 'user_activity_counters.club_sessions_joined_count',
      'notes_created_count': 'derived.notes_created_count',
      'profile_completed': 'derived.profile_completed',
      'favorite_genre': 'derived.favorite_genres',
    };

    const sourceKey = legacyMapping[blockCode];
    if (!sourceKey) {
      // Неизвестный blockCode и не может быть распознан как source_key
      return null;
    }

    return this.resolveFieldValue(sourceKey, snapshot);
  }

  /**
   * Универсальный резолвер, который распознаёт source_key (например, "users.role", "derived.tenure_days")
   * и возвращает соответствующее значение из snapshot или вычисленное значение.
   */
  private resolveFieldValue(sourceKey: string, snapshot: UserGamificationSnapshot): ConditionScalar {
    const [namespace, field] = sourceKey.split('.');
    if (!namespace || !field) {
      return null;
    }

    const resolvers: Record<string, () => ConditionScalar> = {
      'users': () => this.resolveUsersField(field, snapshot),
      'user_activity_counters': () => this.resolveActivityCountersField(field, snapshot),
      'user_profiles': () => this.resolveUserProfilesField(field, snapshot),
      'user_streaks': () => this.resolveUserStreaksField(field, snapshot),
      'derived': () => this.resolveDerivedField(field, snapshot),
    };

    return resolvers[namespace]?.() ?? null;
  }

  private resolveUsersField(field: string, snapshot: UserGamificationSnapshot): ConditionScalar {
    if (field === 'role') return snapshot.userRole;
    return null;
  }

  private resolveActivityCountersField(field: string, snapshot: UserGamificationSnapshot): ConditionScalar {
    const mapping: Record<string, number> = {
      'completed_books_count': snapshot.completedBooksCount,
      'sent_dm_count': snapshot.sentDmCount,
      'following_count_snapshot': snapshot.followingCount,
      'followers_count_snapshot': snapshot.followersCount,
      'club_sessions_joined_count': snapshot.clubSessionsJoinedCount,
    };
    return mapping[field] ?? null;
  }

  private resolveUserProfilesField(field: string, snapshot: UserGamificationSnapshot): ConditionScalar {
    if (field === 'profile_completed') return snapshot.profileCompleted;
    return null;
  }

  private resolveUserStreaksField(field: string, snapshot: UserGamificationSnapshot): ConditionScalar {
    const mapping: Record<string, number> = {
      'current_streak_days': snapshot.currentStreakDays,
      'best_streak_days': snapshot.bestStreakDays,
    };
    return mapping[field] ?? null;
  }

  private resolveDerivedField(field: string, snapshot: UserGamificationSnapshot): ConditionScalar {
    switch (field) {
      case 'tenure_days':
        return daysSince(snapshot.registeredAt);
      case 'notes_created_count':
        return snapshot.notesCreatedCount;
      case 'profile_completed':
        return snapshot.profileCompleted;
      case 'favorite_genres':
        return snapshot.favoriteGenres;
      default:
        return null;
    }
  }

  private async getUserSnapshot(userId: string): Promise<UserGamificationSnapshot> {
    const [userRow, profileRow, countersRow, streakRow] = await Promise.all([
      this.db
        .select({ createdAt: users.createdAt, role: users.role })
        .from(users)
        .where(eq(users.id, userId))
        .limit(1),
      this.db
        .select({
          displayName: userProfiles.displayName,
          avatar: userProfiles.avatar,
          bio: userProfiles.bio,
          favoriteGenres: userProfiles.favoriteGenres,
          followersCount: userProfiles.followersCount,
          followingCount: userProfiles.followingCount,
        })
        .from(userProfiles)
        .where(eq(userProfiles.userId, userId))
        .limit(1),
      this.db
        .select()
        .from(userActivityCounters)
        .where(eq(userActivityCounters.userId, userId))
        .limit(1),
      this.db
        .select()
        .from(userStreaks)
        .where(eq(userStreaks.userId, userId))
        .limit(1),
    ]);

    const user = userRow[0];
    if (!user) {
      throw new Error('NOT_FOUND: user not found');
    }

    const profile = profileRow[0] ?? null;
    const counters = countersRow[0] ?? null;
    const streak = streakRow[0] ?? null;
    const liveCounters = counters ? null : await this.getLiveActivityCounters(userId);

    return {
      userId,
      registeredAt: user.createdAt,
      userRole: user.role ?? 'user',
      completedBooksCount: counters?.completedBooksCount ?? liveCounters?.completedBooksCount ?? 0,
      sentDmCount: counters?.sentDmCount ?? liveCounters?.sentDmCount ?? 0,
      followingCount: counters?.followingCountSnapshot ?? profile?.followingCount ?? 0,
      followersCount: counters?.followersCountSnapshot ?? profile?.followersCount ?? 0,
      clubSessionsJoinedCount: counters?.clubSessionsJoinedCount ?? liveCounters?.clubSessionsJoinedCount ?? 0,
      notesCreatedCount: await this.getNotesCount(userId),
      currentStreakDays: streak?.currentStreakDays ?? 0,
      bestStreakDays: streak?.bestStreakDays ?? 0,
      profileCompleted: isProfileCompleted(profile),
      favoriteGenres: parseFavoriteGenres(profile?.favoriteGenres ?? null),
    };
  }

  private async getNotesCount(userId: string): Promise<number> {
    const rows = await this.db
      .select({ count: count() })
      .from(notes)
      .where(eq(notes.userId, userId));

    return rows[0]?.count ?? 0;
  }

  private async getLiveActivityCounters(userId: string): Promise<LiveActivityCounters> {
    const [completedBooksRow, sentDmRow, joinedSessionsRow] = await Promise.all([
      this.db
        .select({ count: count() })
        .from(bookReadingStatus)
        .where(and(eq(bookReadingStatus.userId, userId), eq(bookReadingStatus.status, 'completed'))),
      this.db
        .select({ count: count() })
        .from(directMessages)
        .where(eq(directMessages.senderId, userId)),
      this.db
        .select({ count: sql<number>`COUNT(DISTINCT ${sessionListeners.sessionId})` })
        .from(sessionListeners)
        .where(eq(sessionListeners.listenerId, userId)),
    ]);

    return {
      completedBooksCount: completedBooksRow[0]?.count ?? 0,
      sentDmCount: sentDmRow[0]?.count ?? 0,
      clubSessionsJoinedCount: joinedSessionsRow[0]?.count ?? 0,
    };
  }

  async listAwardedAchievements(userId: string): Promise<AwardedAchievementSummary[]> {
    const normalizedUserId = userId.trim();
    if (!normalizedUserId) {
      throw new Error('VALIDATION_ERROR: userId is required');
    }

    const rows = await this.db
      .select({
        achievementId: achievements.id,
        code: achievements.code,
        titleRu: achievements.titleRu,
        iconType: achievements.iconType,
        badgeImageUrl: achievements.badgeImageUrl,
      })
      .from(userAchievements)
      .innerJoin(achievements, eq(userAchievements.achievementId, achievements.id))
      .where(eq(userAchievements.userId, normalizedUserId))
      .orderBy(asc(achievements.sortOrder), asc(achievements.createdAt));

    return rows;
  }

  async getUserStreak(userId: string): Promise<UserStreakSummary> {
    const normalizedUserId = userId.trim();
    if (!normalizedUserId) {
      throw new Error('VALIDATION_ERROR: userId is required');
    }

    const rows = await this.db
      .select()
      .from(userStreaks)
      .where(eq(userStreaks.userId, normalizedUserId))
      .limit(1);

    const streak = rows[0];
    if (!streak) {
      return {
        currentStreakDays: 0,
        bestStreakDays: 0,
        lastActiveDate: null,
      };
    }

    return {
      currentStreakDays: streak.currentStreakDays,
      bestStreakDays: streak.bestStreakDays,
      lastActiveDate: streak.lastActiveDate,
    };
  }

  async hasAchievement(userId: string, achievementId: string): Promise<boolean> {
    const rows = await this.db
      .select({ id: userAchievements.id })
      .from(userAchievements)
      .where(and(eq(userAchievements.userId, userId), eq(userAchievements.achievementId, achievementId)))
      .limit(1);

    return rows.length > 0;
  }

  /**
   * Этап 6: Dry-run диагностика для отладки условий.
   * Возвращает детальный результат вычисления каждого условия.
   */
  async dryRunAchievement(userId: string, conditionsPayload: unknown): Promise<{
    snapshot: UserGamificationSnapshot;
    conditions: Array<{
      blockCode: string;
      operator: string;
      expectedValue: unknown;
      actualValue: unknown;
      result: boolean;
    }>;
    overallResult: boolean;
    logic: string;
  }> {
    const snapshot = await this.getUserSnapshot(userId);
    const parsed = parseConditionsPayload(conditionsPayload);

    const conditions = parsed.items.map((condition) => {
      const actualValue = this.resolveBlockValue(condition.blockCode, snapshot);
      const expectedValue = normalizeExpectedValue(condition.valueType, condition.value);
      const result = compareCondition(actualValue, condition.operator, expectedValue);

      return {
        blockCode: condition.blockCode,
        operator: condition.operator,
        expectedValue,
        actualValue,
        result,
      };
    });

    const overallResult = parsed.logic === 'OR' ? conditions.some(c => c.result) : conditions.every(c => c.result);

    return {
      snapshot,
      conditions,
      overallResult,
      logic: parsed.logic,
    };
  }
}

export const gamificationService = new GamificationService();
