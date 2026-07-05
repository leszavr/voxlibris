import { sql } from "drizzle-orm";
import { pgTable, text, varchar, integer, boolean, timestamp, jsonb, uniqueIndex, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { users, books, clubs, readingSessions } from "./core.js";
import { clubReadingStatus, sessionReactions, sessionQuestions, sessionAnalytics } from "./reader.js";


// ============================================
// МОНИТИЗАЦИЯ
// ============================================

// Типы монетизации
export const monetizationTypes = ["one_time", "subscription", "donation"] as const;
export type MonetizationType = typeof monetizationTypes[number];

// Статусы платежей
export const paymentStatuses = ["pending", "completed", "failed", "refunded", "cancelled"] as const;
export type PaymentStatus = typeof paymentStatuses[number];

// Legacy monetization tables. Do not use for new RF commerce features.
// Настройки монетизации для клуба
export const clubMonetization = pgTable("club_monetization", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  clubId: varchar("club_id").notNull().references(() => clubs.id, { onDelete: "cascade" }),
  
  // Тип монетизации
  type: varchar("type", { length: 20 }).notNull().$type<MonetizationType>(),
  
  // Для разовой оплаты (one_time)
  oneTimeAmount: integer("one_time_amount"), // В копейках/центах
  oneTimeCurrency: varchar("one_time_currency", { length: 3 }).default("USD"),
  
  // Для подписки (subscription)
  subscriptionAmount: integer("subscription_amount"), // В копейках/центах за месяц
  subscriptionCurrency: varchar("subscription_currency", { length: 3 }).default("USD"),
  subscriptionInterval: varchar("subscription_interval", { length: 20 }).default("monthly"), // monthly, yearly
  
  // Для пожертвований (donation)
  donationMinAmount: integer("donation_min_amount"), // Минимальная сумма
  donationMaxAmount: integer("donation_max_amount"), // Максимальная сумма
  donationSuggestedAmounts: text("donation_suggested_amounts"), // JSON: [100, 500, 1000] в копейках
  donationCurrency: varchar("donation_currency", { length: 3 }).default("USD"),
  
  // Процент платформы
  platformFeePercent: integer("platform_fee_percent").notNull().default(10), // 10%
  
  // Способ выплат
  payoutMethod: varchar("payout_method", { length: 50 }), // stripe, bank, crypto, etc
  payoutDetails: text("payout_details"), // JSON: {accountNumber, routingNumber, ...}
  
  // Статус
  isActive: boolean("is_active").notNull().default(false),
  
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
  updatedAt: timestamp("updated_at").notNull().default(sql`now()`),
});

// Доходы чтеца
export const earningStatuses = ["pending", "processing", "paid", "failed"] as const;
export type EarningStatus = typeof earningStatuses[number];

export const readerEarnings = pgTable("reader_earnings", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  sessionId: varchar("session_id").notNull().references(() => readingSessions.id, { onDelete: "cascade" }),
  readerId: varchar("reader_id").notNull().references(() => users.id),
  clubId: varchar("club_id").notNull().references(() => clubs.id),
  
  // Тип монетизации сессии
  monetizationType: varchar("monetization_type", { length: 20 }).notNull().$type<MonetizationType>(),
  
  // Доход (до вычета процента платформы)
  grossAmount: integer("gross_amount").notNull(), // В копейках/центах
  currency: varchar("currency", { length: 3 }).default("USD"),
  
  // Процент платформы
  platformFeePercent: integer("platform_fee_percent").notNull(),
  platformFeeAmount: integer("platform_fee_amount").notNull(), // В копейках/центах
  
  // Чистый доход
  netAmount: integer("net_amount").notNull(), // В копейках/центах
  
  // Статистика
  listenerCount: integer("listener_count").default(0),
  paymentCount: integer("payment_count").default(0), // Количество платежей
  
  // Статус
  status: varchar("status", { length: 20 }).notNull().default("pending").$type<EarningStatus>(),
  
  // Выплата
  payoutId: varchar("payout_id"), // ID выплаты от платежной системы
  payoutStatus: varchar("payout_status", { length: 20 }), // pending, completed, failed
  payoutAt: timestamp("payout_at"),
  
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
  updatedAt: timestamp("updated_at").notNull().default(sql`now()`),
});

// Платежи слушателей
export const listenerPayments = pgTable("listener_payments", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  sessionId: varchar("session_id").references(() => readingSessions.id, { onDelete: "cascade" }),
  userId: varchar("user_id").notNull().references(() => users.id),
  clubId: varchar("club_id").notNull().references(() => clubs.id),
  
  // Тип монетизации
  monetizationType: varchar("monetization_type", { length: 20 }).notNull().$type<MonetizationType>(),
  
  // Сумма
  amount: integer("amount").notNull(), // В копейках/центах
  currency: varchar("currency", { length: 3 }).default("USD"),
  
  // Платежная система
  paymentProvider: varchar("payment_provider", { length: 50 }), // stripe, paypal, etc
  paymentIntentId: varchar("payment_intent_id"), // ID от платежной системы
  paymentMethodId: varchar("payment_method_id"), // ID метода оплаты
  
  // Статус
  status: varchar("status", { length: 20 }).notNull().default("pending").$type<PaymentStatus>(),
  
  // Возврат
  refundId: varchar("refund_id"),
  refundAmount: integer("refund_amount"),
  refundReason: text("refund_reason"),
  refundedAt: timestamp("refunded_at"),
  
  // Дополнительно
  metadata: text("metadata"), // JSON: {receiptUrl, fraudScore, ...}
  
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
  updatedAt: timestamp("updated_at").notNull().default(sql`now()`),
});

// Подписки на клубы
export const subscriptionStatuses = ["active", "past_due", "canceled", "unpaid", "trialing"] as const;
export type SubscriptionStatus = typeof subscriptionStatuses[number];

export const clubSubscriptions = pgTable("club_subscriptions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  clubId: varchar("club_id").notNull().references(() => clubs.id, { onDelete: "cascade" }),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  
  // Детали подписки
  amount: integer("amount").notNull(), // В копейках/центах
  currency: varchar("currency", { length: 3 }).default("USD"),
  interval: varchar("interval", { length: 20 }).notNull().default("monthly"), // monthly, yearly
  
  // Статус
  status: varchar("status", { length: 20 }).notNull().default("active").$type<SubscriptionStatus>(),
  
  // Даты
  currentPeriodStart: timestamp("current_period_start").notNull(),
  currentPeriodEnd: timestamp("current_period_end").notNull(),
  cancelAtPeriodEnd: boolean("cancel_at_period_end").notNull().default(false),
  canceledAt: timestamp("canceled_at"),
  
  // Платежная система
  paymentProvider: varchar("payment_provider", { length: 50 }),
  subscriptionId: varchar("subscription_id"), // ID от платежной системы
  
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
  updatedAt: timestamp("updated_at").notNull().default(sql`now()`),
});

export const calendarSubscriptionTokens = pgTable("calendar_subscription_tokens", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  tokenHash: text("token_hash").notNull().unique(),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  clubId: varchar("club_id").notNull().references(() => clubs.id, { onDelete: "cascade" }),
  revokedAt: timestamp("revoked_at"),
  lastUsedAt: timestamp("last_used_at"),
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
  updatedAt: timestamp("updated_at").notNull().default(sql`now()`),
}, (table) => [
  uniqueIndex("calendar_subscription_tokens_token_hash_idx").on(table.tokenHash),
  index("calendar_subscription_tokens_user_club_idx").on(table.userId, table.clubId),
  index("calendar_subscription_tokens_club_idx").on(table.clubId),
]);

// ============================================
// РАСПИСАНИЕ СЕССИЙ
// ============================================

// Статусы расписания
export const scheduleStatuses = ["scheduled", "in_progress", "completed", "cancelled"] as const;
export type ScheduleStatus = typeof scheduleStatuses[number];

// Расписание сессий чтения
export const readingSchedule = pgTable("reading_schedule", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  clubId: varchar("club_id").notNull().references(() => clubs.id, { onDelete: "cascade" }),
  bookId: varchar("book_id").notNull().references(() => books.id, { onDelete: "cascade" }),
  title: varchar("title", { length: 255 }).notNull(), // "Чтение главы 1-3"
  description: text("description"),
  
  // Время проведения
  scheduledStart: timestamp("scheduled_start").notNull(),
  scheduledEnd: timestamp("scheduled_end"),
  estimatedDuration: integer("estimated_duration"), // В минутах
  
  // Текущая позиция в книге
  startChapter: integer("start_chapter").notNull().default(1),
  startPosition: text("start_position"), // JSON: {scrollTop, paragraph, offset}
  endChapter: integer("end_chapter"),
  endPosition: text("end_position"), // JSON
  
  // Статус расписания
  status: varchar("status", { length: 20 }).notNull().default("scheduled").$type<ScheduleStatus>(),
  
  // Привязка к сессии чтения
  sessionId: varchar("session_id").references(() => readingSessions.id),
  
  // Повторение
  isRecurring: boolean("is_recurring").notNull().default(false),
  recurringPattern: text("recurring_pattern"), // JSON: {frequency: 'weekly', days: [1,3,5], endDate: '2025-03-01'}
  
  // Уведомления
  reminderMinutes: integer("reminder_minutes").default(15), // За сколько минут напомнить
  remindersSent: boolean("reminders_sent").notNull().default(false),
  calendarSequence: integer("calendar_sequence").notNull().default(0),
  
  // Статистика
  actualStart: timestamp("actual_start"),
  actualEnd: timestamp("actual_end"),
  attendeesCount: integer("attendees_count").default(0),
  
  createdBy: varchar("created_by").notNull().references(() => users.id),
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
  updatedAt: timestamp("updated_at").notNull().default(sql`now()`),
});

// ============================================
// ЗАПИСИ СЕССИЙ (для клубов Чтеца)
// ============================================

// Статусы записи
export const recordingStatuses = ["processing", "ready", "failed", "deleted"] as const;
export type RecordingStatus = typeof recordingStatuses[number];
export const recordingModerationStatuses = ["pending", "approved", "rejected"] as const;
export type RecordingModerationStatus = typeof recordingModerationStatuses[number];

// Записи сессий (для клубов Чтеца)
export const sessionRecordings = pgTable("session_recordings", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  sessionId: varchar("session_id").notNull().references(() => readingSessions.id, { onDelete: "cascade" }),
  clubId: varchar("club_id").notNull().references(() => clubs.id),
  
  // Файл записи
  recordingUrl: text("recording_url"), // URL к записи на S3/локальном хранилище
  storageKey: text("storage_key"), // Ключ в хранилище
  duration: integer("duration"), // Длительность в секундах
  fileSize: integer("file_size"), // Размер в байтах
  format: varchar("format", { length: 20 }).default("webm"), // webm, mp3, etc
  
  // Статус обработки
  status: varchar("status", { length: 20 }).notNull().default("processing").$type<RecordingStatus>(),
  
  // Тип записи
  isLocal: boolean("is_local").default(false), // Локальная запись при сбое связи
  isBackup: boolean("is_backup").default(false), // Резервная копия
  
  // Качество
  bitrate: integer("bitrate"), // В kbps
  sampleRate: integer("sample_rate"), // В Hz
  channels: integer("channels"), // 1 = mono, 2 = stereo
  
  // Доступность
  isAvailable: boolean("is_available").notNull().default(true),
  availableUntil: timestamp("available_until"), // Дата, когда запись перестанет быть доступной

  // Модерация и публикация
  publicationRequested: boolean("publication_requested").notNull().default(true),
  moderationStatus: varchar("moderation_status", { length: 20 }).notNull().default("pending").$type<RecordingModerationStatus>(),
  moderatedBy: varchar("moderated_by").references(() => users.id),
  moderatedAt: timestamp("moderated_at"),
  moderationNotes: text("moderation_notes"),
  publishedBy: varchar("published_by").references(() => users.id),
  publishedAt: timestamp("published_at"),
  isPublished: boolean("is_published").notNull().default(false),

  // Будущее оформление публичной карточки записи
  publicTitle: varchar("public_title", { length: 255 }),
  publicAuthor: varchar("public_author", { length: 255 }),
  publicDescription: text("public_description"),
  coverImageUrl: text("cover_image_url"),

  // Тарифные ворота: фактический доступ дополнительно проверяется тарифом пользователя
  allowStreaming: boolean("allow_streaming").notNull().default(false),
  allowDownload: boolean("allow_download").notNull().default(false),
  
  // Дополнительно
  metadata: text("metadata"), // JSON для любых дополнительных данных
  
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
  updatedAt: timestamp("updated_at").notNull().default(sql`now()`),
});

// ============================================
// ОЦЕНКА КАЧЕСТВА ЧТЕНИЯ
// ============================================

// Оценки качества чтения (от других чтецов)
export const readerQualityRatings = pgTable("reader_quality_ratings", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  ratedUserId: varchar("rated_user_id").notNull().references(() => users.id), // Чей рейтинг
  raterUserId: varchar("rater_user_id").notNull().references(() => users.id), // Кто оценил
  clubId: varchar("club_id").references(() => clubs.id), // В каком клубе (может быть null для общего рейтинга)
  
  // Критерии оценки
  voiceQuality: integer("voice_quality"), // 1-5, качество голоса
  readingPace: integer("reading_pace"), // 1-5, темп чтения
  articulation: integer("articulation"), // 1-5, артикуляция
  emotion: integer("emotion"), // 1-5, эмоциональная подача
  
  // Общая оценка
  overallRating: integer("overall_rating").notNull(), // 1-5
  
  // Комментарий
  feedback: text("feedback"),
  
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
});

// ============================================
// SCHEMAS ДЛЯ ВАЛИДАЦИИ
// ============================================

// Club Reading Status
export const insertClubReadingStatusSchema = createInsertSchema(clubReadingStatus).pick({
  clubId: true,
  userId: true,
  bookId: true,
  sessionId: true,
  currentChapter: true,
  currentPosition: true,
  isOpenForListeners: true,
  sessionType: true,
});

// ============================================
// GUEST SYSTEM (v2.1 - KISS)
// ============================================

// Guest Account Status
export const guestAccountStatuses = ["active", "expired", "deleted"] as const;
export type GuestAccountStatus = typeof guestAccountStatuses[number];

// Guest Book Format
export const guestBookFormats = ["epub", "fb2"] as const;
export type GuestBookFormat = typeof guestBookFormats[number];

// Guest Book Moderation Status
export const guestBookModerationStatuses = ["pending", "approved", "rejected"] as const;
export type GuestBookModerationStatus = typeof guestBookModerationStatuses[number];

// Guest Analytics Event Types
export const guestAnalyticsEventTypes = ["book_upload", "session_start", "session_end", "book_open"] as const;
export type GuestAnalyticsEventType = typeof guestAnalyticsEventTypes[number];

// Guest Accounts
export const guestAccounts = pgTable("guest_accounts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  accessCode: varchar("access_code", { length: 8 }).notNull(),
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
  lastSeenAt: timestamp("last_seen_at").notNull().default(sql`now()`),
  expiresAt: timestamp("expires_at").notNull(),
  status: text("status").notNull().default("active").$type<GuestAccountStatus>(),
  createdFromIp: varchar("created_from_ip", { length: 45 }), // IPv6 compatible
  createdUserAgent: text("created_user_agent"),
  browserFingerprint: varchar("browser_fingerprint", { length: 64 }),
  recoveryAttempts: integer("recovery_attempts").default(0),
  lastRecoveryAt: timestamp("last_recovery_at"),
});

// Guest Books
export const guestBooks = pgTable("guest_books", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  guestAccountId: varchar("guest_account_id").notNull().references(() => guestAccounts.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  author: text("author").notNull(),
  description: text("description"),
  format: text("format").notNull().$type<GuestBookFormat>(),
  fileSizeBytes: integer("file_size_bytes").notNull(),
  originalFilename: text("original_filename"),
  originalFileStorageKey: text("original_file_storage_key"),
  originalFileContentType: text("original_file_content_type"),
  flatContent: text("flat_content").notNull(),
  contentHash: varchar("content_hash", { length: 64 }),
  wordCount: integer("word_count").default(0),
  uploadedAt: timestamp("uploaded_at").notNull().default(sql`now()`),
  expiresAt: timestamp("expires_at").notNull(),
  isDeleted: boolean("is_deleted").notNull().default(false),
  deletedAt: timestamp("deleted_at"),
  // Moderation
  moderationStatus: text("moderation_status").default("pending").$type<GuestBookModerationStatus>(),
  moderatedBy: varchar("moderated_by").references(() => users.id),
  moderatedAt: timestamp("moderated_at"),
  moderationNotes: text("moderation_notes"),
});

// Guest Reading Positions
export const guestReadingPositions = pgTable("guest_reading_positions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  guestAccountId: varchar("guest_account_id").notNull().references(() => guestAccounts.id, { onDelete: "cascade" }),
  guestBookId: varchar("guest_book_id").notNull().references(() => guestBooks.id, { onDelete: "cascade" }),
  progressPercent: integer("progress_percent").notNull().default(0),
  currentPosition: jsonb("current_position").default({}),
  readingTimeMinutes: integer("reading_time_minutes").default(0),
  lastReadAt: timestamp("last_read_at").notNull().default(sql`now()`),
  updatedAt: timestamp("updated_at").notNull().default(sql`now()`),
});

// Guest Analytics (simplified)
export const guestAnalytics = pgTable("guest_analytics", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  guestAccountId: varchar("guest_account_id").notNull().references(() => guestAccounts.id, { onDelete: "cascade" }),
  guestBookId: varchar("guest_book_id").references(() => guestBooks.id, { onDelete: "set null" }),
  eventType: text("event_type").notNull().$type<GuestAnalyticsEventType>(),
  eventData: jsonb("event_data").default({}),
  sessionId: varchar("session_id", { length: 64 }),
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
});

// Guest Insert Schemas
export const insertGuestAccountSchema = createInsertSchema(guestAccounts).pick({
  accessCode: true,
  expiresAt: true,
  status: true,
  createdFromIp: true,
  createdUserAgent: true,
  browserFingerprint: true,
});

export const insertGuestBookSchema = createInsertSchema(guestBooks).pick({
  guestAccountId: true,
  title: true,
  author: true,
  description: true,
  format: true,
  fileSizeBytes: true,
  originalFilename: true,
  originalFileStorageKey: true,
  originalFileContentType: true,
  flatContent: true,
  contentHash: true,
  wordCount: true,
  expiresAt: true,
});

export const updateGuestBookSchema = createInsertSchema(guestBooks).pick({
  moderationStatus: true,
  moderatedBy: true,
  moderatedAt: true,
  moderationNotes: true,
  isDeleted: true,
  deletedAt: true,
});

export const insertGuestReadingPositionSchema = createInsertSchema(guestReadingPositions).pick({
  guestAccountId: true,
  guestBookId: true,
  progressPercent: true,
  currentPosition: true,
  readingTimeMinutes: true,
});

export const updateGuestReadingPositionSchema = createInsertSchema(guestReadingPositions).pick({
  progressPercent: true,
  currentPosition: true,
  readingTimeMinutes: true,
  lastReadAt: true,
});

export const insertGuestAnalyticsSchema = createInsertSchema(guestAnalytics).pick({
  guestAccountId: true,
  guestBookId: true,
  eventType: true,
  eventData: true,
  sessionId: true,
});

// Session Reactions
export const insertSessionReactionSchema = createInsertSchema(sessionReactions).pick({
  sessionId: true,
  userId: true,
  emoji: true,
  type: true,
  position: true,
  audioTimestampMs: true,
  chapterNumber: true,
});

// Session Questions
export const insertSessionQuestionSchema = createInsertSchema(sessionQuestions).pick({
  sessionId: true,
  userId: true,
  question: true,
});

export const updateSessionQuestionSchema = createInsertSchema(sessionQuestions).pick({
  answer: true,
  isAnswered: true,
  answeredAt: true,
});

// Session Analytics
export const insertSessionAnalyticsSchema = createInsertSchema(sessionAnalytics).pick({
  sessionId: true,
  peakListenerCount: true,
  averageListenerCount: true,
  totalListeners: true,
  totalListenTime: true,
  averageSessionDuration: true,
  reactionCount: true,
  positiveReactionCount: true,
  negativeReactionCount: true,
  questionCount: true,
  audioQualityScore: true,
  networkQualityScore: true,
  listenerRegions: true,
  listenerCities: true,
  deviceTypes: true,
  retention: true,
  metadata: true,
});

// Club Monetization
export const insertClubMonetizationSchema = createInsertSchema(clubMonetization).pick({
  clubId: true,
  type: true,
  oneTimeAmount: true,
  oneTimeCurrency: true,
  subscriptionAmount: true,
  subscriptionCurrency: true,
  subscriptionInterval: true,
  donationMinAmount: true,
  donationMaxAmount: true,
  donationSuggestedAmounts: true,
  donationCurrency: true,
  platformFeePercent: true,
  payoutMethod: true,
  payoutDetails: true,
  isActive: true,
});

// Reader Earnings
export const insertReaderEarningSchema = createInsertSchema(readerEarnings).pick({
  sessionId: true,
  readerId: true,
  clubId: true,
  monetizationType: true,
  grossAmount: true,
  currency: true,
  platformFeePercent: true,
  platformFeeAmount: true,
  netAmount: true,
  listenerCount: true,
  paymentCount: true,
  status: true,
});

// Listener Payments
export const insertListenerPaymentSchema = createInsertSchema(listenerPayments).pick({
  sessionId: true,
  userId: true,
  clubId: true,
  monetizationType: true,
  amount: true,
  currency: true,
  paymentProvider: true,
  paymentIntentId: true,
  paymentMethodId: true,
  status: true,
  metadata: true,
});

// Club Subscriptions
export const insertClubSubscriptionSchema = createInsertSchema(clubSubscriptions).pick({
  clubId: true,
  userId: true,
  amount: true,
  currency: true,
  interval: true,
  status: true,
  currentPeriodStart: true,
  currentPeriodEnd: true,
  cancelAtPeriodEnd: true,
  paymentProvider: true,
  subscriptionId: true,
});

// Reading Schedule
export const insertReadingScheduleSchema = createInsertSchema(readingSchedule).pick({
  clubId: true,
  bookId: true,
  title: true,
  description: true,
  scheduledStart: true,
  scheduledEnd: true,
  estimatedDuration: true,
  startChapter: true,
  startPosition: true,
  endChapter: true,
  endPosition: true,
  isRecurring: true,
  recurringPattern: true,
  reminderMinutes: true,
  createdBy: true,
});

// Session Recordings
export const insertSessionRecordingSchema = createInsertSchema(sessionRecordings).pick({
  sessionId: true,
  clubId: true,
  recordingUrl: true,
  storageKey: true,
  duration: true,
  fileSize: true,
  format: true,
  isLocal: true,
  isBackup: true,
  bitrate: true,
  sampleRate: true,
  channels: true,
  isAvailable: true,
  availableUntil: true,
  moderationStatus: true,
  moderatedBy: true,
  moderatedAt: true,
  moderationNotes: true,
  publishedBy: true,
  publishedAt: true,
  isPublished: true,
  publicTitle: true,
  publicAuthor: true,
  publicDescription: true,
  coverImageUrl: true,
  allowStreaming: true,
  allowDownload: true,
  metadata: true,
});

// Reader Quality Ratings
export const insertReaderQualityRatingSchema = createInsertSchema(readerQualityRatings).pick({
  ratedUserId: true,
  raterUserId: true,
  clubId: true,
  voiceQuality: true,
  readingPace: true,
  articulation: true,
  emotion: true,
  overallRating: true,
  feedback: true,
});

// ============================================
// TYPES
// ============================================

// VoxLibris Studio Types
export type ClubReadingStatus = typeof clubReadingStatus.$inferSelect;
export type InsertClubReadingStatus = z.infer<typeof insertClubReadingStatusSchema>;
