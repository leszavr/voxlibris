import postgres from 'postgres';
import { hashCalendarToken } from '../server/services/calendar-token-service.js';

const baseUrl = (process.env.ICALENDAR_SMOKE_BASE_URL ?? 'http://127.0.0.1:5000').replace(/\/$/, '');
const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error('DATABASE_URL is required');
}

const sql = postgres(databaseUrl, { max: 1 });
const now = Date.now();
const ids = {
  user: 'ical-smoke-user',
  book: 'ical-smoke-book',
  clubBook: 'ical-smoke-club-book',
  publicClub: 'ical-smoke-public-club',
  privateClub: 'ical-smoke-private-club',
  publicSchedule: 'ical-smoke-public-schedule',
  privateSchedule: 'ical-smoke-private-schedule',
  legacySchedule: 'ical-smoke-legacy-schedule',
  token: 'ical-smoke-token',
};

const rawToken = `ical-smoke-${now}`;

async function cleanup(): Promise<void> {
  await sql`delete from calendar_subscription_tokens where id = ${ids.token} or user_id = ${ids.user}`;
  await sql`delete from reading_schedule where id in (${ids.publicSchedule}, ${ids.privateSchedule})`;
  await sql`update clubs set book_id = null where id in (${ids.publicClub}, ${ids.privateClub})`;
  await sql`delete from club_books where id = ${ids.clubBook}`;
  await sql`delete from club_members where user_id = ${ids.user} or club_id in (${ids.publicClub}, ${ids.privateClub})`;
  await sql`delete from clubs where id in (${ids.publicClub}, ${ids.privateClub})`;
  await sql`delete from books where id = ${ids.book}`;
  await sql`delete from users where id = ${ids.user}`;
}

async function seed(): Promise<void> {
  const start = new Date(Date.now() + 86_400_000);
  const end = new Date(start.getTime() + 3_600_000);
  const legacyStart = new Date(Date.now() + 172_800_000);
  const legacyDate = legacyStart.toISOString().slice(0, 10);
  const legacyTime = legacyStart.toISOString().slice(11, 16);
  const legacySchedule = JSON.stringify([{ id: ids.legacySchedule, title: 'Legacy Smoke Session', date: legacyDate, time: legacyTime, description: 'Legacy club.schedule session' }]);

  await cleanup();
  await sql`
    insert into users (id, username, email, password, role, status, email_confirmed)
    values (${ids.user}, 'ical_smoke_user', 'ical-smoke@example.invalid', 'not-used', 'user', 'active', true)
  `;
  await sql`
    insert into books (id, title, author, visibility, status, uploaded_by)
    values (${ids.book}, 'iCalendar Smoke Book', 'VoxLibris', 'public', 'active', ${ids.user})
  `;
  await sql`
    insert into clubs (id, title, description, owner_id, type, status, is_private, is_active, schedule)
    values
      (${ids.publicClub}, 'iCalendar Smoke Public Club', 'Smoke test public club', ${ids.user}, 'standard', 'active', false, true, ${legacySchedule}),
      (${ids.privateClub}, 'iCalendar Smoke Private Club', 'Smoke test private club', ${ids.user}, 'standard', 'active', true, true, ${legacySchedule})
  `;
  await sql`
    insert into club_books (id, club_id, uploaded_by_user_id, title, author, format, storage_path)
    values (${ids.clubBook}, ${ids.publicClub}, ${ids.user}, 'iCalendar Smoke Club Book', 'VoxLibris', 'txt', 'smoke/icalendar.txt')
  `;
  await sql`
    update clubs set book_id = ${ids.clubBook} where id in (${ids.publicClub}, ${ids.privateClub})
  `;
  await sql`
    insert into club_members (id, club_id, user_id, role, is_active)
    values
      ('ical-smoke-public-member', ${ids.publicClub}, ${ids.user}, 'owner', true),
      ('ical-smoke-private-member', ${ids.privateClub}, ${ids.user}, 'owner', true)
  `;
  await sql`
    insert into reading_schedule (id, club_id, book_id, title, description, scheduled_start, scheduled_end, estimated_duration, status, created_by, reminder_minutes)
    values
      (${ids.publicSchedule}, ${ids.publicClub}, ${ids.book}, 'Public Smoke Session', 'Public ICS session', ${start}, ${end}, 60, 'scheduled', ${ids.user}, 15),
      (${ids.privateSchedule}, ${ids.privateClub}, ${ids.book}, 'Private Smoke Session', 'Private ICS session', ${start}, ${end}, 60, 'scheduled', ${ids.user}, 15)
  `;
  await sql`
    insert into calendar_subscription_tokens (id, token_hash, user_id, club_id)
    values (${ids.token}, ${hashCalendarToken(rawToken)}, ${ids.user}, ${ids.privateClub})
  `;
}

async function get(path: string): Promise<Response> {
  return fetch(`${baseUrl}${path}`, { headers: { Accept: 'text/calendar' } });
}

async function expectStatus(path: string, status: number): Promise<Response> {
  const response = await get(path);
  if (response.status !== status) {
    throw new Error(`${path}: expected ${status}, got ${response.status}`);
  }
  return response;
}

function expectHeader(response: Response, name: string, includes: string): void {
  const value = response.headers.get(name) ?? '';
  if (!value.toLowerCase().includes(includes.toLowerCase())) {
    throw new Error(`${name}: expected to include ${includes}, got ${value}`);
  }
}

function expectBody(body: string, text: string): void {
  if (!body.includes(text)) {
    throw new Error(`ICS body does not include ${text}`);
  }
}

async function run(): Promise<void> {
  await seed();

  const event = await expectStatus(`/api/schedule/${ids.publicSchedule}/calendar.ics`, 200);
  expectHeader(event, 'content-type', 'text/calendar');
  expectHeader(event, 'content-disposition', 'attachment');
  const eventBody = await event.text();
  expectBody(eventBody, 'BEGIN:VCALENDAR');
  expectBody(eventBody, `UID:schedule-${ids.publicSchedule}@voxlibris`);
  expectBody(eventBody, 'BEGIN:VALARM');

  const publicFeed = await expectStatus(`/api/clubs/${ids.publicClub}/calendar.ics`, 200);
  expectHeader(publicFeed, 'content-disposition', 'inline');
  const publicFeedBody = await publicFeed.text();
  expectBody(publicFeedBody, `UID:schedule-${ids.publicSchedule}@voxlibris`);
  expectBody(publicFeedBody, `UID:schedule-${ids.legacySchedule}@voxlibris`);

  const legacyEvent = await expectStatus(`/api/schedule/${ids.legacySchedule}/calendar.ics`, 200);
  expectBody(await legacyEvent.text(), 'Legacy Smoke Session');

  await expectStatus(`/api/clubs/${ids.privateClub}/calendar.ics`, 403);

  const privateFeed = await expectStatus(`/api/calendar/subscription/${rawToken}.ics`, 200);
  expectHeader(privateFeed, 'cache-control', 'no-store');
  const privateFeedBody = await privateFeed.text();
  expectBody(privateFeedBody, `UID:schedule-${ids.privateSchedule}@voxlibris`);
  expectBody(privateFeedBody, `UID:schedule-${ids.legacySchedule}@voxlibris`);

  const [usage] = await sql<{ last_used_at: Date | null }[]>`
    select last_used_at from calendar_subscription_tokens where id = ${ids.token}
  `;
  if (!usage?.last_used_at) {
    throw new Error('subscription last_used_at was not updated');
  }

  await sql`update calendar_subscription_tokens set revoked_at = now() where id = ${ids.token}`;
  await expectStatus(`/api/calendar/subscription/${rawToken}.ics`, 404);
  await expectStatus('/api/calendar/subscription/invalid-smoke-token.ics', 404);
}

try {
  await run();
  console.log('iCalendar smoke: OK');
} finally {
  await cleanup().finally(() => sql.end());
}
