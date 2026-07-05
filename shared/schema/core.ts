import { sql } from "drizzle-orm";
import { pgTable, text, varchar, integer, boolean, timestamp, foreignKey, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";


export const userRoles = ["user", "admin", "moderator"] as const;
export type UserRole = typeof userRoles[number];

export const userStatuses = ["pending", "active", "suspended", "deleted"] as const;
export type UserStatus = typeof userStatuses[number];

export const clubTypes = ["standard", "premium", "reader-led", "reading_club"] as const;
export type ClubType = typeof clubTypes[number];

export const clubStatuses = ["pending", "recruiting", "active", "completed", "archived"] as const;
export type ClubStatus = typeof clubStatuses[number];

export const clubMemberRoles = ["owner", "moderator", "member"] as const;
export type ClubMemberRole = typeof clubMemberRoles[number];

export const bookStatuses = ["active", "blocked", "deleted"] as const;
export type BookStatus = typeof bookStatuses[number];

// Using pgTable with extraConfig for foreign keys is the correct Drizzle ORM pattern
export const users = pgTable( // NOSONAR typescript:S1874
  "users",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    username: text("username").notNull().unique(),
    email: text("email").notNull().unique(),
    password: text("password").notNull(),
    role: text("role").notNull().default("user").$type<UserRole>(),
    status: text("status").notNull().default("pending").$type<UserStatus>(),
    emailConfirmed: boolean("email_confirmed").notNull().default(false),
    confirmationToken: varchar("confirmation_token", { length: 64 }),
    invitedBy: varchar("invited_by"), // Кто пригласил пользователя
    invitedToClub: varchar("invited_to_club"), // В какой клуб приглашен
    lastActivityAt: timestamp("last_activity_at"),
    suspensionReason: text("suspension_reason"),
    suspendedUntil: timestamp("suspended_until"),
    failedLoginAttempts: integer("failed_login_attempts").default(0),
    createdAt: timestamp("created_at").notNull().default(sql`now()`),
  },
  (table) => ({
    invitedByFk: foreignKey({
      columns: [table.invitedBy],
      foreignColumns: [table.id],
    }).onDelete("set null"),
  })
);


// Refresh tokens for JWT authentication
export const refreshTokens = pgTable("refresh_tokens", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  token: text("token").notNull().unique(),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
  isRevoked: boolean("is_revoked").notNull().default(false),
});

// Password reset tokens
export const passwordResetTokens = pgTable("password_reset_tokens", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  tokenHash: varchar("token_hash", { length: 64 }).notNull().unique(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
  usedAt: timestamp("used_at"),
  requestedByAdminId: varchar("requested_by_admin_id").references(() => users.id, { onDelete: "set null" }),
  requestedFromIp: text("requested_from_ip"),
});

// VoxLibris Upload System - Contexts and Collections

export const uploadContextTypes = ["personal", "club", "reader"] as const;
export type UploadContextType = typeof uploadContextTypes[number];

export const bookVisibilities = ["private", "club", "public"] as const;
export type BookVisibility = typeof bookVisibilities[number];

// Upload Contexts
export const uploadContexts = pgTable("upload_contexts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  type: text("type").notNull().$type<UploadContextType>(),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  clubId: varchar("club_id").references(() => clubs.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
});

// Book Collections (series, cycles)
export const bookCollections = pgTable("book_collections", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  title: text("title").notNull(),
  description: text("description"),
  uploadContextId: varchar("upload_context_id").notNull().references(() => uploadContexts.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
  updatedAt: timestamp("updated_at").notNull().default(sql`now()`),
});

// Book Collection Items
export const bookCollectionItems = pgTable("book_collection_items", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  collectionId: varchar("collection_id").notNull().references(() => bookCollections.id, { onDelete: "cascade" }),
  bookId: varchar("book_id").notNull().references(() => books.id, { onDelete: "cascade" }),
  position: integer("position").notNull().default(1),
  addedAt: timestamp("added_at").notNull().default(sql`now()`),
});

// Legal Acknowledgments
export const legalAcknowledgments = pgTable("legal_acknowledgments", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  uploadContextId: varchar("upload_context_id").notNull().references(() => uploadContexts.id, { onDelete: "cascade" }),
  ipAddress: text("ip_address").notNull(),
  userAgent: text("user_agent"),
  acknowledgedAt: timestamp("acknowledged_at").notNull().default(sql`now()`),
});

// Personal Books - user's personal library
export const userBooksLibrary = pgTable("user_books_library", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  bookId: varchar("book_id").notNull().references(() => books.id, { onDelete: "cascade" }),
  addedAt: timestamp("added_at").notNull().default(sql`now()`),
  lastReadAt: timestamp("last_read_at"),
});

// Club Books - club's shared library
export const clubBooksLibrary = pgTable("club_books_library", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  clubId: varchar("club_id").notNull().references(() => clubs.id, { onDelete: "cascade" }),
  bookId: varchar("book_id").notNull().references(() => books.id, { onDelete: "cascade" }),
  addedBy: varchar("added_by").notNull().references(() => users.id, { onDelete: "cascade" }),
  addedAt: timestamp("added_at").notNull().default(sql`now()`),
});

// Types for new tables
export type UploadContext = typeof uploadContexts.$inferSelect;
export type InsertUploadContext = typeof uploadContexts.$inferInsert;

export type BookCollection = typeof bookCollections.$inferSelect;
export type InsertBookCollection = typeof bookCollections.$inferInsert;

export type BookCollectionItem = typeof bookCollectionItems.$inferSelect;
export type InsertBookCollectionItem = typeof bookCollectionItems.$inferInsert;

export type LegalAcknowledgment = typeof legalAcknowledgments.$inferSelect;
export type InsertLegalAcknowledgment = typeof legalAcknowledgments.$inferInsert;

export type UserBookLibrary = typeof userBooksLibrary.$inferSelect;
export type InsertUserBookLibrary = typeof userBooksLibrary.$inferInsert;
export const bookProcessingStatuses = ["pending", "processing", "completed", "failed"] as const;
export type BookProcessingStatus = typeof bookProcessingStatuses[number];

// Books table
export const books = pgTable("books", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  title: text("title").notNull(),
  author: text("author").notNull(),
  coverUrl: text("cover_url"),
  description: text("description"),
  isbn: text("isbn"),
  language: text("language"), // Book language (ru, en, etc.)
  publisher: text("publisher"), // Book publisher
  publishDate: text("publish_date"), // Publication date/year
  totalChapters: integer("total_chapters").default(1),
  contentType: text("content_type").default("text"), // "text", "epub", "fb2"
  contentPath: text("content_path"), // Path to uploaded file in S3
  originalFilename: text("original_filename"), // Original uploaded filename
  fileSize: integer("file_size"), // File size in bytes
  uploadedBy: varchar("uploaded_by").references(() => users.id), // User who uploaded the book
  uploadedAt: timestamp("uploaded_at"), // VoxLibris Upload: when book was uploaded
  contentHash: varchar("content_hash", { length: 64 }), // VoxLibris Upload: file content hash
  wordCount: integer("word_count").default(0), // VoxLibris Upload: estimated word count
  processingStatus: text("processing_status").default("pending").$type<BookProcessingStatus>(), // VoxLibris Upload: processing status
  status: text("status").notNull().default("active").$type<BookStatus>(),
  blockedAt: timestamp("blocked_at"),
  blockReason: text("block_reason"),
  downloadCount: integer("download_count").default(0),
  // VoxLibris Upload Context
  uploadContextId: varchar("upload_context_id").references(() => uploadContexts.id, { onDelete: "cascade" }), // каскадное удаление книг при удалении контекста
  visibility: text("visibility").notNull().default("private").$type<BookVisibility>(),
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
  updatedAt: timestamp("updated_at").notNull().default(sql`now()`),
});

// Book chapters/content table
export const bookContent = pgTable("book_content", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  bookId: varchar("book_id").notNull().references(() => books.id, { onDelete: "cascade" }),
  chapterNumber: integer("chapter_number").notNull(),
  title: text("title").notNull(),
  content: text("content").notNull(),
  wordCount: integer("word_count").default(0),
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
});

// Clubs table
export const clubs = pgTable("clubs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  title: text("title").notNull(),
  description: text("description"),
  coverImage: text("cover_image"), // URL обложки клуба
  bookId: varchar("book_id"), // nullable - ссылка на club_books.id (FK добавлен в миграции 0016)
  ownerId: varchar("owner_id").notNull().references(() => users.id),
  type: text("type").notNull().default("standard").$type<ClubType>(),
  status: text("status").notNull().default("recruiting").$type<ClubStatus>(),
  maxMembers: integer("max_members").notNull().default(50),
  isPrivate: boolean("is_private").notNull().default(false), // Приватный клуб (только по приглашениям)
  isActive: boolean("is_active").notNull().default(true),
  isLive: boolean("is_live").notNull().default(false),
  isFeatured: boolean("is_featured").notNull().default(false),
  popularityScore: integer("popularity_score").notNull().default(0), // Оценка популярности для сортировки
  schedule: text("schedule"), // JSON string for reading schedule
  settings: text("settings"), // JSON строка с дополнительными настройками клуба
  archivedAt: timestamp("archived_at"),
  archiveReason: text("archive_reason"),
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
  updatedAt: timestamp("updated_at").notNull().default(sql`now()`),
});

// Club members relationship
export const clubMembers = pgTable("club_members", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  clubId: varchar("club_id").notNull().references(() => clubs.id, { onDelete: "cascade" }),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  role: text("role").notNull().default("member").$type<ClubMemberRole>(), // Роль участника в клубе
  joinedAt: timestamp("joined_at").notNull().default(sql`now()`),
  isActive: boolean("is_active").notNull().default(true),
  mutedUntil: timestamp("muted_until"),
  deactivatedUntil: timestamp("deactivated_until"),
  restrictionReason: text("restriction_reason"),
  restrictedBy: varchar("restricted_by").references(() => users.id),
  restrictedAt: timestamp("restricted_at"),
});

// Club invitations - система приглашений участников
export const invitationStatuses = ["pending", "accepted", "declined", "expired"] as const;
export type InvitationStatus = typeof invitationStatuses[number];

export const clubInvitations = pgTable("club_invitations", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  clubId: varchar("club_id").notNull().references(() => clubs.id, { onDelete: "cascade" }),
  email: varchar("email", { length: 255 }).notNull(),
  invitedBy: varchar("invited_by").notNull().references(() => users.id),
  inviteToken: varchar("invite_token", { length: 64 }).notNull().unique(),
  status: text("status").notNull().default("pending").$type<InvitationStatus>(),
  expiresAt: timestamp("expires_at").notNull(),
  acceptedAt: timestamp("accepted_at"),
  declinedAt: timestamp("declined_at"),
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
});

// Tags - справочник тегов/жанров
export const tags = pgTable("tags", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  slug: varchar("slug").notNull().unique(), // fantasy, sf_heroic, lit_rpg и т.д.
  nameRu: text("name_ru").notNull(), // фэнтези, героическая фантастика, литРПГ
  nameEn: text("name_en").notNull(), // fantasy, heroic fantasy, LitRPG
  description: text("description"), // описание жанра
  category: varchar("category"), // fantasy, sf, detective, romance и т.д.
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
});

// Club tags - связь клубов с тегами (many-to-many)
export const clubTags = pgTable("club_tags", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  clubId: varchar("club_id").notNull().references(() => clubs.id, { onDelete: "cascade" }),
  tagId: varchar("tag_id").notNull().references(() => tags.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
});

// Personal book tags - связь личных книг с тегами (many-to-many)
export const personalBookTags = pgTable("personal_book_tags", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  bookId: varchar("book_id").notNull().references(() => personalBooks.id, { onDelete: "cascade" }),
  tagId: varchar("tag_id").notNull().references(() => tags.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
});

// Club book tags - связь книг клубов с тегами (many-to-many)
export const clubBookTags = pgTable("club_book_tags", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  bookId: varchar("book_id").notNull().references(() => clubBooks.id, { onDelete: "cascade" }),
  tagId: varchar("tag_id").notNull().references(() => tags.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
});

// System settings - настройки системы (SMTP, etc)
export const settings = pgTable("settings", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  key: varchar("key", { length: 100 }).notNull().unique(),
  value: text("value"),
  category: varchar("category", { length: 50 }).notNull().default("general"), // 'smtp', 'general', 'email', etc
  description: text("description"),
  isEncrypted: boolean("is_encrypted").notNull().default(false), // для паролей SMTP
  updatedBy: varchar("updated_by").references(() => users.id),
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
  updatedAt: timestamp("updated_at").notNull().default(sql`now()`),
});

// RefreshToken type
export type RefreshToken = typeof refreshTokens.$inferSelect;
export type InsertRefreshToken = typeof refreshTokens.$inferInsert;

// PasswordResetToken type
export type PasswordResetToken = typeof passwordResetTokens.$inferSelect;
export type InsertPasswordResetToken = typeof passwordResetTokens.$inferInsert;

// Schemas for validation
export const insertUserSchema = createInsertSchema(users).pick({
  username: true,
  email: true,
  password: true,
  invitedBy: true,
  invitedToClub: true,
  status: true,
});

export const insertRefreshTokenSchema = createInsertSchema(refreshTokens).pick({
  token: true,
  userId: true,
  expiresAt: true,
});

export const insertBookSchema = createInsertSchema(books).pick({
  title: true,
  author: true,
  coverUrl: true,
  description: true,
  isbn: true,
  language: true,
  publisher: true,
  publishDate: true,
  totalChapters: true,
  contentType: true,
  contentPath: true,
  originalFilename: true,
  fileSize: true,
});

export const insertBookContentSchema = createInsertSchema(bookContent).pick({
  bookId: true,
  chapterNumber: true,
  title: true,
  content: true,
  wordCount: true,
});

export const insertClubSchema = createInsertSchema(clubs).omit({
  id: true,
  ownerId: true,
  status: true,
  isActive: true,
  isLive: true,
  isFeatured: true,
  archivedAt: true,
  archiveReason: true,
  createdAt: true,
  updatedAt: true,
}).extend({
  bookId: z.string().optional(), // bookId теперь необязательный - книга загружается после создания клуба
});

export const insertClubMemberSchema = createInsertSchema(clubMembers).pick({
  clubId: true,
  userId: true,
  role: true,
});

export const insertClubInvitationSchema = createInsertSchema(clubInvitations).pick({
  clubId: true,
  email: true,
  invitedBy: true,
  inviteToken: true,
  expiresAt: true,
});

// Types
export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;

export type InsertBook = z.infer<typeof insertBookSchema>;
export type Book = typeof books.$inferSelect;

export type InsertBookContent = z.infer<typeof insertBookContentSchema>;
export type BookContent = typeof bookContent.$inferSelect;

export type InsertClub = z.infer<typeof insertClubSchema>;
export type Club = typeof clubs.$inferSelect;

export type InsertClubMember = z.infer<typeof insertClubMemberSchema>;
export type ClubMember = typeof clubMembers.$inferSelect;

export type InsertClubInvitation = z.infer<typeof insertClubInvitationSchema>;
export type ClubInvitation = typeof clubInvitations.$inferSelect;

export type ClubInvitationWithInviter = ClubInvitation & {
  inviterName: string | null;
};

// Tag types
export type Tag = typeof tags.$inferSelect;
export type InsertTag = typeof tags.$inferInsert;

export type ClubTag = typeof clubTags.$inferSelect;
export type InsertClubTag = typeof clubTags.$inferInsert;

export type PersonalBookTag = typeof personalBookTags.$inferSelect;
export type InsertPersonalBookTag = typeof personalBookTags.$inferInsert;

export type ClubBookTag = typeof clubBookTags.$inferSelect;
export type InsertClubBookTag = typeof clubBookTags.$inferInsert;

export const insertSettingSchema = createInsertSchema(settings).pick({
  key: true,
  value: true,
  category: true,
  description: true,
  isEncrypted: true,
});

export type InsertSetting = z.infer<typeof insertSettingSchema>;
export type Setting = typeof settings.$inferSelect;

// Reading sessions table - for live reading sessions
export const readingSessions = pgTable("reading_sessions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  clubId: varchar("club_id").notNull().references(() => clubs.id, { onDelete: "cascade" }),
  readerId: varchar("reader_id").notNull().references(() => users.id),
  bookId: varchar("book_id").notNull(), // Может ссылаться на books.id или club_books.id
  title: text("title").notNull(),
  currentChapter: integer("current_chapter").notNull().default(1),
  currentPosition: text("current_position"), // JSON with detailed position info
  isActive: boolean("is_active").notNull().default(true),
  isLive: boolean("is_live").notNull().default(false),
  startedAt: timestamp("started_at").notNull().default(sql`now()`),
  endedAt: timestamp("ended_at"),
  emotionalMapCache: jsonb("emotional_map_cache"),
  emotionalMapBuiltAt: timestamp("emotional_map_built_at"),
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
});

// Reading progress for individual users
export const readingProgress = pgTable("reading_progress", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id),
  bookId: varchar("book_id").notNull(), // Может ссылаться на books.id или personal_books.id
  clubId: varchar("club_id").references(() => clubs.id, { onDelete: "cascade" }),
  currentChapter: integer("current_chapter").notNull().default(1),
  currentPosition: text("current_position"), // JSON with detailed position
  progress: integer("progress").notNull().default(0), // percentage 0-100
  lastReadAt: timestamp("last_read_at").notNull().default(sql`now()`),
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
  updatedAt: timestamp("updated_at").notNull().default(sql`now()`),
});

// Reading History - completed books only
export const readingHistory = pgTable("reading_history", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  bookId: varchar("book_id").notNull(), // personal_books.id
  bookTitle: text("book_title").notNull(), // Статичная копия для истории
  bookAuthor: text("book_author").notNull(), // Статичная копия для истории
  bookCoverUrl: text("book_cover_url"), // Статичная копия обложки
  completedAt: timestamp("completed_at").notNull().default(sql`now()`), // Когда завершено чтение
  readingTimeMinutes: integer("reading_time_minutes").default(0), // Общее время чтения в минутах
});

// Session listeners - who is listening to which session
export const sessionListeners = pgTable("session_listeners", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  sessionId: varchar("session_id").notNull().references(() => readingSessions.id),
  listenerId: varchar("listener_id").notNull().references(() => users.id),
  joinedAt: timestamp("joined_at").notNull().default(sql`now()`),
  leftAt: timestamp("left_at"),
  isActive: boolean("is_active").notNull().default(true),
});

// Reader ratings and feedback
export const readerRatings = pgTable("reader_ratings", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  sessionId: varchar("session_id").notNull().references(() => readingSessions.id),
  readerId: varchar("reader_id").notNull().references(() => users.id),
  raterId: varchar("rater_id").notNull().references(() => users.id),
  rating: integer("rating").notNull(), // 1-5 stars
  feedback: text("feedback"),
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
});

// User profiles extension for readers
export const userProfiles = pgTable("user_profiles", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id),
  displayName: text("display_name"),
  avatar: text("avatar"),
  coverImage: text("cover_image"), // URL обложки профиля
  bio: text("bio"),
  profileQuote: text("profile_quote"),
  profileQuoteAuthor: text("profile_quote_author"),
  favoriteGenres: text("favorite_genres"), // JSON array
  readerSettings: text("reader_settings"), // JSON с настройками ридера для синхронизации между устройствами
  isReader: boolean("is_reader").notNull().default(false),
  readerRating: integer("reader_rating").notNull().default(0), // 0-500 (5.0 * 100)
  totalReadingSessions: integer("total_reading_sessions").notNull().default(0),
  totalListeners: integer("total_listeners").notNull().default(0),
  followersCount: integer("followers_count").notNull().default(0),
  followingCount: integer("following_count").notNull().default(0),
  feedLastSeenAt: timestamp("feed_last_seen_at"),
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
  updatedAt: timestamp("updated_at").notNull().default(sql`now()`),
});

export const profileBookshelf = pgTable("profile_bookshelf", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  bookId: varchar("book_id").notNull(),
  bookType: text("book_type").notNull().$type<BookType>(),
  reviewText: text("review_text"),
  rating: integer("rating"),
  displayOrder: integer("display_order").notNull().default(0),
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
  updatedAt: timestamp("updated_at").notNull().default(sql`now()`),
});

// Schemas for validation
export const insertReadingSessionSchema = createInsertSchema(readingSessions).pick({
  clubId: true,
  bookId: true,
  title: true,
  currentChapter: true,
  currentPosition: true,
});

export const insertReadingProgressSchema = createInsertSchema(readingProgress).pick({
  bookId: true,
  clubId: true,
  currentChapter: true,
  currentPosition: true,
  progress: true,
});

export const insertReaderRatingSchema = createInsertSchema(readerRatings).pick({
  sessionId: true,
  readerId: true,
  rating: true,
  feedback: true,
});

export const insertUserProfileSchema = createInsertSchema(userProfiles).pick({
  displayName: true,
  avatar: true,
  coverImage: true,
  bio: true,
  favoriteGenres: true,
  isReader: true,
  profileQuote: true,
  profileQuoteAuthor: true,
});

export const insertProfileBookshelfSchema = createInsertSchema(profileBookshelf).pick({
  bookId: true,
  bookType: true,
  reviewText: true,
  rating: true,
  displayOrder: true,
});

// Types for reading system
export type InsertReadingSession = z.infer<typeof insertReadingSessionSchema>;
export type ReadingSession = typeof readingSessions.$inferSelect;

export type InsertReadingProgress = z.infer<typeof insertReadingProgressSchema>;
export type ReadingProgress = typeof readingProgress.$inferSelect;

// Reading History schemas
export const insertReadingHistorySchema = createInsertSchema(readingHistory);
export type InsertReadingHistory = z.infer<typeof insertReadingHistorySchema>;
export type ReadingHistory = typeof readingHistory.$inferSelect;

export type InsertReaderRating = z.infer<typeof insertReaderRatingSchema>;
export type ReaderRating = typeof readerRatings.$inferSelect;

export type InsertUserProfile = z.infer<typeof insertUserProfileSchema>;
export type UserProfile = typeof userProfiles.$inferSelect;

export type SessionListener = typeof sessionListeners.$inferSelect;

// VoxLibris Upload System tables (ТЗ секция 7.1)
export const bookFormats = ["FB2", "EPUB"] as const;
export type BookFormat = typeof bookFormats[number];

export const bookTypes = ["personal", "club"] as const;
export type BookType = typeof bookTypes[number];

export const genreSources = ["metadata", "manual", "migration", "admin"] as const;
export type GenreSource = typeof genreSources[number];

export const accessActions = ["READ_OPENED", "READ_SESSION_END", "READ_DELETED"] as const;
export type AccessAction = typeof accessActions[number];

export const genres = pgTable("genres", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  code: varchar("code", { length: 120 }).notNull().unique(),
  labelRu: text("label_ru").notNull(),
  labelEn: text("label_en"),
  groupKey: varchar("group_key", { length: 80 }),
  description: text("description"),
  aliasesJson: text("aliases_json"),
  sortOrder: integer("sort_order").notNull().default(0),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
  updatedAt: timestamp("updated_at").notNull().default(sql`now()`),
});

// Таблица личных книг пользователя (ТЗ 7.1)
export const personalBooks = pgTable("personal_books", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  author: text("author").notNull(),
  description: text("description"),
  publicationYear: integer("publication_year"),
  genre: text("genre"),
  primaryGenreId: varchar("primary_genre_id").references(() => genres.id, { onDelete: "set null" }),
  language: text("language"),
  format: text("format").notNull().$type<BookFormat>(),
  fileHash: varchar("file_hash", { length: 64 }),
  fileSizeBytes: integer("file_size_bytes"),
  storagePath: text("storage_path").notNull(),
  encryptedContentKey: text("encrypted_content_key"),
  coverUrl: text("cover_url"),
  uploadedAt: timestamp("uploaded_at").notNull().default(sql`now()`),
  isDeleted: boolean("is_deleted").notNull().default(false),
  softDeletedAt: timestamp("soft_deleted_at"),
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
  updatedAt: timestamp("updated_at").notNull().default(sql`now()`),
});

// Таблица клубных книг (ТЗ 7.1)
export const clubBooks = pgTable("club_books", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  clubId: varchar("club_id").notNull().references(() => clubs.id, { onDelete: "cascade" }),
  uploadedByUserId: varchar("uploaded_by_user_id").notNull().references(() => users.id),
  title: text("title").notNull(),
  author: text("author").notNull(),
  description: text("description"),
  publicationYear: integer("publication_year"),
  genre: text("genre"),
  primaryGenreId: varchar("primary_genre_id").references(() => genres.id, { onDelete: "set null" }),
  language: text("language"),
  format: text("format").notNull().$type<BookFormat>(),
  fileHash: varchar("file_hash", { length: 64 }),
  fileSizeBytes: integer("file_size_bytes"),
  storagePath: text("storage_path").notNull(),
  encryptedContentKey: text("encrypted_content_key"),
  coverUrl: text("cover_url"),
  recommendedReadingOrder: integer("recommended_reading_order"),
  uploadedAt: timestamp("uploaded_at").notNull().default(sql`now()`),
  isDeleted: boolean("is_deleted").notNull().default(false),
  softDeletedAt: timestamp("soft_deleted_at"),
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
  updatedAt: timestamp("updated_at").notNull().default(sql`now()`),
});

export const bookGenres = pgTable("book_genres", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  bookId: varchar("book_id").notNull(),
  bookType: text("book_type").notNull().$type<BookType>(),
  genreId: varchar("genre_id").notNull().references(() => genres.id, { onDelete: "cascade" }),
  source: text("source").notNull().default("metadata").$type<GenreSource>(),
  isPrimary: boolean("is_primary").notNull().default(false),
  confidence: integer("confidence"),
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
});

// Логирование доступа к книгам (ТЗ 7.1)
export const bookAccessLogs = pgTable("book_access_logs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  bookId: varchar("book_id").notNull(),
  bookType: text("book_type").notNull().$type<BookType>(),
  userId: varchar("user_id").notNull().references(() => users.id),
  action: text("action").notNull().$type<AccessAction>(),
  timestamp: timestamp("timestamp").notNull().default(sql`now()`),
  deviceType: text("device_type"),
  sessionDurationMinutes: integer("session_duration_minutes"),
  ipHash: text("ip_hash"),
});

// VoxLibris Upload validation schemas
export const insertPersonalBookSchema = createInsertSchema(personalBooks).pick({
  title: true,
  author: true,
  description: true,
  publicationYear: true,
  genre: true,
  primaryGenreId: true,
  language: true,
  format: true,
  fileHash: true,
  fileSizeBytes: true,
  coverUrl: true,
  storagePath: true,
  encryptedContentKey: true,
});

export const insertClubBookSchema = createInsertSchema(clubBooks).pick({
  clubId: true,
  title: true,
  author: true,
  description: true,
  publicationYear: true,
  genre: true,
  primaryGenreId: true,
  language: true,
  format: true,
  fileHash: true,
  fileSizeBytes: true,
  storagePath: true,
  encryptedContentKey: true,
  coverUrl: true,
  recommendedReadingOrder: true,
});

export const insertBookAccessLogSchema = createInsertSchema(bookAccessLogs).pick({
  bookId: true,
  bookType: true,
  action: true,
  deviceType: true,
  sessionDurationMinutes: true,
  ipHash: true,
});

export const insertGenreSchema = createInsertSchema(genres).pick({
  code: true,
  labelRu: true,
  labelEn: true,
  groupKey: true,
  description: true,
  aliasesJson: true,
  sortOrder: true,
  isActive: true,
});

export const insertBookGenreSchema = createInsertSchema(bookGenres).pick({
  bookId: true,
  bookType: true,
  genreId: true,
  source: true,
  isPrimary: true,
  confidence: true,
});

// VoxLibris Upload types
export type InsertPersonalBook = z.infer<typeof insertPersonalBookSchema>;
export type PersonalBook = typeof personalBooks.$inferSelect;

export type InsertClubBook = z.infer<typeof insertClubBookSchema>;
export type ClubBook = typeof clubBooks.$inferSelect;

export type InsertBookAccessLog = z.infer<typeof insertBookAccessLogSchema>;
export type BookAccessLog = typeof bookAccessLogs.$inferSelect;

export type InsertGenre = z.infer<typeof insertGenreSchema>;
export type Genre = typeof genres.$inferSelect;

export type InsertBookGenre = z.infer<typeof insertBookGenreSchema>;
export type BookGenre = typeof bookGenres.$inferSelect;

// Admin tables for VoxLibris admin panel
export const moderationReportTypes = ["user", "club", "book", "chat", "reader"] as const;
export type ModerationReportType = typeof moderationReportTypes[number];

export const moderationReportReasons = [
  "spam", "inappropriate_content", "harassment", "copyright_violation",
  "fake_profile", "offensive_language", "underage", "other"
] as const;
export type ModerationReportReason = typeof moderationReportReasons[number];

export const moderationReportStatuses = ["new", "in_progress", "resolved", "dismissed"] as const;
export type ModerationReportStatus = typeof moderationReportStatuses[number];

export const moderationReportPriorities = ["low", "medium", "high", "critical"] as const;
export type ModerationReportPriority = typeof moderationReportPriorities[number];

export const moderationReports = pgTable("moderation_reports", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  type: text("type").notNull().$type<ModerationReportType>(),
  targetId: varchar("target_id").notNull(),
  reporterId: varchar("reporter_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  reason: text("reason").notNull().$type<ModerationReportReason>(),
  description: text("description").notNull(),
  status: text("status").notNull().default("new").$type<ModerationReportStatus>(),
  priority: text("priority").notNull().default("medium").$type<ModerationReportPriority>(),
  assignedTo: varchar("assigned_to").references(() => users.id, { onDelete: "set null" }),
  resolution: text("resolution"),
  adminNotes: text("admin_notes"),
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
  updatedAt: timestamp("updated_at").notNull().default(sql`now()`),
  resolvedAt: timestamp("resolved_at"),
});

export const adminActionTypes = [
  "block_user", "unblock_user", "change_user_role", "change_user_status", "delete_user", "restore_user", "permanent_delete_user",
  "reset_password", "impersonate", "edit_user_fields", "send_test_push",
  "archive_club", "delete_club", "block_club", "unblock_club", "update_club", "update_club_privacy",
  "delete_book", "block_book", "unblock_book", "update_book_status",
  "delete_message", "block_message",
  "resolve_report", "dismiss_report", "assign_report", "update_report_status",
  "review_dm_report", "dismiss_dm_report", "view_dm_conversation",
  "update_settings", "update_smtp_settings", "test_smtp", "backup_data", "restore_data"
] as const;
export type AdminActionType = typeof adminActionTypes[number];

export const adminActionTargetTypes = ["user", "club", "book", "message", "report", "system", "settings"] as const;
export type AdminActionTargetType = typeof adminActionTargetTypes[number];

export const adminActions = pgTable("admin_actions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  adminId: varchar("admin_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  actionType: text("action_type").notNull().$type<AdminActionType>(),
  targetType: text("target_type").notNull().$type<AdminActionTargetType>(),
  targetId: varchar("target_id").notNull(),
  reason: text("reason"),
  previousValue: text("previous_value"),
  newValue: text("new_value"),
  metadata: text("metadata"), // JSON string for additional data
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
});

export const systemSettingTypes = ["string", "number", "boolean", "json"] as const;
export type SystemSettingType = typeof systemSettingTypes[number];

export const systemSettings = pgTable("system_settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  type: text("type").notNull().$type<SystemSettingType>(),
  category: text("category").notNull().default("general"),
  description: text("description"),
  isPublic: boolean("is_public").notNull().default(false),
  updatedBy: varchar("updated_by").references(() => users.id, { onDelete: "set null" }),
  updatedAt: timestamp("updated_at").notNull().default(sql`now()`),
});

// Reading status tracking
export const bookReadingStatuses = ["reading", "completed", "planned", "abandoned"] as const;
export type BookReadingStatus = typeof bookReadingStatuses[number];

export const bookReadingStatus = pgTable("book_reading_status", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  bookId: varchar("book_id").notNull(),
  bookType: text("book_type").notNull().$type<BookType>(),
  status: text("status").notNull().$type<BookReadingStatus>(),
  progress: integer("progress").default(0),
  startedAt: timestamp("started_at"),
  completedAt: timestamp("completed_at"),
  notes: text("notes"),
  rating: integer("rating"),
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
  updatedAt: timestamp("updated_at").notNull().default(sql`now()`),
});

export const userReadingGoals = pgTable("user_reading_goals", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  year: integer("year").notNull(),
  goalBooks: integer("goal_books").notNull().default(12),
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
  updatedAt: timestamp("updated_at").notNull().default(sql`now()`),
});

// Admin schemas for validation
export const insertModerationReportSchema = createInsertSchema(moderationReports).pick({
  type: true,
  targetId: true,
  reporterId: true,
  reason: true,
  description: true,
  priority: true,
});

export const insertAdminActionSchema = createInsertSchema(adminActions).pick({
  adminId: true,
  actionType: true,
  targetType: true,
  targetId: true,
  reason: true,
  previousValue: true,
  newValue: true,
  metadata: true,
});

export const insertSystemSettingSchema = createInsertSchema(systemSettings).pick({
  key: true,
  value: true,
  type: true,
  category: true,
  description: true,
  isPublic: true,
});

// Admin Insert Types
export type InsertModerationReport = z.infer<typeof insertModerationReportSchema>;
export type ModerationReport = typeof moderationReports.$inferSelect;

export type InsertAdminAction = z.infer<typeof insertAdminActionSchema>;
export type AdminAction = typeof adminActions.$inferSelect;

export type InsertSystemSetting = z.infer<typeof insertSystemSettingSchema>;
export type SystemSetting = typeof systemSettings.$inferSelect;

// Reading status types
export type BookReadingStatusRecord = typeof bookReadingStatus.$inferSelect;
export type InsertBookReadingStatus = typeof bookReadingStatus.$inferInsert;

export type ProfileBookshelf = typeof profileBookshelf.$inferSelect;
export type InsertProfileBookshelf = typeof profileBookshelf.$inferInsert;

export type UserReadingGoal = typeof userReadingGoals.$inferSelect;
export type InsertUserReadingGoal = typeof userReadingGoals.$inferInsert;
