import type { Club, ReadingSchedule } from '../../shared/schema.js';

export type CalendarEventContext = {
  club?: Pick<Club, 'id' | 'title'>;
  baseUrl?: string;
};

function formatIcsDate(date: Date): string {
  return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
}

function escapeIcsText(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n');
}

function foldLine(line: string): string {
  const max = 75;
  if (line.length <= max) return line;

  const chunks: string[] = [];
  let rest = line;
  while (rest.length > max) {
    chunks.push(rest.slice(0, max));
    rest = rest.slice(max);
  }
  chunks.push(rest);
  return chunks.join('\r\n ');
}

function eventEnd(schedule: ReadingSchedule): Date {
  if (schedule.scheduledEnd) return schedule.scheduledEnd;
  return new Date(schedule.scheduledStart.getTime() + (schedule.estimatedDuration ?? 60) * 60_000);
}

function eventDescription(schedule: ReadingSchedule, clubTitle?: string): string {
  const lines = [schedule.description ?? ''];
  if (schedule.status === 'cancelled') lines.unshift('Событие отменено.');
  if (clubTitle) lines.push(`Клуб: ${clubTitle}`);
  return lines.filter(Boolean).join('\n');
}

export function generateScheduleVevent(schedule: ReadingSchedule, context: CalendarEventContext = {}): string {
  const sequence = schedule.calendarSequence ?? 0;
  const url = context.baseUrl ? `${context.baseUrl}/clubs/${schedule.clubId}` : undefined;
  const lines = [
    'BEGIN:VEVENT',
    `UID:schedule-${schedule.id}@voxlibris`,
    `DTSTAMP:${formatIcsDate(schedule.updatedAt ?? new Date())}`,
    `DTSTART:${formatIcsDate(schedule.scheduledStart)}`,
    `DTEND:${formatIcsDate(eventEnd(schedule))}`,
    `SUMMARY:${escapeIcsText(schedule.title)}`,
    `DESCRIPTION:${escapeIcsText(eventDescription(schedule, context.club?.title))}`,
    `STATUS:${schedule.status === 'cancelled' ? 'CANCELLED' : 'CONFIRMED'}`,
    `SEQUENCE:${sequence}`,
    `LAST-MODIFIED:${formatIcsDate(schedule.updatedAt ?? new Date())}`,
  ];

  if (context.club?.title) lines.push(`LOCATION:${escapeIcsText(context.club.title)}`);
  if (url) lines.push(`URL:${escapeIcsText(url)}`);
  if (schedule.reminderMinutes && schedule.reminderMinutes > 0) {
    lines.push('BEGIN:VALARM', `TRIGGER:-PT${schedule.reminderMinutes}M`, 'ACTION:DISPLAY', 'DESCRIPTION:Напоминание VoxLibris', 'END:VALARM');
  }
  lines.push('END:VEVENT');
  return lines.map(foldLine).join('\r\n');
}

export function generateCalendar(schedules: ReadingSchedule[], context: CalendarEventContext = {}): string {
  const name = context.club?.title ? `VoxLibris: ${context.club.title}` : 'VoxLibris';
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//VoxLibris//Calendar//RU',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${escapeIcsText(name)}`,
    ...schedules.map((schedule) => generateScheduleVevent(schedule, context)),
    'END:VCALENDAR',
  ];
  return `${lines.join('\r\n')}\r\n`;
}

export const iCalendarTestExports = { escapeIcsText, formatIcsDate };
