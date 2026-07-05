import type { Request } from "express";
import multer from "multer";
import { and, eq, sql } from "drizzle-orm";
import { db } from "../db.js";
import { logger } from "../lib/logger.js";
import { storage } from "../repositories/index.js";
import { analyticsEvents, clubMembers, type InsertAnalyticsEvent } from "../../shared/schema.js";

export async function findInvitationByToken(token: string) {
  if (!token) return undefined;

  let invitation = await storage.getClubInvitation(token);
  if (invitation) return invitation;

  try {
    const decoded = decodeURIComponent(token);
    if (decoded && decoded !== token) {
      invitation = await storage.getClubInvitation(decoded);
      if (invitation) return invitation;
    }
  } catch (err) {
    logger.warn({ err }, "Failed to decode invite token");
  }

  const lower = token.toLowerCase();
  if (lower !== token) {
    invitation = await storage.getClubInvitation(lower);
    if (invitation) return invitation;
  }

  return undefined;
}

export async function countActiveClubMembersForEntitlement(clubId: string) {
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(clubMembers)
    .where(and(eq(clubMembers.clubId, clubId), eq(clubMembers.isActive, true)));

  return row?.count ?? 0;
}

export function normalizeFavoriteGenresInput(input: unknown): string | null | undefined {
  if (input === undefined) return undefined;
  if (input === null) return null;

  let rawValue = "";
  if (Array.isArray(input)) {
    rawValue = input.filter((item): item is string => typeof item === "string").join(",");
  } else if (typeof input === "string") {
    rawValue = input;
  }

  const normalized = rawValue
    .split(/[,;\n]+/u)
    .map((genre) => genre.trim())
    .filter(Boolean);

  return normalized.length === 0 ? null : Array.from(new Set(normalized)).join(", ");
}

export const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 50 * 1024 * 1024,
    files: 1,
  },
  fileFilter: (_req, file, cb) => {
    const allowedMimeTypes = ["application/epub+zip", "application/x-fictionbook+xml"];
    const allowedExtensions = [".epub", ".fb2"];

    if (!allowedExtensions.some((ext) => file.originalname.toLowerCase().endsWith(ext))) {
      return cb(new Error("Invalid file extension. Only EPUB and FB2 files are allowed."));
    }

    if (!allowedMimeTypes.includes(file.mimetype)) {
      return cb(new Error(`Invalid MIME type: ${file.mimetype}`));
    }

    cb(null, true);
  },
});

export function validateStoragePath(path: string): { valid: boolean; normalizedPath?: string } {
  if (!path || typeof path !== "string") return { valid: false };

  const normalizedPath = path.startsWith("/") ? path.slice(1) : path;
  logger.debug(`[validateStoragePath] Original path: "${path}", Normalized: "${normalizedPath}"`);

  const dangerousPatterns = [/\.\./, /\\/, /\0/];
  for (const pattern of dangerousPatterns) {
    if (pattern.test(normalizedPath)) {
      logger.debug(`[validateStoragePath] Failed dangerous pattern: ${pattern}`);
      return { valid: false };
    }
  }

  if (normalizedPath.length > 255) {
    logger.debug(`[validateStoragePath] Failed length check: ${normalizedPath.length}`);
    return { valid: false };
  }

  const allowedPatterns = [
    /^covers\/[a-zA-Z0-9-]+\.(jpg|jpeg|png|webp)$/,
    /^covers\/(club|personal)\/[a-fA-F0-9-]+\/[a-fA-F0-9-]+-cover\.(jpg|jpeg|png|webp)$/,
    /^covers\/(club|personal)\/[a-fA-F0-9-]+\/manual\/[a-fA-F0-9-]+-[a-fA-F0-9-]+\.(jpg|jpeg|png|webp)$/,
    /^books\/[a-fA-F0-9-]+\/content\.(epub|fb2|html)$/,
    /^avatars\/[a-zA-Z0-9-]+\.(jpg|jpeg|png|webp)$/,
    /^avatars\/[a-fA-F0-9-]+\/[a-zA-Z0-9_-]+-[a-fA-F0-9-]+\.(jpg|jpeg|png|webp)$/,
    /^profiles\/[a-fA-F0-9-]+\/[a-zA-Z0-9_-]+-[a-fA-F0-9-]+\.(jpg|jpeg|png|webp)$/,
    /^gamification\/reward-assets\/[a-zA-Z0-9_-]+-[a-fA-F0-9-]+\.(jpg|jpeg|png|webp)$/,
    /^gamification\/achievements\/[a-zA-Z0-9_-]+-[a-fA-F0-9-]+\.(jpg|jpeg|png|webp)$/,
    /^clubs\/[a-fA-F0-9-]+\/[a-zA-Z0-9_-]+-[a-fA-F0-9-]+\.(jpg|jpeg|png|webp)$/,
  ];

  const isAllowed = allowedPatterns.some((pattern) => {
    const matches = pattern.test(normalizedPath);
    logger.debug(`[validateStoragePath] Testing pattern ${pattern} against "${normalizedPath}": ${matches}`);
    return matches;
  });

  logger.debug(`[validateStoragePath] Final result: ${isAllowed}`);
  return { valid: isAllowed, normalizedPath: isAllowed ? normalizedPath : undefined };
}

export async function recordAnalyticsEvent(
  req: Request,
  payload: Omit<InsertAnalyticsEvent, "userId" | "ipAddress" | "userAgent" | "metadata"> & { metadata?: Record<string, unknown> },
) {
  try {
    const eventData: InsertAnalyticsEvent = {
      ...payload,
      userId: req.user?.id ?? null,
      metadata: payload.metadata ? JSON.stringify(payload.metadata) : null,
      ipAddress: (req.headers["x-forwarded-for"] as string)?.split(",")[0] || req.socket.remoteAddress || null,
      userAgent: req.headers["user-agent"] || null,
    };

    await db.insert(analyticsEvents).values(eventData);
  } catch (error) {
    logger.warn({ error, payload }, "[Analytics] Failed to record event in routes.ts");
  }
}
