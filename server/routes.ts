import type { Express, Request, Response } from "express";
import type { Server } from "node:http";
import { storage } from "./repositories/index.js";
import { fileStorage } from "./file-storage.js";
import { emailService } from "./services/email-service.js";
import personalBooksRouter from "./personal-books-routes.js";
import clubBooksRouter from "./club-books-routes.js";
import genresRouter from "./genres-routes.js";
import accessRouter from "./access-routes.js";
import clubDiscussionsRouter from "./club-discussions-routes.js";
import scheduleRouter from "./routes/schedule.js";
import notificationsRouter from "./routes/notifications.js";
import recordingsRouter from "./routes/recordings.js";
import sessionAnalyticsRouter from "./routes/session-analytics.js";
import readerQualityRouter from "./routes/reader-quality.js";
import { jwtAuth, requireActiveUser } from "./jwt-middleware.js";
import { logger } from "./lib/logger.js";
import { getPublicBaseUrl } from "./lib/public-base-url.js";
import { activityService } from "./services/activity-service.js";
import { getFeatureFlag } from "./lib/feature-flags.js";
import {
  insertClubSchema,
  insertBookSchema,
  type InsertBook
} from "../shared/schema.js";
import { isReaderLedClub } from "./lib/reader-club-access.js";
import { EntitlementError, EntitlementService } from "./services/commerce/entitlement-service.js";
import {
  countActiveClubMembersForEntitlement,
  findInvitationByToken,
  recordAnalyticsEvent,
  validateStoragePath,
} from "./routes/helpers.js";
import { registerReadingSessionRoutes } from "./routes/legacy-reading-sessions.js";
import { registerUserProfileRoutes } from "./routes/user-profiles.js";

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {


  // NOTE: Admin endpoints moved to admin-routes.ts to avoid conflicts

  // ===== NEW VOXLIBRIS UPLOAD API (Phase 2) =====
  app.use('/api/v1/user/books', personalBooksRouter);
  app.use('/api/v1/genres', genresRouter);
  app.use('/api/v1', clubBooksRouter);
  app.use('/api/v1', accessRouter);
  
  // ===== CLUB DISCUSSIONS API =====
  app.use('/api', clubDiscussionsRouter);

  // ===== SCHEDULE API (Phase 5) =====
  app.use('/api/schedule', jwtAuth, scheduleRouter);

  // ===== CLUBS API =====
  // Все club routes теперь в club-routes.ts

  // Public endpoint: Get invitation details (no auth required)
  app.get("/api/invitations/:token", async (req: Request, res: Response) => {
    try {
      const invitation = await storage.getClubInvitation(req.params.token);
      
      if (!invitation) {
        return res.status(404).json({ message: "Приглашение не найдено" });
      }

      // Если статус приглашения не pending — считаем его недействительным.
      // Заметьте: отклонённые приглашения теперь удаляются, поэтому здесь
      // может приходить только 'accepted' или 'expired'.
      if (invitation.status !== 'pending') {
        const statusMessage = invitation.status === 'accepted' ? 'принято' : 'не действительно';
        return res.status(410).json({ 
          message: `Приглашение уже ${statusMessage}`,
          status: invitation.status
        });
      }

      // Проверяем срок действия
      if (new Date(invitation.expiresAt) < new Date()) {
        await storage.updateInvitationStatus(req.params.token, 'expired');
        return res.status(410).json({ message: "Приглашение истекло", status: 'expired' });
      }

      const club = await storage.getClub(invitation.clubId);
      if (!club) {
        return res.status(404).json({ message: "Клуб не найден" });
      }

      const inviter = await storage.getUser(invitation.invitedBy);

      // Возвращаем только публичную информацию, включая id и status
      // чтобы фронтенд мог корректно определить состояние приглашения
      res.json({
        club: {
          id: club.id,
          title: club.title,
          description: club.description,
          coverImage: club.coverImage,
          memberCount: club.memberCount,
          maxMembers: club.maxMembers,
          type: club.type,
        },
        invitation: {
          id: invitation.id,
          email: invitation.email,
          status: invitation.status,
          expiresAt: invitation.expiresAt,
          inviterName: inviter?.username || 'Участник клуба',
        }
      });
    } catch (error) {
      console.error("Get invitation error:", error);
      res.status(500).json({ message: "Внутренняя ошибка сервера" });
    }
  });

  // Accept invitation endpoint (requires authentication)
  app.post("/api/invitations/:token/accept", jwtAuth, async (req: Request, res: Response) => {
    try {
      if (!req.user) {
        return res.status(401).json({ message: 'Authentication required' });
      }

      const invitation = await findInvitationByToken(req.params.token);
      if (!invitation) {
        logger.debug(`Invitation not found for token: ${req.params.token}`);
        return res.status(404).json({ message: 'Invitation not found' });
      }

      // Проверяем статус приглашения
      if (invitation.status !== 'pending') {
        return res.status(409).json({ 
          message: `Invitation already ${invitation.status}` 
        });
      }

      // Проверяем срок действия
      if (new Date(invitation.expiresAt) < new Date()) {
        await storage.updateInvitationStatus(req.params.token, 'expired');
        return res.status(410).json({ message: 'Invitation has expired' });
      }

      const club = await storage.getClub(invitation.clubId);
      if (!club) {
        return res.status(404).json({ message: 'Club not found' });
      }

      // Загружаем текущего пользователя для проверки email
      const currentUser = await storage.getUser(req.user.userId);
      if (!currentUser) {
        return res.status(401).json({ message: 'Пользователь не найден' });
      }

      // Принимать приглашение может только тот пользователь, на чей email оно было отправлено
      if (invitation.email && currentUser.email && invitation.email.toLowerCase() !== currentUser.email.toLowerCase()) {
        return res.status(403).json({
          message: 'Этот инвайт предназначен для другого email. Пожалуйста, войдите под приглашённым аккаунтом или зарегистрируйтесь.',
          code: 'INVITE_EMAIL_MISMATCH'
        });
      }

      // Проверяем, не заполнен ли клуб
      if (club.memberCount >= club.maxMembers) {
        return res.status(409).json({ message: 'Club is full' });
      }

      if (!isReaderLedClub(club)) {
        try {
          await new EntitlementService().assertLimit(club.ownerId, 'club.members.max_count', await countActiveClubMembersForEntitlement(club.id), { scopeType: 'club', scopeId: club.id });
        } catch (error) {
          if (error instanceof EntitlementError) return res.status(403).json({ message: error.message, code: error.code });
          throw error;
        }
      }

      // Проверяем, не является ли пользователь уже участником
      const existingMembership = await storage.getUserClubMembership(club.id, req.user.userId);
      if (existingMembership) {
        // Обновляем статус приглашения
        await storage.updateInvitationStatus(req.params.token, 'accepted', new Date());
        return res.status(409).json({ message: 'You are already a member of this club' });
      }

      // Для reader-led клуба приглашённый пользователь становится слушателем.
      // В текущей модели ролей слушатель хранится как обычный active member;
      // доступ к тексту книги остаётся закрыт серверными guard'ами владельца.
      const membershipRole = 'member' as const;
      const membership = await storage.joinClub(club.id, req.user.userId, membershipRole);
      const listenerAccess = club.type === 'reader-led';

      // Обновляем статус приглашения
      await storage.updateInvitationStatus(req.params.token, 'accepted', new Date());

      // Отправляем уведомление владельцу клуба
      const inviter = await storage.getUser(invitation.invitedBy);
      if (inviter) {
        const baseUrl = await getPublicBaseUrl();
        await emailService.sendInvitationAccepted({
          email: inviter.email,
          clubName: club.title,
          memberName: req.user.username,
          baseUrl,
        });
      }

      logger.debug(`[Clubs] User ${req.user.username} accepted invitation to club "${club.title}"`);

      // Событие ленты: пользователь вступил в клуб
      activityService.emit({
        actorId: req.user.userId,
        eventType: 'joined_club',
        targetType: 'club',
        targetId: club.id,
        metadata: {
          clubId: club.id,
          clubName: club.title,
        },
      }).catch((err) => logger.warn('[activity] joined_club emit failed', err));

      res.json({
        message: 'Successfully joined the club',
        club: {
          id: club.id,
          title: club.title,
          description: club.description,
          type: club.type,
        },
        membership,
        listenerAccess,
      });
    } catch (error) {
      console.error('Error accepting invitation:', error);
      res.status(500).json({ message: 'Failed to accept invitation' });
    }
  });

  // Decline invitation endpoint (requires authentication)
  app.post("/api/invitations/:token/decline", jwtAuth, async (req: Request, res: Response) => {
    try {
      if (!req.user) {
        return res.status(401).json({ message: 'Authentication required' });
      }

      const invitation = await storage.getClubInvitation(req.params.token);
      if (!invitation) {
        return res.status(404).json({ message: 'Invitation not found' });
      }

      // Проверяем статус приглашения
      if (invitation.status !== 'pending') {
        return res.status(409).json({ 
          message: `Invitation already ${invitation.status}` 
        });
      }

      // Вместо установки статуса 'declined' удаляем приглашение
      const deleted = await storage.deleteClubInvitation(invitation.id);
      if (!deleted) {
        console.warn(`[Clubs] Failed to delete declined invitation token ${req.params.token}`);
        return res.status(500).json({ message: 'Failed to decline invitation' });
      }

      logger.debug(`[Clubs] User declined and deleted invitation token ${req.params.token}`);

      res.json({ message: 'Invitation declined and removed' });
    } catch (error) {
      console.error('Error declining invitation:', error);
      res.status(500).json({ message: 'Failed to decline invitation' });
    }
  });

  // ===== CLUBS API =====
  app.put("/api/clubs/:id", jwtAuth, requireActiveUser, async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const currentUser = req.user;
      
      if (!currentUser) {
        return res.status(401).json({ message: "Пользователь не аутентифицирован" });
      }

      // Check if club exists and user has permission
      const existingClub = await storage.getClub(id);
      if (!existingClub) {
        return res.status(404).json({ message: "Клуб не найден" });
      }

      const isOwner = existingClub.ownerId === currentUser.id;
      const isAdmin = currentUser.role === 'admin';

      if (!isOwner && !isAdmin) {
        return res.status(403).json({ message: "Недостаточно прав для изменения клуба" });
      }

      const validation = insertClubSchema.partial().safeParse(req.body);
      if (!validation.success) {
        return res.status(400).json({
          message: "Ошибка валидации данных",
          errors: validation.error.issues
        });
      }

      const updatedClub = await storage.updateClub(id, validation.data);

      if (!updatedClub) {
        return res.status(404).json({ message: "Не удалось обновить клуб" });
      }

      res.json({
        message: "Клуб успешно обновлен",
        club: updatedClub
      });
    } catch (error) {
      console.error("Update club error:", error);
      res.status(500).json({ message: "Внутренняя ошибка сервера" });
    }
  });

  // Delete club (owner or admin only)
  app.delete("/api/clubs/:id", jwtAuth, requireActiveUser, async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const currentUser = req.user;
      
      if (!currentUser) {
        return res.status(401).json({ message: "Пользователь не аутентифицирован" });
      }

      const existingClub = await storage.getClub(id);
      if (!existingClub) {
        return res.status(404).json({ message: "Клуб не найден" });
      }

      const isOwner = existingClub.ownerId === currentUser.id;
      const isAdmin = currentUser.role === 'admin';

      if (!isOwner && !isAdmin) {
        return res.status(403).json({ message: "Недостаточно прав для удаления клуба" });
      }

      const success = await storage.deleteClub(id);

      if (!success) {
        return res.status(404).json({ message: "Не удалось удалить клуб" });
      }

      res.json({ message: "Клуб успешно удален" });
    } catch (error) {
      console.error("Delete club error:", error);
      res.status(500).json({ message: "Внутренняя ошибка сервера" });
    }
  });

  // Get user's clubs
  app.get("/api/user/clubs", jwtAuth, async (req: Request, res: Response) => {
    try {
      const user = req.user;
      if (!user) {
        return res.status(401).json({ message: "Пользователь не аутентифицирован" });
      }
      const userId = user.id;
      const clubs = await storage.getClubsByUser(userId);
      res.json({ clubs });
    } catch (error) {
      console.error("Get user clubs error:", error);
      res.status(500).json({ message: "Внутренняя ошибка сервера" });
    }
  });

  // Get user's books (uploaded by user)
  app.get("/api/user/books", jwtAuth, async (req: Request, res: Response) => {
    try {
      const user = req.user;
      if (!user) {
        return res.status(401).json({ message: "Пользователь не аутентифицирован" });
      }
      const userId = user.id;
      const books = await storage.getBooksByUser(userId);
      res.json({ books });
    } catch (error) {
      console.error("Get user books error:", error);
      res.status(500).json({ message: "Внутренняя ошибка сервера" });
    }
  });

  // Join club
  app.post("/api/clubs/:id/join", jwtAuth, requireActiveUser, async (req: Request, res: Response) => {
    try {
      const { id: clubId } = req.params;
      const user = req.user;
      if (!user) {
        return res.status(401).json({ message: "Пользователь не аутентифицирован" });
      }
      // Check if club exists
      const club = await storage.getClub(clubId);
      if (!club) {
        return res.status(404).json({ message: "Клуб не найден" });
      }

	  return res.status(403).json({
	    message: "Присоединение к клубу возможно только по приглашению.",
	    code: "INVITATION_REQUIRED"
	  });
    } catch (error) {
      console.error("Join club error:", error);
      res.status(500).json({ message: "Внутренняя ошибка сервера" });
    }
  });

  // Leave club
  app.post("/api/clubs/:id/leave", jwtAuth, async (req: Request, res: Response) => {
    try {
      const { id: clubId } = req.params;
      const user = req.user;
      if (!user) {
        return res.status(401).json({ message: "Пользователь не аутентифицирован" });
      }
      const userId = user.id;

      const success = await storage.leaveClub(clubId, userId);

      if (!success) {
        return res.status(404).json({ message: "Вы не являетесь участником этого клуба" });
      }

      await recordAnalyticsEvent(req, {
        eventType: "club_leave",
        clubId,
        bookId: null,
        chapterNumber: null,
        duration: null,
        progress: null,
      });

      res.json({ message: "Вы покинули клуб" });
    } catch (error) {
      console.error("Leave club error:", error);
      res.status(500).json({ message: "Внутренняя ошибка сервера" });
    }
  });

  // ===== BOOKS API =====

  // Get all books
  app.get("/api/books", async (req: Request, res: Response) => {
    try {
      const books = await storage.getBooks();
      res.json({ books });
    } catch (error) {
      console.error("Get books error:", error);
      res.status(500).json({ message: "Внутренняя ошибка сервера" });
    }
  });

  // Search books (MUST be before /api/books/:id)
  app.get("/api/books/search", async (req: Request, res: Response) => {
    try {
      const { q: query } = req.query;

      if (!query || typeof query !== 'string') {
        return res.status(400).json({ message: "Параметр поиска 'q' обязателен" });
      }

      const books = await storage.searchBooks(query);
      res.json({ books, query });
    } catch (error) {
      console.error("Search books error:", error);
      res.status(500).json({ message: "Внутренняя ошибка сервера" });
    }
  });

  // Global search across clubs, books, users, and future features
  app.get("/api/search/global", async (req: Request, res: Response) => {
    try {
      const { q } = req.query;
      const rawLimit = typeof req.query.limit === "string" ? Number.parseInt(req.query.limit, 10) : 6;
      const limit = Number.isFinite(rawLimit) ? Math.min(Math.max(rawLimit, 1), 20) : 6;

      if (!q || typeof q !== "string" || q.trim().length < 2) {
        return res.json({
          query: typeof q === "string" ? q : "",
          results: {
            clubs: [],
            books: [],
            users: [],
            features: [],
          },
        });
      }

      const query = q.trim();
      const queryLower = query.toLowerCase();

      const [clubs, books, users] = await Promise.all([
        storage.getPublicCatalogClubs(limit, undefined, query),
        storage.searchBooks(query),
        storage.searchUsers(query, limit),
      ]);

      const searchableFeatures = [
        { id: "catalog", title: "Каталог клубов", description: "Открыть все клубы", path: "/catalog", isFuture: false },
        { id: "readers", title: "Топ чтецов", description: "Раздел чтецов и рейтингов", path: "/readers", isFuture: false },
        { id: "library", title: "Моя библиотека", description: "Личные книги, история, закладки", path: "/library", isFuture: false },
        { id: "pricing", title: "Тарифы", description: "Тарифные планы и возможности", path: "/pricing", isFuture: false },
        { id: "become-reader", title: "Стать чтецом", description: "Подача заявки и onboarding", path: "/become-reader", isFuture: false },
        { id: "rules", title: "Правила сообщества", description: "Раздел в разработке", path: "", isFuture: true },
        { id: "privacy", title: "Приватность", description: "Раздел в разработке", path: "", isFuture: true },
        { id: "terms", title: "Условия", description: "Раздел в разработке", path: "", isFuture: true },
      ];

      const features = searchableFeatures
        .filter((item) => {
          const haystack = `${item.title} ${item.description}`.toLowerCase();
          return haystack.includes(queryLower);
        })
        .slice(0, limit);

      res.json({
        query,
        results: {
          clubs: clubs.slice(0, limit),
          books: books.slice(0, limit).map((book) => ({
            id: book.id,
            title: book.title,
            author: book.author,
          })),
          users: users.slice(0, limit).map((user) => ({
            id: user.id,
            username: user.username,
            status: user.status,
          })),
          features,
        },
      });
    } catch (error) {
      console.error("Global search error:", error);
      res.status(500).json({ message: "Внутренняя ошибка сервера" });
    }
  });

  // Get book by ID
  app.get("/api/books/:id", async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const book = await storage.getBook(id);

      if (!book) {
        return res.status(404).json({ message: "Книга не найдена" });
      }

      res.json({ book });
    } catch (error) {
      console.error("Get book error:", error);
      res.status(500).json({ message: "Внутренняя ошибка сервера" });
    }
  });

  // Get book details with preview (for book details page)
  app.get("/api/books/:id/details", async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const book = await storage.getBook(id);

      if (!book) {
        return res.status(404).json({ message: "Книга не найдена" });
      }

      // Get uploader info
      const uploader = book.uploadedBy ? await storage.getUser(book.uploadedBy) : null;
      const uploaderProfile = uploader ? await storage.getUserProfile(uploader.id) : null;

      // Get first 2 chapters as preview (or first 3000 characters)
      const content = await storage.getBookContent(id);
      let previewText = '';
      let chapterTitle = '';

      if (content && content.length > 0) {
        // Take first 2 chapters or first 3000 characters
        const previewChapters = content.slice(0, 2);
        previewText = previewChapters.map(ch => ch.content).join('\n\n');
        
        if (previewText.length > 3000) {
          previewText = previewText.slice(0, 3000);
        }

        if (previewChapters[0]) {
          chapterTitle = previewChapters[0].title || 'Глава 1';
        }
      }

      res.json({
        id: book.id,
        title: book.title,
        author: book.author,
        description: book.description,
        coverUrl: book.coverUrl,
        publisher: book.publisher,
        publishedYear: book.publishDate, // используем publishDate как год
        language: book.language,
        isbn: book.isbn,
        createdAt: book.createdAt,
        uploadedBy: {
          id: uploader?.id || book.uploadedBy || 'unknown',
          username: uploader?.username || 'unknown',
          displayName: uploaderProfile?.displayName || uploader?.username || 'unknown',
        },
        preview: previewText ? {
          text: previewText,
          chapterTitle,
        } : undefined,
      });
    } catch (error) {
      console.error("Get book details error:", error);
      res.status(500).json({ message: "Внутренняя ошибка сервера" });
    }
  });

  // Get book content (all chapters or specific chapter)
  app.get("/api/books/:id/content", async (req: Request, res: Response) => {
    try {
      const { id: bookId } = req.params;
      const { chapter } = req.query;

      // Check if book exists
      const book = await storage.getBook(bookId);
      if (!book) {
        return res.status(404).json({ message: "Книга не найдена" });
      }

      if (chapter) {
        const chapterNumber = Number.parseInt(chapter as string, 10);
        const chapterContent = await storage.getBookChapter(bookId, chapterNumber);

        if (!chapterContent) {
          return res.status(404).json({ message: "Глава не найдена" });
        }

        res.json({ chapter: chapterContent });
      } else {
        const content = await storage.getBookContent(bookId);
        res.json({ content });
      }
    } catch (error) {
      console.error("Get book content error:", error);
      res.status(500).json({ message: "Внутренняя ошибка сервера" });
    }
  });

  // Upload book content (authenticated users only)
  app.post("/api/books/:id/content", jwtAuth, requireActiveUser, async (req: Request, res: Response) => {
    try {
      const { id: bookId } = req.params;
      const { chapterNumber, title, content, wordCount } = req.body;

      if (!chapterNumber || !title || !content) {
        return res.status(400).json({
          message: "Обязательные поля: chapterNumber, title, content"
        });
      }

      // Check if book exists
      const book = await storage.getBook(bookId);
      if (!book) {
        return res.status(404).json({ message: "Книга не найдена" });
      }

      const contentData = {
        bookId,
        chapterNumber: Number.parseInt(chapterNumber, 10),
        title,
        content,
        wordCount: wordCount || content.split(/\s+/).length
      };

      const newContent = await storage.createBookContent(contentData);

      res.status(201).json({
        message: "Контент добавлен",
        content: newContent
      });
    } catch (error) {
      console.error("Upload book content error:", error);
      res.status(500).json({ message: "Внутренняя ошибка сервера" });
    }
  });

  // Delete book content (authenticated users only)
  app.delete("/api/books/:bookId/content/:contentId", jwtAuth, requireActiveUser, async (req: Request, res: Response) => {
    try {
      const { contentId } = req.params;

      await storage.deleteBookContent(contentId);

      res.json({ message: "Контент удален" });
    } catch (error) {
      console.error("Delete book content error:", error);
      res.status(500).json({ message: "Внутренняя ошибка сервера" });
    }
  });

  // Upload new book from file (EPUB/FB2) - DEPRECATED/REMOVED in favor of new API
  // app.post("/api/books/upload", ...);

  // Create book manually (for testing or simple text books)
  app.post("/api/books", jwtAuth, requireActiveUser, async (req: Request, res: Response) => {
    try {
      const currentUser = req.user;
      if (!currentUser) {
        return res.status(401).json({ message: "Пользователь не аутентифицирован" });
      }

      // Check user permissions
      if (currentUser.role !== 'admin') {
        return res.status(403).json({ message: "Недостаточно прав для создания книг" });
      }

      const validation = insertBookSchema.safeParse(req.body);

      if (!validation.success) {
        return res.status(400).json({
          message: "Ошибка валидации данных",
          errors: validation.error.issues
        });
      }

      const newBook = await storage.createBook(validation.data);

      res.status(201).json({
        message: "Книга успешно создана",
        book: newBook
      });
    } catch (error) {
      console.error("Create book error:", error);
      res.status(500).json({ message: "Внутренняя ошибка сервера" });
    }
  });

  // Update book metadata (authenticated users only - owner or admin)
  app.put("/api/books/:id", jwtAuth, requireActiveUser, async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const currentUser = req.user;
      if (!currentUser) {
        return res.status(401).json({ message: "Пользователь не аутентифицирован" });
      }

      // Get the book to check ownership
      const book = await storage.getBook(id);
      if (!book) {
        return res.status(404).json({ message: "Книга не найдена" });
      }

      // Check permissions: owner or admin can update
      if (book.uploadedBy !== currentUser.id && currentUser.role !== 'admin') {
        return res.status(403).json({ message: "Недостаточно прав для редактирования этой книги" });
      }

      // Validate update data
      const allowedUpdates = ['title', 'author', 'description', 'isbn', 'coverUrl'];
      const updates: Partial<InsertBook> = {};

      for (const key of allowedUpdates) {
        if (req.body[key] !== undefined) {
          updates[key as keyof InsertBook] = req.body[key];
        }
      }

      if (Object.keys(updates).length === 0) {
        return res.status(400).json({ message: "Нет данных для обновления" });
      }

      const updatedBook = await storage.updateBook(id, updates);

      res.json({
        message: "Книга успешно обновлена",
        book: updatedBook
      });
    } catch (error) {
      console.error("Update book error:", error);
      res.status(500).json({ message: "Внутренняя ошибка сервера" });
    }
  });

  // Delete book (authenticated users only - owner or admin)
  app.delete("/api/books/:id", jwtAuth, requireActiveUser, async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const currentUser = req.user;
      if (!currentUser) {
        return res.status(401).json({ message: "Пользователь не аутентифицирован" });
      }

      // Get the book to check ownership
      const book = await storage.getBook(id);
      if (!book) {
        return res.status(404).json({ message: "Книга не найдена" });
      }

      // Check permissions: owner or admin can delete
      if (book.uploadedBy !== currentUser.id && currentUser.role !== 'admin') {
        return res.status(403).json({ message: "Недостаточно прав для удаления этой книги" });
      }

      // Delete associated file from storage if exists
      if (book.contentPath) {
        try {
          await fileStorage.deleteFile(book.contentPath);
          logger.debug(`Deleted file from storage: ${book.contentPath}`);
        } catch (fileError) {
          console.warn(`Failed to delete file from storage: ${book.contentPath}`, fileError);
          // Continue with database deletion even if file deletion fails
        }
      }

      // Delete cover image if exists
      if (book.coverUrl) {
        try {
          // Extract key from URL to delete cover
          const coverKey = book.coverUrl.split('/').pop();
          if (coverKey) {
            await fileStorage.deleteFile(`covers/${coverKey}`);
            logger.debug(`Deleted cover from storage: covers/${coverKey}`);
          }
        } catch (coverError) {
          console.warn(`Failed to delete cover from storage`, coverError);
        }
      }

      // Delete book from database (this will cascade delete content)
      await storage.deleteBook(id);

      res.json({ message: "Книга успешно удалена" });
    } catch (error) {
      console.error("Delete book error:", error);
      res.status(500).json({ message: "Внутренняя ошибка сервера" });
    }
  });

  registerReadingSessionRoutes(app);

  // ===== STORAGE PROXY API =====

  // Serve files from storage (covers, etc.)
  // Use prefix mounting to avoid path-to-regexp parameter regex incompatibilities
  app.use("/api/storage", async (req: Request, res: Response) => {
    try {
      if (req.method !== 'GET') {
        return res.status(405).json({ message: 'Method Not Allowed' });
      }

      // req.path here is the path after the mounted prefix, keep leading '/'
      // Extract key from path (everything after /api/storage/)
      const raw = (req.path || req.url || '');
      const validation = validateStoragePath(raw);
      
      if (!validation.valid) {
        console.warn(`[Security] Invalid storage path attempted: ${raw}`);
        return res.status(400).json({ message: 'Invalid file path' });
      }

      const key = validation.normalizedPath!;

      try {
        const fileMetadata = await fileStorage.getFileMetadata(key);
        const fileBuffer = await fileStorage.getFile(key);

        res.setHeader('Content-Type', fileMetadata.contentType);
        res.setHeader('Content-Length', fileMetadata.size);
        res.setHeader('Cache-Control', 'public, max-age=31536000'); // Cache for 1 year

        res.send(fileBuffer);
      } catch (error) {
        console.warn(`File not found in storage: ${key}`, error);
        res.status(404).json({ message: "File not found" });
        return;
      }
    } catch (error) {
      console.error("Storage proxy error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Get reader ratings
  app.get("/api/readers/:id/ratings", async (req: Request, res: Response) => {
    try {
      const { id: readerId } = req.params;

      const ratings = await storage.getReaderRatings(readerId);
      const averageRating = await storage.getReaderAverageRating(readerId);

      res.json({
        ratings,
        averageRating,
        totalRatings: ratings.length
      });
    } catch (error) {
      console.error("Get reader ratings error:", error);
      res.status(500).json({ message: "Внутренняя ошибка сервера" });
    }
  });

  // Get top readers
  app.get("/api/readers/top", async (req: Request, res: Response) => {
    try {
      const limit = Number.parseInt(req.query.limit as string) || 10;
      const topReaders = await storage.getTopReaders(limit);
      res.json({ readers: topReaders });
    } catch (error) {
      console.error("Get top readers error:", error);
      res.status(500).json({ message: "Внутренняя ошибка сервера" });
    }
  });

  app.get("/api/readers/landing-top/status", async (_req: Request, res: Response) => {
    try {
      const enabled = await getFeatureFlag("landing.topReaders.enabled", false);
      res.setHeader("Cache-Control", "public, max-age=60, stale-while-revalidate=300");
      res.json({ enabled });
    } catch (error) {
      console.error("Error getting landing top readers status:", error);
      res.status(500).json({ message: "Failed to get landing top readers status" });
    }
  });

  registerUserProfileRoutes(app);



  // Health check endpoint
  app.get("/api/health", (_req: Request, res: Response) => {
    res.json({ status: "ok", timestamp: new Date().toISOString() });
  });

  // ===== NOTIFICATIONS API (Phase 6) =====
  app.use("/api/notifications", jwtAuth, notificationsRouter);

  // ===== RECORDINGS API (Phase 7) =====
  app.use("/api/recordings", jwtAuth, recordingsRouter);

  // ===== SESSION ANALYTICS API (Phase 8) =====
  app.use("/api/session-analytics", jwtAuth, sessionAnalyticsRouter);

  // ===== READER QUALITY API (Phase 10) =====
  app.use("/api/reader-quality", jwtAuth, readerQualityRouter);

  return httpServer;
}
