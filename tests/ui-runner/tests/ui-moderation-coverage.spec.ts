import { expect, test } from '@playwright/test';
import { login } from '../actions/auth';
import { countMemberships, ensureManyMembers, getMembership, resetUiTestData } from '../actions/db';
import { getRunnerEnv } from '../actions/env';
import {
  applyModerationDialog,
  memberRow,
  openDeactivateDialog,
  openModerationMenu,
  openMuteDialog,
  openRemoveDialog,
} from '../actions/moderation';

const targetName = 'VL UI Member';

test.describe('Интерфейс модерации: обычный клуб, клуб чтецов, мобильная адаптация и нагрузка', () => {
  test.beforeEach(async () => {
    await resetUiTestData();
  });

  test('Обычный клуб: владелец видит элементы управления, применяет mute/deactivate/remove с обновлением списка и БД; обычный участник не видит меню модерации', async ({ browser }) => {
    const env = getRunnerEnv();
    const ownerContext = await browser.newContext();
    const ownerPage = await ownerContext.newPage();

    await login(ownerPage, env.ownerEmail, env.ownerPassword);
    await ownerPage.goto(`/clubs/${env.standardClubId}`);
    await ownerPage.waitForLoadState('networkidle');

    await expect(ownerPage.getByRole('heading', { name: /Участники/i })).toBeVisible();
    await expect(ownerPage.getByText('VL UI Owner', { exact: true })).toBeVisible();
    await openMuteDialog(ownerPage, targetName);
    await expect(ownerPage.getByRole('dialog')).toContainText(/запретить/i);
    await applyModerationDialog(ownerPage, 'Автотест: standard mute');
    await expect(ownerPage.getByText(/без права писать/i)).toBeVisible();

    await ownerPage.reload();
    await expect(ownerPage.getByText(/без права писать/i)).toBeVisible();

    await openDeactivateDialog(ownerPage, targetName);
    await expect(ownerPage.getByRole('dialog')).toContainText(/ограничить/i);
    await applyModerationDialog(ownerPage, 'Автотест: standard deactivate');
    await expect(ownerPage.getByText(/доступ ограничен/i)).toBeVisible();

    await openRemoveDialog(ownerPage, targetName);
    await expect(ownerPage.getByRole('dialog')).toContainText(/vl_ui_member/i);
    await ownerPage.getByRole('button', { name: /удалить|исключить/i }).click();
    await expect(ownerPage.getByText(targetName, { exact: true })).toHaveCount(0);
    await expect(await getMembership(env.standardClubId, 'vl-ui-member')).toBeNull();
    await ownerContext.close();

    const memberContext = await browser.newContext();
    const memberPage = await memberContext.newPage();
    await login(memberPage, env.memberEmail, env.memberPassword);
    await memberPage.goto(`/clubs/${env.readerClubId}`);
    await memberPage.waitForLoadState('networkidle');
    await expect(memberPage.getByRole('menuitem', { name: /запретить|ограничить|исключить/i })).toHaveCount(0);
    await memberContext.close();
  });

  test('Клуб чтецов: deactivate показывает бейдж ограничения, после обновления второй вкладки состояние сохраняется; remove удаляет участника и лишает его кнопок live/чата клуба', async ({ browser }) => {
    const env = getRunnerEnv();
    const ownerContext = await browser.newContext();
    const ownerPage = await ownerContext.newPage();
    const secondOwnerPage = await ownerContext.newPage();

    await login(ownerPage, env.ownerEmail, env.ownerPassword);
    await ownerPage.goto(`/clubs/${env.readerClubId}`);
    await ownerPage.waitForLoadState('networkidle');
    await expect(memberRow(ownerPage, targetName).getByText(/слушатель|чтец|member/i).first()).toBeVisible();

    await secondOwnerPage.goto(`/clubs/${env.readerClubId}`);
    await secondOwnerPage.waitForLoadState('networkidle');

    await openDeactivateDialog(ownerPage, targetName);
    await applyModerationDialog(ownerPage, 'Автотест: reader deactivate');
    await expect(ownerPage.getByText(/доступ ограничен/i)).toBeVisible();

    await secondOwnerPage.reload();
    await expect(secondOwnerPage.getByText(/доступ ограничен/i)).toBeVisible();

    await openRemoveDialog(ownerPage, targetName);
    await expect(ownerPage.getByRole('dialog')).toContainText(new RegExp(targetName, 'i'));
    await ownerPage.getByRole('button', { name: /исключить|удалить/i }).click();
    await expect(ownerPage.getByLabel(new RegExp(`Открыть профиль ${targetName}`, 'i'))).toHaveCount(0);
    await ownerContext.close();

    const removedContext = await browser.newContext();
    const removedPage = await removedContext.newPage();
    await login(removedPage, env.memberEmail, env.memberPassword);
    await removedPage.goto(`/clubs/${env.readerClubId}`);
    await removedPage.waitForLoadState('networkidle');
    await expect(removedPage.getByRole('button', { name: /слушать эфир|начать чтение|открыть чат клуба/i })).toHaveCount(0);
    await removedContext.close();
  });

  test('Производительность: при 50+ участниках список открывается, счётчик показывает нагрузку, меню модерации доступно владельцу менее чем за 10 секунд', async ({ browser }) => {
    const env = getRunnerEnv();
    await ensureManyMembers(env.standardClubId, 55);
    await expect(await countMemberships(env.standardClubId)).toBeGreaterThan(50);
    const ownerContext = await browser.newContext();
    const ownerPage = await ownerContext.newPage();

    await login(ownerPage, env.ownerEmail, env.ownerPassword);
    const startedAt = Date.now();
    await ownerPage.goto(`/clubs/${env.standardClubId}`);
    await ownerPage.waitForLoadState('networkidle');
    await expect(ownerPage.getByRole('heading', { name: /Участники/i })).toContainText(/5[0-9]|6[0-9]/);

    await openModerationMenu(ownerPage, 'VL UI Other Member');
    await expect(ownerPage.getByRole('menuitem', { name: /запретить писать/i })).toBeVisible();
    await expect(Date.now() - startedAt).toBeLessThan(10_000);
    await ownerContext.close();
  });
});
