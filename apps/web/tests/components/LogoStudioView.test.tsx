// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '../../src/i18n';
import { LogoStudioView } from '../../src/components/LogoStudioView';

const {
  createProjectMock,
  fetchAgentsMock,
  loadConfigMock,
  saveMessageMock,
  streamViaDaemonMock,
} = vi.hoisted(() => ({
  createProjectMock: vi.fn(),
  fetchAgentsMock: vi.fn(),
  loadConfigMock: vi.fn(),
  saveMessageMock: vi.fn(),
  streamViaDaemonMock: vi.fn(),
}));

vi.mock('../../src/state/projects', () => ({
  createProject: createProjectMock,
  saveMessage: saveMessageMock,
}));
vi.mock('../../src/providers/daemon', () => ({ streamViaDaemon: streamViaDaemonMock }));
vi.mock('../../src/providers/registry', () => ({ fetchAgents: fetchAgentsMock }));
vi.mock('../../src/state/config', () => ({ loadConfig: loadConfigMock }));

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

beforeEach(() => {
  vi.clearAllMocks();
  fetchAgentsMock.mockResolvedValue([
    { id: 'codex', name: 'Codex', bin: 'codex', available: true },
  ]);
  loadConfigMock.mockReturnValue({
    mode: 'daemon',
    agentId: 'codex',
    agentModels: { codex: { model: 'gpt-5.6-sol', reasoning: 'high' } },
  });
  saveMessageMock.mockResolvedValue(undefined);
  streamViaDaemonMock.mockImplementation(async (options) => {
    options.onRunCreated?.('run-1');
    options.onRunStatus?.('queued');
    options.handlers.onDone('Generated logo directions');
  });
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
      }), { status: 200, headers: { 'content-type': 'application/json' } }));

    render(
      <I18nProvider initial="en">
        <LogoStudioView />
      </I18nProvider>,
    );

    fireEvent.change(screen.getByLabelText('Brand name'), { target: { value: 'Northstar' } });
    fireEvent.change(screen.getByLabelText('Industry'), { target: { value: 'Climate analytics' } });
    fireEvent.click(screen.getByRole('button', { name: 'Generate 4 directions' }));

    await waitFor(() => expect(screen.getByRole('status').textContent).toContain('Generation complete'));
    expect(fetchMock).toHaveBeenCalledWith('/api/logo/brief', expect.objectContaining({ method: 'POST' }));
    expect(createProjectMock).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Northstar Logo',
        skillId: 'logo-generator',
        pendingPrompt: 'Use $logo-generator',
      }),
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
    expect(fetchAgentsMock).toHaveBeenCalled();
    expect(streamViaDaemonMock).toHaveBeenCalledWith(expect.objectContaining({
      agentId: 'codex',
      projectId: 'logo-project-1',
      conversationId: 'conversation-1',
      skillId: 'logo-generator',
      model: 'gpt-5.6-sol',
      reasoning: 'high',
      assistantMessageId: expect.any(String),
      clientRequestId: expect.any(String),
    }));
    expect(fetchMock).not.toHaveBeenCalledWith('/api/runs', expect.anything());
    expect(saveMessageMock).toHaveBeenCalledTimes(3);
  });

  it('reports a clear failure when no local generation agent is available', async () => {
    fetchAgentsMock.mockResolvedValue([]);
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response(JSON.stringify({
      brief: {},
      project: {
        name: 'Northstar Logo',
        skillId: 'logo-generator',
        designSystemId: null,
        pendingPrompt: 'Use $logo-generator',
        metadata: { kind: 'image', imageAspect: '1:1', skipDiscoveryBrief: true },
      },
    }), { status: 200, headers: { 'content-type': 'application/json' } }));

    render(
      <I18nProvider initial="en">
        <LogoStudioView />
      </I18nProvider>,
    );

    fireEvent.change(screen.getByLabelText('Brand name'), { target: { value: 'Northstar' } });
    fireEvent.change(screen.getByLabelText('Industry'), { target: { value: 'Climate analytics' } });
    fireEvent.click(screen.getByRole('button', { name: 'Generate 4 directions' }));

    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('local generation agent'));
    expect(createProjectMock).not.toHaveBeenCalled();
    expect(streamViaDaemonMock).not.toHaveBeenCalled();
  });

  it('shows a four-direction skeleton until logo generation finishes', async () => {
    createProjectMock.mockResolvedValue({
      project: { id: 'logo-project-1' },
      conversationId: 'conversation-1',
      appliedPluginSnapshotId: 'snapshot-1',
    });
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response(JSON.stringify({
      brief: {},
      project: {
        name: 'Northstar Logo',
        skillId: 'logo-generator',
        designSystemId: null,
        pendingPrompt: 'Use $logo-generator',
        metadata: { kind: 'image', imageAspect: '1:1', skipDiscoveryBrief: true },
      },
    }), { status: 200, headers: { 'content-type': 'application/json' } }));

    let finishGeneration: (() => void) | undefined;
    streamViaDaemonMock.mockImplementation(async (options) => {
      options.onRunCreated?.('run-1');
      options.onRunStatus?.('running');
      finishGeneration = () => options.handlers.onDone('Generated logo directions');
    });

    render(
      <I18nProvider initial="en">
        <LogoStudioView />
      </I18nProvider>,
    );

    fireEvent.change(screen.getByLabelText('Brand name'), { target: { value: 'Northstar' } });
    fireEvent.change(screen.getByLabelText('Industry'), { target: { value: 'Climate analytics' } });
    fireEvent.click(screen.getByRole('button', { name: 'Generate 4 directions' }));

    const skeleton = await screen.findByTestId('logo-generation-skeleton');
    expect(skeleton.textContent).toContain('Generating 4 directions');
    expect((screen.getByRole('button', { name: 'Generating…' }) as HTMLButtonElement).disabled).toBe(true);

    act(() => finishGeneration?.());

    await waitFor(() => expect(screen.queryByTestId('logo-generation-skeleton')).toBeNull());
    expect((screen.getByRole('button', { name: 'Generate 4 directions' }) as HTMLButtonElement).disabled).toBe(false);
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
