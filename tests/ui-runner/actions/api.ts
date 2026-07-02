import { request, type APIRequestContext } from '@playwright/test';

export async function loginApi(email: string, password: string): Promise<APIRequestContext> {
  const context = await request.newContext({ baseURL: 'http://localhost:5000' });
  const response = await context.post('/api/auth/login', {
    data: { email, password, rememberMe: true },
  });
  if (!response.ok()) {
    throw new Error(`Login failed for ${email}: ${response.status()} ${await response.text()}`);
  }
  return context;
}

export async function moderateMember(
  api: APIRequestContext,
  clubId: string,
  userId: string,
  action: 'mute' | 'unmute' | 'deactivate' | 'reactivate',
  reason = 'Автотест',
) {
  return api.patch(`/api/clubs/${clubId}/members/${userId}/moderation`, {
    data: { action, until: new Date('2999-01-01T00:00:00.000Z').toISOString(), reason },
  });
}
