import test from 'node:test';
import assert from 'node:assert/strict';
import { sendIcs, sendPrivateIcs } from '../lib/calendar-response.ts';

function fakeResponse() {
  const headers = new Map<string, string>();
  return {
    headers,
    body: '',
    setHeader(name: string, value: string) {
      headers.set(name.toLowerCase(), value);
    },
    send(body: string) {
      this.body = body;
    },
  };
}

test('sendIcs sets attachment headers for single event download', () => {
  const res = fakeResponse();
  sendIcs(res as never, 'BEGIN:VCALENDAR', 'voxlibris-schedule-event-1.ics');

  assert.equal(res.headers.get('content-type'), 'text/calendar; charset=utf-8');
  assert.equal(res.headers.get('content-disposition'), 'attachment; filename="voxlibris-schedule-event-1.ics"');
  assert.equal(res.headers.get('cache-control'), 'private, max-age=300');
  assert.equal(res.body, 'BEGIN:VCALENDAR');
});

test('sendIcs supports inline public club feed', () => {
  const res = fakeResponse();
  sendIcs(res as never, 'BEGIN:VCALENDAR', 'voxlibris-club-club-1.ics', 'inline');

  assert.equal(res.headers.get('content-disposition'), 'inline; filename="voxlibris-club-club-1.ics"');
  assert.equal(res.headers.get('cache-control'), 'private, max-age=300');
});

test('sendPrivateIcs disables storage for token feeds', () => {
  const res = fakeResponse();
  sendPrivateIcs(res as never, 'BEGIN:VCALENDAR', 'voxlibris-club-private.ics');

  assert.equal(res.headers.get('content-disposition'), 'inline; filename="voxlibris-club-private.ics"');
  assert.equal(res.headers.get('cache-control'), 'private, no-store');
});
