import crypto from 'node:crypto';

export function generateCalendarToken(): string {
  return crypto.randomBytes(32).toString('base64url');
}

export function hashCalendarToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}
