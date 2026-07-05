import type { Achievement } from '../../shared/schema.js';

export type ConditionValueType = 'number' | 'string' | 'boolean';
export type ConditionsLogic = 'AND' | 'OR';
export type ConditionScalar = boolean | number | string | string[] | null;

export interface AchievementCondition {
  blockCode: string;
  operator: string;
  valueType: ConditionValueType;
  value: unknown;
}

export interface AchievementConditionsPayload {
  logic: ConditionsLogic;
  items: AchievementCondition[];
}

export interface UserGamificationSnapshot {
  userId: string;
  registeredAt: Date;
  userRole: string;
  completedBooksCount: number;
  sentDmCount: number;
  notesCreatedCount: number;
  followingCount: number;
  followersCount: number;
  clubSessionsJoinedCount: number;
  currentStreakDays: number;
  bestStreakDays: number;
  profileCompleted: boolean;
  favoriteGenres: string[];
}

export interface AwardedAchievementSummary {
  achievementId: string;
  code: string;
  titleRu: string;
  iconType: Achievement['iconType'];
  badgeImageUrl: string | null;
}

export interface CheckAndAwardResult {
  checked: number;
  awarded: AwardedAchievementSummary[];
}

export interface UserStreakSummary {
  currentStreakDays: number;
  bestStreakDays: number;
  lastActiveDate: string | null;
}

export interface ReconcileGamificationOptions {
  batchSize?: number;
  maxUsers?: number;
  reason?: string;
}

export interface ReconcileGamificationSummary {
  processedUsers: number;
  checkedAchievements: number;
  awardedCount: number;
  failedUsers: number;
}

export interface NormalizedReconcileOptions {
  batchSize: number;
  maxUsers: number | null;
  reason: string;
}

export interface LiveActivityCounters {
  completedBooksCount: number;
  sentDmCount: number;
  clubSessionsJoinedCount: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function coerceNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string') {
    const parsed = Number(value.trim());
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function coerceBoolean(value: unknown): boolean {
  if (typeof value === 'boolean') {
    return value;
  }

  if (typeof value === 'string') {
    return value.trim().toLowerCase() === 'true';
  }

  return Boolean(value);
}

function coerceString(value: unknown): string {
  if (typeof value === 'string') {
    return value.trim();
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }

  return '';
}

export function normalizeExpectedValue(valueType: ConditionValueType, rawValue: unknown): ConditionScalar | string[] {
  if (valueType === 'number') {
    return coerceNumber(rawValue);
  }

  if (valueType === 'boolean') {
    return coerceBoolean(rawValue);
  }

  if (Array.isArray(rawValue)) {
    return rawValue.map((item) => coerceString(item)).filter(Boolean);
  }

  const normalized = coerceString(rawValue);
  if (normalized.includes(',')) {
    return normalized.split(',').map((item) => item.trim()).filter(Boolean);
  }

  return normalized;
}

export function parseConditionsPayload(payload: unknown): AchievementConditionsPayload {
  const fallback: AchievementConditionsPayload = { logic: 'AND', items: [] };

  if (Array.isArray(payload)) {
    return {
      logic: 'AND',
      items: payload.flatMap((item) => (isRecord(item) ? [parseCondition(item)] : [])),
    };
  }

  if (!isRecord(payload)) {
    return fallback;
  }

  const logic: ConditionsLogic = payload.logic === 'OR' ? 'OR' : 'AND';
  const rawItems = Array.isArray(payload.items) ? payload.items : [];
  return {
    logic,
    items: rawItems.flatMap((item) => (isRecord(item) ? [parseCondition(item)] : [])),
  };
}

function parseCondition(raw: Record<string, unknown>): AchievementCondition {
  return {
    blockCode: typeof raw.blockCode === 'string' ? raw.blockCode : '',
    operator: typeof raw.operator === 'string' ? raw.operator.trim().toUpperCase() : '=',
    valueType:
      raw.valueType === 'string' || raw.valueType === 'boolean'
        ? raw.valueType
        : 'number',
    value: raw.value,
  };
}

export function parseFavoriteGenres(rawValue: string | null): string[] {
  if (!rawValue) {
    return [];
  }

  try {
    const parsed = JSON.parse(rawValue) as unknown;
    if (Array.isArray(parsed)) {
      return parsed
        .filter((item): item is string => typeof item === 'string')
        .map((item) => item.trim())
        .filter(Boolean);
    }
  } catch {
    // ignore invalid JSON and fall back to plain text
  }

  return rawValue
    .split(/[\n,;]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

export function isProfileCompleted(profile: {
  displayName: string | null;
  avatar: string | null;
  bio: string | null;
  favoriteGenres: string | null;
} | null): boolean {
  if (!profile) {
    return false;
  }

  const hasDisplayName = Boolean(profile.displayName?.trim());
  const hasAvatar = Boolean(profile.avatar?.trim());
  const hasBio = Boolean(profile.bio?.trim());
  const hasGenres = parseFavoriteGenres(profile.favoriteGenres).length > 0;

  return hasDisplayName && hasAvatar && hasBio && hasGenres;
}

export function daysSince(date: Date): number {
  const millisecondsPerDay = 24 * 60 * 60 * 1000;
  const diff = Date.now() - date.getTime();
  return diff <= 0 ? 0 : Math.floor(diff / millisecondsPerDay);
}

export function toDateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function toPreviousDateKey(dateKey: string): string {
  const base = new Date(`${dateKey}T00:00:00.000Z`);
  base.setUTCDate(base.getUTCDate() - 1);
  return toDateKey(base);
}

export function compareCondition(actualValue: ConditionScalar, operator: string, expectedValue: ConditionScalar | string[]): boolean {
  if (operator === 'CONTAINS' || operator === 'NOT CONTAINS') {
    return compareContains(actualValue, expectedValue, operator === 'CONTAINS');
  }

  if (operator === 'STARTS WITH') {
    return compareStartsWith(actualValue, expectedValue);
  }

  if (operator === 'ENDS WITH') {
    return compareEndsWith(actualValue, expectedValue);
  }

  if (operator === 'IN' || operator === 'NOT IN') {
    return compareMembership(actualValue, expectedValue, operator === 'IN');
  }

  if (operator === '>' || operator === '<' || operator === '>=' || operator === '<=') {
    return compareNumeric(actualValue, expectedValue, operator);
  }

  if (operator === '!=') {
    return compareEquality(actualValue, expectedValue) === false;
  }

  return compareEquality(actualValue, expectedValue);
}

function compareEquality(actualValue: ConditionScalar, expectedValue: ConditionScalar | string[]): boolean {
  if (Array.isArray(actualValue)) {
    const actualItems = actualValue.map((item) => coerceString(item).toLowerCase()).filter(Boolean);
    if (actualItems.length === 0) {
      return false;
    }

    if (Array.isArray(expectedValue)) {
      const expectedItems = new Set(expectedValue.map((item) => coerceString(item).toLowerCase()).filter(Boolean));
      return actualItems.some((item) => expectedItems.has(item));
    }

    if (typeof expectedValue === 'string') {
      const normalizedExpected = coerceString(expectedValue).toLowerCase();
      return actualItems.some((item) => matchesStringWithWildcard(item, normalizedExpected));
    }

    return false;
  }

  if (Array.isArray(expectedValue)) {
    const actual = coerceString(actualValue).toLowerCase();
    return expectedValue
      .map((item) => coerceString(item).toLowerCase())
      .some((item) => matchesStringWithWildcard(actual, item));
  }

  if (typeof expectedValue === 'number') {
    return coerceNumber(actualValue) === expectedValue;
  }

  if (typeof expectedValue === 'boolean') {
    return coerceBoolean(actualValue) === expectedValue;
  }

  const actual = coerceString(actualValue).toLowerCase();
  const expected = coerceString(expectedValue).toLowerCase();
  return matchesStringWithWildcard(actual, expected);
}

function compareMembership(actualValue: ConditionScalar, expectedValue: ConditionScalar | string[], isPositive: boolean): boolean {
  const expectedItems = Array.isArray(expectedValue)
    ? expectedValue.map((item) => coerceString(item).toLowerCase())
    : [coerceString(expectedValue).toLowerCase()].filter(Boolean);
  const actualItems = Array.isArray(actualValue)
    ? actualValue.map((item) => coerceString(item).toLowerCase()).filter(Boolean)
    : [coerceString(actualValue).toLowerCase()].filter(Boolean);

  const contains = actualItems.some((actual) => expectedItems.some((expected) => matchesStringWithWildcard(actual, expected)));
  return isPositive ? contains : !contains;
}

function matchesStringWithWildcard(actual: string, expected: string): boolean {
  if (!expected) {
    return false;
  }

  if (expected === '*') {
    return actual.length > 0;
  }

  if (expected.includes('*')) {
    const regexEscapePrefix = String.raw`\\`;
    const escaped = expected
      .split('*')
      .map((part) => {
        let value = part;
        const regexSpecialChars = ['\\', '.', '*', '+', '?', '^', '$', '{', '}', '(', ')', '|', '[', ']'];
        for (const specialChar of regexSpecialChars) {
          value = value.replaceAll(specialChar, `${regexEscapePrefix}${specialChar}`);
        }
        return value;
      })
      .join('.*');
    const wildcardRegex = new RegExp(`^${escaped}$`, 'i');
    return wildcardRegex.test(actual);
  }

  return actual === expected;
}

function compareContains(actualValue: ConditionScalar, expectedValue: ConditionScalar | string[], isPositive: boolean): boolean {
  const expectedItems = Array.isArray(expectedValue)
    ? expectedValue.map((item) => coerceString(item).toLowerCase()).filter(Boolean)
    : [coerceString(expectedValue).toLowerCase()].filter(Boolean);
  const actualItems = Array.isArray(actualValue)
    ? actualValue.map((item) => coerceString(item).toLowerCase()).filter(Boolean)
    : [coerceString(actualValue).toLowerCase()].filter(Boolean);

  const contains = actualItems.some((actual) => expectedItems.some((expected) => actual.includes(expected)));
  return isPositive ? contains : !contains;
}

function compareStartsWith(actualValue: ConditionScalar, expectedValue: ConditionScalar | string[]): boolean {
  const expectedItems = Array.isArray(expectedValue)
    ? expectedValue.map((item) => coerceString(item).toLowerCase()).filter(Boolean)
    : [coerceString(expectedValue).toLowerCase()].filter(Boolean);
  const actualItems = Array.isArray(actualValue)
    ? actualValue.map((item) => coerceString(item).toLowerCase()).filter(Boolean)
    : [coerceString(actualValue).toLowerCase()].filter(Boolean);

  return actualItems.some((actual) => expectedItems.some((expected) => actual.startsWith(expected)));
}

function compareEndsWith(actualValue: ConditionScalar, expectedValue: ConditionScalar | string[]): boolean {
  const expectedItems = Array.isArray(expectedValue)
    ? expectedValue.map((item) => coerceString(item).toLowerCase()).filter(Boolean)
    : [coerceString(expectedValue).toLowerCase()].filter(Boolean);
  const actualItems = Array.isArray(actualValue)
    ? actualValue.map((item) => coerceString(item).toLowerCase()).filter(Boolean)
    : [coerceString(actualValue).toLowerCase()].filter(Boolean);

  return actualItems.some((actual) => expectedItems.some((expected) => actual.endsWith(expected)));
}

function compareNumeric(actualValue: ConditionScalar, expectedValue: ConditionScalar | string[], operator: '>' | '<' | '>=' | '<='): boolean {
  const actual = coerceNumber(actualValue);
  const expected = Array.isArray(expectedValue) ? null : coerceNumber(expectedValue);
  if (actual === null || expected === null) {
    return false;
  }

  if (operator === '>') return actual > expected;
  if (operator === '<') return actual < expected;
  if (operator === '>=') return actual >= expected;
  return actual <= expected;
}
