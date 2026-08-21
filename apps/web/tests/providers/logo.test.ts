// @vitest-environment jsdom

import type { LogoFinalization } from '@open-design/contracts';
import { afterEach, describe, expect, it, vi } from 'vitest';

const { fetchAgentsMock, streamViaDaemonMock } = vi.hoisted(() => ({
  fetchAgentsMock: vi.fn(),
  streamViaDaemonMock: vi.fn(),
}));

vi.mock('../../src/providers/registry', () => ({
  fetchAgents: fetchAgentsMock,
}));

vi.mock('../../src/providers/daemon', () => ({
  streamViaDaemon: streamViaDaemonMock,
}));

vi.mock('../../src/utils/uuid', () => ({
  randomUUID: () => 'assistant-message-1',
}));

import { finalizeLogoDirection } from '../../src/providers/logo';

const expectedOutputs = [
  'logo.svg',
  'logo-dark.svg',
  'logo-mono.svg',
  'favicon.ico',
  'apple-touch-icon.png',
  'og-image.png',
  'BRAND.md',
];

const preparedFinalization: LogoFinalization = {
  id: 'final-123',
  projectId: 'logo-project-1',
  conversationId: 'conversation-1',
  clientRequestId: 'logo-finalize:final-123',
  direction: 2,
  sourceFile: 'logo-direction-02.png',
  outputRoot: 'logo/final/final-123',
  expectedOutputs,
  outputFiles: [],
  status: 'prepared',
  requestedAt: 300,
  notes: '',
  prompt: 'Refine the selected logo.',
};

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('logo provider', () => {
  it('reports partial files and returns as soon as the required brand kit exists', async () => {
    vi.useFakeTimers();
    fetchAgentsMock.mockResolvedValue([{ id: 'codex', name: 'Codex', available: true }]);
    streamViaDaemonMock.mockReturnValue(new Promise(() => {}));
    const partial = {
      ...preparedFinalization,
      status: 'running' as const,
      outputFiles: [`${preparedFinalization.outputRoot}/logo.svg`],
    };
    const complete = {
      ...preparedFinalization,
      status: 'complete' as const,
      outputFiles: expectedOutputs.map((name) => `${preparedFinalization.outputRoot}/${name}`),
      archiveUrl: '/api/projects/logo-project-1/archive?root=logo%2Ffinal%2Ffinal-123',
    };
    let finalizationPoll = 0;
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      if (url === '/api/logo/finalize') {
        return new Response(JSON.stringify({
          finalization: preparedFinalization,
          prompt: preparedFinalization.prompt,
        }), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      finalizationPoll += 1;
      return new Response(JSON.stringify({
        finalizations: [finalizationPoll === 1 ? partial : complete],
      }), { status: 200, headers: { 'content-type': 'application/json' } });
    });
    const onProgress = vi.fn();

    const resultPromise = finalizeLogoDirection({
      projectId: 'logo-project-1',
      direction: 2,
    }, { onProgress });

    await vi.waitFor(() => expect(onProgress).toHaveBeenCalledWith(partial));
    await vi.advanceTimersByTimeAsync(1_000);

    await expect(resultPromise).resolves.toEqual(complete);
    expect(streamViaDaemonMock).toHaveBeenCalledTimes(1);
    expect(onProgress).toHaveBeenLastCalledWith(complete);
  });
});
