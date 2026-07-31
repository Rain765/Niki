import { expect, test } from '@playwright/test';
import type { Page, Request } from '@playwright/test';

const STORAGE_KEY = 'open-design:config';

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

test('current Niki workspace exposes the project sidebar and home composer', async ({ page }) => {
  await gotoEntryHome(page);

  await expect(page.getByTestId('niki-project-sidebar')).toBeVisible();
  await expect(page.getByTestId('niki-new-project')).toBeVisible();
  await expect(page.getByTestId('niki-new-project')).toHaveClass(/is-active/);
  await expect(page.getByTestId('niki-design-files')).toBeVisible();
  await expect(page.getByTestId('niki-account-menu-trigger')).toBeVisible();
  await expect(page.getByTestId('entry-nav-home')).toHaveCount(0);
  await expect(page.getByTestId('home-hero-auto-poster-controls')).toBeVisible();
});

test('current Niki account menu exposes execution, preferences, shortcuts, and settings', async ({ page }) => {
  await gotoEntryHome(page);

  await page.getByTestId('niki-account-menu-trigger').click();
  const menu = page.getByTestId('niki-account-menu-popover');
  await expect(menu).toBeVisible();
  await expect(menu.getByTestId('inline-model-switcher-chip')).toBeVisible();
  await expect(menu.getByTestId('niki-account-language')).toBeVisible();
  await expect(menu.getByTestId('niki-account-appearance')).toBeVisible();
  await expect(menu.getByTestId('niki-account-shortcuts')).toBeVisible();

  await menu.getByTestId('niki-account-shortcuts').click();
  await expect(menu.getByTestId('niki-account-shortcut-list')).toBeVisible();
  await expect(menu.getByTestId('niki-account-shortcut-list')).toContainText('Shift + Enter');

  await menu.getByTestId('niki-account-open-settings').click();
  await expect(page.getByRole('dialog').first()).toBeVisible();
});

test('current Niki design files entry stays inside the unified workspace shell', async ({ page }) => {
  await gotoEntryHome(page);

  await page.getByTestId('niki-design-files').click();
  await expect(page).toHaveURL(/\/design-files$/);
  await expect(page.getByTestId('global-design-files')).toBeVisible();
  await expect(page.getByTestId('niki-project-sidebar')).toBeVisible();

  await page.getByTestId('niki-new-project').click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByTestId('home-hero')).toBeVisible();
});

test('current Niki mobile drawer keeps project and design-file navigation available', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await gotoEntryHome(page);

  const menuButton = page.locator('.niki-workspace__menu-button');
  await expect(menuButton).toBeVisible();
  await menuButton.click();
  await expect(page.locator('.niki-workspace')).toHaveClass(/is-drawer-open/);
  await expect(page.getByTestId('niki-project-sidebar')).toBeVisible();

  await page.getByTestId('niki-design-files').click();
  await expect(page).toHaveURL(/\/design-files$/);
  await expect(page.getByTestId('global-design-files')).toBeVisible();
});

test('current Niki project sidebar opens an existing project', async ({ page }) => {
  const older = await createProject(page, 'Sidebar older project');
  const newer = await createProject(page, 'Sidebar newer project');

  await gotoEntryHome(page);

  const projectLinks = page.locator('.niki-workspace__project-link');
  await expect(projectLinks).toContainText(['Sidebar newer project', 'Sidebar older project']);
  await projectLinks.filter({ hasText: 'Sidebar newer project' }).click();
  await expect(page).toHaveURL(new RegExp(`/projects/${newer.project.id}`));
  await expect(page.getByTestId('chat-composer')).toBeVisible();
  await expect(page.getByTestId('niki-project-sidebar')).toBeVisible();

  void older;
});

test('current Niki sidebar renders a stable empty-project state', async ({ page }) => {
  await page.route('**/api/projects', async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({ json: { projects: [] } });
      return;
    }
    await route.continue();
  });

  await gotoEntryHome(page);
  await expect(page.locator('.niki-workspace__project-link')).toHaveCount(0);
  await expect(page.locator('.niki-workspace__empty')).toBeVisible();
});

test('current Niki workspace avoids horizontal overflow on compact desktop widths', async ({ page }) => {
  await page.setViewportSize({ width: 820, height: 900 });
  await gotoEntryHome(page);

  const overflow = await page.evaluate(() => {
    const workspace = document.querySelector('.niki-workspace');
    const sidebar = document.querySelector('.niki-workspace__sidebar');
    return {
      page: Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth),
      workspace: workspace instanceof HTMLElement
        ? Math.max(0, workspace.scrollWidth - workspace.clientWidth)
        : null,
      sidebar: sidebar instanceof HTMLElement
        ? Math.max(0, sidebar.scrollWidth - sidebar.clientWidth)
        : null,
    };
  });

  expect(overflow.workspace).not.toBeNull();
  expect(overflow.sidebar).not.toBeNull();
  expect(overflow.page).toBeLessThanOrEqual(2);
  expect(overflow.workspace!).toBeLessThanOrEqual(2);
  expect(overflow.sidebar!).toBeLessThanOrEqual(2);
});

test('home starters stay deferred in the poster-first Niki workspace', async ({ page }) => {
  let pluginRequests = 0;
  await page.route('**/api/plugins', async (route) => {
    pluginRequests += 1;
    await route.fulfill({ json: { plugins: [] } });
  });
  await gotoEntryHome(page);

  expect(pluginRequests).toBe(0);
  await expect(page.getByTestId('plugins-home-section')).toHaveCount(0);
  await expect(page.getByTestId('home-hero-send-menu')).not.toBeVisible();
});

test('home hero exposes visible product, size, and 1 through 10 poster controls', async ({ page }) => {
  await gotoEntryHome(page);

  const input = page.getByTestId('home-hero-input');
  const submit = page.getByTestId('home-hero-submit');
  const product = page.getByTestId('home-hero-auto-poster-product-zamloan');
  const nativeCount = page.getByTestId('home-hero-auto-poster-count');

  await expect(input).toHaveValue('');
  await expect(submit).toBeEnabled();
  await expect(submit).toHaveAttribute('data-action', 'generate');
  await expect(product).toHaveAttribute('aria-pressed', 'true');
  await product.click();
  await expect(page.getByTestId('home-hero-auto-poster-menu')).toBeVisible();
  await expect(nativeCount.locator('option')).toHaveCount(10);
  await page.getByTestId('home-hero-auto-poster-count-option-10').click();
  await expect(nativeCount).toHaveValue('10');
  await expect(input).toHaveValue('');
});

test('home hero input keeps Shift+Enter as a newline and submits on Enter', async ({ page }) => {
  await gotoEntryHome(page);

  const input = page.getByTestId('home-hero-input');
  await input.fill('Line one');
  await input.press('Shift+Enter');
  await input.type('Line two');
  await expect(input).toHaveValue('Line one\nLine two');

  const projectRequestPromise = page.waitForRequest(isCreateProjectRequest);
  const runRequestPromise = page.waitForRequest(isCreateRunRequest);
  await input.press('Enter');

  const projectBody = (await projectRequestPromise).postDataJSON() as { pendingPrompt?: string };
  expect(projectBody.pendingPrompt).toBe('Line one\nLine two');
  const runBody = (await runRequestPromise).postDataJSON() as { message?: string };
  expect(runBody.message).toContain('Line one\nLine two');
  await expect(page).toHaveURL(/\/projects\//);
});

test('home hero attachment staging switches between generate and send actions', async ({ page }) => {
  await gotoEntryHome(page);

  const fileInput = page.getByTestId('home-hero-file-input');
  const submit = page.getByTestId('home-hero-submit');
  await expect(submit).toHaveAttribute('data-action', 'generate');

  await fileInput.setInputFiles({
    name: 'brief.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from('Attachment staged from the home hero.\n', 'utf8'),
  });

  const staged = page.getByTestId('home-hero-staged-files');
  await expect(staged.getByText('brief.txt', { exact: true })).toBeVisible();
  await expect(submit).toHaveAttribute('data-action', 'send');
  await page.getByRole('button', { name: /Remove brief\.txt/i }).click();
  await expect(staged).toHaveCount(0);
  await expect(submit).toHaveAttribute('data-action', 'generate');
});

test('home hero attachment-only submit uploads the file and opens the project', async ({ page }) => {
  await gotoEntryHome(page);

  const uploadResponse = page.waitForResponse(
    (response) =>
      /\/api\/projects\/[^/]+\/upload$/.test(new URL(response.url()).pathname)
      && response.request().method() === 'POST',
  );
  await page.getByTestId('home-hero-file-input').setInputFiles({
    name: 'reference.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from('Attachment-only home submission.\n', 'utf8'),
  });
  await page.getByTestId('home-hero-submit').click();

  await expect((await uploadResponse).ok()).toBeTruthy();
  await expect(page).toHaveURL(/\/projects\//);
  await expect(page.locator('.user-attachments').getByText('reference.txt', { exact: true })).toBeVisible();
});

async function gotoEntryHome(page: Page) {
  await page.goto('/');
  const privacyDialog = page.getByRole('dialog').filter({ hasText: 'Help us improve Niki' });
  if (await privacyDialog.isVisible().catch(() => false)) {
    await privacyDialog.getByRole('button', { name: /not now/i }).click();
    await expect(privacyDialog).toHaveCount(0);
  }
  await expect(page.getByTestId('home-hero')).toBeVisible();
  await expect(page.getByTestId('home-hero-input')).toBeVisible();
}

async function createProject(page: Page, name: string) {
  const id = `entry-home-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const response = await page.request.post('/api/projects', {
    data: {
      id,
      name,
      skillId: null,
      designSystemId: null,
      metadata: { kind: 'prototype' },
    },
  });
  expect(response.ok(), await response.text()).toBeTruthy();
  return response.json() as Promise<{ project: { id: string; name: string } }>;
}

function isCreateRunRequest(request: Request): boolean {
  const url = new URL(request.url());
  return url.pathname === '/api/runs' && request.method() === 'POST';
}

function isCreateProjectRequest(request: Request): boolean {
  const url = new URL(request.url());
  return url.pathname === '/api/projects' && request.method() === 'POST';
}
