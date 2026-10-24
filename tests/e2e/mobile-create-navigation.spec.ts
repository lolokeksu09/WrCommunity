import { test, expect } from '@playwright/test';
import { account, browserPerson, noOverflow } from './helpers.js';

test('мобильная навигация позволяет создать публикацию гостю после входа и авторизованному игроку', async ({ page, browser, isMobile }) => {
  test.skip(!isMobile, 'Нижняя навигация отображается только на телефоне');
  await page.goto('/');
  const nav = page.getByRole('navigation', { name: 'Основная мобильная навигация' });
  await expect(nav).toBeVisible();
  await expect(nav.getByRole('link')).toHaveCount(5);
  await expect(nav.getByRole('link', { name: 'Создать публикацию' })).toBeVisible();
  await nav.getByRole('link', { name: 'Создать публикацию' }).click();
  await expect(page).toHaveURL(/\/login\?returnTo=%2Fposts%2Fnew/);
  await noOverflow(page);

  const player = await account();
  try {
    const ui = await browserPerson(browser, player);
    try {
      await ui.page.goto('/');
      const create = ui.page.getByRole('navigation', { name: 'Основная мобильная навигация' }).getByRole('link', { name: 'Создать публикацию' });
      await create.click();
      await expect(ui.page).toHaveURL(/\/posts\/new$/);
      await expect(ui.page.getByRole('heading', { name: 'Новая публикация' })).toBeVisible();
      await noOverflow(ui.page);
      expect(ui.errors).toEqual([]);
    } finally { await ui.context.close(); }
  } finally { await player.context.dispose(); }
});
