import type { BookType, GenreSource, InvitationStatus, ReadingSessionWithDetails } from '../../shared/schema.js';
import type { AnalyticsRepository } from './AnalyticsRepository.js';
import type { BookRepository } from './BookRepository.js';
import type { ClubBooksRepository } from './ClubBooksRepository.js';
import type { ClubDiscussionsRepository } from './ClubDiscussionsRepository.js';
import type { ClubRepository } from './ClubRepository.js';
import type { GenresRepository } from './GenresRepository.js';
import type { ModerationRepository } from './ModerationRepository.js';
import type { PersonalBooksRepository } from './PersonalBooksRepository.js';
import type { ReadingRepository } from './ReadingRepository.js';
import type { SystemRepository } from './SystemRepository.js';
import type { UserRepository } from './UserRepository.js';
import { RepositoryContainer, type IStorage, type LegacyReadingSessionStatus } from './container.js';

/**
 * Адаптер для обратной совместимости с существующим IStorage интерфейсом
 * Обеспечивает плавный переход от монолитной архитектуры к модульной
 */
export class StorageAdapter implements Partial<IStorage> {
  private readonly repos: RepositoryContainer;
  private readonly readingSessionRoomIds = new Map<string, string>();
  private readonly readingSessionStatusOverrides = new Map<string, LegacyReadingSessionStatus>();

  constructor() {
    this.repos = new RepositoryContainer();
  }

  private getLegacySessionStatus(session: ReadingSessionWithDetails): LegacyReadingSessionStatus {
    const override = this.readingSessionStatusOverrides.get(session.id);
    if (override) {
      return override;
    }
    if (session.isLive) {
      return 'active';
    }
    if (session.isActive === false) {
      return 'completed';
    }
    return 'paused';
  }

  private toLegacySession(session: ReadingSessionWithDetails) {
    return {
      ...session,
      userId: session.readerId,
      chapter: session.currentChapter,
      position: session.currentPosition,
      status: this.getLegacySessionStatus(session),
      listenerCount: session.listenerCount ?? 0,
      roomId: this.readingSessionRoomIds.get(session.id),
    };
  }

  readonly readingSessions = {
    createSession: async (params: {
      clubId: string;
      bookId: string;
      userId: string;
      chapter?: number;
      status?: LegacyReadingSessionStatus;
      position?: string;
      title?: string;
    }) => {
      const { clubId, bookId, userId, chapter, status, position, title } = params;

      const book = await this.repos.books.getBook(bookId);
      const sessionTitle = title ?? book?.title ?? 'Reading Session';

      const created = await this.repos.reading.createReadingSession({
        clubId,
        bookId,
        title: sessionTitle,
        currentChapter: chapter ?? 1,
        currentPosition: position ?? null,
        readerId: userId,
      });

      if (status) {
        await this.repos.reading.updateSessionStatus(created.id, status);
        if (status === 'cancelled') {
          this.readingSessionStatusOverrides.set(created.id, status);
        }
      }

      const session = await this.repos.reading.getReadingSession(created.id);
      return session ? this.toLegacySession(session) : undefined;
    },

    getSession: async (sessionId: string) => {
      const session = await this.repos.reading.getReadingSession(sessionId);
      return session ? this.toLegacySession(session) : undefined;
    },

    getClubSessions: async (clubId: string) => {
      const sessions = await this.repos.reading.getSessionsByClub(clubId);
      return sessions.map(session => this.toLegacySession(session));
    },

    getClubSessionsByStatus: async (clubId: string, status: LegacyReadingSessionStatus) => {
      const sessions = await this.repos.reading.getSessionsByClub(clubId);
      return sessions
        .map(session => this.toLegacySession(session))
        .filter(session => session.status === status);
    },

    getBookSessions: async (bookId: string) => {
      const sessions = await this.repos.reading.getSessionsByBook(bookId);
      return sessions.map(session => this.toLegacySession(session));
    },

    getUserActiveSession: async (userId: string) => {
      const session = await this.repos.reading.getActiveSessionForReader(userId);
      return session ? this.toLegacySession(session) : undefined;
    },

    updateSessionStatus: async (sessionId: string, status: LegacyReadingSessionStatus) => {
      await this.repos.reading.updateSessionStatus(sessionId, status);
      if (status === 'cancelled') {
        this.readingSessionStatusOverrides.set(sessionId, status);
      } else {
        this.readingSessionStatusOverrides.delete(sessionId);
      }
      if (status === 'cancelled' || status === 'completed') {
        this.readingSessionRoomIds.delete(sessionId);
      }
      const session = await this.repos.reading.getReadingSession(sessionId);
      return session ? this.toLegacySession(session) : undefined;
    },

    updateSessionPosition: async (sessionId: string, position?: string, chapter?: number) => {
      const current = await this.repos.reading.getReadingSession(sessionId);
      if (!current) {
        return undefined;
      }

      const nextChapter = chapter ?? current.currentChapter;
      const nextPosition = position ?? current.currentPosition ?? '';

      await this.repos.reading.updateSessionPosition(sessionId, nextChapter, nextPosition);
      const updated = await this.repos.reading.getReadingSession(sessionId);
      return updated ? this.toLegacySession(updated) : undefined;
    },

    updateListenerCount: async (sessionId: string, count: number) => {
      const status = await this.repos.clubReadingStatus.getReadingStatusBySessionId(sessionId);
      if (status) {
        await this.repos.clubReadingStatus.updateListenerCount(status.id, count);
      }
      const session = await this.repos.reading.getReadingSession(sessionId);
      return session ? this.toLegacySession(session) : undefined;
    },

    addSessionListener: async (sessionId: string, userId: string) => {
      return this.repos.reading.joinSession(sessionId, userId);
    },

    removeSessionListener: async (sessionId: string, userId: string) => {
      return this.repos.reading.leaveSession(sessionId, userId);
    },

    getSessionListenerCount: async (sessionId: string) => {
      return this.repos.reading.getActiveListenersCount(sessionId);
    },

    getSessionListeners: async (sessionId: string) => {
      return this.repos.reading.getSessionListeners(sessionId);
    },

    endSession: async (sessionId: string) => {
      await this.repos.reading.endSession(sessionId);
      this.readingSessionStatusOverrides.delete(sessionId);
      this.readingSessionRoomIds.delete(sessionId);
    },

    updateSessionRoomId: async (sessionId: string, roomId: string) => {
      if (!roomId) {
        this.readingSessionRoomIds.delete(sessionId);
        return;
      }
      this.readingSessionRoomIds.set(sessionId, roomId);
    },
  };

  // =================================================================
  // User Domain Delegation - делегирование пользовательского домена
  // =================================================================
  
  async getUser(id: string) {
    return this.repos.users.getUser(id);
  }

  async getUserByUsername(username: string) {
    return this.repos.users.getUserByUsername(username);
  }

  async getUserByEmail(email: string) {
    return this.repos.users.getUserByEmail(email);
  }

  async createUser(user: Parameters<UserRepository['createUser']>[0]) {
    return this.repos.users.createUser(user);
  }

  async updateUserRole(username: string, role: Parameters<UserRepository['updateUserRole']>[1]) {
    return this.repos.users.updateUserRole(username, role);
  }

  async updateUserStatus(username: string, status: Parameters<UserRepository['updateUserStatus']>[1]) {
    return this.repos.users.updateUserStatus(username, status);
  }

  async updateUserPassword(userId: string, passwordHash: string) {
    return this.repos.users.updateUserPassword(userId, passwordHash);
  }

  async updateUserUsername(userId: string, username: string) {
    return this.repos.users.updateUserUsername(userId, username);
  }

  async updateUserEmail(userId: string, email: string, confirmationToken: string) {
    return this.repos.users.updateUserEmail(userId, email, confirmationToken);
  }

  async updateUserLastActivity(userId: string) {
    return this.repos.users.updateUserLastActivity(userId);
  }

  async getUserByConfirmationToken(token: string) {
    return this.repos.users.getUserByConfirmationToken(token);
  }

  async updateUserEmailConfirmation(userId: string, confirmed: boolean) {
    return this.repos.users.updateUserEmailConfirmation(userId, confirmed);
  }

  async updateUserConfirmationToken(userId: string, token: string | null) {
    return this.repos.users.updateUserConfirmationToken(userId, token);
  }

  async createPasswordResetToken(params: {
    userId: string;
    tokenHash: string;
    expiresAt: Date;
    requestedByAdminId?: string;
    requestedFromIp?: string;
  }) {
    return this.repos.users.createPasswordResetToken(params);
  }

  async getPasswordResetTokenByHash(tokenHash: string) {
    return this.repos.users.getPasswordResetTokenByHash(tokenHash);
  }

  async markPasswordResetTokenUsed(tokenId: string) {
    return this.repos.users.markPasswordResetTokenUsed(tokenId);
  }

  async invalidatePasswordResetTokensForUser(userId: string) {
    return this.repos.users.invalidatePasswordResetTokensForUser(userId);
  }

  async cleanExpiredPasswordResetTokens() {
    return this.repos.users.cleanExpiredPasswordResetTokens();
  }

  async createRefreshToken(userId: string, token: string, expiresAt: Date) {
    return this.repos.users.createRefreshToken(userId, token, expiresAt);
  }

  async getRefreshToken(token: string) {
    return this.repos.users.getRefreshToken(token);
  }

  async revokeRefreshToken(token: string) {
    return this.repos.users.revokeRefreshToken(token);
  }

  async revokeAllUserRefreshTokens(userId: string) {
    return this.repos.users.revokeAllUserRefreshTokens(userId);
  }

  async cleanExpiredRefreshTokens() {
    return this.repos.users.cleanExpiredRefreshTokens();
  }

  // =================================================================
  // Book Domain Delegation - делегирование книжного домена
  // =================================================================

  async getBooks() {
    return this.repos.books.getBooks();
  }

  async getBook(id: string) {
    return this.repos.books.getBook(id);
  }

  async getBookByContentHash(contentHash: string) {
    return this.repos.books.getBookByContentHash(contentHash);
  }

  async getBooksByUser(userId: string) {
    return this.repos.books.getBooksByUser(userId);
  }

  async searchBooks(query: string) {
    return this.repos.books.searchBooks(query);
  }

  async createBook(book: Parameters<BookRepository['createBook']>[0]) {
    return this.repos.books.createBook(book);
  }

  async updateBook(id: string, updates: Parameters<BookRepository['updateBook']>[1]) {
    const result = await this.repos.books.updateBook(id, updates);
    if (!result) {
      throw new Error(`Book with id ${id} not found`);
    }
    return result;
  }

  async deleteBook(id: string) {
    return this.repos.books.deleteBook(id);
  }

  async getBookContent(bookId: string, chapterNumber?: number) {
    return this.repos.books.getBookContent(bookId, chapterNumber);
  }

  async getBookChapter(bookId: string, chapterNumber: number) {
    return this.repos.books.getBookChapter(bookId, chapterNumber);
  }

  async createBookContent(content: Parameters<BookRepository['createBookContent']>[0]) {
    return this.repos.books.createBookContent(content);
  }

  async updateBookContent(id: string, updates: Parameters<BookRepository['updateBookContent']>[1]) {
    const result = await this.repos.books.updateBookContent(id, updates);
    if (!result) {
      throw new Error(`BookContent with id ${id} not found`);
    }
    return result;
  }

  async deleteBookContent(id: string) {
    return this.repos.books.deleteBookContent(id);
  }

  // =================================================================
  // Club Domain Delegation - делегирование клубного домена
  // =================================================================

  async getClubs() {
    return this.repos.clubs.getClubs();
  }

  async getAllClubs() {
    return this.repos.clubs.getClubs(); // Alias для совместимости
  }

  async getPublicCatalogClubs(limit?: number, offset?: number, searchQuery?: string, type?: string) {
    return this.repos.clubs.getPublicCatalogClubs(limit, offset, searchQuery, type);
  }

  async getClub(id: string) {
    return this.repos.clubs.getClub(id);
  }

  async getClubsByUser(userId: string) {
    return this.repos.clubs.getClubsByUser(userId);
  }

  async getClubsOwnedByUser(userId: string) {
    return this.repos.clubs.getClubsOwnedByUser(userId);
  }

  async createClub(club: Parameters<ClubRepository['createClub']>[0]) {
    return this.repos.clubs.createClub(club);
  }

  async getClubByTitle(title: string) {
    return this.repos.clubs.getClubByTitle(title);
  }

  async getClubsForModeration() {
    return this.repos.clubs.getClubsForModeration();
  }

  async updateClub(id: string, updates: Parameters<ClubRepository['updateClub']>[1]) {
    return this.repos.clubs.updateClub(id, updates);
  }

  async updateClubPrivacy(clubId: string, isPrivate: boolean) {
    return this.repos.clubs.updateClubPrivacy(clubId, isPrivate);
  }

  async deleteClub(id: string) {
    return this.repos.clubs.deleteClub(id);
  }

  async approveClub(clubId: string) {
    return this.repos.clubs.approveClub(clubId);
  }

  async rejectClub(clubId: string, reason?: string) {
    return this.repos.clubs.rejectClub(clubId, reason);
  }

  async updateClubPopularityScore(clubId: string, score: number) {
    return this.repos.clubs.updateClubPopularityScore(clubId, score);
  }

  async joinClub(clubId: string, userId: string, role?: Parameters<ClubRepository['joinClub']>[2]) {
    return this.repos.clubs.joinClub(clubId, userId, role);
  }

  async leaveClub(clubId: string, userId: string) {
    return this.repos.clubs.leaveClub(clubId, userId);
  }

  async getClubMembers(clubId: string) {
    return this.repos.clubs.getClubMembers(clubId);
  }

  async getClubMembersWithRoles(clubId: string) {
    return this.repos.clubs.getClubMembersWithRoles(clubId);
  }

  async getUserClubMembership(clubId: string, userId: string) {
    return this.repos.clubs.getUserClubMembership(clubId, userId);
  }

  async getActiveClubMembersCount(clubId: string, excludeUserId?: string) {
    return this.repos.clubs.getActiveClubMembersCount(clubId, excludeUserId);
  }

  async updateMemberRole(
    clubId: string,
    userId: string,
    role: Parameters<ClubRepository['updateMemberRole']>[2]
  ) {
    return this.repos.clubs.updateMemberRole(clubId, userId, role);
  }

  async removeMember(clubId: string, userId: string) {
    return this.repos.clubs.removeMember(clubId, userId);
  }

  // Club Discussions methods
  async getClubDiscussions(clubId: string) {
    return this.repos.clubDiscussions.getClubDiscussions(clubId);
  }

  async createClubDiscussion(discussion: Parameters<ClubDiscussionsRepository['createClubDiscussion']>[0]) {
    return this.repos.clubDiscussions.createClubDiscussion(discussion);
  }

  async deleteClubDiscussion(discussionId: string) {
    return this.repos.clubDiscussions.deleteClubDiscussion(discussionId);
  }

  async createClubInvitation(invitation: Parameters<ClubRepository['createClubInvitation']>[0]) {
    return this.repos.clubs.createClubInvitation(invitation);
  }

  async getClubInvitation(inviteToken: string) {
    return this.repos.clubs.getClubInvitation(inviteToken);
  }

  async getClubInvitations(clubId: string) {
    return this.repos.clubs.getClubInvitations(clubId);
  }

  async updateInvitationStatus(inviteToken: string, status: InvitationStatus, acceptedAt?: Date) {
    return this.repos.clubs.updateInvitationStatus(inviteToken, status, acceptedAt);
  }

  async deleteClubInvitation(id: string) {
    return this.repos.clubs.deleteClubInvitation(id);
  }

  async deleteClubInvitationsByEmail(clubId: string, email: string) {
    return this.repos.clubs.deleteClubInvitationsByEmail(clubId, email);
  }

  // =================================================================
  // User Extended Methods - расширенное управление пользователями
  // =================================================================

  async deleteUser(userId: string) {
    return this.repos.users.deleteUser(userId);
  }

  async restoreUser(userId: string) {
    return this.repos.users.restoreUser(userId);
  }

  async permanentDeleteUser(userId: string) {
    return this.repos.users.permanentDeleteUser(userId);
  }

  async getAllUsers(includeDeleted?: boolean) {
    return this.repos.users.getAllUsers(includeDeleted);
  }

  async searchUsers(query: string, limit?: number) {
    return this.repos.users.searchUsers(query, limit);
  }

  async getDeletedUsers() {
    return this.repos.users.getDeletedUsers();
  }

  async getPendingUsers() {
    return this.repos.users.getPendingUsers();
  }

  async getUsersByRole(role: Parameters<UserRepository['getUsersByRole']>[0]) {
    return this.repos.users.getUsersByRole(role);
  }

  // =================================================================
  // Personal Books Domain - личные книги пользователей
  // =================================================================

  async createPersonalBook(book: Parameters<PersonalBooksRepository['createPersonalBook']>[0]) {
    return this.repos.personalBooks.createPersonalBook(book);
  }

  async getPersonalBook(id: string) {
    return this.repos.personalBooks.getPersonalBook(id);
  }

  async getPersonalBooksByUser(userId: string) {
    return this.repos.personalBooks.getPersonalBooksByUser(userId);
  }

  async getAllPersonalBooks() {
    return this.repos.personalBooks.getAllPersonalBooks();
  }

  async updatePersonalBook(id: string, updates: Parameters<PersonalBooksRepository['updatePersonalBook']>[1]) {
    return this.repos.personalBooks.updatePersonalBook(id, updates);
  }

  async deletePersonalBook(id: string) {
    return this.repos.personalBooks.deletePersonalBook(id);
  }

  async restorePersonalBook(id: string) {
    return this.repos.personalBooks.restorePersonalBook(id);
  }

  async permanentDeletePersonalBook(id: string) {
    return this.repos.personalBooks.permanentDeletePersonalBook(id);
  }

  // =================================================================
  // Club Books Domain - книги клубов
  // =================================================================

  async createClubBook(book: Parameters<ClubBooksRepository['createClubBook']>[0]) {
    return this.repos.clubBooks.createClubBook(book);
  }

  async getActiveGenres(search?: string) {
    return this.repos.genres.getActiveGenres(search);
  }

  async getGenresAdmin(search?: string) {
    return this.repos.genres.getGenresAdmin(search);
  }

  async getGenreByCode(code: string) {
    return this.repos.genres.getGenreByCode(code);
  }

  async createGenre(payload: Parameters<GenresRepository['createGenre']>[0]) {
    return this.repos.genres.createGenre(payload);
  }

  async updateGenre(code: string, payload: Parameters<GenresRepository['updateGenre']>[1]) {
    return this.repos.genres.updateGenre(code, payload);
  }

  async deleteGenre(code: string) {
    return this.repos.genres.deleteGenre(code);
  }

  async getGenresByCodes(codes: string[]) {
    return this.repos.genres.getGenresByCodes(codes);
  }

  async getBookGenres(bookType: BookType, bookId: string) {
    return this.repos.genres.getBookGenres(bookType, bookId);
  }

  async replaceBookGenres(
    bookType: BookType,
    bookId: string,
    items: Array<{ genreId: string; source: GenreSource; isPrimary: boolean; confidence?: number | null }>,
  ) {
    return this.repos.genres.replaceBookGenres(bookType, bookId, items);
  }

  async getClubBook(id: string) {
    return this.repos.clubBooks.getClubBook(id);
  }

  async getClubBooksByClub(clubId: string) {
    return this.repos.clubBooks.getClubBooksByClub(clubId);
  }

  async getAllClubBooks() {
    return this.repos.clubBooks.getAllClubBooks();
  }

  async updateClubBook(id: string, updates: Parameters<ClubBooksRepository['updateClubBook']>[1]) {
    return this.repos.clubBooks.updateClubBook(id, updates);
  }

  async deleteClubBook(id: string) {
    return this.repos.clubBooks.deleteClubBook(id);
  }

  async restoreClubBook(id: string) {
    return this.repos.clubBooks.restoreClubBook(id);
  }

  async permanentDeleteClubBook(id: string) {
    return this.repos.clubBooks.permanentDeleteClubBook(id);
  }

  // =================================================================
  // Reading Domain - чтение и прогресс
  // =================================================================

  // Reading Sessions
  async createReadingSession(session: Parameters<ReadingRepository['createReadingSession']>[0]) {
    return this.repos.reading.createReadingSession(session);
  }

  async getReadingSession(id: string) {
    return this.repos.reading.getReadingSession(id);
  }

  async getActiveSessionsInClub(clubId: string) {
    return this.repos.reading.getActiveSessionsInClub(clubId);
  }

  async getSessionsByReader(readerId: string) {
    return this.repos.reading.getSessionsByReader(readerId);
  }

  async updateSessionPosition(sessionId: string, currentChapter: number, currentPosition: string) {
    return this.repos.reading.updateSessionPosition(sessionId, currentChapter, currentPosition);
  }

  async startSession(sessionId: string) {
    return this.repos.reading.startSession(sessionId);
  }

  async endSession(sessionId: string) {
    return this.repos.reading.endSession(sessionId);
  }

  // Session Listeners
  async joinSession(sessionId: string, listenerId: string) {
    return this.repos.reading.joinSession(sessionId, listenerId);
  }

  async leaveSession(sessionId: string, listenerId: string) {
    return this.repos.reading.leaveSession(sessionId, listenerId);
  }

  async getSessionListeners(sessionId: string) {
    return this.repos.reading.getSessionListeners(sessionId);
  }

  async getActiveListenersCount(sessionId: string) {
    return this.repos.reading.getActiveListenersCount(sessionId);
  }

  // Reading Progress
  async updateReadingProgress(progress: Parameters<ReadingRepository['updateReadingProgress']>[0]) {
    return this.repos.reading.updateReadingProgress(progress);
  }

  async getUserReadingProgress(userId: string, bookId: string) {
    return this.repos.reading.getUserReadingProgress(userId, bookId);
  }

  async getClubReadingProgress(clubId: string) {
    return this.repos.reading.getClubReadingProgress(clubId);
  }

  // Reading History
  async addCompletedToHistory(userId: string, bookId: string, bookTitle: string, bookAuthor: string, bookCoverUrl?: string) {
    return this.repos.reading.addCompletedToHistory(userId, bookId, bookTitle, bookAuthor, bookCoverUrl);
  }

  async getReadingHistory(userId: string) {
    return this.repos.reading.getReadingHistory(userId);
  }

  async clearReadingHistory(userId: string) {
    return this.repos.reading.clearReadingHistory(userId);
  }

  // Reader Ratings
  async rateReader(rating: Parameters<ReadingRepository['rateReader']>[0]) {
    return this.repos.reading.rateReader(rating);
  }

  async getReaderRatings(readerId: string) {
    return this.repos.reading.getReaderRatings(readerId);
  }

  async getReaderAverageRating(readerId: string) {
    return this.repos.reading.getReaderAverageRating(readerId);
  }

  // User Profiles
  async createOrUpdateUserProfile(
    userId: string,
    profile: Parameters<ReadingRepository['createOrUpdateUserProfile']>[1]
  ) {
    return this.repos.reading.createOrUpdateUserProfile(userId, profile);
  }

  async getUserProfile(userId: string) {
    return this.repos.reading.getUserProfile(userId);
  }

  async deleteUserProfile(userId: string) {
    return this.repos.reading.deleteUserProfile(userId);
  }

  async getTopReaders(limit?: number) {
    return this.repos.reading.getTopReaders(limit);
  }

  // =================================================================
  // Moderation Domain - модерация
  // =================================================================

  async logAdminAction(action: Parameters<ModerationRepository['logAdminAction']>[0]) {
    return this.repos.moderation.logAdminAction(action);
  }

  async getAdminActions(adminId?: string, limit?: number) {
    return this.repos.moderation.getAdminActions(adminId, limit);
  }

  async updateBookStatus(
    bookId: string,
    status: Parameters<ModerationRepository['updateBookStatus']>[1],
    adminId: string
  ) {
    return this.repos.moderation.updateBookStatus(bookId, status, adminId);
  }

  async getModerationReports(filters?: Parameters<ModerationRepository['getModerationReports']>[0]) {
    return this.repos.moderation.getModerationReports(filters);
  }

  async getModerationReportsPage(params: Parameters<ModerationRepository['getModerationReportsPage']>[0]) {
    return this.repos.moderation.getModerationReportsPage(params);
  }

  async updateModerationReport(
    reportId: string,
    updates: Parameters<ModerationRepository['updateModerationReport']>[1]
  ) {
    return this.repos.moderation.updateModerationReport(reportId, updates);
  }

  async createModerationReport(report: Parameters<ModerationRepository['createModerationReport']>[0]) {
    return this.repos.moderation.createModerationReport(report);
  }

  // =================================================================
  // Analytics Domain - аналитика
  // =================================================================

  async logBookAccess(log: Parameters<AnalyticsRepository['logBookAccess']>[0]) {
    return this.repos.analytics.logBookAccess(log);
  }

  async getBookAccessLogs(bookId: string) {
    return this.repos.analytics.getBookAccessLogs(bookId);
  }

  async getUserAccessLogs(userId: string) {
    return this.repos.analytics.getUserAccessLogs(userId);
  }

  // =================================================================
  // System Settings Domain - системные настройки
  // =================================================================

  async getSystemSettings(category?: string) {
    return this.repos.system.getSystemSettings(category);
  }

  async getSystemSetting(key: string) {
    return this.repos.system.getSystemSetting(key);
  }

  async updateSystemSetting(
    key: string,
    value: Parameters<SystemRepository['updateSystemSetting']>[1],
    updatedBy: string
  ) {
    return this.repos.system.updateSystemSetting(key, value, updatedBy);
  }

  async getSetting(key: string) {
    return this.repos.system.getSetting(key);
  }

  async getSettingsByCategory(category: string) {
    return this.repos.system.getSettingsByCategory(category);
  }

  async setSetting(setting: Parameters<SystemRepository['setSetting']>[0]) {
    return this.repos.system.setSetting(setting);
  }

  async deleteSetting(key: string) {
    return this.repos.system.deleteSetting(key);
  }

  // =================================================================
  // Admin Action Logs Domain - логи административных действий
  // =================================================================

  async getAdminActionLogs(filters: Parameters<SystemRepository['getAdminActionLogs']>[0]) {
    return this.repos.system.getAdminActionLogs(filters);
  }

  async getAdminActionLogsCount(filters: Parameters<SystemRepository['getAdminActionLogsCount']>[0]) {
    return this.repos.system.getAdminActionLogsCount(filters);
  }

  async getAdminActionStats(days: number) {
    return this.repos.system.getAdminActionStats(days);
  }
}
