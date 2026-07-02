import { expect, request, test } from '@playwright/test';
import { loginApi, moderateMember } from '../actions/api';
import {
  countMemberships,
  getMembership,
  removeMembership,
  resetUiTestData,
  setExpiredRestriction,
} from '../actions/db';
import { getRunnerEnv } from '../actions/env';

const targetUserId = 'vl-ui-member';
const ownerUserId = 'vl-ui-owner';

test.describe('API и база данных: проверка прав и сохранения модерации участников клуба', () => {
  test.beforeEach(async () => {
    await resetUiTestData();
  });

  test('Владелец может применить mute/deactivate/remove; участник, аноним, самомодерация и отсутствующий участник получают корректные ошибки; в БД сохраняются сроки, причина и автор ограничения', async () => {
    const env = getRunnerEnv();
    const ownerApi = await loginApi(env.ownerEmail, env.ownerPassword);
    const memberApi = await loginApi(env.memberEmail, env.memberPassword);

    await expect((await moderateMember(memberApi, env.standardClubId, 'vl-ui-other-member', 'mute')).status()).toBe(403);

    const anonymous = await request.newContext({ baseURL: process.env.VOXLIBRIS_BASE_URL ?? 'http://localhost:3000' });
    const anonymousResponse = await anonymous.patch('/api/clubs/vl-ui-standard-club/members/vl-ui-member/moderation', {
      method: 'PATCH',
      data: { action: 'mute' },
    });
    await expect(anonymousResponse.status()).toBe(401);
    await anonymous.dispose();

    await expect((await moderateMember(ownerApi, env.standardClubId, ownerUserId, 'mute')).status()).toBe(403);
    await expect((await moderateMember(ownerApi, env.standardClubId, 'missing-user', 'mute')).status()).toBe(404);

    const muteResponse = await moderateMember(ownerApi, env.standardClubId, targetUserId, 'mute', 'Автотест: mute DB');
    await expect(muteResponse.ok()).toBeTruthy();
    const muted = await muteResponse.json();
    await expect(muted.mutedUntil).toBeTruthy();
    await expect(muted.restrictionReason).toBe('Автотест: mute DB');

    const mutedRow = await getMembership(env.standardClubId, targetUserId);
    await expect(mutedRow?.muted_until).toBeTruthy();
    await expect(mutedRow?.restriction_reason).toBe('Автотест: mute DB');
    await expect(mutedRow?.restricted_by).toBe(ownerUserId);
    await expect(mutedRow?.restricted_at).toBeTruthy();

    const deactivateResponse = await moderateMember(ownerApi, env.standardClubId, targetUserId, 'deactivate', 'Автотест: deactivate DB');
    await expect(deactivateResponse.ok()).toBeTruthy();
    const deactivatedRow = await getMembership(env.standardClubId, targetUserId);
    await expect(deactivatedRow?.is_active).toBe(false);
    await expect(deactivatedRow?.deactivated_until).toBeTruthy();

    const removeResponse = await ownerApi.delete(`/api/clubs/${env.standardClubId}/members/${targetUserId}`);
    await expect(removeResponse.ok()).toBeTruthy();
    await expect(await getMembership(env.standardClubId, targetUserId)).toBeNull();
    await expect(await getMembership(env.otherClubId, targetUserId)).toBeTruthy();

    await ownerApi.dispose();
    await memberApi.dispose();
  });

  test('GET /api/clubs/:id/members возвращает активные ограничения, а истёкшие mute/deactivate не отображаются как действующие и пользователь снова считается активным', async () => {
    const env = getRunnerEnv();
    const ownerApi = await loginApi(env.ownerEmail, env.ownerPassword);

    await moderateMember(ownerApi, env.readerClubId, targetUserId, 'mute', 'Автотест: members response');
    const membersResponse = await ownerApi.get(`/api/clubs/${env.readerClubId}/members?check=initial`);
    await expect(membersResponse.ok()).toBeTruthy();
    const members = await membersResponse.json();
    const target = members.find((member: { id: string }) => member.id === targetUserId);
    await expect(target.mutedUntil).toBeTruthy();
    await expect(target.restrictionReason).toBe('Автотест: members response');

    await setExpiredRestriction(env.readerClubId, targetUserId, 'muted_until');
    const expiredMembers = await (await ownerApi.get(`/api/clubs/${env.readerClubId}/members?check=expired-mute`)).json();
    const expiredTarget = expiredMembers.find((member: { id: string }) => member.id === targetUserId);
    await expect(expiredTarget.mutedUntil).toBeFalsy();

    await moderateMember(ownerApi, env.readerClubId, targetUserId, 'deactivate', 'Автотест: expired deactivate');
    await setExpiredRestriction(env.readerClubId, targetUserId, 'deactivated_until');
    const expiredDeactivated = await (await ownerApi.get(`/api/clubs/${env.readerClubId}/members?check=expired-deactivate`)).json();
    const restoredTarget = expiredDeactivated.find((member: { id: string }) => member.id === targetUserId);
    await expect(restoredTarget.isActive).toBe(true);

    await ownerApi.dispose();
  });

  test('Удаление участника полностью удаляет запись членства из БД, а количество членов клуба уменьшается до ожидаемого значения', async () => {
    const env = getRunnerEnv();
    await removeMembership(env.standardClubId, targetUserId);
    await expect(await getMembership(env.standardClubId, targetUserId)).toBeNull();
    await expect(await countMemberships(env.standardClubId)).toBe(2);
  });
});
