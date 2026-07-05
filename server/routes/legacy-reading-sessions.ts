import type { Express, Request, Response } from "express";
import { storage } from "../repositories/index.js";
import { jwtAuth, requireActiveUser } from "../jwt-middleware.js";
import { isReaderLedClub } from "../lib/reader-club-access.js";
import { sessionAnalyticsService } from "../services/session-analytics-service.js";
import { getIO } from "../lib/socket-registry.js";
import { clearStudioStreamClosureIntent, setStudioStreamClosureIntent } from "../lib/studio-stream-intent-store.js";

export function registerReadingSessionRoutes(app: Express): void {
  // ===== READING SESSIONS API =====

  // Create new reading session (authenticated users only)
  app.post("/api/sessions", jwtAuth, requireActiveUser, async (req: Request, res: Response) => {
    try {
      const user = req.user;
      if (!user) {
        return res.status(401).json({ message: "Пользователь не аутентифицирован" });
      }
      const userId = user.id;
      const { clubId, bookId, title, currentChapter = 1, currentPosition } = req.body;

      if (!clubId || !bookId || !title) {
        return res.status(400).json({
          message: "Обязательные поля: clubId, bookId, title"
        });
      }

      // Verify user is member of the club or is the owner
      const club = await storage.getClub(clubId);
      if (!club) {
        return res.status(404).json({ message: "Клуб не найден" });
      }

      const membership = await storage.getUserClubMembership(clubId, userId);
      const isOwner = club.ownerId === userId && membership?.isActive === true;

      if (!membership?.isActive) {
        return res.status(403).json({ message: "Вы не являетесь участником этого клуба" });
      }

      if (isReaderLedClub(club) && !isOwner) {
        return res.status(403).json({ message: "В клубе чтецов Studio может запускать только владелец клуба" });
      }

      const sessionData = {
        clubId,
        bookId,
        title,
        currentChapter,
        currentPosition,
        readerId: userId
      };

      const session = await storage.createReadingSession(sessionData);

      res.status(201).json({
        message: "Сессия чтения создана",
        session
      });
    } catch (error) {
      console.error("Create reading session error:", error);
      res.status(500).json({ message: "Внутренняя ошибка сервера" });
    }
  });

  // Get reading session by ID
  app.get("/api/sessions/:id", async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const session = await storage.getReadingSession(id);

      if (!session) {
        return res.status(404).json({ message: "Сессия не найдена" });
      }

      res.json({ session });
    } catch (error) {
      console.error("Get reading session error:", error);
      res.status(500).json({ message: "Внутренняя ошибка сервера" });
    }
  });

  // Get active reading sessions in club
  app.get("/api/clubs/:id/sessions", async (req: Request, res: Response) => {
    try {
      const { id: clubId } = req.params;

      // Check if club exists
      const club = await storage.getClub(clubId);
      if (!club) {
        return res.status(404).json({ message: "Клуб не найден" });
      }

      const sessions = await storage.getActiveSessionsInClub(clubId);
      res.json({ sessions });
    } catch (error) {
      console.error("Get club sessions error:", error);
      res.status(500).json({ message: "Внутренняя ошибка сервера" });
    }
  });

  // Get sessions by reader
  app.get("/api/readers/:id/sessions", async (req: Request, res: Response) => {
    try {
      const { id: readerId } = req.params;
      const sessions = await storage.getSessionsByReader(readerId);
      res.json({ sessions });
    } catch (error) {
      console.error("Get reader sessions error:", error);
      res.status(500).json({ message: "Внутренняя ошибка сервера" });
    }
  });

  // Start reading session (reader only)
  app.put("/api/sessions/:id/start", jwtAuth, requireActiveUser, async (req: Request, res: Response) => {
    try {
      const { id: sessionId } = req.params;
      const user = req.user;
      if (!user) {
        return res.status(401).json({ message: "Пользователь не аутентифицирован" });
      }
      const userId = user.id;

      // Verify user is the reader for this session
      const session = await storage.getReadingSession(sessionId);
      if (!session) {
        return res.status(404).json({ message: "Сессия не найдена" });
      }

      if (session.readerId !== userId) {
        return res.status(403).json({ message: "Только чтец может запустить эту сессию" });
      }

      await clearStudioStreamClosureIntent(sessionId);

      const success = await storage.startSession(sessionId);
      if (!success) {
        return res.status(400).json({ message: "Не удалось запустить сессию" });
      }

      const existingAnalytics = await sessionAnalyticsService.getSessionAnalytics(sessionId);
      if (!existingAnalytics) {
        await sessionAnalyticsService.initializeSessionAnalytics(sessionId);
      }

      // Уведомляем чтеца и слушателей что сессия официально в эфире.
      // Чтец может ещё не быть в room (join_session требует isLive=true),
      // поэтому ищем его сокет по userId и добавляем в room + эмитим напрямую.
      try {
        const io = getIO();
        const room = `session_${sessionId}`;
        // Найти все сокеты чтеца и добавить в room
        for (const [, sock] of io.sockets.sockets) {
          const authSock = sock as typeof sock & { userId?: string };
          if (authSock.userId === userId) {
            await authSock.join(room);
          }
        }
        io.to(room).emit("session_started", { sessionId });
      } catch {
        // io может не быть инициализирован в тестах — не критично
      }

      res.json({ message: "Сессия запущена" });
    } catch (error) {
      console.error("Start session error:", error);
      res.status(500).json({ message: "Внутренняя ошибка сервера" });
    }
  });

  // End reading session (reader only)
  app.put("/api/sessions/:id/end", jwtAuth, async (req: Request, res: Response) => {
    try {
      const { id: sessionId } = req.params;
      const user = req.user;
      if (!user) {
        return res.status(401).json({ message: "Пользователь не аутентифицирован" });
      }
      const userId = user.id;

      // Verify user is the reader for this session
      const session = await storage.getReadingSession(sessionId);
      if (!session) {
        return res.status(404).json({ message: "Сессия не найдена" });
      }

      if (session.readerId !== userId) {
        return res.status(403).json({ message: "Только чтец может завершить эту сессию" });
      }

      await setStudioStreamClosureIntent(sessionId, "end");

      const success = await storage.endSession(sessionId);
      if (!success) {
        return res.status(400).json({ message: "Не удалось завершить сессию" });
      }

      const existingAnalytics = await sessionAnalyticsService.getSessionAnalytics(sessionId);
      if (existingAnalytics) {
        await sessionAnalyticsService.finalizeSessionAnalytics(sessionId);
      }

      res.json({ message: "Сессия завершена" });
    } catch (error) {
      console.error("End session error:", error);
      res.status(500).json({ message: "Внутренняя ошибка сервера" });
    }
  });

  // Update reading position (reader only)
  app.put("/api/sessions/:id/position", jwtAuth, async (req: Request, res: Response) => {
    try {
      const { id: sessionId } = req.params;
      const user = req.user;
      if (!user) {
        return res.status(401).json({ message: "Пользователь не аутентифицирован" });
      }
      const userId = user.id;
      const { currentChapter, currentPosition } = req.body;

      if (currentChapter === undefined || !currentPosition) {
        return res.status(400).json({
          message: "Обязательные поля: currentChapter, currentPosition"
        });
      }

      // Verify user is the reader for this session
      const session = await storage.getReadingSession(sessionId);
      if (!session) {
        return res.status(404).json({ message: "Сессия не найдена" });
      }

      if (session.readerId !== userId) {
        return res.status(403).json({ message: "Только чтец может обновлять позицию" });
      }

      const success = await storage.updateSessionPosition(sessionId, currentChapter, currentPosition);
      if (!success) {
        return res.status(400).json({ message: "Не удалось обновить позицию" });
      }

      res.json({ message: "Позиция обновлена" });
    } catch (error) {
      console.error("Update position error:", error);
      res.status(500).json({ message: "Внутренняя ошибка сервера" });
    }
  });

  // Rate reader (listeners only)
  app.post("/api/sessions/:id/rate", jwtAuth, requireActiveUser, async (req: Request, res: Response) => {
    try {
      const { id: sessionId } = req.params;
      const user = req.user;
      if (!user) {
        return res.status(401).json({ message: "Пользователь не аутентифицирован" });
      }
      const userId = user.id;
      const { rating, feedback } = req.body;

      if (!rating || rating < 1 || rating > 5) {
        return res.status(400).json({
          message: "Рейтинг должен быть от 1 до 5"
        });
      }

      // Get session to find reader
      const session = await storage.getReadingSession(sessionId);
      if (!session) {
        return res.status(404).json({ message: "Сессия не найдена" });
      }

      // Prevent self-rating
      if (session.readerId === userId) {
        return res.status(400).json({ message: "Нельзя оценивать самого себя" });
      }

      const ratingData = {
        sessionId,
        readerId: session.readerId,
        raterId: userId,
        rating,
        feedback
      };

      await storage.rateReader(ratingData);
      res.json({ message: "Оценка сохранена" });
    } catch (error) {
      console.error("Rate session error:", error);
      res.status(500).json({ message: "Внутренняя ошибка сервера" });
    }
  });
}
