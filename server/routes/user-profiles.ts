import type { Express, Request, Response } from "express";
import { storage } from "../repositories/index.js";
import { jwtAuth } from "../jwt-middleware.js";
import { logger } from "../lib/logger.js";
import { storeOptimizedImageIfNeeded } from "../lib/uploaded-image-storage.js";
import { gamificationService } from "../services/gamification-service.js";
import { normalizeFavoriteGenresInput } from "./helpers.js";

export function registerUserProfileRoutes(app: Express): void {
  // ===== USER PROFILES API =====

  // Search users — делегировано server/routes/users.ts (optionalJwtAuth, FTS, тип all|readers|listeners)

  // Get current user profile
  app.get("/api/users/current/profile", jwtAuth, async (req: Request, res: Response) => {
    try {
      const currentUser = req.user;
      if (!currentUser) {
        return res.status(401).json({ message: "Пользователь не аутентифицирован" });
      }
      logger.debug({ userId: currentUser.id }, "Getting profile for user");
      
      let profile = await storage.getUserProfile(currentUser.id);
      logger.debug({ profile }, "Profile found");

      // Создаем профиль если не существует
      if (!profile) {
        logger.debug({ userId: currentUser.id }, "Creating new profile for user");
        profile = await storage.createOrUpdateUserProfile(currentUser.id, {
          displayName: currentUser.username,
          isReader: false
        });
        logger.debug({ profile }, "Profile created");
      }

      if (!profile) {
        console.error("Failed to create profile for user:", currentUser.id);
        return res.status(404).json({ message: "Профиль не найден" });
      }

      res.json({ profile });
    } catch (error) {
      console.error("Get current user profile error:", error);
      res.status(500).json({ message: "Внутренняя ошибка сервера" });
    }
  });

  // Get user profile
  app.get("/api/users/:id/profile", async (req: Request, res: Response) => {
    try {
      const { id: userId } = req.params;

      // Проверяем, что пользователь существует
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ message: "Пользователь не найден" });
      }

      let profile = await storage.getUserProfile(userId);

      // Создаем профиль если не существует
      profile ??= await storage.createOrUpdateUserProfile(userId, {
        displayName: user.username,
        isReader: false
      });

      if (!profile) {
        return res.status(404).json({ message: "Профиль не найден" });
      }

      res.json({ profile });
    } catch (error) {
      console.error("Get user profile error:", error);
      res.status(500).json({ message: "Внутренняя ошибка сервера" });
    }
  });

  // Update current user profile
  app.put("/api/users/current/profile", jwtAuth, async (req: Request, res: Response) => {
    try {
      const currentUser = req.user;
      if (!currentUser) {
        return res.status(401).json({ message: "Пользователь не аутентифицирован" });
      }

      const isReader = req.body.isReader;
      const displayName = typeof req.body.displayName === 'string' ? req.body.displayName.trim() : null;
      const bio = typeof req.body.bio === 'string' ? req.body.bio.trim() : null;
      const hasProfileQuote = Object.hasOwn(req.body, 'profileQuote');
      const hasProfileQuoteAuthor = Object.hasOwn(req.body, 'profileQuoteAuthor');
      const profileQuote = typeof req.body.profileQuote === 'string' ? req.body.profileQuote.trim() : null;
      const profileQuoteAuthor = typeof req.body.profileQuoteAuthor === 'string' ? req.body.profileQuoteAuthor.trim() : null;
      const favoriteGenres = normalizeFavoriteGenresInput(req.body.favoriteGenres ?? req.body.favorite_genres);
      const avatar = await storeOptimizedImageIfNeeded(req.body.avatar, {
        type: "avatar",
        keyPrefix: `avatars/${currentUser.id}`,
        filenamePrefix: "avatar",
      });
      const coverImage = await storeOptimizedImageIfNeeded(req.body.coverImage, {
        type: "background",
        keyPrefix: `profiles/${currentUser.id}`,
        filenamePrefix: "cover",
      });

      const profileData: {
        displayName: string | null;
        avatar: string | null;
        coverImage: string | null;
        bio: string | null;
        profileQuote?: string | null;
        profileQuoteAuthor?: string | null;
        isReader: boolean;
        favoriteGenres?: string | null;
      } = {
        displayName,
        avatar: avatar ?? null,
        coverImage: coverImage ?? null,
        bio,
        isReader: Boolean(isReader),
      };
      if (hasProfileQuote) {
        profileData.profileQuote = profileQuote || null;
      }
      if (hasProfileQuoteAuthor) {
        profileData.profileQuoteAuthor = profileQuoteAuthor || null;
      }
      if (favoriteGenres !== undefined) {
        profileData.favoriteGenres = favoriteGenres;
      }

      const profile = await storage.createOrUpdateUserProfile(currentUser.id, profileData);

      gamificationService.syncUserStateAndAward(currentUser.id, 'profile_updated').catch((err) => {
        logger.warn({ err, userId: currentUser.id }, '[gamification] current profile sync failed');
      });

      res.json({
        message: "Профиль обновлен",
        profile
      });
    } catch (error) {
      console.error("Update current user profile error:", error);
      res.status(500).json({ message: "Внутренняя ошибка сервера" });
    }
  });

  // Update user profile (user only)
  app.put("/api/users/:id/profile", jwtAuth, async (req: Request, res: Response) => {
    try {
      const { id: profileUserId } = req.params;
      const currentUser = req.user;
      if (!currentUser) {
        return res.status(401).json({ message: "Пользователь не аутентифицирован" });
      }

      // Users can only update their own profile (unless admin)
      if (currentUser.id !== profileUserId && currentUser.role !== 'admin') {
        return res.status(403).json({ message: "Недостаточно прав" });
      }

      const isReader = req.body.isReader;
      const displayName = typeof req.body.displayName === 'string' ? req.body.displayName.trim() : null;
      const bio = typeof req.body.bio === 'string' ? req.body.bio.trim() : null;
      const hasProfileQuote = Object.hasOwn(req.body, 'profileQuote');
      const hasProfileQuoteAuthor = Object.hasOwn(req.body, 'profileQuoteAuthor');
      const profileQuote = typeof req.body.profileQuote === 'string' ? req.body.profileQuote.trim() : null;
      const profileQuoteAuthor = typeof req.body.profileQuoteAuthor === 'string' ? req.body.profileQuoteAuthor.trim() : null;
      const favoriteGenres = normalizeFavoriteGenresInput(req.body.favoriteGenres ?? req.body.favorite_genres);
      const avatar = await storeOptimizedImageIfNeeded(req.body.avatar, {
        type: "avatar",
        keyPrefix: `avatars/${profileUserId}`,
        filenamePrefix: "avatar",
      });
      const coverImage = await storeOptimizedImageIfNeeded(req.body.coverImage, {
        type: "background",
        keyPrefix: `profiles/${profileUserId}`,
        filenamePrefix: "cover",
      });

      const profileData: {
        displayName: string | null;
        avatar: string | null;
        coverImage: string | null;
        bio: string | null;
        profileQuote?: string | null;
        profileQuoteAuthor?: string | null;
        isReader: boolean;
        favoriteGenres?: string | null;
      } = {
        displayName,
        avatar: avatar ?? null,
        coverImage: coverImage ?? null,
        bio,
        isReader: Boolean(isReader),
      };
      if (hasProfileQuote) {
        profileData.profileQuote = profileQuote || null;
      }
      if (hasProfileQuoteAuthor) {
        profileData.profileQuoteAuthor = profileQuoteAuthor || null;
      }
      if (favoriteGenres !== undefined) {
        profileData.favoriteGenres = favoriteGenres;
      }

      const profile = await storage.createOrUpdateUserProfile(profileUserId, profileData);

      gamificationService.syncUserStateAndAward(profileUserId, 'profile_updated').catch((err) => {
        logger.warn({ err, userId: profileUserId }, '[gamification] profile sync failed');
      });

      res.json({
        message: "Профиль обновлен",
        profile
      });
    } catch (error) {
      console.error("Update user profile error:", error);
      res.status(500).json({ message: "Внутренняя ошибка сервера" });
    }
  });

  // Get current user clubs
  app.get("/api/users/current/clubs", jwtAuth, async (req: Request, res: Response) => {
    try {
      const currentUser = req.user;
      if (!currentUser) {
        return res.status(401).json({ message: "Пользователь не аутентифицирован" });
      }
      const userClubs = await storage.getClubsByUser(currentUser.id);
      res.json(userClubs);
    } catch (error) {
      console.error("Get current user clubs error:", error);
      res.status(500).json({ message: "Внутренняя ошибка сервера" });
    }
  });

  // Get current user books
  app.get("/api/users/current/books", jwtAuth, async (req: Request, res: Response) => {
    try {
      const currentUser = req.user;
      if (!currentUser) {
        return res.status(401).json({ message: "Пользователь не аутентифицирован" });
      }
      const userBooks = await storage.getPersonalBooksByUser(currentUser.id);
      res.json(userBooks);
    } catch (error) {
      console.error("Get current user books error:", error);
      res.status(500).json({ message: "Внутренняя ошибка сервера" });
    }
  });

  // Get user books
  app.get("/api/users/:id/books", jwtAuth, async (req: Request, res: Response) => {
    try {
      const { id: userId } = req.params;
      const currentUser = req.user;
      if (!currentUser) {
        return res.status(401).json({ message: "Пользователь не аутентифицирован" });
      }

      if (currentUser.id !== userId && currentUser.role !== 'admin') {
        return res.status(403).json({ message: "Недостаточно прав" });
      }

      const userBooks = await storage.getPersonalBooksByUser(userId);
      res.json(userBooks);
    } catch (error) {
      console.error("Get user books error:", error);
      res.status(500).json({ message: "Внутренняя ошибка сервера" });
    }
  });

  // Get user clubs
  app.get("/api/users/:id/clubs", async (req: Request, res: Response) => {
    try {
      const { id: userId } = req.params;
      
      const userClubs = await storage.getClubsByUser(userId);

      // getClubsByUser уже возвращает ClubWithDetails[], не нужно дополнительно обогащать
      res.json(userClubs);
    } catch (error) {
      console.error("Get user clubs error:", error);
      res.status(500).json({ message: "Внутренняя ошибка сервера" });
    }
  });

  // Update reading progress
  app.put("/api/progress", jwtAuth, async (req: Request, res: Response) => {
    logger.debug('[Progress] === Начало обработки PUT /api/progress ===');
      logger.debug({ user: req.user }, '[Progress] req.user');
      logger.debug({ body: req.body }, '[Progress] req.body');
      
      try {
        const currentUser = req.user;
        if (!currentUser) {
          return res.status(401).json({ message: "Пользователь не аутентифицирован" });
        }
        const userId = currentUser.id;
        const { bookId, clubId, currentChapter, currentPosition, progress } = req.body;

      logger.debug({ userId, bookId, clubId, currentChapter, currentPosition, progress }, '[Progress] Извлечённые данные');

      if (!bookId || currentChapter === undefined || progress === undefined) {
        logger.debug('[Progress] Валидация не прошла - отсутствуют обязательные поля');
        return res.status(400).json({
          message: "Обязательные поля: bookId, currentChapter, progress"
        });
      }

      const progressData = {
        userId,
        bookId,
        clubId,
        currentChapter,
        currentPosition,
        progress
      };

      logger.debug({ progressData }, '[Progress] Вызов storage.updateReadingProgress с данными');
      const updatedProgress = await storage.updateReadingProgress(progressData);
      logger.debug({ updatedProgress }, '[Progress] Успешно обновлено');

      // Если прогресс достиг 100% (или почти), добавляем в историю
      if (progress >= 99) {
        try {
          // Проверяем, не добавлена ли уже книга в историю
          const existingHistory = await storage.getReadingHistory(userId);
          const alreadyInHistory = existingHistory.some((h) => h.bookId === bookId);

          if (!alreadyInHistory) {
            // Получаем данные о книге из personal_books
            const bookData = await storage.getPersonalBook(bookId);
            
            if (bookData) {
              await storage.addCompletedToHistory(
                userId,
                bookId,
                bookData.title,
                bookData.author,
                bookData.coverUrl || undefined
              );
              logger.debug(`[Progress] Книга "${bookData.title}" добавлена в историю`);
            }
          }
        } catch (historyError) {
          console.error('[Progress] Ошибка добавления в историю:', historyError);
        }
      }

      res.json({
        message: "Прогресс обновлен",
        progress: updatedProgress
      });
    } catch (error) {
      console.error("[Progress] КРИТИЧЕСКАЯ ОШИБКА:", error);
      console.error("[Progress] Stack trace:", error instanceof Error ? error.stack : 'Нет stack trace');
      res.status(500).json({ message: "Внутренняя ошибка сервера" });
    }
  });

  // Get user reading progress for a book
  app.get("/api/progress/:bookId", jwtAuth, async (req: Request, res: Response) => {
    try {
      const { bookId } = req.params;
      const currentUser = req.user;
      if (!currentUser) {
        return res.status(401).json({ message: "Пользователь не аутентифицирован" });
      }
      const userId = currentUser.id;

      const progress = await storage.getUserReadingProgress(userId, bookId);

      if (!progress) {
        return res.status(404).json({ message: "Прогресс не найден" });
      }

      res.json({ progress });
    } catch (error) {
      console.error("Get reading progress error:", error);
      res.status(500).json({ message: "Внутренняя ошибка сервера" });
    }
  });
}
