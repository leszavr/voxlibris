import { sql } from "drizzle-orm";
import { pgTable, text, varchar, integer, boolean, timestamp, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { users, User, Book, Club, ReadingSession } from "./core";
import { sessionReactions, sessionQuestions, sessionAnalytics } from "./reader";
import { clubMonetization, readerEarnings, listenerPayments, clubSubscriptions, calendarSubscriptionTokens, readingSchedule, sessionRecordings, readerQualityRatings, GuestBookFormat, GuestBookModerationStatus } from "./clubs";
import { guestAccounts, guestBooks, guestReadingPositions, guestAnalytics, insertGuestAccountSchema, insertGuestBookSchema, updateGuestBookSchema, insertGuestReadingPositionSchema, updateGuestReadingPositionSchema, insertGuestAnalyticsSchema } from "./clubs";
import { insertSessionReactionSchema, insertSessionQuestionSchema, updateSessionQuestionSchema, insertSessionAnalyticsSchema, insertClubMonetizationSchema, insertReaderEarningSchema, insertListenerPaymentSchema, insertClubSubscriptionSchema, insertReadingScheduleSchema, insertSessionRecordingSchema } from "./clubs";
import { insertReaderQualityRatingSchema, ClubReadingStatus } from "./clubs";

export type SessionReaction = typeof sessionReactions.$inferSelect;
export type InsertSessionReaction = z.infer<typeof insertSessionReactionSchema>;

export type SessionQuestion = typeof sessionQuestions.$inferSelect;
export type InsertSessionQuestion = z.infer<typeof insertSessionQuestionSchema>;
export type UpdateSessionQuestion = z.infer<typeof updateSessionQuestionSchema>;

export type SessionAnalytics = typeof sessionAnalytics.$inferSelect;
export type InsertSessionAnalytics = z.infer<typeof insertSessionAnalyticsSchema>;

export type ClubMonetization = typeof clubMonetization.$inferSelect;
export type InsertClubMonetization = z.infer<typeof insertClubMonetizationSchema>;

export type ReaderEarning = typeof readerEarnings.$inferSelect;
export type InsertReaderEarning = z.infer<typeof insertReaderEarningSchema>;

export type ListenerPayment = typeof listenerPayments.$inferSelect;
export type InsertListenerPayment = z.infer<typeof insertListenerPaymentSchema>;

export type ClubSubscription = typeof clubSubscriptions.$inferSelect;
export type InsertClubSubscription = z.infer<typeof insertClubSubscriptionSchema>;
export type CalendarSubscriptionToken = typeof calendarSubscriptionTokens.$inferSelect;

export type ReadingSchedule = typeof readingSchedule.$inferSelect;
export type InsertReadingSchedule = z.infer<typeof insertReadingScheduleSchema>;

export type SessionRecording = typeof sessionRecordings.$inferSelect;
export type InsertSessionRecording = z.infer<typeof insertSessionRecordingSchema>;

export type ReaderQualityRating = typeof readerQualityRatings.$inferSelect;
export type InsertReaderQualityRating = z.infer<typeof insertReaderQualityRatingSchema>;

// Extended Types
export interface ClubReadingStatusWithDetails extends ClubReadingStatus {
  user: User;
  book: Book;
  club: Club;
}

export interface SessionReactionWithDetails extends SessionReaction {
  user: User;
}

export interface SessionQuestionWithDetails extends SessionQuestion {
  user: User;
}

export interface SessionAnalyticsWithDetails extends SessionAnalytics {
  session: ReadingSession;
  club: Club;
  reader: User;
}

export interface ReaderEarningWithDetails extends ReaderEarning {
  session: ReadingSession;
  club: Club;
  reader: User;
}

export interface ReaderQualityRatingWithDetails extends ReaderQualityRating {
  ratedUser: User;
  raterUser: User;
  club?: Club;
}

// ============================================
// GUEST SYSTEM TYPES
// ============================================

// Guest Account Types
export type GuestAccount = typeof guestAccounts.$inferSelect;
export type InsertGuestAccount = z.infer<typeof insertGuestAccountSchema>;

// Guest Book Types
export type GuestBook = typeof guestBooks.$inferSelect;
export type InsertGuestBook = z.infer<typeof insertGuestBookSchema>;
export type UpdateGuestBook = z.infer<typeof updateGuestBookSchema>;

// Guest Reading Position Types
export type GuestReadingPosition = typeof guestReadingPositions.$inferSelect;
export type InsertGuestReadingPosition = z.infer<typeof insertGuestReadingPositionSchema>;
export type UpdateGuestReadingPosition = z.infer<typeof updateGuestReadingPositionSchema>;

// Guest Analytics Types
export type GuestAnalytics = typeof guestAnalytics.$inferSelect;
export type InsertGuestAnalytics = z.infer<typeof insertGuestAnalyticsSchema>;

// Guest API Response DTOs
export interface GuestAccountResponse {
  guestId: string;
  accessCode: string;
  expiresAt: string;
  hasBook: boolean;
  canRecover: boolean;
}

export interface GuestBookResponse {
  bookId: string;
  title: string;
  author: string;
  format: GuestBookFormat;
  wordCount: number;
  uploadedAt: string;
  expiresAt: string;
  moderationStatus: GuestBookModerationStatus;
}

export interface GuestReadingProgressResponse {
  progressPercent: number;
  currentPosition: Record<string, unknown>;
  readingTimeMinutes: number;
  lastReadAt: string;
}

export interface GuestAnalyticsSummaryResponse {
  totalReadingTime: number;
  sessionsCount: number;
  averageSessionTime: number;
  lastActivity: string;
}

// ============================================
// СОЦИАЛЬНЫЙ ГРАФ (SOCIAL GRAPH)
// ============================================

export const profileVisibilities = ['public', 'followers', 'private'] as const;
export type ProfileVisibility = typeof profileVisibilities[number];

export const dmPermissions = ['everyone', 'followers', 'nobody'] as const;
export type DmPermission = typeof dmPermissions[number];

// Подписки (follower → following)
export const userFollows = pgTable('user_follows', {
  id: varchar('id').primaryKey().default(sql`gen_random_uuid()`),
  followerId: varchar('follower_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  followingId: varchar('following_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  createdAt: timestamp('created_at').notNull().default(sql`now()`),
});

// Блокировки
export const userBlocks = pgTable('user_blocks', {
  id: varchar('id').primaryKey().default(sql`gen_random_uuid()`),
  blockerId: varchar('blocker_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  blockedId: varchar('blocked_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  createdAt: timestamp('created_at').notNull().default(sql`now()`),
});

// Муты (скрыть активность без блокировки)
export const userMutes = pgTable('user_mutes', {
  id: varchar('id').primaryKey().default(sql`gen_random_uuid()`),
  muterId: varchar('muter_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  mutedId: varchar('muted_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  createdAt: timestamp('created_at').notNull().default(sql`now()`),
});

// Настройки приватности профиля
export const userPrivacySettings = pgTable('user_privacy_settings', {
  userId: varchar('user_id').primaryKey().references(() => users.id, { onDelete: 'cascade' }),
  profileVisibility: text('profile_visibility').notNull().default('public').$type<ProfileVisibility>(),
  readingStatsVisible: boolean('reading_stats_visible').notNull().default(true),
  clubsVisible: boolean('clubs_visible').notNull().default(true),
  readingHistoryVisible: boolean('reading_history_visible').notNull().default(true),
  allowDmFrom: text('allow_dm_from').notNull().default('followers').$type<DmPermission>(),
  updatedAt: timestamp('updated_at').notNull().default(sql`now()`),
});

// Схемы валидации
export const insertUserFollowSchema = createInsertSchema(userFollows).pick({
  followingId: true,
});

export const insertUserPrivacySettingsSchema = createInsertSchema(userPrivacySettings).pick({
  profileVisibility: true,
  readingStatsVisible: true,
  clubsVisible: true,
  readingHistoryVisible: true,
  allowDmFrom: true,
});

// Типы
export type UserFollow = typeof userFollows.$inferSelect;
export type InsertUserFollow = typeof userFollows.$inferInsert;

export type UserBlock = typeof userBlocks.$inferSelect;
export type InsertUserBlock = typeof userBlocks.$inferInsert;

export type UserMute = typeof userMutes.$inferSelect;
export type InsertUserMute = typeof userMutes.$inferInsert;

export type UserPrivacySettings = typeof userPrivacySettings.$inferSelect;
export type InsertUserPrivacySettings = Pick<
  typeof userPrivacySettings.$inferInsert,
  | 'profileVisibility'
  | 'readingStatsVisible'
  | 'clubsVisible'
  | 'readingHistoryVisible'
  | 'allowDmFrom'
>;

// Расширенный тип публичного профиля
export interface PublicUserProfile {
  id: string;
  username: string;
  displayName: string | null;
  avatar: string | null;
  coverImage: string | null;
  bio: string | null;
  favoriteGenres: string[];
  isReader: boolean;
  readerRating: number;
  followersCount: number;
  followingCount: number;
  totalReadingSessions: number;
  totalListeners: number;
  createdAt: Date;
  // Социальный контекст (если viewer авторизован)
  isFollowing?: boolean;
  isFollowedBy?: boolean;
  isBlocked?: boolean;
}

// ─── Лента активности (Sprint 2.1) ───────────────────────────────────────────

export const activityEventTypes = [
  'session_started',
  'session_ended',
  'joined_club',
  'left_club',
  'club_created',
  'reading_completed',
  'book_review_posted',
  'achievement_unlocked',
  'club_session_scheduled',
  'discussion_hot',
  'followed_user',
  'book_added_to_club',
] as const;
export type ActivityEventType = (typeof activityEventTypes)[number];

export const activityEvents = pgTable('activity_events', {
  id: varchar('id').primaryKey().default(sql`gen_random_uuid()`),
  actorId: varchar('actor_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  eventType: text('event_type').notNull().$type<ActivityEventType>(),
  targetType: text('target_type'), // 'session' | 'club' | 'book' | 'user' | 'achievement'
  targetId: varchar('target_id'),
  metadata: jsonb('metadata'), // денормализованный снапшот для рендеринга
  visibility: text('visibility')
    .notNull()
    .default('followers')
    .$type<'public' | 'followers' | 'private'>(),
  createdAt: timestamp('created_at').notNull().default(sql`now()`),
});

export type ActivityEvent = typeof activityEvents.$inferSelect;
export type InsertActivityEvent = typeof activityEvents.$inferInsert;

export interface ActivityEventWithActor extends ActivityEvent {
  actor: {
    id: string;
    username: string;
    displayName: string | null;
    avatar: string | null;
    isReader: boolean;
  };
}

// ─── Рекомендации (Sprint 2.6, этап после 0046) ────────────────────────────

export const recommendationEntityTypes = ['book', 'club', 'reader', 'live'] as const;
export type RecommendationEntityType = (typeof recommendationEntityTypes)[number];

export const recommendationSourceTypes = ['activity', 'community', 'mixed'] as const;
export type RecommendationSourceType = (typeof recommendationSourceTypes)[number];

export const recommendationBookSourcePreferences = ['all', 'activity', 'community'] as const;
export type RecommendationBookSourcePreference = (typeof recommendationBookSourcePreferences)[number];

export const recommendationDismissals = pgTable('recommendation_dismissals', {
  id: varchar('id').primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  entityType: varchar('entity_type', { length: 20 }).notNull().$type<RecommendationEntityType>(),
  entityId: varchar('entity_id').notNull(),
  source: varchar('source', { length: 20 }).$type<RecommendationSourceType | null>(),
  reason: varchar('reason', { length: 120 }),
  createdAt: timestamp('created_at').notNull().default(sql`now()`),
});

export const recommendationPreferences = pgTable('recommendation_preferences', {
  userId: varchar('user_id').primaryKey().references(() => users.id, { onDelete: 'cascade' }),
  excludedTypesJson: text('excluded_types_json').notNull().default('[]'),
  booksSourcePreference: varchar('books_source_preference', { length: 20 })
    .notNull()
    .default('all')
    .$type<RecommendationBookSourcePreference>(),
  updatedAt: timestamp('updated_at').notNull().default(sql`now()`),
});

export type RecommendationDismissal = typeof recommendationDismissals.$inferSelect;
export type RecommendationPreference = typeof recommendationPreferences.$inferSelect;

// ─── Личные сообщения (Sprint 2.3) ───────────────────────────────────────────

export const conversations = pgTable('conversations', {
  id: varchar('id').primaryKey().default(sql`gen_random_uuid()`),
  participantA: varchar('participant_a').notNull().references(() => users.id, { onDelete: 'cascade' }),
  participantB: varchar('participant_b').notNull().references(() => users.id, { onDelete: 'cascade' }),
  lastMessageAt: timestamp('last_message_at'),
  lastMessageId: varchar('last_message_id'),
  createdAt: timestamp('created_at').notNull().default(sql`now()`),
});

export const directMessages = pgTable('direct_messages', {
  id: varchar('id').primaryKey().default(sql`gen_random_uuid()`),
  conversationId: varchar('conversation_id').notNull().references(() => conversations.id, { onDelete: 'cascade' }),
  senderId: varchar('sender_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  body: text('body').notNull(),
  isDeleted: boolean('is_deleted').notNull().default(false),
  createdAt: timestamp('created_at').notNull().default(sql`now()`),
  readAt: timestamp('read_at'),
});

export const conversationUnread = pgTable('conversation_unread', {
  conversationId: varchar('conversation_id').notNull().references(() => conversations.id, { onDelete: 'cascade' }),
  userId: varchar('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  unreadCount: integer('unread_count').notNull().default(0),
});

export type Conversation = typeof conversations.$inferSelect;
export type DirectMessage = typeof directMessages.$inferSelect;
export type ConversationUnread = typeof conversationUnread.$inferSelect;

// ─── Жалобы на ЛС + аудит доступа администраторов (Sprint 2.3) ───────────────

export const dmReports = pgTable('dm_reports', {
  id: varchar('id').primaryKey().default(sql`gen_random_uuid()`),
  messageId: varchar('message_id').notNull().references(() => directMessages.id, { onDelete: 'cascade' }),
  reporterId: varchar('reporter_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  category: varchar('category').notNull().$type<'spam' | 'harassment' | 'threats' | 'other'>(),
  comment: text('comment'),
  status: varchar('status').notNull().default('pending').$type<'pending' | 'reviewed' | 'dismissed'>(),
  reviewedBy: varchar('reviewed_by').references(() => users.id, { onDelete: 'set null' }),
  reviewedAt: timestamp('reviewed_at'),
  createdAt: timestamp('created_at').notNull().default(sql`now()`),
});

export const dmAdminAccessLog = pgTable('dm_admin_access_log', {
  id: varchar('id').primaryKey().default(sql`gen_random_uuid()`),
  adminId: varchar('admin_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  conversationId: varchar('conversation_id').notNull().references(() => conversations.id, { onDelete: 'cascade' }),
  reportId: varchar('report_id').references(() => dmReports.id, { onDelete: 'set null' }),
  reason: text('reason').notNull(),
  accessedAt: timestamp('accessed_at').notNull().default(sql`now()`),
});

export type DmReport = typeof dmReports.$inferSelect;
export type DmAdminAccessLog = typeof dmAdminAccessLog.$inferSelect;

// ─── Геймификация (Sprint 2.4) ──────────────────────────────────────────────

export const achievementStatuses = ['draft', 'active', 'archived'] as const;
export type AchievementStatus = (typeof achievementStatuses)[number];

export const achievementIconTypes = ['badge', 'star', 'title'] as const;
export type AchievementIconType = (typeof achievementIconTypes)[number];

export const achievements = pgTable('achievements', {
  id: varchar('id').primaryKey().default(sql`gen_random_uuid()`),
  code: varchar('code', { length: 100 }).notNull().unique(),
  titleRu: varchar('title_ru', { length: 120 }).notNull(),
  descriptionRu: text('description_ru'),
  iconType: varchar('icon_type', { length: 30 }).notNull().default('badge').$type<AchievementIconType>(),
  badgeImageUrl: text('badge_image_url'),
  rewardPayload: jsonb('reward_payload'),
  conditionsPayload: jsonb('conditions_payload').notNull().default(sql`'[]'::jsonb`),
  status: varchar('status', { length: 20 }).notNull().default('draft').$type<AchievementStatus>(),
  sortOrder: integer('sort_order').notNull().default(0),
  createdBy: varchar('created_by').references(() => users.id, { onDelete: 'set null' }),
  updatedBy: varchar('updated_by').references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at').notNull().default(sql`now()`),
  updatedAt: timestamp('updated_at').notNull().default(sql`now()`),
});

export const achievementBuildingBlocks = pgTable('achievement_building_blocks', {
  id: varchar('id').primaryKey().default(sql`gen_random_uuid()`),
  code: varchar('code', { length: 100 }).notNull().unique(),
  labelRu: varchar('label_ru', { length: 120 }).notNull(),
  valueType: varchar('value_type', { length: 20 }).notNull().$type<'number' | 'string' | 'boolean'>(),
  supportedOperators: jsonb('supported_operators').notNull().default(sql`'[]'::jsonb`),
  sourceKey: varchar('source_key', { length: 200 }),
  isActive: boolean('is_active').notNull().default(true),
  createdBy: varchar('created_by').references(() => users.id, { onDelete: 'set null' }),
  updatedBy: varchar('updated_by').references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at').notNull().default(sql`now()`),
  updatedAt: timestamp('updated_at').notNull().default(sql`now()`),
});

export const achievementRewardAssets = pgTable('achievement_reward_assets', {
  id: varchar('id').primaryKey().default(sql`gen_random_uuid()`),
  assetType: varchar('asset_type', { length: 20 }).notNull().$type<AchievementIconType>(),
  nameRu: varchar('name_ru', { length: 120 }).notNull(),
  imageUrl: text('image_url').notNull(),
  descriptionRu: text('description_ru'),
  groupKey: varchar('group_key', { length: 80 }).notNull().default('default'),
  tags: jsonb('tags').notNull().default(sql`'[]'::jsonb`),
  sortOrder: integer('sort_order').notNull().default(0),
  isActive: boolean('is_active').notNull().default(true),
  createdBy: varchar('created_by').references(() => users.id, { onDelete: 'set null' }),
  updatedBy: varchar('updated_by').references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at').notNull().default(sql`now()`),
  updatedAt: timestamp('updated_at').notNull().default(sql`now()`),
});

export const userAchievements = pgTable('user_achievements', {
  id: varchar('id').primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  achievementId: varchar('achievement_id').notNull().references(() => achievements.id, { onDelete: 'cascade' }),
  awardedAt: timestamp('awarded_at').notNull().default(sql`now()`),
  awardedBy: varchar('awarded_by').references(() => users.id, { onDelete: 'set null' }),
  meta: jsonb('meta'),
});

export const userActivityCounters = pgTable('user_activity_counters', {
  userId: varchar('user_id').primaryKey().references(() => users.id, { onDelete: 'cascade' }),
  completedBooksCount: integer('completed_books_count').notNull().default(0),
  sentDmCount: integer('sent_dm_count').notNull().default(0),
  followingCountSnapshot: integer('following_count_snapshot').notNull().default(0),
  followersCountSnapshot: integer('followers_count_snapshot').notNull().default(0),
  clubSessionsJoinedCount: integer('club_sessions_joined_count').notNull().default(0),
  updatedAt: timestamp('updated_at').notNull().default(sql`now()`),
});

export const userStreaks = pgTable('user_streaks', {
  userId: varchar('user_id').primaryKey().references(() => users.id, { onDelete: 'cascade' }),
  currentStreakDays: integer('current_streak_days').notNull().default(0),
  bestStreakDays: integer('best_streak_days').notNull().default(0),
  lastActiveDate: text('last_active_date'),
  updatedAt: timestamp('updated_at').notNull().default(sql`now()`),
});

export type Achievement = typeof achievements.$inferSelect;
export type InsertAchievement = typeof achievements.$inferInsert;

export type AchievementBuildingBlock = typeof achievementBuildingBlocks.$inferSelect;
export type InsertAchievementBuildingBlock = typeof achievementBuildingBlocks.$inferInsert;

export type AchievementRewardAsset = typeof achievementRewardAssets.$inferSelect;
export type InsertAchievementRewardAsset = typeof achievementRewardAssets.$inferInsert;

export type UserAchievement = typeof userAchievements.$inferSelect;
export type InsertUserAchievement = typeof userAchievements.$inferInsert;

export type UserActivityCounters = typeof userActivityCounters.$inferSelect;
export type InsertUserActivityCounters = typeof userActivityCounters.$inferInsert;

export type UserStreak = typeof userStreaks.$inferSelect;
export type InsertUserStreak = typeof userStreaks.$inferInsert;
