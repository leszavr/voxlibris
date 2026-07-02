import { expect, type Locator, type Page } from '@playwright/test';

export function memberRow(page: Page, memberName: string): Locator {
  const profileRow = page
    .getByLabel(new RegExp(`Открыть профиль ${memberName}`, 'i'))
    .locator('xpath=ancestor::div[contains(@class, "flex")][1]');

  const textRow = page
    .getByText(memberName, { exact: true })
    .locator('xpath=ancestor::div[contains(@class, "grid") and .//button][1]');

  return profileRow.or(textRow).first();
}

export async function openModerationMenu(page: Page, memberName: string): Promise<Locator> {
  const row = memberRow(page, memberName);
  await expect(row).toBeVisible();
  await row.getByRole('button').last().click();
  return row;
}

export async function openMuteDialog(page: Page, memberName: string): Promise<void> {
  await openModerationMenu(page, memberName);
  await page.getByRole('menuitem', { name: /запретить писать/i }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
}

export async function openDeactivateDialog(page: Page, memberName: string): Promise<void> {
  await openModerationMenu(page, memberName);
  await page.getByRole('menuitem', { name: /ограничить доступ/i }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
}

export async function openRemoveDialog(page: Page, memberName: string): Promise<void> {
  await openModerationMenu(page, memberName);
  await page.getByRole('menuitem', { name: /исключить из клуба/i }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
}

export async function pickTomorrowAtNoon(page: Page): Promise<void> {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const yyyy = tomorrow.getFullYear();
  const mm = String(tomorrow.getMonth() + 1).padStart(2, '0');
  const dd = String(tomorrow.getDate()).padStart(2, '0');

  await page.getByLabel(/дата окончания/i).fill(`${yyyy}-${mm}-${dd}`);
  await page.getByLabel(/время окончания/i).fill('12:30');
}

export async function assertPickerButtons(page: Page): Promise<void> {
  const dateInput = page.getByLabel(/дата окончания/i);
  const timeInput = page.getByLabel(/время окончания/i);

  await page.getByRole('button', { name: /открыть календарь/i }).click();
  await expect(dateInput).toBeFocused();

  await page.getByRole('button', { name: /открыть выбор времени/i }).click();
  await expect(timeInput).toBeFocused();
}

export async function applyModerationDialog(page: Page, reason: string): Promise<void> {
  await pickTomorrowAtNoon(page);
  await page.getByLabel(/причина/i).fill(reason);
  await page.getByRole('button', { name: /применить/i }).click();
}
