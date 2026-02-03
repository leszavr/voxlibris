import { pgTable, index, foreignKey, unique, varchar, text, boolean, timestamp, integer, type AnyPgColumn } from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"



export const users = pgTable("users", {
	id: varchar().default(gen_random_uuid()).primaryKey().notNull(),
	username: text().notNull(),
	email: text().notNull(),
	password: text().notNull(),
	role: text().default('user').notNull(),
	status: text().default('pending').notNull(),
	emailConfirmed: boolean("email_confirmed").default(false).notNull(),
	confirmationToken: varchar("confirmation_token", { length: 64 }),
	invitedBy: varchar("invited_by"),
	invitedToClub: varchar("invited_to_club"),
	lastActivityAt: timestamp("last_activity_at", { mode: 'string' }),
	suspensionReason: text("suspension_reason"),
	suspendedUntil: timestamp("suspended_until", { mode: 'string' }),
	failedLoginAttempts: integer("failed_login_attempts").default(0),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("users_email_idx").using("btree", table.email.asc().nullsLast().op("text_ops")),
	index("users_role_idx").using("btree", table.role.asc().nullsLast().op("text_ops")),
	index("users_status_idx").using("btree", table.status.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.invitedBy],
			foreignColumns: [table.id],
			name: "users_invited_by_fk"
		}).onDelete("set null"),
	unique("users_username_unique").on(table.username),
	unique("users_email_unique").on(table.email),
]);

export const refreshTokens = pgTable("refresh_tokens", {
	id: varchar().default(gen_random_uuid()).primaryKey().notNull(),
	token: text().notNull(),
	userId: varchar("user_id").notNull(),
	expiresAt: timestamp("expires_at", { mode: 'string' }).notNull(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	isRevoked: boolean("is_revoked").default(false).notNull(),
}, (table) => [
	index("refresh_tokens_expires_at_idx").using("btree", table.expiresAt.asc().nullsLast().op("timestamp_ops")),
	index("refresh_tokens_user_id_idx").using("btree", table.userId.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.userId],
			foreignColumns: [users.id],
			name: "refresh_tokens_user_id_fk"
		}).onDelete("cascade"),
	unique("refresh_tokens_token_unique").on(table.token),
]);

export const books = pgTable("books", {
	id: varchar().default(gen_random_uuid()).primaryKey().notNull(),
	title: text().notNull(),
	author: text().notNull(),
	coverUrl: text("cover_url"),
	description: text(),
	isbn: text(),
	language: text(),
	publisher: text(),
	publishDate: text("publish_date"),
	status: text().default('active').notNull(),
	blockedAt: timestamp("blocked_at", { mode: 'string' }),
	blockReason: text("block_reason"),
	downloadCount: integer("download_count").default(0),
	totalChapters: integer("total_chapters").default(1),
	contentType: text("content_type").default('text'),
	contentPath: text("content_path"),
	originalFilename: text("original_filename"),
	fileSize: integer("file_size"),
	uploadedBy: varchar("uploaded_by"),
	uploadedAt: timestamp("uploaded_at", { mode: 'string' }),
	contentHash: varchar("content_hash", { length: 64 }),
	wordCount: integer("word_count").default(0),
	processingStatus: text("processing_status").default('pending'),
	uploadContextId: varchar("upload_context_id"),
	visibility: text().default('private').notNull(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("books_author_idx").using("btree", table.author.asc().nullsLast().op("text_ops")),
	index("books_status_idx").using("btree", table.status.asc().nullsLast().op("text_ops")),
	index("books_upload_context_id_idx").using("btree", table.uploadContextId.asc().nullsLast().op("text_ops")),
	index("books_visibility_idx").using("btree", table.visibility.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.uploadedBy],
			foreignColumns: [users.id],
			name: "books_uploaded_by_fk"
		}).onDelete("set null"),
	foreignKey({
			columns: [table.uploadContextId],
			foreignColumns: [uploadContexts.id],
			name: "books_upload_context_fk"
		}).onDelete("set null"),
]);

export const bookContent = pgTable("book_content", {
	id: varchar().default(gen_random_uuid()).primaryKey().notNull(),
	bookId: varchar("book_id").notNull(),
	chapterNumber: integer("chapter_number").notNull(),
	title: text().notNull(),
	content: text().notNull(),
	wordCount: integer("word_count").default(0),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("book_content_book_id_idx").using("btree", table.bookId.asc().nullsLast().op("text_ops")),
	index("book_content_chapter_idx").using("btree", table.bookId.asc().nullsLast().op("int4_ops"), table.chapterNumber.asc().nullsLast().op("int4_ops")),
	foreignKey({
			columns: [table.bookId],
			foreignColumns: [books.id],
			name: "book_content_book_id_fk"
		}).onDelete("cascade"),
]);

export const clubs = pgTable("clubs", {
	id: varchar().default(gen_random_uuid()).primaryKey().notNull(),
	title: text().notNull(),
	description: text(),
	coverImage: text("cover_image"),
	bookId: varchar("book_id"),
	ownerId: varchar("owner_id").notNull(),
	type: text().default('standard').notNull(),
	status: text().default('recruiting').notNull(),
	maxMembers: integer("max_members").default(50).notNull(),
	isPrivate: boolean("is_private").default(false).notNull(),
	isActive: boolean("is_active").default(true).notNull(),
	isLive: boolean("is_live").default(false).notNull(),
	isFeatured: boolean("is_featured").default(false).notNull(),
	schedule: text(),
	settings: text(),
	archivedAt: timestamp("archived_at", { mode: 'string' }),
	archiveReason: text("archive_reason"),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("clubs_book_id_idx").using("btree", table.bookId.asc().nullsLast().op("text_ops")),
	index("clubs_owner_id_idx").using("btree", table.ownerId.asc().nullsLast().op("text_ops")),
	index("clubs_status_idx").using("btree", table.status.asc().nullsLast().op("text_ops")),
	index("clubs_type_idx").using("btree", table.type.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.ownerId],
			foreignColumns: [users.id],
			name: "clubs_owner_id_fk"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.bookId],
			foreignColumns: [clubBooks.id],
			name: "clubs_book_id_fk"
		}).onDelete("set null"),
]);

export const clubMembers = pgTable("club_members", {
	id: varchar().default(gen_random_uuid()).primaryKey().notNull(),
	clubId: varchar("club_id").notNull(),
	userId: varchar("user_id").notNull(),
	role: text().default('member').notNull(),
	joinedAt: timestamp("joined_at", { mode: 'string' }).defaultNow().notNull(),
	isActive: boolean("is_active").default(true).notNull(),
}, (table) => [
	index("club_members_club_id_idx").using("btree", table.clubId.asc().nullsLast().op("text_ops")),
	index("club_members_club_user_idx").using("btree", table.clubId.asc().nullsLast().op("text_ops"), table.userId.asc().nullsLast().op("text_ops")),
	index("club_members_user_id_idx").using("btree", table.userId.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.clubId],
			foreignColumns: [clubs.id],
			name: "club_members_club_id_fk"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.userId],
			foreignColumns: [users.id],
			name: "club_members_user_id_fk"
		}).onDelete("cascade"),
]);

export const clubTags = pgTable("club_tags", {
	id: varchar().default(gen_random_uuid()).primaryKey().notNull(),
	clubId: varchar("club_id").notNull(),
	tag: text().notNull(),
}, (table) => [
	index("club_tags_club_id_idx").using("btree", table.clubId.asc().nullsLast().op("text_ops")),
	index("club_tags_tag_idx").using("btree", table.tag.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.clubId],
			foreignColumns: [clubs.id],
			name: "club_tags_club_id_fk"
		}).onDelete("cascade"),
	unique("club_tags_club_tag_unique").on(table.clubId, table.tag),
]);

export const readingSessions = pgTable("reading_sessions", {
	id: varchar().default(gen_random_uuid()).primaryKey().notNull(),
	clubId: varchar("club_id").notNull(),
	readerId: varchar("reader_id").notNull(),
	bookId: varchar("book_id").notNull(),
	title: text().notNull(),
	currentChapter: integer("current_chapter").default(1).notNull(),
	currentPosition: text("current_position"),
	isActive: boolean("is_active").default(true).notNull(),
	isLive: boolean("is_live").default(false).notNull(),
	startedAt: timestamp("started_at", { mode: 'string' }).defaultNow().notNull(),
	endedAt: timestamp("ended_at", { mode: 'string' }),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("reading_sessions_book_id_idx").using("btree", table.bookId.asc().nullsLast().op("text_ops")),
	index("reading_sessions_club_id_idx").using("btree", table.clubId.asc().nullsLast().op("text_ops")),
	index("reading_sessions_is_active_idx").using("btree", table.isActive.asc().nullsLast().op("bool_ops")),
	index("reading_sessions_reader_id_idx").using("btree", table.readerId.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.clubId],
			foreignColumns: [clubs.id],
			name: "reading_sessions_club_id_fk"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.readerId],
			foreignColumns: [users.id],
			name: "reading_sessions_reader_id_fk"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.bookId],
			foreignColumns: [books.id],
			name: "reading_sessions_book_id_fk"
		}).onDelete("cascade"),
]);

export const readingProgress = pgTable("reading_progress", {
	id: varchar().default(gen_random_uuid()).primaryKey().notNull(),
	userId: varchar("user_id").notNull(),
	bookId: varchar("book_id").notNull(),
	clubId: varchar("club_id"),
	currentChapter: integer("current_chapter").default(1).notNull(),
	currentPosition: text("current_position"),
	progress: integer().default(0).notNull(),
	lastReadAt: timestamp("last_read_at", { mode: 'string' }).defaultNow().notNull(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("reading_progress_book_id_idx").using("btree", table.bookId.asc().nullsLast().op("text_ops")),
	index("reading_progress_club_id_idx").using("btree", table.clubId.asc().nullsLast().op("text_ops")),
	index("reading_progress_user_book_idx").using("btree", table.userId.asc().nullsLast().op("text_ops"), table.bookId.asc().nullsLast().op("text_ops")),
	index("reading_progress_user_id_idx").using("btree", table.userId.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.userId],
			foreignColumns: [users.id],
			name: "reading_progress_user_id_fk"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.clubId],
			foreignColumns: [clubs.id],
			name: "reading_progress_club_id_fk"
		}).onDelete("set null"),
]);

export const readingHistory = pgTable("reading_history", {
	id: varchar().default(gen_random_uuid()).primaryKey().notNull(),
	userId: varchar("user_id").notNull(),
	bookId: varchar("book_id").notNull(),
	clubId: varchar("club_id"),
	completedAt: timestamp("completed_at", { mode: 'string' }).defaultNow().notNull(),
	bookTitle: text("book_title").notNull(),
	bookAuthor: text("book_author").notNull(),
	bookCoverUrl: text("book_cover_url"),
	readingTimeMinutes: integer("reading_time_minutes").default(0),
}, (table) => [
	index("reading_history_book_id_idx").using("btree", table.bookId.asc().nullsLast().op("text_ops")),
	index("reading_history_completed_at_idx").using("btree", table.completedAt.asc().nullsLast().op("timestamp_ops")),
	index("reading_history_user_id_idx").using("btree", table.userId.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.userId],
			foreignColumns: [users.id],
			name: "reading_history_user_id_fk"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.bookId],
			foreignColumns: [books.id],
			name: "reading_history_book_id_fk"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.clubId],
			foreignColumns: [clubs.id],
			name: "reading_history_club_id_fk"
		}).onDelete("set null"),
]);

export const sessionListeners = pgTable("session_listeners", {
	id: varchar().default(gen_random_uuid()).primaryKey().notNull(),
	sessionId: varchar("session_id").notNull(),
	listenerId: varchar("listener_id").notNull(),
	joinedAt: timestamp("joined_at", { mode: 'string' }).defaultNow().notNull(),
	leftAt: timestamp("left_at", { mode: 'string' }),
	isActive: boolean("is_active").default(true).notNull(),
}, (table) => [
	index("session_listeners_listener_id_idx").using("btree", table.listenerId.asc().nullsLast().op("text_ops")),
	index("session_listeners_session_id_idx").using("btree", table.sessionId.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.sessionId],
			foreignColumns: [readingSessions.id],
			name: "session_listeners_session_id_fk"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.listenerId],
			foreignColumns: [users.id],
			name: "session_listeners_listener_id_fk"
		}).onDelete("cascade"),
]);

export const readerRatings = pgTable("reader_ratings", {
	id: varchar().default(gen_random_uuid()).primaryKey().notNull(),
	sessionId: varchar("session_id").notNull(),
	readerId: varchar("reader_id").notNull(),
	raterId: varchar("rater_id").notNull(),
	rating: integer().notNull(),
	feedback: text(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("reader_ratings_rater_id_idx").using("btree", table.raterId.asc().nullsLast().op("text_ops")),
	index("reader_ratings_reader_id_idx").using("btree", table.readerId.asc().nullsLast().op("text_ops")),
	index("reader_ratings_session_id_idx").using("btree", table.sessionId.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.sessionId],
			foreignColumns: [readingSessions.id],
			name: "reader_ratings_session_id_fk"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.readerId],
			foreignColumns: [users.id],
			name: "reader_ratings_reader_id_fk"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.raterId],
			foreignColumns: [users.id],
			name: "reader_ratings_rater_id_fk"
		}).onDelete("cascade"),
]);

export const userProfiles = pgTable("user_profiles", {
	id: varchar().default(gen_random_uuid()).primaryKey().notNull(),
	userId: varchar("user_id").notNull(),
	displayName: text("display_name"),
	avatar: text(),
	bio: text(),
	favoriteGenres: text("favorite_genres"),
	isReader: boolean("is_reader").default(false).notNull(),
	readerRating: integer("reader_rating").default(0).notNull(),
	totalReadingSessions: integer("total_reading_sessions").default(0).notNull(),
	totalListeners: integer("total_listeners").default(0).notNull(),
	coverImage: text("cover_image"),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("user_profiles_is_reader_idx").using("btree", table.isReader.asc().nullsLast().op("bool_ops")),
	index("user_profiles_user_id_idx").using("btree", table.userId.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.userId],
			foreignColumns: [users.id],
			name: "user_profiles_user_id_fk"
		}).onDelete("cascade"),
	unique("user_profiles_user_id_unique").on(table.userId),
]);

export const adminActions = pgTable("admin_actions", {
	id: varchar().default(gen_random_uuid()).primaryKey().notNull(),
	adminId: varchar("admin_id").notNull(),
	actionType: text("action_type").notNull(),
	targetType: text("target_type").notNull(),
	targetId: varchar("target_id").notNull(),
	reason: text(),
	previousValue: text("previous_value"),
	newValue: text("new_value"),
	metadata: text(),
	ipAddress: text("ip_address"),
	userAgent: text("user_agent"),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("admin_actions_admin_id_idx").using("btree", table.adminId.asc().nullsLast().op("text_ops")),
	index("admin_actions_created_at_idx").using("btree", table.createdAt.asc().nullsLast().op("timestamp_ops")),
	index("admin_actions_target_idx").using("btree", table.targetType.asc().nullsLast().op("text_ops"), table.targetId.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.adminId],
			foreignColumns: [users.id],
			name: "admin_actions_admin_id_fk"
		}).onDelete("cascade"),
]);

export const bookmarks = pgTable("bookmarks", {
	id: varchar().default(gen_random_uuid()).primaryKey().notNull(),
	userId: varchar("user_id").notNull(),
	bookId: varchar("book_id").notNull(),
	chapterNumber: integer("chapter_number"),
	position: text().notNull(),
	title: text(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("bookmarks_book_id_idx").using("btree", table.bookId.asc().nullsLast().op("text_ops")),
	index("bookmarks_user_book_idx").using("btree", table.userId.asc().nullsLast().op("text_ops"), table.bookId.asc().nullsLast().op("text_ops")),
	index("bookmarks_user_id_idx").using("btree", table.userId.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.userId],
			foreignColumns: [users.id],
			name: "bookmarks_user_id_fk"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.bookId],
			foreignColumns: [books.id],
			name: "bookmarks_book_id_fk"
		}).onDelete("cascade"),
]);

export const notes = pgTable("notes", {
	id: varchar().default(gen_random_uuid()).primaryKey().notNull(),
	userId: varchar("user_id").notNull(),
	bookId: varchar("book_id").notNull(),
	chapterNumber: integer("chapter_number"),
	position: text().notNull(),
	highlightedText: text("highlighted_text"),
	noteText: text("note_text").notNull(),
	color: varchar({ length: 20 }).default('yellow'),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("notes_book_id_idx").using("btree", table.bookId.asc().nullsLast().op("text_ops")),
	index("notes_updated_at_idx").using("btree", table.updatedAt.asc().nullsLast().op("timestamp_ops")),
	index("notes_user_book_idx").using("btree", table.userId.asc().nullsLast().op("text_ops"), table.bookId.asc().nullsLast().op("text_ops")),
	index("notes_user_id_idx").using("btree", table.userId.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.userId],
			foreignColumns: [users.id],
			name: "notes_user_id_fk"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.bookId],
			foreignColumns: [books.id],
			name: "notes_book_id_fk"
		}).onDelete("cascade"),
]);

export const moderationReports = pgTable("moderation_reports", {
	id: varchar().default(gen_random_uuid()).primaryKey().notNull(),
	type: text().notNull(),
	targetId: varchar("target_id").notNull(),
	reporterId: varchar("reporter_id").notNull(),
	reason: text().notNull(),
	description: text().notNull(),
	status: text().default('new').notNull(),
	priority: text().default('medium').notNull(),
	assignedTo: varchar("assigned_to"),
	resolution: text(),
	adminNotes: text("admin_notes"),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().notNull(),
	resolvedAt: timestamp("resolved_at", { mode: 'string' }),
}, (table) => [
	index("moderation_reports_assigned_to_idx").using("btree", table.assignedTo.asc().nullsLast().op("text_ops")),
	index("moderation_reports_reporter_id_idx").using("btree", table.reporterId.asc().nullsLast().op("text_ops")),
	index("moderation_reports_status_idx").using("btree", table.status.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.reporterId],
			foreignColumns: [users.id],
			name: "moderation_reports_reporter_id_fk"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.assignedTo],
			foreignColumns: [users.id],
			name: "moderation_reports_assigned_to_fk"
		}).onDelete("set null"),
]);

export const systemSettings = pgTable("system_settings", {
	key: text().primaryKey().notNull(),
	value: text().notNull(),
	type: text().notNull(),
	category: text().default('general').notNull(),
	description: text(),
	isPublic: boolean("is_public").default(false).notNull(),
	updatedBy: varchar("updated_by"),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	foreignKey({
			columns: [table.updatedBy],
			foreignColumns: [users.id],
			name: "system_settings_updated_by_fk"
		}).onDelete("set null"),
]);

export const uploadContexts = pgTable("upload_contexts", {
	id: varchar().default(gen_random_uuid()).primaryKey().notNull(),
	type: text().notNull(),
	userId: varchar("user_id").notNull(),
	clubId: varchar("club_id"),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("upload_contexts_club_id_idx").using("btree", table.clubId.asc().nullsLast().op("text_ops")),
	index("upload_contexts_type_idx").using("btree", table.type.asc().nullsLast().op("text_ops")),
	index("upload_contexts_user_id_idx").using("btree", table.userId.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.userId],
			foreignColumns: [users.id],
			name: "upload_contexts_user_id_fk"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.clubId],
			foreignColumns: [clubs.id],
			name: "upload_contexts_club_id_fk"
		}).onDelete("cascade"),
]);

export const personalBooks = pgTable("personal_books", {
	id: varchar().default(gen_random_uuid()).primaryKey().notNull(),
	userId: varchar("user_id").notNull(),
	title: text().notNull(),
	author: text().notNull(),
	description: text(),
	publicationYear: integer("publication_year"),
	genre: text(),
	language: text(),
	format: text().notNull(),
	fileHash: varchar("file_hash", { length: 64 }),
	fileSizeBytes: integer("file_size_bytes"),
	storagePath: text("storage_path").notNull(),
	encryptedContentKey: text("encrypted_content_key"),
	coverUrl: text("cover_url"),
	uploadedAt: timestamp("uploaded_at", { mode: 'string' }).defaultNow().notNull(),
	isDeleted: boolean("is_deleted").default(false).notNull(),
	softDeletedAt: timestamp("soft_deleted_at", { mode: 'string' }),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("personal_books_author_idx").using("btree", table.author.asc().nullsLast().op("text_ops")),
	index("personal_books_is_deleted_idx").using("btree", table.isDeleted.asc().nullsLast().op("bool_ops")),
	index("personal_books_title_idx").using("btree", table.title.asc().nullsLast().op("text_ops")),
	index("personal_books_user_id_idx").using("btree", table.userId.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.userId],
			foreignColumns: [users.id],
			name: "personal_books_user_id_fk"
		}).onDelete("cascade"),
]);

export const clubBooks = pgTable("club_books", {
	id: varchar().default(gen_random_uuid()).primaryKey().notNull(),
	clubId: varchar("club_id").notNull(),
	uploadedByUserId: varchar("uploaded_by_user_id").notNull(),
	title: text().notNull(),
	author: text().notNull(),
	description: text(),
	publicationYear: integer("publication_year"),
	genre: text(),
	language: text(),
	format: text().notNull(),
	fileHash: varchar("file_hash", { length: 64 }),
	fileSizeBytes: integer("file_size_bytes"),
	storagePath: text("storage_path").notNull(),
	encryptedContentKey: text("encrypted_content_key"),
	coverUrl: text("cover_url"),
	recommendedReadingOrder: integer("recommended_reading_order"),
	uploadedAt: timestamp("uploaded_at", { mode: 'string' }).defaultNow().notNull(),
	isDeleted: boolean("is_deleted").default(false).notNull(),
	softDeletedAt: timestamp("soft_deleted_at", { mode: 'string' }),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("club_books_author_idx").using("btree", table.author.asc().nullsLast().op("text_ops")),
	index("club_books_club_id_idx").using("btree", table.clubId.asc().nullsLast().op("text_ops")),
	index("club_books_is_deleted_idx").using("btree", table.isDeleted.asc().nullsLast().op("bool_ops")),
	index("club_books_title_idx").using("btree", table.title.asc().nullsLast().op("text_ops")),
	index("club_books_uploaded_by_user_id_idx").using("btree", table.uploadedByUserId.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.clubId],
			foreignColumns: [clubs.id],
			name: "club_books_club_id_fk"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.uploadedByUserId],
			foreignColumns: [users.id],
			name: "club_books_uploaded_by_user_id_fk"
		}).onDelete("cascade"),
]);

export const bookCollections = pgTable("book_collections", {
	id: varchar().default(gen_random_uuid()).primaryKey().notNull(),
	title: text().notNull(),
	description: text(),
	uploadContextId: varchar("upload_context_id").notNull(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("book_collections_upload_context_id_idx").using("btree", table.uploadContextId.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.uploadContextId],
			foreignColumns: [uploadContexts.id],
			name: "book_collections_upload_context_id_fk"
		}).onDelete("cascade"),
]);

export const bookCollectionItems = pgTable("book_collection_items", {
	id: varchar().default(gen_random_uuid()).primaryKey().notNull(),
	collectionId: varchar("collection_id").notNull(),
	bookId: varchar("book_id").notNull(),
	position: integer().default(1).notNull(),
	addedAt: timestamp("added_at", { mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("book_collection_items_book_id_idx").using("btree", table.bookId.asc().nullsLast().op("text_ops")),
	index("book_collection_items_collection_id_idx").using("btree", table.collectionId.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.collectionId],
			foreignColumns: [bookCollections.id],
			name: "book_collection_items_collection_id_fk"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.bookId],
			foreignColumns: [books.id],
			name: "book_collection_items_book_id_fk"
		}).onDelete("cascade"),
]);

export const legalAcknowledgments = pgTable("legal_acknowledgments", {
	id: varchar().default(gen_random_uuid()).primaryKey().notNull(),
	userId: varchar("user_id").notNull(),
	uploadContextId: varchar("upload_context_id").notNull(),
	ipAddress: text("ip_address").notNull(),
	userAgent: text("user_agent"),
	acknowledgedAt: timestamp("acknowledged_at", { mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("legal_acknowledgments_upload_context_id_idx").using("btree", table.uploadContextId.asc().nullsLast().op("text_ops")),
	index("legal_acknowledgments_user_id_idx").using("btree", table.userId.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.userId],
			foreignColumns: [users.id],
			name: "legal_acknowledgments_user_id_fk"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.uploadContextId],
			foreignColumns: [uploadContexts.id],
			name: "legal_acknowledgments_upload_context_id_fk"
		}).onDelete("cascade"),
]);

export const settings = pgTable("settings", {
	id: varchar().default(gen_random_uuid()).primaryKey().notNull(),
	key: varchar({ length: 100 }).notNull(),
	value: text(),
	description: text(),
	updatedBy: varchar("updated_by"),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().notNull(),
	category: varchar({ length: 50 }).default('general').notNull(),
	isEncrypted: boolean("is_encrypted").default(false).notNull(),
}, (table) => [
	index("settings_category_idx").using("btree", table.category.asc().nullsLast().op("text_ops")),
	index("settings_key_idx").using("btree", table.key.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.updatedBy],
			foreignColumns: [users.id],
			name: "settings_updated_by_fk"
		}).onDelete("set null"),
	unique("settings_key_unique").on(table.key),
]);

export const clubReadingPlans = pgTable("club_reading_plans", {
	id: varchar().default(gen_random_uuid()).primaryKey().notNull(),
	clubBookId: varchar("club_book_id").notNull(),
	title: varchar({ length: 255 }).notNull(),
	description: text(),
	orderIndex: integer("order_index").notNull(),
	startChapter: integer("start_chapter"),
	endChapter: integer("end_chapter"),
	targetDate: timestamp("target_date", { mode: 'string' }),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("club_reading_plans_club_book_id_idx").using("btree", table.clubBookId.asc().nullsLast().op("text_ops")),
	index("club_reading_plans_order_index_idx").using("btree", table.orderIndex.asc().nullsLast().op("int4_ops")),
	foreignKey({
			columns: [table.clubBookId],
			foreignColumns: [clubBooks.id],
			name: "club_reading_plans_club_book_id_fk"
		}).onDelete("cascade"),
]);

export const clubInvitations = pgTable("club_invitations", {
	id: varchar().default(gen_random_uuid()).primaryKey().notNull(),
	clubId: varchar("club_id").notNull(),
	invitedBy: varchar("invited_by").notNull(),
	email: varchar({ length: 255 }).notNull(),
	invitedUserId: varchar("invited_user_id"),
	inviteToken: varchar("invite_token", { length: 64 }).notNull(),
	expiresAt: timestamp("expires_at", { mode: 'string' }).notNull(),
	acceptedAt: timestamp("accepted_at", { mode: 'string' }),
	declinedAt: timestamp("declined_at", { mode: 'string' }),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	status: text().default('pending').notNull(),
}, (table) => [
	index("club_invitations_club_id_idx").using("btree", table.clubId.asc().nullsLast().op("text_ops")),
	index("club_invitations_email_idx").using("btree", table.email.asc().nullsLast().op("text_ops")),
	index("club_invitations_invite_token_idx").using("btree", table.inviteToken.asc().nullsLast().op("text_ops")),
	index("club_invitations_status_idx").using("btree", table.status.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.clubId],
			foreignColumns: [clubs.id],
			name: "club_invitations_club_id_fk"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.invitedUserId],
			foreignColumns: [users.id],
			name: "club_invitations_invited_user_id_fk"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.invitedBy],
			foreignColumns: [users.id],
			name: "club_invitations_invited_by_fk"
		}).onDelete("cascade"),
	unique("club_invitations_invite_token_unique").on(table.inviteToken),
]);

export const clubReadingPlanProgress = pgTable("club_reading_plan_progress", {
	id: varchar().default(gen_random_uuid()).primaryKey().notNull(),
	planId: varchar("plan_id").notNull(),
	userId: varchar("user_id").notNull(),
	status: varchar({ length: 20 }).notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("club_reading_plan_progress_plan_id_idx").using("btree", table.planId.asc().nullsLast().op("text_ops")),
	index("club_reading_plan_progress_user_id_idx").using("btree", table.userId.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.planId],
			foreignColumns: [clubReadingPlans.id],
			name: "club_reading_plan_progress_plan_id_fk"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.userId],
			foreignColumns: [users.id],
			name: "club_reading_plan_progress_user_id_fk"
		}).onDelete("cascade"),
]);

export const analyticsEvents = pgTable("analytics_events", {
	id: varchar().default(gen_random_uuid()).primaryKey().notNull(),
	userId: varchar("user_id"),
	eventType: text("event_type").notNull(),
	ipAddress: text("ip_address"),
	userAgent: text("user_agent"),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	bookId: varchar("book_id"),
	clubId: varchar("club_id"),
	chapterNumber: integer("chapter_number"),
	duration: integer(),
	progress: integer(),
	metadata: text(),
}, (table) => [
	index("analytics_events_book_complete_idx").using("btree", table.bookId.asc().nullsLast().op("text_ops"), table.eventType.asc().nullsLast().op("text_ops"), table.createdAt.asc().nullsLast().op("text_ops")).where(sql`(event_type = 'book_complete'::text)`),
	index("analytics_events_book_id_idx").using("btree", table.bookId.asc().nullsLast().op("text_ops")),
	index("analytics_events_club_id_idx").using("btree", table.clubId.asc().nullsLast().op("text_ops")),
	index("analytics_events_club_reading_idx").using("btree", table.clubId.asc().nullsLast().op("timestamp_ops"), table.eventType.asc().nullsLast().op("timestamp_ops"), table.createdAt.asc().nullsLast().op("timestamp_ops")).where(sql`(club_id IS NOT NULL)`),
	index("analytics_events_created_at_idx").using("btree", table.createdAt.asc().nullsLast().op("timestamp_ops")),
	index("analytics_events_event_type_created_at_idx").using("btree", table.eventType.asc().nullsLast().op("timestamp_ops"), table.createdAt.asc().nullsLast().op("text_ops")),
	index("analytics_events_event_type_idx").using("btree", table.eventType.asc().nullsLast().op("text_ops")),
	index("analytics_events_user_id_idx").using("btree", table.userId.asc().nullsLast().op("text_ops")),
	index("analytics_events_user_reading_idx").using("btree", table.userId.asc().nullsLast().op("text_ops"), table.eventType.asc().nullsLast().op("timestamp_ops"), table.createdAt.asc().nullsLast().op("text_ops")).where(sql`(user_id IS NOT NULL)`),
	foreignKey({
			columns: [table.userId],
			foreignColumns: [users.id],
			name: "analytics_events_user_id_fk"
		}).onDelete("set null"),
	foreignKey({
			columns: [table.bookId],
			foreignColumns: [books.id],
			name: "analytics_events_book_id_fk"
		}).onDelete("set null"),
	foreignKey({
			columns: [table.clubId],
			foreignColumns: [clubs.id],
			name: "analytics_events_club_id_fk"
		}).onDelete("set null"),
]);

export const chatMessages = pgTable("chat_messages", {
	id: varchar().default(gen_random_uuid()).primaryKey().notNull(),
	clubId: varchar("club_id").notNull(),
	channel: varchar({ length: 64 }).default('general').notNull(),
	userId: varchar("user_id").notNull(),
	text: text().notNull(),
	mentions: text(),
	attachments: text(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().notNull(),
	deletedAt: timestamp("deleted_at", { mode: 'string' }),
}, (table) => [
	index("idx_chat_messages_club_channel").using("btree", table.clubId.asc().nullsLast().op("text_ops"), table.channel.asc().nullsLast().op("text_ops")),
	index("idx_chat_messages_created_at").using("btree", table.createdAt.desc().nullsFirst().op("timestamp_ops")),
	foreignKey({
			columns: [table.clubId],
			foreignColumns: [clubs.id],
			name: "chat_messages_club_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.userId],
			foreignColumns: [users.id],
			name: "chat_messages_user_id_fkey"
		}).onDelete("cascade"),
]);
