import type { Page } from '@playwright/test';

export async function login(page: Page, email: string, password: string): Promise<void> {
  await page.goto('/auth/login');
  await page.getByLabel(/email|логин|почта/i).fill(email);
  await page.getByLabel(/пароль|password/i).fill(password);
  await page.getByRole('button', { name: /войти|login/i }).click();
  await page.waitForLoadState('networkidle');
}

