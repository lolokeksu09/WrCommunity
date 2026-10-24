import { test, expect } from '@playwright/test';
import { account, api, browserPerson, noOverflow } from './helpers.js';

test('добавленные страницы публикаций сохраняются после лайка и закладки', async ({ browser }) => {
  const owner = await account();
  try {
    for (let n = 1; n <= 21; n++) {
      await api(owner.context, '/posts', 'POST', { body: `Запись ${n} — ${owner.handle}`, state: 'published' });
    }
    const ui = await browserPerson(browser, owner);
    try {
      await ui.page.goto('/me/posts');
      await expect(ui.page.locator('.post-list > .post')).toHaveCount(20);
      await ui.page.getByRole('button', { name: 'Показать ещё', exact: true }).click();
      await ui.page.waitForLoadState('networkidle');
      await expect(ui.page.locator('.post-list > .post')).toHaveCount(21);

      const oldest = ui.page.locator('.post').filter({ hasText: `Запись 1 — ${owner.handle}` });
      await oldest.getByRole('button', { name: 'Нравится', exact: true }).click();
      await expect(oldest.getByRole('button', { name: 'Убрать отметку нравится' })).toHaveAttribute('aria-pressed', 'true');
      await expect(ui.page.locator('.post-list > .post')).toHaveCount(21);
      await oldest.getByRole('button', { name: 'Сохранить в закладки' }).click();
      await expect(oldest.getByRole('button', { name: 'Убрать закладку' })).toHaveAttribute('aria-pressed', 'true');
      await expect(ui.page.locator('.post-list > .post')).toHaveCount(21);
      await noOverflow(ui.page);
      expect(ui.errors).toEqual([]);
    } finally { await ui.context.close(); }
  } finally { await owner.context.dispose(); }
});

test('страницы комментариев обновляются после ответа и удаления без возврата к первым двадцати', async ({ browser }) => {
  const owner = await account();
  try {
    const post = await api(owner.context, '/posts', 'POST', { body: 'Длинное обсуждение ' + owner.handle, state: 'published' });
    let lastId = '';
    for (let n = 1; n <= 21; n++) {
      const comment = await api(owner.context, `/posts/${post.id}/comments`, 'POST', { body: `Комментарий ${n}` });
      lastId = comment.id;
    }
    const ui = await browserPerson(browser, owner);
    try {
      await ui.page.goto('/posts/' + post.id);
      await ui.page.getByRole('button', { name: 'Загрузить комментарии' }).click();
      await ui.page.waitForLoadState('networkidle');
      await expect(ui.page.locator('.comment')).toHaveCount(21);
      const last = ui.page.locator('.comment').filter({ has: ui.page.getByText('Комментарий 21', { exact: true }) });
      await last.getByRole('button', { name: 'Ответить', exact: true }).click();
      await ui.page.getByLabel('Ответить', { exact: true }).fill('Ответ на второй странице');
      await ui.page.getByRole('button', { name: 'Отправить', exact: true }).click();
      await expect(last.locator('.comment-children').getByText('Ответ на второй странице', { exact: true })).toBeVisible();
      await expect(ui.page.locator('.comment')).toHaveCount(22);

      // A later refresh must not keep a deleted item in the retained tail.
      await api(owner.context, '/comments/' + lastId, 'DELETE');
      await ui.page.getByRole('button', { name: 'Нравится', exact: true }).click();
      await expect(ui.page.getByRole('button', { name: 'Убрать отметку нравится' })).toBeVisible();
      await expect(ui.page.getByText('Комментарий 21', { exact: true })).toHaveCount(0);
      await expect(ui.page.getByText('Ответ на второй странице', { exact: true })).toBeVisible();
      await expect(ui.page.locator('.comment')).toHaveCount(21);
      expect(ui.errors).toEqual([]);
    } finally { await ui.context.close(); }
  } finally { await owner.context.dispose(); }
});

test('гость видит ошибку догрузки комментариев и может повторить запрос', async ({ page }) => {
  const owner = await account();
  try {
    const post = await api(owner.context, '/posts', 'POST', { body: 'Обсуждение для гостя ' + owner.handle, state: 'published' });
    for (let n = 1; n <= 21; n++) {
      await api(owner.context, `/posts/${post.id}/comments`, 'POST', { body: `Гостевой комментарий ${n}` });
    }
    await page.goto('/posts/' + post.id);
    // Fault injection at the transport boundary; initial data and retry use the real API.
    await page.route(`**/api/v1/posts/${post.id}/comments?cursor=*`, route => route.fulfill({
      status: 503, contentType: 'application/json',
      body: JSON.stringify({ error: { code: 'temporarily_unavailable', message: 'Сервис временно недоступен. Повторите запрос.' } }),
    }), { times: 1 });
    await page.getByRole('button', { name: 'Загрузить комментарии' }).click();
    await expect(page.getByRole('alert')).toContainText('Сервис временно недоступен');
    await expect(page.locator('.comment')).toHaveCount(20);
    await page.getByRole('button', { name: 'Загрузить комментарии' }).click();
    await page.waitForLoadState('networkidle');
    await expect(page.locator('.comment')).toHaveCount(21);
    await expect(page.getByRole('alert')).toHaveCount(0);
    await noOverflow(page);
  } finally { await owner.context.dispose(); }
});
