// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '../../src/i18n';
import { LogoStudioView } from '../../src/components/LogoStudioView';

const { createProjectMock } = vi.hoisted(() => ({ createProjectMock: vi.fn() }));

vi.mock('../../src/state/projects', () => ({ createProject: createProjectMock }));

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe('LogoStudioView', () => {
  it('builds the brief through the logo API and creates an auto-running project', async () => {
    createProjectMock.mockResolvedValue({
      project: { id: 'logo-project-1' },
      conversationId: 'conversation-1',
      appliedPluginSnapshotId: 'snapshot-1',
    });
    const fetchMock = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response(JSON.stringify({
      brief: {
        brandName: 'Northstar',
        industry: 'Climate analytics',
        audience: '',
        personality: ['precise'],
        architecture: 'combination',
        palette: ['#FF5A1F'],
        applications: ['web'],
        avoid: [],
        notes: '',
      },
      project: {
        name: 'Northstar Logo',
        skillId: 'logo-generator',
        designSystemId: null,
        pendingPrompt: 'Use $logo-generator',
        metadata: { kind: 'image', imageAspect: '1:1', skipDiscoveryBrief: true },
        pluginId: 'od-media-generation',
        pluginInputs: { mediaKind: 'image', aspect: '1:1' },
      },
      }), { status: 200, headers: { 'content-type': 'application/json' } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ runId: 'run-1' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }));

    render(
      <I18nProvider initial="en">
        <LogoStudioView />
      </I18nProvider>,
    );

    fireEvent.change(screen.getByLabelText('Brand name'), { target: { value: 'Northstar' } });
    fireEvent.change(screen.getByLabelText('Industry'), { target: { value: 'Climate analytics' } });
    fireEvent.click(screen.getByRole('button', { name: 'Generate 4 directions' }));

    await waitFor(() => expect(screen.getByRole('status').textContent).toContain('Generation started'));
    expect(fetchMock).toHaveBeenCalledWith('/api/logo/brief', expect.objectContaining({ method: 'POST' }));
    expect(createProjectMock).toHaveBeenCalledWith(expect.objectContaining({
      name: 'Northstar Logo',
      skillId: 'logo-generator',
      pendingPrompt: 'Use $logo-generator',
    }));
    expect(fetchMock).toHaveBeenCalledWith('/api/runs', expect.objectContaining({ method: 'POST' }));
  });

  it('keeps the user on the form when required fields are empty', () => {
    render(
      <I18nProvider initial="en">
        <LogoStudioView />
      </I18nProvider>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Generate 4 directions' }));
    expect(screen.getByRole('alert').textContent).toContain('brand name and industry');
    expect(createProjectMock).not.toHaveBeenCalled();
  });

  it('opens a custom color picker and updates the selected palette color', () => {
    render(
      <I18nProvider initial="en">
        <LogoStudioView />
      </I18nProvider>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Starting palette 1' }));
    expect(screen.getByRole('dialog', { name: 'Color picker for Starting palette 1' })).toBeTruthy();

    fireEvent.change(screen.getByLabelText('Hex color'), { target: { value: '1F4E5B80' } });
    expect(screen.getByRole('button', { name: 'Starting palette 1' }).textContent).toContain('#1F4E5B80');
    expect((screen.getByLabelText('Opacity') as HTMLInputElement).value).toBe('50');

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByRole('dialog', { name: 'Color picker for Starting palette 1' })).toBeNull();
  });
});
