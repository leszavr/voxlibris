import type { Club, ReadingSchedule } from '../../shared/schema.js';

type LegacyScheduleItem = {
  id?: unknown;
  title?: unknown;
  date?: unknown;
  time?: unknown;
  description?: unknown;
  scheduledStart?: unknown;
  scheduledEnd?: unknown;
  estimatedDuration?: unknown;
  reminderMinutes?: unknown;
  status?: unknown;
};

const validStatuses = new Set(['scheduled', 'in_progress', 'completed', 'cancelled']);

function parseDate(value: unknown): Date | null {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value !== 'string' || !value.trim()) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function legacyScheduleDate(item: LegacyScheduleItem): Date | null {
  const scheduledStart = parseDate(item.scheduledStart);
  if (scheduledStart) return scheduledStart;
  if (typeof item.date !== 'string') return null;
  const time = typeof item.time === 'string' && item.time.trim() ? item.time.trim() : '00:00';
  return parseDate(`${item.date}T${time.length === 5 ? `${time}:00` : time}.000Z`);
}

function optionalPositiveInt(value: unknown): number | null {
  const parsed = typeof value === 'number' ? value : typeof value === 'string' ? Number.parseInt(value, 10) : Number.NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function legacyScheduleToCalendar(item: LegacyScheduleItem, club: Pick<Club, 'id' | 'title' | 'ownerId'>): ReadingSchedule | null {
  if (typeof item.id !== 'string' && typeof item.id !== 'number') return null;
  if (typeof item.title !== 'string' || !item.title.trim()) return null;
  const scheduledStart = legacyScheduleDate(item);
  if (!scheduledStart) return null;
  const now = new Date();
  const scheduledEnd = parseDate(item.scheduledEnd);
  const estimatedDuration = optionalPositiveInt(item.estimatedDuration) ?? 60;
  const reminderMinutes = optionalPositiveInt(item.reminderMinutes) ?? 15;
  const status = typeof item.status === 'string' && validStatuses.has(item.status) ? item.status as ReadingSchedule['status'] : 'scheduled';
  return {
    id: String(item.id),
    clubId: club.id,
    bookId: '',
    title: item.title,
    description: typeof item.description === 'string' ? item.description : null,
    scheduledStart,
    scheduledEnd,
    estimatedDuration,
    startChapter: 1,
    startPosition: null,
    endChapter: null,
    endPosition: null,
    status,
    sessionId: null,
    isRecurring: false,
    recurringPattern: null,
    reminderMinutes,
    remindersSent: false,
    calendarSequence: 0,
    actualStart: null,
    actualEnd: null,
    attendeesCount: 0,
    createdBy: club.ownerId,
    createdAt: now,
    updatedAt: now,
  };
}

export function getLegacyClubSchedules(club: Pick<Club, 'id' | 'title' | 'ownerId' | 'schedule'>): ReadingSchedule[] {
  if (!club.schedule) return [];
  try {
    const parsed = JSON.parse(club.schedule) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((item) => legacyScheduleToCalendar(item as LegacyScheduleItem, club))
      .filter((schedule): schedule is ReadingSchedule => Boolean(schedule));
  } catch {
    return [];
  }
}

export function mergeCalendarSchedules(primary: ReadingSchedule[], legacy: ReadingSchedule[]): ReadingSchedule[] {
  const seen = new Set(primary.map((schedule) => schedule.id));
  return [...primary, ...legacy.filter((schedule) => !seen.has(schedule.id))]
    .sort((left, right) => left.scheduledStart.getTime() - right.scheduledStart.getTime());
}
