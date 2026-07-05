import type { Server as HttpServer } from "node:http";
import { Server as SocketIOServer } from "socket.io";
import jwt, { type JwtPayload } from "jsonwebtoken";
import { registerIO } from "./socket-registry.js";

export function createMainSocketServer(httpServer: HttpServer, allowedOrigins: string[]) {
  const io = new SocketIOServer(httpServer, {
    cors: {
      origin: allowedOrigins,
      methods: ["GET", "POST"],
      credentials: true,
    },
    transports: ["websocket", "polling"],
  });

  registerIO(io);

  io.use((socket, next) => {
    try {
      const auth = socket.handshake.auth as Record<string, unknown> | undefined;
      const token =
        (typeof auth?.token === "string" ? auth.token : undefined) ||
        socket.handshake.headers.authorization?.replace("Bearer ", "") ||
        /accessToken=([^;]+)/.exec(socket.handshake.headers.cookie ?? "")?.[1];

      if (token && process.env.JWT_SECRET) {
        const decoded = jwt.verify(token, process.env.JWT_SECRET) as JwtPayload & { userId?: string };
        if (decoded.userId) socket.data.userId = decoded.userId;
      }
    } catch {
      // Optional auth: anonymous sockets are allowed.
    }
    next();
  });

  io.on("connection", (socket) => {
    socket.on("join_user_room", (userId: unknown) => {
      if (typeof userId === "string" && userId.length > 0 && userId.length < 64) {
        void socket.join(`user:${userId}`);
      }
    });
  });

  return io;
}
