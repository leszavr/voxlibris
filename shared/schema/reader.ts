import { sql } from "drizzle-orm";
import { pgTable, text, varchar, integer, boolean, timestamp, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { users, clubBooksLibrary, books, bookContent, clubs, User, Book, Club, readingSessions } from "./core.js";
import { ReadingSession, UserProfile, SessionListener, clubBooks, ClubBook } from "./core.js";


// Extended types for frontend
export interface ClubWithDetails extends Club {
  book: ClubBook | null;
  books?: ClubBook[];
  owner: User | null;
  tags: string[];
  memberCount: number;
  activeSessions?: ReadingSessionWithDetails[];
}

export interface ReadingSessionWithDetails extends ReadingSession {
  reader: User;
  book: Book;
  club: Club;
  listenerCount: number;
  listeners?: SessionListener[];
  readerProfile?: UserProfile;
}

export interface UserWithProfile extends User {
  profile?: UserProfile;
}

// Reader: Bookmarks
export const bookmarks = pgTable("bookmarks", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  bookId: varchar("book_id").notNull(),
  chapterNumber: integer("chapter_number"),
  position: text("position").notNull(), // JSON: {scrollTop, paragraph, offset}
  title: text("title"),
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
});

// Reader: Notes
export const noteColors = ["yellow", "blue", "green", "pink", "purple"] as const;
export type NoteColor = typeof noteColors[number];

export const notes = pgTable("notes", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  bookId: varchar("book_id").notNull(),
  chapterNumber: integer("chapter_number"),
  position: text("position").notNull(), // JSON: {scrollTop, paragraph, offset}
  highlightedText: text("highlighted_text"),
  noteText: text("note_text").notNull(),
  color: varchar("color", { length: 20 }).notNull().default("yellow").$type<NoteColor>(),
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
  updatedAt: timestamp("updated_at").notNull().default(sql`now()`),
});

// Reader schemas for validation
export const insertBookmarkSchema = createInsertSchema(bookmarks).pick({
  bookId: true,
  chapterNumber: true,
  position: true,
  title: true,
});

export const insertNoteSchema = createInsertSchema(notes).pick({
  bookId: true,
  chapterNumber: true,
  position: true,
  highlightedText: true,
  noteText: true,
  color: true,
});

// Reader Insert Types
export type InsertBookmark = z.infer<typeof insertBookmarkSchema>;
export type Bookmark = typeof bookmarks.$inferSelect;

export type InsertNote = z.infer<typeof insertNoteSchema>;
export type Note = typeof notes.$inferSelect;

// WebSocket message types
export interface WebSocketMessage {
  type: 'session_start' | 'session_end' | 'position_update' | 'listener_join' | 'listener_leave' | 'rating_update' | 'progress_update' | 'bookmark_add' | 'note_add' | 'club_progress';
  payload: unknown;
  sessionId?: string;
  userId?: string;
}

export interface SessionPositionUpdate {
  sessionId: string;
  currentChapter: number;
  currentPosition: string;
  timestamp: string;
}

export interface ListenerUpdate {
  sessionId: string;
  userId: string;
  action: 'join' | 'leave';
  timestamp: string;
}

export interface ReaderProgressUpdate {
  bookId: string;
  userId: string;
  currentChapter: number;
  currentPosition: string;
  progress: number; // 0-100
  clubId?: string;
}

export interface BookmarkUpdate {
  bookId: string;
  userId: string;
  bookmark: Bookmark;
}

export interface NoteUpdate {
  bookId: string;
  userId: string;
  note: Note;
}


export type ClubBookLibrary = typeof clubBooksLibrary.$inferSelect;
export type InsertClubBookLibrary = typeof clubBooksLibrary.$inferInsert;

// ============================================
// КЛУБНЫЙ РИДЕР (CLUB READER)
// ============================================

// Статусы прогресса по плану чтения
export const planProgressStatuses = ["not_started", "in_progress", "completed"] as const;
export type PlanProgressStatus = typeof planProgressStatuses[number];

// Визуальные статусы участника относительно плана
export const userPlanStatuses = ["ahead", "on_track", "behind"] as const;
export type UserPlanStatus = typeof userPlanStatuses[number];

// Визуальность комментариев
export const commentVisibilities = ["public", "private", "moderators"] as const;
export type CommentVisibility = typeof commentVisibilities[number];

// Типы уведомлений
export const notificationTypes = ["reply", "mention", "chapter_ready", "message", "plan_update"] as const;
export type NotificationType = typeof notificationTypes[number];

export const notificationKinds = [
  "dm_message",
  "followed_you",
  "club_discussion_reply",
  "club_membership_approved",
  "comment_reply",
  "mention",
  "chapter_ready",
  "plan_update",
  "achievement_unlocked",
] as const;
export type NotificationKind = typeof notificationKinds[number];

// Типы жалоб
export const reportReasons = ["spam", "abuse", "copyright", "explicit", "other"] as const;
export type ReportReason = typeof reportReasons[number];

export const reportStatuses = ["new", "in_review", "resolved", "dismissed"] as const;
export type ReportStatus = typeof reportStatuses[number];

// План чтения для клубной книги
export const clubReadingPlans = pgTable("club_reading_plans", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  clubBookId: varchar("club_book_id").notNull().references(() => clubBooks.id, { onDelete: "cascade" }),
  title: varchar("title", { length: 255 }).notNull(), // "Неделя 1: Главы 1–5"
  description: text("description"),
  orderIndex: integer("order_index").notNull(), // порядок этапа
  startChapter: integer("start_chapter"), // опционально
  endChapter: integer("end_chapter"), // опционально
  targetDate: timestamp("target_date"),
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
  updatedAt: timestamp("updated_at").notNull().default(sql`now()`),
});

// Прогресс участников по плану чтения
export const clubReadingPlanProgress = pgTable("club_reading_plan_progress", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  planId: varchar("plan_id").notNull().references(() => clubReadingPlans.id, { onDelete: "cascade" }),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  status: varchar("status", { length: 20 }).notNull().$type<PlanProgressStatus>(),
  updatedAt: timestamp("updated_at").notNull().default(sql`now()`),
});

// Клубные закладки (общие точки для всех участников)
export const clubBookmarks = pgTable("club_bookmarks", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  clubBookId: varchar("club_book_id").notNull().references(() => clubBooks.id, { onDelete: "cascade" }),
  createdBy: varchar("created_by").notNull().references(() => users.id, { onDelete: "cascade" }),
  position: integer("position").notNull(), // логическая позиция в книге
  chapter: varchar("chapter", { length: 255 }),
  title: varchar("title", { length: 255 }).notNull(), // краткое название точки
  description: text("description"),
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
});

// Обсуждения клуба (доска обсуждений)
export const clubDiscussions = pgTable("club_discussions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  clubId: varchar("club_id").notNull().references(() => clubs.id, { onDelete: "cascade" }),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  content: text("content").notNull(),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Drizzle limitation for self-referencing tables
  parentId: varchar("parent_id").references((): any => clubDiscussions.id, { onDelete: "cascade" }), // для ответов
  quotedContent: text("quoted_content"), // цитируемое сообщение для ответов
  isWarning: boolean("is_warning").notNull().default(false), // предупреждение от владельца
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
  updatedAt: timestamp("updated_at").notNull().default(sql`now()`),
});

// Комментарии к тексту (клубные)
export const comments = pgTable("comments", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  clubId: varchar("club_id").notNull().references(() => clubs.id, { onDelete: "cascade" }),
  bookId: varchar("book_id").notNull().references(() => books.id, { onDelete: "cascade" }),
  chapterId: varchar("chapter_id").references(() => bookContent.id, { onDelete: "set null" }),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  pageNumber: integer("page_number"),
  textFragment: text("text_fragment"), // выделенный фрагмент текста
  textOffset: text("text_offset"), // JSON: {start_position, end_position}
  commentText: text("comment_text").notNull(),
  visibility: varchar("visibility", { length: 20 }).notNull().default("public").$type<CommentVisibility>(),
  isEdited: boolean("is_edited").notNull().default(false),
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
  updatedAt: timestamp("updated_at").notNull().default(sql`now()`),
  deletedAt: timestamp("deleted_at"),
});

// Ответы на комментарии
export const commentReplies = pgTable("comment_replies", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  parentCommentId: varchar("parent_comment_id").notNull().references(() => comments.id, { onDelete: "cascade" }),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  replyText: text("reply_text").notNull(),
  mentions: text("mentions"), // JSON array of user_ids
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
  updatedAt: timestamp("updated_at").notNull().default(sql`now()`),
  deletedAt: timestamp("deleted_at"),
});

// Рейтинги комментариев (лайки/дизлайки)
export const commentRatings = pgTable("comment_ratings", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  commentId: varchar("comment_id").notNull().references(() => comments.id, { onDelete: "cascade" }),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  rating: varchar("rating", { length: 10 }).notNull(), // "like" or "dislike"
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
});

// Сообщения общего чата клуба
export const chatMessages = pgTable("chat_messages", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  clubId: varchar("club_id").notNull().references(() => clubs.id, { onDelete: "cascade" }),
  // Логический канал внутри клуба (general, voice, announcements и т.п.)
  channel: varchar("channel", { length: 64 }).notNull().default("general"),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  text: text("text").notNull(),
  mentions: text("mentions"), // JSON array of user_ids
  attachments: text("attachments"), // JSON array of attachments
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
  updatedAt: timestamp("updated_at").notNull().default(sql`now()`),
  deletedAt: timestamp("deleted_at"),
});

// Уведомления пользователей
export const notifications = pgTable("notifications", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  type: varchar("type", { length: 20 }).notNull().$type<NotificationType>(),
  sourceCommentId: varchar("source_comment_id").references(() => comments.id, { onDelete: "set null" }),
  sourceUserId: varchar("source_user_id").references(() => users.id, { onDelete: "set null" }),
  sourceMessageId: varchar("source_message_id").references(() => chatMessages.id, { onDelete: "set null" }),
  kind: varchar("kind", { length: 60 }).$type<NotificationKind>(),
  actorUserId: varchar("actor_user_id").references(() => users.id, { onDelete: "set null" }),
  entityType: varchar("entity_type", { length: 40 }),
  entityId: varchar("entity_id"),
  actionUrl: text("action_url"),
  payload: jsonb("payload"),
  message: text("message").notNull(),
  readAt: timestamp("read_at"),
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
});

// Browser Web Push subscriptions
export const pushSubscriptions = pgTable("push_subscriptions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  endpoint: text("endpoint").notNull(),
  auth: text("auth").notNull(),
  p256dh: text("p256dh").notNull(),
  userAgent: text("user_agent"),
  deviceName: text("device_name"),
  isActive: boolean("is_active").notNull().default(true),
  lastUsedAt: timestamp("last_used_at"),
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
  updatedAt: timestamp("updated_at").notNull().default(sql`now()`),
});

export const pushNotificationSettings = pgTable("push_notification_settings", {
  userId: varchar("user_id").primaryKey().references(() => users.id, { onDelete: "cascade" }),
  pushEnabled: boolean("push_enabled").notNull().default(false),
  emailEnabled: boolean("email_enabled").notNull().default(true),
  sessionStarted: boolean("session_started").notNull().default(true),
  sessionReminder: boolean("session_reminder").notNull().default(true),
  clubDiscussion: boolean("club_discussion").notNull().default(false),
  mentionInChat: boolean("mention_in_chat").notNull().default(true),
  dmReceived: boolean("dm_received").notNull().default(true),
  newFollower: boolean("new_follower").notNull().default(false),
  streakReminder: boolean("streak_reminder").notNull().default(true),
  achievementUnlocked: boolean("achievement_unlocked").notNull().default(true),
  quietHoursEnabled: boolean("quiet_hours_enabled").notNull().default(false),
  quietHoursStart: integer("quiet_hours_start").default(23),
  quietHoursEnd: integer("quiet_hours_end").default(8),
  updatedAt: timestamp("updated_at").notNull().default(sql`now()`),
});

export const pushNotificationLog = pgTable("push_notification_log", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  type: text("type").notNull(),
  title: text("title").notNull(),
  body: text("body").notNull(),
  url: text("url"),
  sentAt: timestamp("sent_at").notNull().default(sql`now()`),
  deliveredAt: timestamp("delivered_at"),
  clickedAt: timestamp("clicked_at"),
  errorCode: text("error_code"),
});

// Избранные комментарии
export const favoriteComments = pgTable("favorite_comments", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  commentId: varchar("comment_id").notNull().references(() => comments.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
});

// Жалобы на комментарии
export const commentReports = pgTable("comment_reports", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  commentId: varchar("comment_id").notNull().references(() => comments.id, { onDelete: "cascade" }),
  reporterId: varchar("reporter_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  reason: varchar("reason", { length: 20 }).notNull().$type<ReportReason>(),
  description: text("description"),
  status: varchar("status", { length: 20 }).notNull().default("new").$type<ReportStatus>(),
  resolvedBy: varchar("resolved_by").references(() => users.id, { onDelete: "set null" }),
  resolvedAt: timestamp("resolved_at"),
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
});

// Schemas для валидации Club Reader
export const insertClubReadingPlanSchema = createInsertSchema(clubReadingPlans).pick({
  clubBookId: true,
  title: true,
  description: true,
  orderIndex: true,
  startChapter: true,
  endChapter: true,
  targetDate: true,
});

export const insertClubReadingPlanProgressSchema = createInsertSchema(clubReadingPlanProgress).pick({
  planId: true,
  userId: true,
  status: true,
});

export const insertClubBookmarkSchema = createInsertSchema(clubBookmarks).pick({
  clubBookId: true,
  position: true,
  chapter: true,
  title: true,
  description: true,
});

export const insertCommentSchema = createInsertSchema(comments).pick({
  clubId: true,
  bookId: true,
  chapterId: true,
  pageNumber: true,
  textFragment: true,
  textOffset: true,
  commentText: true,
  visibility: true,
});

export const insertCommentReplySchema = createInsertSchema(commentReplies).pick({
  parentCommentId: true,
  replyText: true,
  mentions: true,
});

export const insertCommentRatingSchema = createInsertSchema(commentRatings).pick({
  commentId: true,
  rating: true,
});

export const insertChatMessageSchema = createInsertSchema(chatMessages).pick({
  clubId: true,
  channel: true,
  text: true,
  mentions: true,
  attachments: true,
});

export const insertFavoriteCommentSchema = createInsertSchema(favoriteComments).pick({
  commentId: true,
});

export const insertCommentReportSchema = createInsertSchema(commentReports).pick({
  commentId: true,
  reason: true,
  description: true,
});

// Types для Club Reader
export type InsertClubReadingPlan = z.infer<typeof insertClubReadingPlanSchema>;
export type ClubReadingPlan = typeof clubReadingPlans.$inferSelect;

export type InsertClubReadingPlanProgress = z.infer<typeof insertClubReadingPlanProgressSchema>;
export type ClubReadingPlanProgress = typeof clubReadingPlanProgress.$inferSelect;

export type InsertClubBookmark = z.infer<typeof insertClubBookmarkSchema>;
export type ClubBookmark = typeof clubBookmarks.$inferSelect;

export type ClubDiscussion = typeof clubDiscussions.$inferSelect;
export type InsertClubDiscussion = typeof clubDiscussions.$inferInsert;

export const insertClubDiscussionSchema = createInsertSchema(clubDiscussions).pick({
  clubId: true,
  content: true,
  parentId: true,
  quotedContent: true,
  isWarning: true,
});

export type InsertComment = z.infer<typeof insertCommentSchema>;
export type Comment = typeof comments.$inferSelect;

export type InsertCommentReply = z.infer<typeof insertCommentReplySchema>;
export type CommentReply = typeof commentReplies.$inferSelect;

export type InsertCommentRating = z.infer<typeof insertCommentRatingSchema>;
export type CommentRating = typeof commentRatings.$inferSelect;

export type InsertChatMessage = z.infer<typeof insertChatMessageSchema>;
export type ChatMessage = typeof chatMessages.$inferSelect;

export type InsertFavoriteComment = z.infer<typeof insertFavoriteCommentSchema>;
export type FavoriteComment = typeof favoriteComments.$inferSelect;

export type InsertCommentReport = z.infer<typeof insertCommentReportSchema>;
export type CommentReport = typeof commentReports.$inferSelect;

// Extended types для Club Reader
export interface ClubReadingPlanWithProgress extends ClubReadingPlan {
  statusForUser?: PlanProgressStatus;
  completedUsersCount?: number;
  totalUsers?: number;
}

export interface CommentWithReplies extends Comment {
  user: User;
  replies: CommentReply[];
  replyCount: number;
  likeCount: number;
  dislikeCount: number;
  userRating?: "like" | "dislike";
  isFavorite?: boolean;
}

export interface CommentReplyWithUser extends CommentReply {
  user: User;
}

export interface ChatUser {
  id: string;
  username: string;
  displayName?: string | null;
  avatar?: string | null;
}

export interface ChatMessageWithUser extends ChatMessage {
  user: ChatUser;
  likesCount?: number;
}

export interface NotificationWithDetails {
  id: string;
  type: NotificationType;
  message: string;
  readAt: Date | null;
  createdAt: Date;
  sourceComment?: CommentWithReplies;
  sourceUser?: User;
  sourceMessage?: ChatMessageWithUser;
}

// Analytics Events - собственная система аналитики для книжных метрик
export const analyticsEventTypes = [
  "book_open",           // Открытие книги
  "chapter_start",       // Начало чтения главы
  "chapter_complete",    // Завершение главы
  "reading_session",     // Сессия чтения (периодическая отправка)
  "bookmark_create",     // Создание закладки
  "note_create",         // Создание заметки
  "book_complete",       // Завершение книги
  "club_join",           // Вступление в клуб
  "club_leave",          // Выход из клуба
  "book_upload",         // Загрузка книги
  "pwa_install",         // Установка PWA на устройство
  "pwa_homescreen_open", // Открытие PWA с домашнего экрана
] as const;
export type AnalyticsEventType = typeof analyticsEventTypes[number];

export const analyticsEvents = pgTable("analytics_events", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  eventType: text("event_type").notNull().$type<AnalyticsEventType>(),
  userId: varchar("user_id").references(() => users.id, { onDelete: "set null" }), // null для анонимных
  bookId: varchar("book_id").references(() => books.id, { onDelete: "set null" }),
  clubId: varchar("club_id").references(() => clubs.id, { onDelete: "set null" }),
  chapterNumber: integer("chapter_number"),
  duration: integer("duration"), // Длительность в секундах (для reading_session)
  progress: integer("progress"), // Прогресс чтения 0-100
  metadata: text("metadata"), // JSON для дополнительных данных
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
});

export type AnalyticsEvent = typeof analyticsEvents.$inferSelect;
export type InsertAnalyticsEvent = typeof analyticsEvents.$inferInsert;

// ============================================
// VOXLIBRIS STUDIO - Аудио чтение и WebRTC
// ============================================

// Типы сессий
export const sessionTypes = ["general", "reader_club"] as const;
export type SessionType = typeof sessionTypes[number];

// Статус чтения в клубе (поддерживает множественных чтецов)
export const clubReadingStatus = pgTable("club_reading_status", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  clubId: varchar("club_id").notNull().references(() => clubs.id, { onDelete: "cascade" }),
  userId: varchar("user_id").notNull().references(() => users.id), // Кто читает
  bookId: varchar("book_id").notNull().references(() => books.id),
  sessionId: varchar("session_id").references(() => readingSessions.id),
  
  // Статус
  isActive: boolean("is_active").notNull().default(false),
  startedAt: timestamp("started_at"),
  
  // Текущая позиция
  currentChapter: integer("current_chapter").notNull().default(1),
  currentPosition: text("current_position"), // JSON: {scrollTop, paragraph, offset}
  
  // Для клуба Чтеца - может ли подключаться
  isOpenForListeners: boolean("is_open_for_listeners").notNull().default(true),
  
  // Количество слушателей
  listenerCount: integer("listener_count").notNull().default(0),
  
  // Тип сессии (для фильтрации)
  sessionType: varchar("session_type", { length: 20 }).notNull().default("general").$type<SessionType>(),
  
  updatedAt: timestamp("updated_at").notNull().default(sql`now()`),
});

// Реакции слушателей (с поддержкой положительных и отрицательных)
export const reactionTypes = ["positive", "negative"] as const;
export type ReactionType = typeof reactionTypes[number];

export const sessionReactions = pgTable("session_reactions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  sessionId: varchar("session_id").notNull().references(() => readingSessions.id, { onDelete: "cascade" }),
  userId: varchar("user_id").notNull().references(() => users.id),
  emoji: varchar("emoji", { length: 50 }).notNull(), // "👍", "❤️", "🔥", "👎", "💩", etc
  type: varchar("type", { length: 20 }).notNull().default("positive").$type<ReactionType>(), // positive, negative
  position: text("position"), // Позиция в аудио (timestamp в секундах)
  audioTimestampMs: integer("audio_timestamp_ms"), // Миллисекунды от начала аудио/записи
  chapterNumber: integer("chapter_number"),
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
});

// Вопросы к чтецу (в контексте чата)
export const sessionQuestions = pgTable("session_questions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  sessionId: varchar("session_id").notNull().references(() => readingSessions.id, { onDelete: "cascade" }),
  userId: varchar("user_id").notNull().references(() => users.id),
  question: text("question").notNull(),
  isAnswered: boolean("is_answered").notNull().default(false),
  answer: text("answer"),
  answeredAt: timestamp("answered_at"),
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
});

// Аналитика сессий чтения
export const sessionAnalytics = pgTable("session_analytics", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  sessionId: varchar("session_id").notNull().references(() => readingSessions.id, { onDelete: "cascade" }),
  
  // Статистика слушателей
  peakListenerCount: integer("peak_listener_count").default(0),
  averageListenerCount: integer("average_listener_count").default(0),
  totalListeners: integer("total_listeners").default(0), // Уникальные слушатели
  
  // Время прослушивания
  totalListenTime: integer("total_listen_time").default(0), // В секундах
  averageSessionDuration: integer("average_session_duration").default(0), // В секундах
  
  // Реакции и вопросы
  reactionCount: integer("reaction_count").default(0),
  positiveReactionCount: integer("positive_reaction_count").default(0),
  negativeReactionCount: integer("negative_reaction_count").default(0),
  questionCount: integer("question_count").default(0),
  
  // Качество
  audioQualityScore: integer("audio_quality_score"), // 0-100
  networkQualityScore: integer("network_quality_score"), // 0-100
  
  // География (JSON)
  listenerRegions: text("listener_regions"), // JSON: {RU: 10, US: 5, ...}
  listenerCities: text("listener_cities"), // JSON: {Moscow: 8, "New York": 3, ...}
  
  // Устройства (JSON)
  deviceTypes: text("device_types"), // JSON: {desktop: 12, mobile: 8, tablet: 2}
  
  // Удержание (JSON)
  retention: text("retention"), // JSON: {"1min": 20, "5min": 15, "10min": 10}
  
  // Дополнительные метаданные
  metadata: text("metadata"), // JSON для любых дополнительных данных
  
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
  updatedAt: timestamp("updated_at").notNull().default(sql`now()`),
});
