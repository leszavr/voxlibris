import test from 'node:test';
import assert from 'node:assert/strict';
import { generateCalendar } from '../services/icalendar-service.ts';
import { generateCalendarToken, hashCalendarToken } from '../services/calendar-token-service.ts';
import type { ReadingSchedule } from '../../shared/schema.ts';

function schedule(overrides: Partial<ReadingSchedule> = {}): ReadingSchedule {
  return {
    id: 'event-1',
    clubId: 'club-1',
    bookId: 'book-1',
    title: 'Встреча, чтение; глава 1',
    description: 'Строка 1\nСтрока 2',
    scheduledStart: new Date('2026-01-02T03:04:05.000Z'),
    scheduledEnd: new Date('2026-01-02T04:04:05.000Z'),
    estimatedDuration: 60,
    startChapter: 1,
    startPosition: null,
    endChapter: null,
    endPosition: null,
    status: 'scheduled',
    sessionId: null,
    isRecurring: false,
    recurringPattern: null,
    reminderMinutes: 15,
    remindersSent: false,
    calendarSequence: 2,
    actualStart: null,
    actualEnd: null,
    attendeesCount: 0,
    createdBy: 'user-1',
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T01:00:00.000Z'),
    ...overrides,
  };
}

test('generateCalendar creates valid VEVENT with stable UID, sequence and alarm', () => {
  const ics = generateCalendar([schedule()], { club: { id: 'club-1', title: 'Клуб' }, baseUrl: 'https://voxlibris.ru' });
  assert.match(ics, /BEGIN:VCALENDAR/);
  assert.match(ics, /UID:schedule-event-1@voxlibris/);
  assert.match(ics, /DTSTART:20260102T030405Z/);
  assert.ok(ics.includes('SUMMARY:Встреча\\, чтение\\; глава 1'));
  assert.match(ics, /SEQUENCE:2/);
  assert.match(ics, /LAST-MODIFIED:20260101T010000Z/);
  assert.match(ics, /BEGIN:VALARM/);
  assert.match(ics, /TRIGGER:-PT15M/);
});

test('generateCalendar marks cancelled events', () => {
  const ics = generateCalendar([schedule({ status: 'cancelled' })]);
  assert.match(ics, /STATUS:CANCELLED/);
  assert.match(ics, /DESCRIPTION:Событие отменено/);
});

test('generateCalendar uses estimated duration and 60 minute fallback for DTEND', () => {
  const start = new Date('2026-01-02T03:00:00.000Z');
  const withDuration = generateCalendar([schedule({ scheduledStart: start, scheduledEnd: null, estimatedDuration: 90 })]);
  const withFallback = generateCalendar([schedule({ scheduledStart: start, scheduledEnd: null, estimatedDuration: null })]);

  assert.match(withDuration, /DTEND:20260102T043000Z/);
  assert.match(withFallback, /DTEND:20260102T040000Z/);
});

test('calendar tokens are random and hashed', () => {
  const first = generateCalendarToken();
  const second = generateCalendarToken();
  assert.notEqual(first, second);
  assert.notEqual(hashCalendarToken(first), first);
  assert.equal(hashCalendarToken(first), hashCalendarToken(first));
});
