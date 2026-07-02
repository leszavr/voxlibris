import { expect, test } from '@playwright/test';
import { login } from '../actions/auth';
import { getRunnerEnv } from '../actions/env';

test.describe('Commerce UI smoke', () => {
  test('админ видит commerce dashboard на /admin/analytics', async ({ page }) => {
    const env = getRunnerEnv();

    await login(page, env.ownerEmail, env.ownerPassword);
    await page.goto('/admin/analytics');
    await page.waitForLoadState('networkidle');

    await expect(page.getByText('Коммерция')).toBeVisible();
    await expect(page.getByText('Выручка')).toBeVisible();
    await expect(page.getByText('MRR')).toBeVisible();
    await expect(page.getByText('ARR')).toBeVisible();
  });

  test('платный клуб чтеца показывает paywall и кнопку оплаты без активного доступа', async ({ page }) => {
    const env = getRunnerEnv();

    await login(page, env.nonMemberEmail, env.nonMemberPassword);
    await page.goto(`/clubs/${env.readerClubId}`);
    await page.waitForLoadState('networkidle');

    await expect(page.getByText(/нужна активная подписка/i)).toBeVisible();
    await expect(page.getByRole('button', { name: /оплатить доступ/i })).toBeVisible();
  });
});
