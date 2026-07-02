import { expect, test } from '@playwright/test';
import { login } from '../actions/auth';
import { resetUiTestData } from '../actions/db';
import { getRunnerEnv } from '../actions/env';
import { assertPickerButtons, openMuteDialog, pickTomorrowAtNoon } from '../actions/moderation';

test.describe('Клуб чтецов: браузерная проверка mute и запрета отправки сообщений', () => {
  test('Владелец клуба чтецов открывает модальное окно mute, выбирает срок через поля даты/времени; после применения участник видит чат, но попытка отправки сообщения показывает ошибку ограничения', async ({ browser }) => {
    await resetUiTestData();
    const env = getRunnerEnv();
    const ownerContext = await browser.newContext();
    const ownerPage = await ownerContext.newPage();

    await login(ownerPage, env.ownerEmail, env.ownerPassword);
    await ownerPage.goto(`/clubs/${env.readerClubId}`);
    await ownerPage.waitForLoadState('networkidle');

    await openMuteDialog(ownerPage, env.targetMemberName);
    await assertPickerButtons(ownerPage);
    await pickTomorrowAtNoon(ownerPage);
    await ownerPage.getByLabel(/причина/i).fill('Автотест: временный запрет писать');
    await ownerPage.getByRole('button', { name: /применить/i }).click();

    await expect(ownerPage.getByText(/без права писать/i)).toBeVisible();
    await ownerContext.close();

    const memberContext = await browser.newContext();
    const memberPage = await memberContext.newPage();
    await login(memberPage, env.memberEmail, env.memberPassword);
    await memberPage.goto(`/clubs/${env.readerClubId}`);
    await memberPage.waitForLoadState('networkidle');

    await memberPage.getByRole('button', { name: /открыть чат клуба/i }).click();
    const messageInput = memberPage.getByPlaceholder(/напишите сообщение/i);
    await expect(messageInput).toBeVisible();
    await messageInput.fill('Сообщение от ограниченного пользователя');
    await memberPage.keyboard.press('Enter');
    await expect(memberPage.getByText(/огранич|restricted|нельзя|запрещ|права/i)).toBeVisible();

    await memberContext.close();
  });
});
