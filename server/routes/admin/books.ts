import express from 'express';
import { and, desc, eq, sql } from 'drizzle-orm';
import type { SQL } from 'drizzle-orm';
import { jwtAuth, requireAdmin } from '../../jwt-middleware.js';
import { storage } from '../../repositories/index.js';
import { db } from '../../db.js';
import { emailService } from '../../services/email-service.js';
import { books, clubBooks, personalBooks, users } from '../../../shared/schema.js';
import type { AdminActionTargetType, AdminActionType } from '../../../shared/schema.js';
import { createAdminBookGenresRouter } from './book-genres.js';
import { buildClubBookDownloadPayload, buildPersonalBookDownloadPayload, buildRegularBookDownloadPayload } from './book-download.js';

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

interface AdminBooksRouterDeps {
  requireFullAdmin: FullAdminMiddleware;
  logAction: LogAction;
}

type AdminBookSource = 'books' | 'personal_books' | 'club_books';
type AdminBookStatus = 'active' | 'blocked' | 'pending';

const BOOK_BLOCK_REASON_MAX_LENGTH = 1000;

interface DownloadPayload {
  fileBuffer: Buffer;
  fileName: string;
  mimeType: string;
}

function isAdminBookSource(source: unknown): source is AdminBookSource {
  return source === 'books' || source === 'personal_books' || source === 'club_books';
}

function isAdminBookStatus(status: unknown): status is AdminBookStatus {
  return status === 'active' || status === 'blocked' || status === 'pending';
}

function buildAttachmentHeader(fileName: string): string {
  const fallback = fileName.replaceAll(/[^\x20-\x7E]/g, '_').replaceAll('"', '');
  const utf8FileName = encodeURIComponent(fileName)
    .replaceAll(/['()]/g, (char) => `%${char.codePointAt(0)!.toString(16).toUpperCase()}`)
    .replaceAll('*', '%2A');

  return `attachment; filename="${fallback || 'book.bin'}"; filename*=UTF-8''${utf8FileName}`;
}

function getDisplayBookStatusForRegularBook(status: string): AdminBookStatus {
  return status === 'active' || status === 'blocked' ? status : 'pending';
}

function normalizeReason(reasonRaw: unknown): string {
  return typeof reasonRaw === 'string' ? reasonRaw.trim() : '';
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

export function createAdminBooksRouter(deps: AdminBooksRouterDeps) {
  const router = express.Router();
  const { requireFullAdmin, logAction } = deps;

// ==== BOOK MANAGEMENT ====

// Helper functions for book management
type BookWithSource = 
  | ({ source: 'books' } & typeof books.$inferSelect)
  | ({ source: 'personal_books' } & typeof personalBooks.$inferSelect)
  | ({ source: 'club_books' } & typeof clubBooks.$inferSelect);

function _filterBooksByStatus(books: BookWithSource[], status: string): BookWithSource[] {
  return books.filter(book => {
    if (book.source === 'personal_books' || book.source === 'club_books') {
      if (status === 'active') return !('isDeleted' in book) || !book.isDeleted;
      if (status === 'blocked') return 'isDeleted' in book && book.isDeleted;
      return false;
    }
    return book.source === 'books' && 'status' in book && book.status === status;
  });
}

// Специализированные форматеры для каждого типа книг (Single Responsibility)
function _formatSystemBookForAdmin(book: { source: 'books' } & typeof books.$inferSelect, usersMap: Map<string, string>) {
  // Explicit status mapping for clarity
  let bookStatus: string;
  if (book.status === 'active') {
    bookStatus = 'active';
  } else if (book.status === 'blocked') {
    bookStatus = 'blocked';
  } else {
    bookStatus = 'pending';
  }
  
  return {
    uploadedBy: book.uploadedBy ? usersMap.get(book.uploadedBy) || 'Unknown' : 'System',
    uploadDate: book.uploadedAt?.toISOString() || book.createdAt.toISOString(),
    fileSize: book.fileSize || 0,
    filePath: book.contentPath || '',
    bookStatus,
    isbn: book.isbn || null,
    downloadCount: book.downloadCount || 0
  };
}

function _formatPersonalBookForAdmin(book: { source: 'personal_books' } & typeof personalBooks.$inferSelect, usersMap: Map<string, string>) {
  return {
    uploadedBy: book.userId ? usersMap.get(book.userId) || 'Unknown' : 'System',
    uploadDate: book.uploadedAt.toISOString(),
    fileSize: book.fileSizeBytes || 0,
    filePath: book.storagePath || '',
    bookStatus: book.isDeleted ? 'blocked' : 'active',
    isbn: null,
    downloadCount: 0
  };
}

function _formatClubBookForAdmin(book: { source: 'club_books' } & typeof clubBooks.$inferSelect, usersMap: Map<string, string>) {
  return {
    uploadedBy: book.uploadedByUserId ? usersMap.get(book.uploadedByUserId) || 'Unknown' : 'System',
    uploadDate: book.uploadedAt.toISOString(),
    fileSize: book.fileSizeBytes || 0,
    filePath: book.storagePath || '',
    bookStatus: book.isDeleted ? 'blocked' : 'active',
    isbn: null,
    downloadCount: 0
  };
}

// Вспомогательные функции для GET /books - снижение когнитивной сложности
interface BookFilters {
  search: string;
  status?: string;
  genre?: string;
}

interface BookConditions {
  booksWhere?: SQL<unknown>;
  personalWhere?: SQL<unknown>;
  clubWhere?: SQL<unknown>;
}

interface BookFilterPatterns {
  searchPattern: string | null;
  status?: string;
  genrePattern: string | null;
}

type StatusConditionMap = Record<AdminBookStatus, SQL<unknown>>;

function sourceWhere(conditions: SQL<unknown>[]): SQL<unknown> | undefined {
  if (conditions.length === 0) return undefined;
  if (conditions.length === 1) return conditions[0];
  return and(...conditions);
}

function compactConditions(conditions: Array<SQL<unknown> | undefined>): SQL<unknown>[] {
  return conditions.filter((condition): condition is SQL<unknown> => Boolean(condition));
}

function statusCondition(status: string | undefined, conditions: StatusConditionMap): SQL<unknown> | undefined {
  if (isAdminBookStatus(status)) {
    return conditions[status];
  }

  return undefined;
}

function buildBookFilterPatterns(filters: BookFilters): BookFilterPatterns {
  return {
    searchPattern: filters.search ? `%${filters.search}%` : null,
    status: filters.status,
    genrePattern: filters.genre ? `%${filters.genre}%` : null,
  };
}

function buildSystemBookConditions(filters: BookFilterPatterns): SQL<unknown>[] {
  const { searchPattern, status, genrePattern } = filters;

  return compactConditions([
    searchPattern
      ? sql`(LOWER(${books.title}) LIKE ${searchPattern} OR LOWER(${books.author}) LIKE ${searchPattern})`
      : undefined,
    statusCondition(status, {
      active: eq(books.status, 'active'),
      blocked: eq(books.status, 'blocked'),
      pending: sql`${books.status} NOT IN ('active', 'blocked')`,
    }),
    genrePattern ? sql`false` : undefined,
  ]);
}

function buildPersonalBookConditions(filters: BookFilterPatterns): SQL<unknown>[] {
  const { searchPattern, status, genrePattern } = filters;

  return compactConditions([
    searchPattern
      ? sql`(LOWER(${personalBooks.title}) LIKE ${searchPattern} OR LOWER(${personalBooks.author}) LIKE ${searchPattern})`
      : undefined,
    statusCondition(status, {
      active: eq(personalBooks.isDeleted, false),
      blocked: eq(personalBooks.isDeleted, true),
      pending: sql`false`,
    }),
    genrePattern ? sql`LOWER(COALESCE(${personalBooks.genre}, '')) LIKE ${genrePattern}` : undefined,
  ]);
}

function buildClubBookConditions(filters: BookFilterPatterns): SQL<unknown>[] {
  const { searchPattern, status, genrePattern } = filters;

  return compactConditions([
    searchPattern
      ? sql`(LOWER(${clubBooks.title}) LIKE ${searchPattern} OR LOWER(${clubBooks.author}) LIKE ${searchPattern})`
      : undefined,
    statusCondition(status, {
      active: eq(clubBooks.isDeleted, false),
      blocked: eq(clubBooks.isDeleted, true),
      pending: sql`false`,
    }),
    genrePattern ? sql`LOWER(COALESCE(${clubBooks.genre}, '')) LIKE ${genrePattern}` : undefined,
  ]);
}

function buildBookConditions(filters: BookFilters): BookConditions {
  const patterns = buildBookFilterPatterns(filters);

  return {
    booksWhere: sourceWhere(buildSystemBookConditions(patterns)),
    personalWhere: sourceWhere(buildPersonalBookConditions(patterns)),
    clubWhere: sourceWhere(buildClubBookConditions(patterns)),
  };
}

async function fetchBookCounts(conditions: BookConditions) {
  const { booksWhere, personalWhere, clubWhere } = conditions;

  const [booksCountRows, personalCountRows, clubCountRows] = await Promise.all([
    booksWhere
      ? db.select({ count: sql<number>`COUNT(*)::int` }).from(books).where(booksWhere)
      : db.select({ count: sql<number>`COUNT(*)::int` }).from(books),
    personalWhere
      ? db.select({ count: sql<number>`COUNT(*)::int` }).from(personalBooks).where(personalWhere)
      : db.select({ count: sql<number>`COUNT(*)::int` }).from(personalBooks),
    clubWhere
      ? db.select({ count: sql<number>`COUNT(*)::int` }).from(clubBooks).where(clubWhere)
      : db.select({ count: sql<number>`COUNT(*)::int` }).from(clubBooks),
  ]);

  return {
    booksCount: Number(booksCountRows[0]?.count || 0),
    personalCount: Number(personalCountRows[0]?.count || 0),
    clubCount: Number(clubCountRows[0]?.count || 0),
  };
}

interface BookWindow {
  skip: number;
  take: number;
}

function calculateBookWindows(counts: { booksCount: number; personalCount: number; clubCount: number }, offset: number, limit: number) {
  let remainingOffset = offset;
  let remainingLimit = limit;

  const calculateWindow = (segmentCount: number): BookWindow => {
    if (remainingLimit <= 0) return { skip: 0, take: 0 };
    if (remainingOffset >= segmentCount) {
      remainingOffset -= segmentCount;
      return { skip: 0, take: 0 };
    }

    const skip = remainingOffset;
    const take = Math.min(remainingLimit, segmentCount - skip);
    remainingOffset = 0;
    remainingLimit -= take;
    return { skip, take };
  };

  return {
    booksWindow: calculateWindow(counts.booksCount),
    personalWindow: calculateWindow(counts.personalCount),
    clubWindow: calculateWindow(counts.clubCount),
  };
}

// Типы для результатов запросов книг
interface BookQueryResult {
  id: string;
  title: string;
  author: string;
  isbn: string | null;
  coverUrl: string | null;
  fileUrl: string | null;
  uploadedBy: string | null;
  uploadedAt: Date | null;
  createdAt: Date | null;
  fileSize: number | null;
  downloadsCount: number | null;
  description: string | null;
  status: string;
}

interface PersonalBookQueryResult {
  id: string;
  title: string;
  author: string;
  genre: string | null;
  coverUrl: string | null;
  fileUrl: string | null;
  uploadedBy: string | null;
  uploadedAt: Date;
  fileSize: number | null;
  description: string | null;
  status: string;
  userId: string | null;
}

interface ClubBookQueryResult {
  id: string;
  title: string;
  author: string;
  genre: string | null;
  coverUrl: string | null;
  fileUrl: string | null;
  uploadedBy: string | null;
  uploadedAt: Date;
  fileSize: number | null;
  description: string | null;
  clubId: string;
  uploadedByUserId: string | null;
  status: string;
}

async function executeBookQueries(
  conditions: BookConditions,
  windows: { booksWindow: BookWindow; personalWindow: BookWindow; clubWindow: BookWindow }
) {
  const { booksWhere, personalWhere, clubWhere } = conditions;
  const { booksWindow, personalWindow, clubWindow } = windows;

  const booksQuery = db
    .select({
      id: books.id,
      title: books.title,
      author: books.author,
      isbn: books.isbn,
      coverUrl: books.coverUrl,
      fileUrl: books.contentPath,
      uploadedBy: users.username,
      uploadedAt: books.uploadedAt,
      createdAt: books.createdAt,
      fileSize: books.fileSize,
      downloadsCount: books.downloadCount,
      description: books.description,
      status: sql<string>`CASE
        WHEN ${books.status} = 'active' THEN 'active'
        WHEN ${books.status} = 'blocked' THEN 'blocked'
        ELSE 'pending'
      END`,
    })
    .from(books)
    .leftJoin(users, eq(books.uploadedBy, users.id))
    .orderBy(desc(books.createdAt));

  const personalQuery = db
    .select({
      id: personalBooks.id,
      userId: personalBooks.userId,
      title: personalBooks.title,
      author: personalBooks.author,
      genre: personalBooks.genre,
      coverUrl: personalBooks.coverUrl,
      fileUrl: personalBooks.storagePath,
      uploadedBy: users.username,
      uploadedAt: personalBooks.uploadedAt,
      fileSize: personalBooks.fileSizeBytes,
      description: personalBooks.description,
      status: sql<string>`CASE
        WHEN ${personalBooks.isDeleted} = true THEN 'blocked'
        ELSE 'active'
      END`,
    })
    .from(personalBooks)
    .leftJoin(users, eq(personalBooks.userId, users.id))
    .orderBy(desc(personalBooks.createdAt));

  const clubQuery = db
    .select({
      id: clubBooks.id,
      title: clubBooks.title,
      author: clubBooks.author,
      genre: clubBooks.genre,
      coverUrl: clubBooks.coverUrl,
      fileUrl: clubBooks.storagePath,
      uploadedBy: users.username,
      uploadedAt: clubBooks.uploadedAt,
      fileSize: clubBooks.fileSizeBytes,
      description: clubBooks.description,
      clubId: clubBooks.clubId,
      uploadedByUserId: clubBooks.uploadedByUserId,
      status: sql<string>`CASE
        WHEN ${clubBooks.isDeleted} = true THEN 'blocked'
        ELSE 'active'
      END`,
    })
    .from(clubBooks)
    .leftJoin(users, eq(clubBooks.uploadedByUserId, users.id))
    .orderBy(desc(clubBooks.createdAt));

  let getBooksRows: Promise<BookQueryResult[]>;
  if (booksWindow.take > 0) {
    getBooksRows = booksWhere 
      ? booksQuery.where(booksWhere).limit(booksWindow.take).offset(booksWindow.skip)
      : booksQuery.limit(booksWindow.take).offset(booksWindow.skip);
  } else {
    getBooksRows = Promise.resolve([]);
  }

  let getPersonalRows: Promise<PersonalBookQueryResult[]>;
  if (personalWindow.take > 0) {
    getPersonalRows = (personalWhere
      ? personalQuery.where(personalWhere).limit(personalWindow.take).offset(personalWindow.skip)
      : personalQuery.limit(personalWindow.take).offset(personalWindow.skip)
    ).then(rows => rows.map(row => ({
      ...row,
      uploadedBy: row.uploadedBy ?? null
    })));
  } else {
    getPersonalRows = Promise.resolve([]);
  }

  let getClubRows: Promise<ClubBookQueryResult[]>;
  if (clubWindow.take > 0) {
    getClubRows = (clubWhere
      ? clubQuery.where(clubWhere).limit(clubWindow.take).offset(clubWindow.skip)
      : clubQuery.limit(clubWindow.take).offset(clubWindow.skip)
    ).then(rows => rows.map(row => ({
      ...row,
      uploadedByUserId: row.uploadedByUserId ?? null
    })));
  } else {
    getClubRows = Promise.resolve([]);
  }

  return Promise.all([getBooksRows, getPersonalRows, getClubRows]);
}

function formatBookResults(booksRows: BookQueryResult[], personalRows: PersonalBookQueryResult[], clubRows: ClubBookQueryResult[]) {
  return [
    ...booksRows.map((book) => ({
      id: book.id,
      title: book.title,
      author: book.author,
      isbn: book.isbn || null,
      genre: null,
      cover_url: book.coverUrl || null,
      file_url: book.fileUrl || '',
      status: book.status,
      uploaded_by: book.uploadedBy ?? 'System',
      upload_date: (book.uploadedAt || book.createdAt)?.toISOString() ?? new Date().toISOString(),
      file_size: book.fileSize || 0,
      downloads_count: book.downloadsCount || 0,
      description: book.description || null,
      source: 'books',
      club_id: null,
    })),
    ...personalRows.map((book) => ({
      id: book.id,
      title: book.title,
      author: book.author,
      isbn: null,
      genre: book.genre || null,
      cover_url: book.coverUrl || null,
      file_url: book.fileUrl || '',
      status: book.status,
      uploaded_by: book.uploadedBy ?? 'System',
      upload_date: book.uploadedAt.toISOString(),
      file_size: book.fileSize || 0,
      downloads_count: 0,
      description: book.description || null,
      source: 'personal_books',
      club_id: null,
    })),
    ...clubRows.map((book) => ({
      id: book.id,
      title: book.title,
      author: book.author,
      isbn: null,
      genre: book.genre || null,
      cover_url: book.coverUrl || null,
      file_url: book.fileUrl || '',
      status: book.status,
      uploaded_by: book.uploadedBy ?? 'System',
      upload_date: book.uploadedAt.toISOString(),
      file_size: book.fileSize || 0,
      downloads_count: 0,
      description: book.description || null,
      source: 'club_books',
      club_id: book.clubId,
    })),
  ];
}

// Получить список всех книг (refactored for low cognitive complexity)
router.get('/books', jwtAuth, requireAdmin, async (req, res) => {
  try {
    const search = typeof req.query.search === 'string' ? req.query.search.trim().toLowerCase() : '';
    const status = typeof req.query.status === 'string' ? req.query.status : undefined;
    const genre = typeof req.query.genre === 'string' ? req.query.genre.trim().toLowerCase() : undefined;
    const { page, limit, offset } = parseAdminPagination(req.query.page, req.query.limit);

    if (status && !['active', 'blocked', 'pending'].includes(status)) {
      return res.json({
        books: [],
        pagination: { page, limit, total: 0, pages: 0 },
      });
    }

    const conditions = buildBookConditions({ search, status, genre });
    const counts = await fetchBookCounts(conditions);
    const total = counts.booksCount + counts.personalCount + counts.clubCount;
    const windows = calculateBookWindows(counts, offset, limit);
    const [booksRows, personalRows, clubRows] = await executeBookQueries(conditions, windows);
    const formattedBooks = formatBookResults(booksRows, personalRows, clubRows);

    res.json({
      books: formattedBooks,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Error fetching books:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

  router.use(createAdminBookGenresRouter({ requireFullAdmin }));


// Скачать книгу для постмодерации (с расшифровкой для personal/club books)
router.get('/books/:id/download', jwtAuth, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const sourceRaw = req.query.source;
    const source = isAdminBookSource(sourceRaw) ? sourceRaw : 'books';

    let result: { payload?: DownloadPayload; error?: string; statusCode?: number };
    if (source === 'personal_books') {
      result = await buildPersonalBookDownloadPayload(id);
    } else if (source === 'club_books') {
      result = await buildClubBookDownloadPayload(id);
    } else {
      result = await buildRegularBookDownloadPayload(id);
    }

    if (!result.payload) {
      return res.status(result.statusCode || 500).json({
        message: result.error || 'Failed to prepare book for download',
      });
    }

    res.setHeader('Content-Type', result.payload.mimeType);
    res.setHeader('Content-Length', result.payload.fileBuffer.length.toString());
    res.setHeader('Content-Disposition', buildAttachmentHeader(result.payload.fileName));
    res.setHeader('Cache-Control', 'no-store');

    return res.send(result.payload.fileBuffer);
  } catch (error) {
    console.error('Error downloading book for moderation:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

interface BookBlockNotificationParams {
  source: 'personal_books' | 'club_books';
  uploaderUserId: string;
  bookTitle: string;
  reason: string;
  clubId?: string;
}

async function sendBookBlockNotification(
  params: BookBlockNotificationParams,
): Promise<{ success: boolean; error?: string }> {
  const user = await storage.getUser(params.uploaderUserId);
  if (!user?.email) {
    return { success: false, error: 'Book uploader email not found' };
  }

  const clubTitle = params.clubId ? (await storage.getClub(params.clubId))?.title : undefined;
  const profile = await storage.getUserProfile(user.id).catch(() => undefined);
  const emailSent = await emailService.sendBookBlockedNotification({
    email: user.email,
    username: user.username,
    displayName: profile?.displayName ?? undefined,
    bookTitle: params.bookTitle,
    reason: params.reason,
    source: params.source,
    clubTitle,
  });

  if (!emailSent) {
    return { success: false, error: 'Failed to send notification email to book uploader' };
  }

  return { success: true };
}

// Вспомогательные функции для PUT /books/:id/status - снижение когнитивной сложности
interface BookStatusUpdateResult {
  success: boolean;
  message: string;
  status?: AdminBookStatus;
  error?: boolean;
}

async function updatePersonalBookStatusHelper(
  id: string,
  status: AdminBookStatus,
  reason: string,
  req: express.Request
): Promise<BookStatusUpdateResult> {
  if (status === 'pending') {
    return { success: false, message: 'Pending status is not supported for personal books', error: true };
  }

  const personalBook = await storage.getPersonalBook(id);
  if (!personalBook) {
    return { success: false, message: 'Personal book not found', error: true };
  }

  const previousStatus: AdminBookStatus = personalBook.isDeleted ? 'blocked' : 'active';
  if (status === previousStatus) {
    return { success: true, message: 'Book status unchanged', status };
  }

  if (status === 'blocked') {
    const notificationResult = await sendBookBlockNotification({
      source: 'personal_books',
      uploaderUserId: personalBook.userId,
      bookTitle: personalBook.title,
      reason,
    });
    if (!notificationResult.success) {
      return { success: false, message: notificationResult.error!, error: true };
    }
  }

  const updated = status === 'blocked'
    ? await storage.deletePersonalBook(id)
    : await storage.restorePersonalBook(id);

  if (!updated) {
    return { success: false, message: 'Failed to update personal book status', error: true };
  }

  await logAction(
    req,
    status === 'blocked' ? 'block_book' : 'unblock_book',
    'book',
    id,
    status === 'blocked' ? reason : undefined,
    previousStatus,
    status,
  );

  return {
    success: true,
    message: status === 'blocked'
      ? 'Book blocked successfully and uploader notified'
      : 'Book unblocked successfully',
    status,
  };
}

async function updateClubBookStatusHelper(
  id: string,
  status: AdminBookStatus,
  reason: string,
  req: express.Request
): Promise<BookStatusUpdateResult> {
  if (status === 'pending') {
    return { success: false, message: 'Pending status is not supported for club books', error: true };
  }

  const clubBook = await storage.getClubBook(id);
  if (!clubBook) {
    return { success: false, message: 'Club book not found', error: true };
  }

  const previousStatus: AdminBookStatus = clubBook.isDeleted ? 'blocked' : 'active';
  if (status === previousStatus) {
    return { success: true, message: 'Book status unchanged', status };
  }

  if (status === 'blocked') {
    const notificationResult = await sendBookBlockNotification({
      source: 'club_books',
      uploaderUserId: clubBook.uploadedByUserId,
      bookTitle: clubBook.title,
      reason,
      clubId: clubBook.clubId,
    });
    if (!notificationResult.success) {
      return { success: false, message: notificationResult.error!, error: true };
    }
  }

  const updated = status === 'blocked'
    ? await storage.deleteClubBook(id)
    : await storage.restoreClubBook(id);

  if (!updated) {
    return { success: false, message: 'Failed to update club book status', error: true };
  }

  await logAction(
    req,
    status === 'blocked' ? 'block_book' : 'unblock_book',
    'book',
    id,
    status === 'blocked' ? reason : undefined,
    previousStatus,
    status,
  );

  return {
    success: true,
    message: status === 'blocked'
      ? 'Book blocked successfully and uploader notified'
      : 'Book unblocked successfully',
    status,
  };
}

async function updateRegularBookStatusHelper(
  id: string,
  status: AdminBookStatus,
  reason: string,
  req: express.Request
): Promise<BookStatusUpdateResult> {
  const regularBook = await storage.getBook(id);
  if (!regularBook) {
    return { success: false, message: 'Book not found', error: true };
  }

  const previousStatus = getDisplayBookStatusForRegularBook(regularBook.status);
  if (status === previousStatus) {
    return { success: true, message: 'Book status unchanged', status };
  }

  const [updatedRegularBook] = await db
    .update(books)
    .set({
      status: status as unknown as typeof books.$inferInsert.status,
      blockedAt: status === 'blocked' ? new Date() : null,
      blockReason: status === 'blocked' ? reason || null : null,
      updatedAt: new Date(),
    })
    .where(eq(books.id, id))
    .returning({ id: books.id });

  if (!updatedRegularBook) {
    return { success: false, message: 'Failed to update regular book status', error: true };
  }

  let actionType: AdminActionType;
  if (status === 'blocked') {
    actionType = 'block_book';
  } else if (status === 'active') {
    actionType = 'unblock_book';
  } else {
    actionType = 'update_book_status';
  }

  await logAction(
    req,
    actionType,
    'book',
    id,
    status === 'blocked' ? reason : undefined,
    previousStatus,
    status,
  );

  return { success: true, message: 'Book status updated successfully', status };
}

// Изменить статус книги (поддерживает все типы: books, personal_books, club_books)
router.put('/books/:id/status', jwtAuth, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const statusRaw = req.body?.status;
    const sourceRaw = req.body?.source;
    const reason = normalizeReason(req.body?.reason);
    const source = isAdminBookSource(sourceRaw) ? sourceRaw : 'books';

    if (!isAdminBookStatus(statusRaw)) {
      return res.status(400).json({ message: 'Invalid book status' });
    }
    const status = statusRaw;

    const requiresReasonForBlock = source !== 'books' && status === 'blocked';
    if (requiresReasonForBlock && !reason) {
      return res.status(400).json({ message: 'Block reason is required' });
    }
    if (reason.length > BOOK_BLOCK_REASON_MAX_LENGTH) {
      return res.status(400).json({
        message: `Block reason is too long (max ${BOOK_BLOCK_REASON_MAX_LENGTH} chars)`,
      });
    }

    let result: BookStatusUpdateResult;

    if (source === 'personal_books') {
      result = await updatePersonalBookStatusHelper(id, status, reason, req);
    } else if (source === 'club_books') {
      result = await updateClubBookStatusHelper(id, status, reason, req);
    } else {
      result = await updateRegularBookStatusHelper(id, status, reason, req);
    }

    if (!result.success) {
      return res.status(result.error ? 500 : 404).json({ message: result.message });
    }

    return res.json({ message: result.message, status: result.status });
  } catch (error) {
    console.error('Error updating book status:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

// Вспомогательные функции для удаления книг
async function deletePersonalBookAdmin(id: string): Promise<{ success: boolean; bookInfo?: { title: string; status?: string }; error?: string }> {
  const book = await storage.getPersonalBook(id);
  if (!book) {
    return { success: false, error: 'Personal book not found' };
  }
  
  const bookInfo = { title: book.title, status: book.isDeleted ? 'deleted' : 'active' };
  const deleted = await storage.permanentDeletePersonalBook(id);
  
  return { success: deleted, bookInfo };
}

async function deleteClubBookAdmin(id: string): Promise<{ success: boolean; bookInfo?: { title: string; status?: string }; error?: string }> {
  const book = await storage.getClubBook(id);
  if (!book) {
    return { success: false, error: 'Club book not found' };
  }
  
  const bookInfo = { title: book.title, status: book.isDeleted ? 'deleted' : 'active' };
  const deleted = await storage.permanentDeleteClubBook(id);
  
  return { success: deleted, bookInfo };
}

async function deleteRegularBookAdmin(id: string): Promise<{ success: boolean; bookInfo?: { title: string; status?: string }; error?: string }> {
  const book = await storage.getBook(id);
  if (!book) {
    return { success: false, error: 'Book not found' };
  }
  
  const bookInfo = { title: book.title, status: book.status };
  await storage.deleteBook(id);
  
  return { success: true, bookInfo };
}

// Удалить книгу окончательно (поддерживает все типы: books, personal_books, club_books)
router.delete('/books/:id', jwtAuth, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { source } = req.query;

    let result: { success: boolean; bookInfo?: { title: string; status?: string }; error?: string };

    if (source === 'personal_books') {
      result = await deletePersonalBookAdmin(id);
    } else if (source === 'club_books') {
      result = await deleteClubBookAdmin(id);
    } else {
      result = await deleteRegularBookAdmin(id);
    }

    if (!result.success) {
      const statusCode = result.error?.includes('not found') ? 404 : 500;
      return res.status(statusCode).json({ message: result.error || 'Failed to delete book' });
    }

    await logAction(
      req,
      'delete_book',
      'book',
      id,
      `Book deleted by admin (source: ${typeof source === 'string' ? source : 'books'})`,
      result.bookInfo?.status,
      'deleted'
    );

    res.json({ message: 'Book deleted successfully' });
  } catch (error) {
    console.error('Error deleting book:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});


  return router;
}
