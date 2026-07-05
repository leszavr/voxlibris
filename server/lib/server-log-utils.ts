import { logger } from "./logger.js";

export function formatUnknownError(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;

  try {
    return JSON.stringify(error);
  } catch {
    return "Unknown error";
  }
}

export function logServerMessage(message: string, source = "express") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  logger.info(`${formattedTime} [${source}] ${message}`);
}

function isSensitiveKey(key: string): boolean {
  const lowerKey = key.toLowerCase();
  return ["password", "token", "secret", "apikey", "api_key", "accesstoken", "refreshtoken"]
    .some((sensitive) => lowerKey.includes(sensitive));
}

function isLargeDataKey(key: string): boolean {
  const lowerKey = key.toLowerCase();
  return ["coverimage", "image", "avatar", "encryptedcontentkey"]
    .some((large) => lowerKey.includes(large));
}

function maskStringValue(value: string): string {
  if (value.startsWith("data:image/") && value.length > 200) {
    return `[Base64 image: ${value.length} bytes]`;
  }
  if (value.length > 1000) {
    return `${value.substring(0, 100)}... [${value.length} chars total]`;
  }
  return value;
}

export function maskSensitiveData(obj: unknown): unknown {
  if (!obj || typeof obj !== "object") return obj;

  const masked: Record<string, unknown> | unknown[] = Array.isArray(obj) ? [...obj] : { ...(obj as Record<string, unknown>) };

  if (Array.isArray(masked)) {
    return masked.map((item) => (typeof item === "object" && item !== null ? maskSensitiveData(item) : item));
  }

  for (const key in masked) {
    const value = masked[key];
    if (isSensitiveKey(key)) {
      masked[key] = "***";
    } else if (isLargeDataKey(key) && typeof value === "string" && value.length > 100) {
      masked[key] = `[${value.length} bytes]`;
    } else if (typeof value === "string") {
      masked[key] = maskStringValue(value);
    } else if (typeof value === "object" && value !== null) {
      masked[key] = maskSensitiveData(value);
    }
  }

  return masked;
}
