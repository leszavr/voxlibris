import { useState } from "react";
import type { FollowUser } from "@/api/social";
import type { PersonalBook } from "@/hooks/use-books-v2";
import type { ReadingStatusRecord, RecommendationPayload } from "./types";

const RECOMMEND_PREFIX = "[RECOMMEND]";

export const SHELF_PAGE_SIZE = 9;

export function encodeRecommendationPayload(payload: RecommendationPayload): string {
  return `${RECOMMEND_PREFIX}${JSON.stringify(payload)}`;
}

export async function loadAllFollowUsers(
  loader: (userId: string, limit: number, cursor?: string) => Promise<{ users: FollowUser[]; nextCursor: string | null }>,
  userId: string,
): Promise<FollowUser[]> {
  const all: FollowUser[] = [];
  let cursor: string | undefined;

  while (true) {
    const page = await loader(userId, 50, cursor);
    all.push(...page.users);
    if (!page.nextCursor) break;
    cursor = page.nextCursor;
  }

  return all;
}

export function isShelvedCompletedStatus(item: ReadingStatusRecord): boolean {
  if (item.bookType !== "personal" || item.status !== "completed") return false;
  if (!item.notes) return false;

  try {
    const parsed = JSON.parse(item.notes) as { shelved?: boolean };
    return parsed.shelved === true;
  } catch {
    return false;
  }
}

export function generateDeleteCode(): string {
  return String(Math.floor(100000 + Math.random() * 900000));
}

export function getPersonalBookFormatLabel(book: PersonalBook): string {
  if (book.format === "EPUB") return "EPUB";
  if (book.format === "FB2") return "FB2";
  return "Книга";
}

function getLocalStorageValue<T>(key: string, fallback: T): T {
  if (globalThis.window === undefined) return fallback;
  try {
    const value = globalThis.window.localStorage.getItem(key);
    if (value === null) return fallback;
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function setLocalStorageValue<T>(key: string, value: T): void {
  if (globalThis.window === undefined) return;
  try {
    globalThis.window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // localStorage can be unavailable in private mode or denied by browser settings.
  }
}

export function useLocalStorageState<T>(key: string, fallback: T): readonly [T, (value: T) => void] {
  const [value, setValue] = useState<T>(() => getLocalStorageValue(key, fallback));

  const setPersistedValue = (nextValue: T) => {
    setValue(nextValue);
    setLocalStorageValue(key, nextValue);
  };

  return [value, setPersistedValue] as const;
}

export function serializeHistoryCompletedAt(value: Date | string | null | undefined): string {
  if (!value) return "";
  return value instanceof Date ? value.toISOString() : value;
}
