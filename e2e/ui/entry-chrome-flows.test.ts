import { expect, test } from '@playwright/test';

// Exercise the immutable production shell, not the retired project sidebar.
test('poster controls retain choices while switching workspaces', async ({ page }) => {
  await page.goto('/');
  const quantity = page.getByRole('combobox', { name: '数量', exact: true });
  await quantity.click();
  await page.getByRole('option', { name: '3', exact: true }).click();
  const ratio = page.getByRole('combobox', { name: '比例', exact: true });
  await ratio.click();
  await page.getByRole('option', { name: '1:1', exact: true }).click();
  const navigation = page.getByRole('navigation', { name: '主导航' });
  await navigation.getByRole('button', { name: '竞品', exact: true }).click();
  await expect(page.getByRole('region', { name: '竞品截图', exact: true })).toBeVisible();
  await navigation.getByRole('button', { name: '海报', exact: true }).click();
  await expect(quantity).toContainText('3');
  await expect(ratio).toContainText('1:1');
});

test('poster controls expose supported quantities and keyboard selection', async ({ page }) => {
  await page.goto('/');
  const quantity = page.getByRole('combobox', { name: '数量', exact: true });
  await quantity.click();
  await expect(page.getByRole('option')).toHaveText(['1', '2', '3', '4']);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('listbox')).toHaveCount(0);
  await expect(quantity).toBeFocused();
});

test('poster controls keep history and language selection available', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('tab', { name: /^历史生成\s*\d+$/ }).click();
  await expect(page.getByRole('tab', { name: /^历史生成\s*\d+$/ })).toHaveAttribute('aria-selected', 'true');
  await page.getByRole('button', { name: 'English', exact: true }).click();
  await expect(page.getByRole('navigation', { name: 'Primary navigation' })).toBeVisible();
  await expect(page.getByRole('combobox', { name: 'Product', exact: true })).toBeVisible();
  await expect(page.getByRole('tab', { name: /^History\s*\d+$/ })).toHaveAttribute('aria-selected', 'true');
  await page.getByRole('button', { name: '中文', exact: true }).click();
  await expect(page.getByRole('navigation', { name: '主导航' })).toBeVisible();
});

for (const viewport of [{ width: 390, height: 844 }, { width: 1024, height: 768 }]) {
  test(`production navigation and competitor gallery fit ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto('/');
    const navigation = page.getByRole('navigation', { name: '主导航' });
    const competitor = navigation.getByRole('button', { name: '竞品', exact: true });
    await competitor.scrollIntoViewIfNeeded();
    await competitor.click();
    await expect(page.getByRole('region', { name: '竞品截图', exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
    await expect(page.getByRole('searchbox', { name: '搜索竞品截图' })).toBeVisible();
  });
}

test('video, PPT, document and voice navigation retain their deep links', async ({ page }) => {
  await page.goto('/');
  const navigation = page.getByRole('navigation', { name: '主导航' });
  for (const [name, mode] of [['视频', 'video'], ['PPT', 'ppt'], ['文档', 'documents'], ['语音', 'english']] as const) {
    await navigation.getByRole('button', { name, exact: true }).click();
    await expect(navigation.getByRole('button', { name, exact: true })).toHaveAttribute('aria-current', 'page');
    await expect(page).toHaveURL(new RegExp(`\\?mode=${mode}$`));
  }
  await navigation.getByRole('button', { name: '品牌', exact: true }).click();
  await expect(page).toHaveURL(/\/logo$/);
  await page.reload();
  await expect(navigation.getByRole('button', { name: '品牌', exact: true })).toHaveAttribute('aria-current', 'page');
});
