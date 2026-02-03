import { relations } from "drizzle-orm/relations";
import { users, refreshTokens, books, uploadContexts, bookContent, clubs, clubBooks, clubMembers, clubTags, readingSessions, readingProgress, readingHistory, sessionListeners, readerRatings, userProfiles, adminActions, bookmarks, notes, moderationReports, systemSettings, personalBooks, bookCollections, bookCollectionItems, legalAcknowledgments, settings, clubReadingPlans, clubInvitations, clubReadingPlanProgress, analyticsEvents, chatMessages } from "./schema";

export const usersRelations = relations(users, ({one, many}) => ({
	user: one(users, {
		fields: [users.invitedBy],
		references: [users.id],
		relationName: "users_invitedBy_users_id"
	}),
	users: many(users, {
		relationName: "users_invitedBy_users_id"
	}),
	refreshTokens: many(refreshTokens),
	books: many(books),
	clubs: many(clubs),
	clubMembers: many(clubMembers),
	readingSessions: many(readingSessions),
	readingProgresses: many(readingProgress),
	readingHistories: many(readingHistory),
	sessionListeners: many(sessionListeners),
	readerRatings_readerId: many(readerRatings, {
		relationName: "readerRatings_readerId_users_id"
	}),
	readerRatings_raterId: many(readerRatings, {
		relationName: "readerRatings_raterId_users_id"
	}),
	userProfiles: many(userProfiles),
	adminActions: many(adminActions),
	bookmarks: many(bookmarks),
	notes: many(notes),
	moderationReports_reporterId: many(moderationReports, {
		relationName: "moderationReports_reporterId_users_id"
	}),
	moderationReports_assignedTo: many(moderationReports, {
		relationName: "moderationReports_assignedTo_users_id"
	}),
	systemSettings: many(systemSettings),
	uploadContexts: many(uploadContexts),
	personalBooks: many(personalBooks),
	clubBooks: many(clubBooks),
	legalAcknowledgments: many(legalAcknowledgments),
	settings: many(settings),
	clubInvitations_invitedUserId: many(clubInvitations, {
		relationName: "clubInvitations_invitedUserId_users_id"
	}),
	clubInvitations_invitedBy: many(clubInvitations, {
		relationName: "clubInvitations_invitedBy_users_id"
	}),
	clubReadingPlanProgresses: many(clubReadingPlanProgress),
	analyticsEvents: many(analyticsEvents),
	chatMessages: many(chatMessages),
}));

export const refreshTokensRelations = relations(refreshTokens, ({one}) => ({
	user: one(users, {
		fields: [refreshTokens.userId],
		references: [users.id]
	}),
}));

export const booksRelations = relations(books, ({one, many}) => ({
	user: one(users, {
		fields: [books.uploadedBy],
		references: [users.id]
	}),
	uploadContext: one(uploadContexts, {
		fields: [books.uploadContextId],
		references: [uploadContexts.id]
	}),
	bookContents: many(bookContent),
	readingSessions: many(readingSessions),
	readingHistories: many(readingHistory),
	bookmarks: many(bookmarks),
	notes: many(notes),
	bookCollectionItems: many(bookCollectionItems),
	analyticsEvents: many(analyticsEvents),
}));

export const uploadContextsRelations = relations(uploadContexts, ({one, many}) => ({
	books: many(books),
	user: one(users, {
		fields: [uploadContexts.userId],
		references: [users.id]
	}),
	club: one(clubs, {
		fields: [uploadContexts.clubId],
		references: [clubs.id]
	}),
	bookCollections: many(bookCollections),
	legalAcknowledgments: many(legalAcknowledgments),
}));

export const bookContentRelations = relations(bookContent, ({one}) => ({
	book: one(books, {
		fields: [bookContent.bookId],
		references: [books.id]
	}),
}));

export const clubsRelations = relations(clubs, ({one, many}) => ({
	user: one(users, {
		fields: [clubs.ownerId],
		references: [users.id]
	}),
	clubBook: one(clubBooks, {
		fields: [clubs.bookId],
		references: [clubBooks.id],
		relationName: "clubs_bookId_clubBooks_id"
	}),
	clubMembers: many(clubMembers),
	clubTags: many(clubTags),
	readingSessions: many(readingSessions),
	readingProgresses: many(readingProgress),
	readingHistories: many(readingHistory),
	uploadContexts: many(uploadContexts),
	clubBooks: many(clubBooks, {
		relationName: "clubBooks_clubId_clubs_id"
	}),
	clubInvitations: many(clubInvitations),
	analyticsEvents: many(analyticsEvents),
	chatMessages: many(chatMessages),
}));

export const clubBooksRelations = relations(clubBooks, ({one, many}) => ({
	clubs: many(clubs, {
		relationName: "clubs_bookId_clubBooks_id"
	}),
	club: one(clubs, {
		fields: [clubBooks.clubId],
		references: [clubs.id],
		relationName: "clubBooks_clubId_clubs_id"
	}),
	user: one(users, {
		fields: [clubBooks.uploadedByUserId],
		references: [users.id]
	}),
	clubReadingPlans: many(clubReadingPlans),
}));

export const clubMembersRelations = relations(clubMembers, ({one}) => ({
	club: one(clubs, {
		fields: [clubMembers.clubId],
		references: [clubs.id]
	}),
	user: one(users, {
		fields: [clubMembers.userId],
		references: [users.id]
	}),
}));

export const clubTagsRelations = relations(clubTags, ({one}) => ({
	club: one(clubs, {
		fields: [clubTags.clubId],
		references: [clubs.id]
	}),
}));

export const readingSessionsRelations = relations(readingSessions, ({one, many}) => ({
	club: one(clubs, {
		fields: [readingSessions.clubId],
		references: [clubs.id]
	}),
	user: one(users, {
		fields: [readingSessions.readerId],
		references: [users.id]
	}),
	book: one(books, {
		fields: [readingSessions.bookId],
		references: [books.id]
	}),
	sessionListeners: many(sessionListeners),
	readerRatings: many(readerRatings),
}));

export const readingProgressRelations = relations(readingProgress, ({one}) => ({
	user: one(users, {
		fields: [readingProgress.userId],
		references: [users.id]
	}),
	club: one(clubs, {
		fields: [readingProgress.clubId],
		references: [clubs.id]
	}),
}));

export const readingHistoryRelations = relations(readingHistory, ({one}) => ({
	user: one(users, {
		fields: [readingHistory.userId],
		references: [users.id]
	}),
	book: one(books, {
		fields: [readingHistory.bookId],
		references: [books.id]
	}),
	club: one(clubs, {
		fields: [readingHistory.clubId],
		references: [clubs.id]
	}),
}));

export const sessionListenersRelations = relations(sessionListeners, ({one}) => ({
	readingSession: one(readingSessions, {
		fields: [sessionListeners.sessionId],
		references: [readingSessions.id]
	}),
	user: one(users, {
		fields: [sessionListeners.listenerId],
		references: [users.id]
	}),
}));

export const readerRatingsRelations = relations(readerRatings, ({one}) => ({
	readingSession: one(readingSessions, {
		fields: [readerRatings.sessionId],
		references: [readingSessions.id]
	}),
	user_readerId: one(users, {
		fields: [readerRatings.readerId],
		references: [users.id],
		relationName: "readerRatings_readerId_users_id"
	}),
	user_raterId: one(users, {
		fields: [readerRatings.raterId],
		references: [users.id],
		relationName: "readerRatings_raterId_users_id"
	}),
}));

export const userProfilesRelations = relations(userProfiles, ({one}) => ({
	user: one(users, {
		fields: [userProfiles.userId],
		references: [users.id]
	}),
}));

export const adminActionsRelations = relations(adminActions, ({one}) => ({
	user: one(users, {
		fields: [adminActions.adminId],
		references: [users.id]
	}),
}));

export const bookmarksRelations = relations(bookmarks, ({one}) => ({
	user: one(users, {
		fields: [bookmarks.userId],
		references: [users.id]
	}),
	book: one(books, {
		fields: [bookmarks.bookId],
		references: [books.id]
	}),
}));

export const notesRelations = relations(notes, ({one}) => ({
	user: one(users, {
		fields: [notes.userId],
		references: [users.id]
	}),
	book: one(books, {
		fields: [notes.bookId],
		references: [books.id]
	}),
}));

export const moderationReportsRelations = relations(moderationReports, ({one}) => ({
	user_reporterId: one(users, {
		fields: [moderationReports.reporterId],
		references: [users.id],
		relationName: "moderationReports_reporterId_users_id"
	}),
	user_assignedTo: one(users, {
		fields: [moderationReports.assignedTo],
		references: [users.id],
		relationName: "moderationReports_assignedTo_users_id"
	}),
}));

export const systemSettingsRelations = relations(systemSettings, ({one}) => ({
	user: one(users, {
		fields: [systemSettings.updatedBy],
		references: [users.id]
	}),
}));

export const personalBooksRelations = relations(personalBooks, ({one}) => ({
	user: one(users, {
		fields: [personalBooks.userId],
		references: [users.id]
	}),
}));

export const bookCollectionsRelations = relations(bookCollections, ({one, many}) => ({
	uploadContext: one(uploadContexts, {
		fields: [bookCollections.uploadContextId],
		references: [uploadContexts.id]
	}),
	bookCollectionItems: many(bookCollectionItems),
}));

export const bookCollectionItemsRelations = relations(bookCollectionItems, ({one}) => ({
	bookCollection: one(bookCollections, {
		fields: [bookCollectionItems.collectionId],
		references: [bookCollections.id]
	}),
	book: one(books, {
		fields: [bookCollectionItems.bookId],
		references: [books.id]
	}),
}));

export const legalAcknowledgmentsRelations = relations(legalAcknowledgments, ({one}) => ({
	user: one(users, {
		fields: [legalAcknowledgments.userId],
		references: [users.id]
	}),
	uploadContext: one(uploadContexts, {
		fields: [legalAcknowledgments.uploadContextId],
		references: [uploadContexts.id]
	}),
}));

export const settingsRelations = relations(settings, ({one}) => ({
	user: one(users, {
		fields: [settings.updatedBy],
		references: [users.id]
	}),
}));

export const clubReadingPlansRelations = relations(clubReadingPlans, ({one, many}) => ({
	clubBook: one(clubBooks, {
		fields: [clubReadingPlans.clubBookId],
		references: [clubBooks.id]
	}),
	clubReadingPlanProgresses: many(clubReadingPlanProgress),
}));

export const clubInvitationsRelations = relations(clubInvitations, ({one}) => ({
	club: one(clubs, {
		fields: [clubInvitations.clubId],
		references: [clubs.id]
	}),
	user_invitedUserId: one(users, {
		fields: [clubInvitations.invitedUserId],
		references: [users.id],
		relationName: "clubInvitations_invitedUserId_users_id"
	}),
	user_invitedBy: one(users, {
		fields: [clubInvitations.invitedBy],
		references: [users.id],
		relationName: "clubInvitations_invitedBy_users_id"
	}),
}));

export const clubReadingPlanProgressRelations = relations(clubReadingPlanProgress, ({one}) => ({
	clubReadingPlan: one(clubReadingPlans, {
		fields: [clubReadingPlanProgress.planId],
		references: [clubReadingPlans.id]
	}),
	user: one(users, {
		fields: [clubReadingPlanProgress.userId],
		references: [users.id]
	}),
}));

export const analyticsEventsRelations = relations(analyticsEvents, ({one}) => ({
	user: one(users, {
		fields: [analyticsEvents.userId],
		references: [users.id]
	}),
	book: one(books, {
		fields: [analyticsEvents.bookId],
		references: [books.id]
	}),
	club: one(clubs, {
		fields: [analyticsEvents.clubId],
		references: [clubs.id]
	}),
}));

export const chatMessagesRelations = relations(chatMessages, ({one}) => ({
	club: one(clubs, {
		fields: [chatMessages.clubId],
		references: [clubs.id]
	}),
	user: one(users, {
		fields: [chatMessages.userId],
		references: [users.id]
	}),
}));