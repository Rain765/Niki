import { expect, test } from '@playwright/test';

// The production entry is PosterApp. The former sidebar/composer shell is no
// longer an App Router entry; these checks exercise the actual deployed pages.
test('home loads the production navigation and poster controls', async ({ page, request }) => {
  const health = await request.get('/api/health');
  expect(health.ok()).toBe(true);
  expect(await health.json()).toMatchObject({ ok: true });
  await page.goto('/');
  const navigation = page.getByRole('navigation', { name: '主导航' });
  await expect(navigation.getByRole('button')).toHaveText([
    '海报', '视频', 'PPT', '品牌', '竞品', '更多',
  ]);
  await navigation.getByRole('button', { name: '更多', exact: true }).click();
  await expect(page.getByRole('menuitem')).toHaveText(['文档', '语音']);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('region', { name: '海报生成设置' })).toBeVisible();
  await expect(page.getByRole('combobox', { name: '产品', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: '生成', exact: true })).toBeEnabled();
});

test('competitor entry filters, previews, navigates images and restores after reload', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('navigation', { name: '主导航' }).getByRole('button', { name: '竞品', exact: true }).click();
  await expect(page).toHaveURL(/\?mode=competitors$/);
  const gallery = page.getByRole('region', { name: '竞品截图', exact: true });
  await expect(gallery).toBeVisible();
  await expect(gallery.locator('.competitor-gallery__card')).toHaveCount(100);
  await gallery.getByRole('navigation', { name: '竞品截图分类' }).getByRole('button', { name: /首页与信贷入口/ }).click();
  await expect(gallery.locator('.competitor-gallery__card')).toHaveCount(10);
  await gallery.getByRole('searchbox').fill('SuperKwacha');
  await expect(gallery.locator('.competitor-gallery__card')).toHaveCount(1);
  await gallery.getByRole('button', { name: '清除搜索', exact: true }).click();
  await gallery.getByRole('button', { name: /^预览 / }).first().click();
  const preview = page.getByRole('dialog', { name: /^预览 / });
  await expect(preview).toBeVisible();
  await expect(preview.locator('.competitor-gallery__lightbox-counter')).toHaveText('1 / 10');
  await preview.getByRole('button', { name: '下一张', exact: true }).click();
  await expect(preview.locator('.competitor-gallery__lightbox-counter')).toHaveText('2 / 10');
  await page.keyboard.press('Escape');
  await expect(preview).toHaveCount(0);
  await page.reload();
  await expect(gallery).toBeVisible();
  await expect(gallery.locator('.competitor-gallery__card')).toHaveCount(100);
});

test('competitor direct link preserves the poster return path', async ({ page }) => {
  await page.goto('/?mode=competitors');
  await expect(page.getByRole('region', { name: '竞品截图', exact: true })).toBeVisible();
  await page.getByRole('navigation', { name: '主导航' }).getByRole('button', { name: '海报', exact: true }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole('region', { name: '海报生成设置' })).toBeVisible();
});
