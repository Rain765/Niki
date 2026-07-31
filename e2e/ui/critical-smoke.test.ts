import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

const STORAGE_KEY = 'open-design:config';

test.describe.configure({ timeout: 30_000 });

test.beforeEach(async ({ page }) => {
  await page.addInitScript((key) => {
    window.localStorage.setItem(
      key,
      JSON.stringify({
        mode: 'daemon',
        apiKey: '',
        baseUrl: 'https://api.anthropic.com',
        model: 'claude-sonnet-4-5',
        agentId: 'mock',
        skillId: null,
        designSystemId: null,
        onboardingCompleted: true,
        agentModels: {},
        privacyDecisionAt: 1,
        telemetry: { metrics: false, content: false, artifactManifest: false },
      }),
    );
  }, STORAGE_KEY);

  await page.route('**/api/agents', async (route) => {
    await route.fulfill({
      json: {
        agents: [
          {
            id: 'mock',
            name: 'Mock Agent',
            bin: 'mock-agent',
            available: true,
            version: 'test',
            models: [{ id: 'default', label: 'Default' }],
          },
        ],
      },
    });
  });

  await page.route('**/api/app-config', async (route) => {
    if (route.request().method() !== 'GET') {
      await route.continue();
      return;
    }
    await route.fulfill({
      json: {
        config: {
          onboardingCompleted: true,
          agentId: 'mock',
          skillId: null,
          designSystemId: null,
          agentModels: {},
          privacyDecisionAt: 1,
          telemetry: { metrics: false, content: false, artifactManifest: false },
        },
      },
    });
  });
});

test('home loads with the primary entry controls', async ({ page }) => {
  await gotoEntryHome(page);

  await expect(page.getByTestId('niki-project-sidebar')).toBeVisible();
  await expect(page.getByTestId('niki-new-project')).toHaveClass(/is-active/);
  await expect(page.getByTestId('niki-design-files')).toBeVisible();
  await expect(page.getByTestId('home-hero-input')).toBeVisible();
});

test('settings menu is reachable from home', async ({ page }) => {
  await gotoEntryHome(page);

  await page.getByTestId('niki-account-menu-trigger').click();
  const settingsMenu = page.getByTestId('niki-account-menu-popover');
  await expect(settingsMenu).toBeVisible();
  await settingsMenu.getByTestId('niki-account-open-settings').click();
  await expect(page.getByRole('dialog').first()).toBeVisible();
});

test('design files navigation reaches the unified workspace shell', async ({ page }) => {
  await gotoEntryHome(page);
  await page.getByTestId('niki-design-files').click();
  await expect(page).toHaveURL(/\/design-files$/);
  await expect(page.getByTestId('global-design-files')).toBeVisible();
  await expect(page.getByTestId('niki-project-sidebar')).toBeVisible();
});

async function gotoEntryHome(page: Page) {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await waitForLoadingToClear(page);
  const privacyDialog = page.getByRole('dialog').filter({ hasText: 'Help us improve Niki' });
  if (await privacyDialog.isVisible().catch(() => false)) {
    await privacyDialog.getByRole('button', { name: /not now/i }).click();
    await expect(privacyDialog).toHaveCount(0);
  }
  await expect(page.getByTestId('home-hero')).toBeVisible();
  await expect(page.getByTestId('home-hero-input')).toBeVisible();
}

async function waitForLoadingToClear(page: Page) {
  const loading = page.getByText('Loading Niki…');
  await loading.waitFor({ state: 'detached', timeout: 10_000 }).catch(() => {});
}
