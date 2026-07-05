import test from 'node:test';
import assert from 'node:assert/strict';
import { getLegacyClubSchedules, mergeCalendarSchedules } from '../services/legacy-schedule-calendar.ts';
import type { ReadingSchedule } from '../../shared/schema.ts';

function club(type: 'standard' | 'reader-led', schedule: unknown) {
  return {
    id: `${type}-club`,
    title: type === 'reader-led' ? 'Клуб чтецов' : 'Обычный клуб',
    type,
    ownerId: 'owner-1',
    schedule: JSON.stringify(schedule),
  };
}

test('legacy club schedule is converted for standard and reader-led clubs', () => {
  const legacyItems = [
    {
      id: 'legacy-session-1',
      title: 'Каждый четверг, в подень по Багдаду',
      date: '2026-02-12',
      time: '12:00',
      description: '',
    },
  ];
  const standard = getLegacyClubSchedules(club('standard', legacyItems));
  const readerLed = getLegacyClubSchedules(club('reader-led', legacyItems));

  assert.equal(standard.length, 1);
  assert.equal(readerLed.length, 1);
  assert.equal(standard[0].scheduledStart.toISOString(), '2026-02-12T12:00:00.000Z');
  assert.equal(readerLed[0].clubId, 'reader-led-club');
});

test('legacy converter supports scheduledStart-style items and optional fields', () => {
  const schedules = getLegacyClubSchedules(club('standard', [{
    id: 123,
    title: 'ISO session',
    scheduledStart: '2026-07-07T10:34:00.000Z',
    scheduledEnd: '2026-07-07T11:34:00.000Z',
    estimatedDuration: '90',
    reminderMinutes: '30',
    status: 'cancelled',
  }]));

  assert.equal(schedules.length, 1);
  assert.equal(schedules[0].id, '123');
  assert.equal(schedules[0].status, 'cancelled');
  assert.equal(schedules[0].scheduledEnd?.toISOString(), '2026-07-07T11:34:00.000Z');
  assert.equal(schedules[0].estimatedDuration, 90);
  assert.equal(schedules[0].reminderMinutes, 30);
});

test('calendar feed merge deduplicates legacy events when migrated to reading_schedule', () => {
  const existing = getLegacyClubSchedules(club('standard', [{ id: 'same-id', title: 'Legacy', date: '2026-07-07', time: '10:00' }]))[0];
  const migrated: ReadingSchedule = { ...existing, title: 'Migrated' };
  const merged = mergeCalendarSchedules([migrated], [existing]);

  assert.equal(merged.length, 1);
  assert.equal(merged[0].title, 'Migrated');
});
