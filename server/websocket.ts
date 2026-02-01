import { Server as SocketIOServer, Socket } from "socket.io";
import jwt, { type JwtPayload } from "jsonwebtoken";
import { storage } from "./storage.js";
import type { 
  SessionPositionUpdate, 
  ListenerUpdate 
} from "../shared/schema.js";

interface AuthenticatedSocket extends Socket {
  userId?: string;
  currentSession?: string;
  lastReactionTime?: number;
}

// WebSocket connection tracking for security
const userConnections = new Map<string, Set<string>>();
const MAX_CONNECTIONS_PER_USER = 5;
const MAX_TOTAL_CONNECTIONS = 1000;

// Флуд-контроль для реакций (1 реакция/10 сек согласно ТЗ)
const REACTION_COOLDOWN_MS = 10000;

// Helper function to handle leaving current session
async function leaveCurrentSession(socket: AuthenticatedSocket) {
  if (!socket.currentSession || !socket.userId) return;

  try {
    // Remove from session listeners
    await storage.leaveSession(socket.currentSession, socket.userId);
    
    // Notify others in the session
    const listenerUpdate: ListenerUpdate = {
      sessionId: socket.currentSession,
      userId: socket.userId,
      action: 'leave',
      timestamp: new Date().toISOString()
    };

    socket.to(`session_${socket.currentSession}`).emit("listener_update", listenerUpdate);
    
    // Leave socket room
    await socket.leave(`session_${socket.currentSession}`);
    
    console.log(`User ${socket.userId} left session ${socket.currentSession}`);
    socket.currentSession = undefined;
  } catch (error) {
    console.error("Error leaving session:", error);
  }
}

export function setupWebSocketHandlers(io: SocketIOServer) {
  console.log('[WebSocket] Setting up main WebSocket handlers...');
  
  // Authentication middleware for WebSocket connections with connection limits
  io.use(async (socket: AuthenticatedSocket, next) => {
    try {
      console.log('[WebSocket] New connection attempt');

      // Check total connection limit
      const totalConnections = io.sockets.sockets.size;
      if (totalConnections >= MAX_TOTAL_CONNECTIONS) {
        console.warn('[WebSocket] Connection limit reached:', totalConnections);
        return next(new Error("Server connection limit reached"));
      }

      // Extract JWT token from multiple sources (same as chat WebSocket)
      const token =
        (socket.handshake.auth && (socket.handshake.auth as any).token) ||
        socket.handshake.headers.authorization?.replace("Bearer ", "") ||
        socket.handshake.headers.cookie?.match(/accessToken=([^;]+)/)?.[1];

      console.log('[WebSocket] Token found:', !!token);

      if (!token) {
        console.error('[WebSocket] ❌ No authentication token provided');
        return next(new Error("Authentication token required"));
      }

      // Verify JWT token
      const secret = process.env.JWT_SECRET;
      if (!secret) {
        console.error('[WebSocket] ❌ JWT_SECRET not configured');
        return next(new Error("JWT_SECRET not configured"));
      }

      const decoded = jwt.verify(token, secret) as JwtPayload & {
        userId: string;
        username: string;
        role: string;
        status?: string;
      };

      console.log('[WebSocket] Token decoded, userId:', decoded.userId);

      if (!decoded.userId) {
        console.error('[WebSocket] ❌ Invalid token payload');
        return next(new Error("Invalid token payload"));
      }

      const userId = decoded.userId;

      // Check per-user connection limit
      const userConnectionCount = userConnections.get(userId)?.size || 0;
      if (userConnectionCount >= MAX_CONNECTIONS_PER_USER) {
        console.warn(`[WebSocket] ❌ User connection limit reached for ${userId}:`, userConnectionCount);
        return next(new Error("Too many connections"));
      }

      console.log('[WebSocket] Fetching user from database:', userId);

      // Verify user exists in database
      const user = await storage.getUser(userId);
      
      console.log('[WebSocket] User fetch result:', user ? 'found' : 'not found');
      
      if (!user) {
        console.error('[WebSocket] ❌ User not found:', userId);
        return next(new Error("User not found"));
      }

      socket.userId = userId;
      console.log('[WebSocket] ✅ Authenticated for user:', userId);
      next();
    } catch (error) {
      if (error instanceof jwt.TokenExpiredError) {
        console.error('[WebSocket] ❌ Token expired');
        return next(new Error("Token expired"));
      }
      if (error instanceof jwt.JsonWebTokenError) {
        console.error('[WebSocket] ❌ Invalid token:', error.message);
        return next(new Error("Invalid token"));
      }
      console.error('[WebSocket] ❌ Authentication exception:', error);
      console.error('[WebSocket] Error stack:', error instanceof Error ? error.stack : 'No stack');
      next(new Error("Authentication failed"));
    }
  });

  io.on("connection", (socket: AuthenticatedSocket) => {
    console.log(`User ${socket.userId} connected to WebSocket`);

    // Track connection for security
    if (socket.userId) {
      const userSockets = userConnections.get(socket.userId) || new Set();
      userSockets.add(socket.id);
      userConnections.set(socket.userId, userSockets);
    }

    // Cleanup on disconnect
    socket.on("disconnect", () => {
      if (socket.userId) {
        const userSockets = userConnections.get(socket.userId);
        if (userSockets) {
          userSockets.delete(socket.id);
          if (userSockets.size === 0) {
            userConnections.delete(socket.userId);
          }
        }
      }
    });

    // Join a reading session room
    socket.on("join_session", async (sessionId: string) => {
      try {
        if (!socket.userId) {
          socket.emit("error", { message: "User not authenticated" });
          return;
        }

        // Verify session exists and is active
        const session = await storage.getReadingSession(sessionId);
        if (session?.isLive !== true) {
          socket.emit("error", { message: "Session not found or not active" });
          return;
        }

        // Join the session as a listener
        await storage.joinSession(sessionId, socket.userId);
        
        // Join socket room
        await socket.join(`session_${sessionId}`);
        socket.currentSession = sessionId;

        // Notify others in the session
        const listenerUpdate: ListenerUpdate = {
          sessionId,
          userId: socket.userId,
          action: 'join',
          timestamp: new Date().toISOString()
        };

        socket.to(`session_${sessionId}`).emit("listener_update", listenerUpdate);
        
        // Send current session state to the new listener
        const listenerCount = await storage.getActiveListenersCount(sessionId);
        socket.emit("session_joined", {
          sessionId,
          currentChapter: session.currentChapter,
          currentPosition: session.currentPosition,
          listenerCount
        });

        console.log(`User ${socket.userId} joined session ${sessionId}`);
      } catch (error) {
        console.error("Error joining session:", error);
        socket.emit("error", { message: "Failed to join session" });
      }
    });

    // Leave current session
    socket.on("leave_session", async () => {
      if (socket.currentSession && socket.userId) {
        await leaveCurrentSession(socket);
      }
    });

    // Reader starts a session
    socket.on("start_session", async (data: { bookId: string; chapterNumber: number; clubId: string }) => {
      try {
        if (!socket.userId) {
          socket.emit("error", { message: "User not authenticated" });
          return;
        }

        // Create new reading session
        const session = await storage.createReadingSession({
          readerId: socket.userId,
          clubId: data.clubId,
          bookId: data.bookId,
          currentChapter: data.chapterNumber,
          currentPosition: "0",
          title: `Reading Session - Chapter ${data.chapterNumber}`
        });

        await socket.join(`session_${session.id}`);
        socket.currentSession = session.id;

        socket.emit("session_started", {
          sessionId: session.id,
          bookId: data.bookId,
          currentChapter: data.chapterNumber
        });

        console.log(`User ${socket.userId} started session ${session.id}`);
      } catch (error) {
        console.error("Error starting session:", error);
        socket.emit("error", { message: "Failed to start session" });
      }
    });

    // Reader updates position in session
    socket.on("position_update", async (data: SessionPositionUpdate) => {
      try {
        if (!socket.userId || !socket.currentSession) {
          socket.emit("error", { message: "No active session" });
          return;
        }

        // Update session position
        await storage.updateSessionPosition(
          socket.currentSession,
          data.currentChapter,
          data.currentPosition
        );

        // Broadcast to all listeners in the session
        socket.to(`session_${socket.currentSession}`).emit("position_update", {
          sessionId: socket.currentSession,
          currentChapter: data.currentChapter,
          currentPosition: data.currentPosition,
          timestamp: new Date().toISOString()
        });

        console.log(`Position updated in session ${socket.currentSession}: Chapter ${data.currentChapter}, Position ${data.currentPosition}`);
      } catch (error) {
        console.error("Error updating position:", error);
        socket.emit("error", { message: "Failed to update position" });
      }
    });

    // End session
    socket.on("end_session", async () => {
      try {
        if (!socket.userId || !socket.currentSession) {
          socket.emit("error", { message: "No active session" });
          return;
        }

        // Mark session as ended
        await storage.endSession(socket.currentSession);
        
        // Notify all listeners
        socket.to(`session_${socket.currentSession}`).emit("session_ended", {
          sessionId: socket.currentSession,
          endedBy: socket.userId,
          timestamp: new Date().toISOString()
        });

        console.log(`Session ${socket.currentSession} ended by ${socket.userId}`);
        socket.currentSession = undefined;
      } catch (error) {
        console.error("Error ending session:", error);
        socket.emit("error", { message: "Failed to end session" });
      }
    });

    // Rate reader after session
    socket.on("rate_reader", async (data: { sessionId: string; readerId: string; rating: number }) => {
      try {
        if (!socket.userId) {
          socket.emit("error", { message: "User not authenticated" });
          return;
        }

        if (data.rating < 1 || data.rating > 5) {
          socket.emit("error", { message: "Rating must be between 1 and 5" });
          return;
        }

        // Save rating
        await storage.rateReader({
          sessionId: data.sessionId,
          readerId: data.readerId,
          raterId: socket.userId,
          rating: data.rating
        });

        // Rating calculation handled internally by storage

        // Notify the reader about the new rating
        socket.emit("rating_submitted", { 
          sessionId: data.sessionId,
          rating: data.rating 
        });

        console.log(`User ${socket.userId} rated reader ${data.readerId}: ${data.rating} stars`);
      } catch (error) {
        console.error("Error submitting rating:", error);
        socket.emit("error", { message: "Failed to submit rating" });
      }
    });

    // Отправка реакции (флуд-контроль 1 реакция/10 сек)
    socket.on("send_reaction", async (data: { sessionId: string; type: string; timestamp: number }) => {
      try {
        if (!socket.userId) {
          socket.emit("error", { message: "User not authenticated" });
          return;
        }

        // Проверка флуд-контроля
        const now = Date.now();
        if (socket.lastReactionTime && (now - socket.lastReactionTime) < REACTION_COOLDOWN_MS) {
          socket.emit("error", { message: "Please wait before sending another reaction" });
          return;
        }

        // Проверка что сессия активна
        const session = await storage.getReadingSession(data.sessionId);
        if (!session?.isLive) {
          socket.emit("error", { message: "Session not active" });
          return;
        }

        socket.lastReactionTime = now;

        // Отправляем реакцию всем в сессии (включая чтеца)
        io.to(`session_${data.sessionId}`).emit("reaction_received", {
          type: data.type,
          userId: socket.userId,
          timestamp: data.timestamp
        });

        console.log(`User ${socket.userId} sent reaction ${data.type} to session ${data.sessionId}`);
      } catch (error) {
        console.error("Error sending reaction:", error);
        socket.emit("error", { message: "Failed to send reaction" });
      }
    });

    // Присоединение к аудио сессии
    socket.on("join_audio_session", async (data: { sessionId: string }) => {
      try {
        if (!socket.userId) {
          socket.emit("error", { message: "User not authenticated" });
          return;
        }

        await socket.join(`audio_${data.sessionId}`);
        console.log(`User ${socket.userId} joined audio session ${data.sessionId}`);
      } catch (error) {
        console.error("Error joining audio session:", error);
        socket.emit("error", { message: "Failed to join audio session" });
      }
    });

    // Получение аудио чанка от чтеца
    socket.on("audio_chunk", async (data: { sessionId: string; data: any }) => {
      try {
        if (!socket.userId) return;

        // Ретранслируем аудио всем слушателям в сессии
        socket.to(`audio_${data.sessionId}`).emit("audio_stream", {
          data: data.data,
          timestamp: Date.now()
        });
      } catch (error) {
        console.error("Error handling audio chunk:", error);
      }
    });

    // Уведомление о mute микрофона
    socket.on("audio_muted", async (data: { sessionId: string; muted: boolean }) => {
      try {
        if (!socket.userId) return;

        // Уведомляем всех слушателей
        socket.to(`session_${data.sessionId}`).emit("reader_muted", {
          muted: data.muted,
          timestamp: Date.now()
        });
      } catch (error) {
        console.error("Error handling audio mute:", error);
      }
    });

    // Handle disconnect
    socket.on("disconnect", async (reason) => {
      console.log(`User ${socket.userId} disconnected: ${reason}`);
      
      if (socket.currentSession && socket.userId) {
        await leaveCurrentSession(socket);
      }
    });
  });

  console.log('[WebSocket] ✅ Main WebSocket handlers setup complete');
  return io;
}