// @vitest-environment jsdom

/**
 * Visibility-gate coverage for assistant artifact feedback (issue #1288).
 * Feedback should only appear for successful assistant turns that produce
 * or update an artifact, not for text-only acknowledgements, failed runs,
 * streaming turns, or empty responses.
 */

import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AssistantMessage } from '../../src/components/AssistantMessage';
import type { ChatMessage, ProjectFile } from '../../src/types';

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

beforeEach(() => {
  window.localStorage.clear();
});

function baseMessage(overrides: Partial<ChatMessage> = {}): ChatMessage {
  return {
    id: 'msg-1',
    role: 'assistant',
    content: 'Done.',
    runStatus: 'succeeded',
    startedAt: 1700000000,
    endedAt: 1700000005,
    events: [{ kind: 'text', text: 'Done.' } as ChatMessage['events'][number]],
    producedFiles: [],
    ...overrides,
  } as ChatMessage;
}

function producedFile(name: string): ProjectFile {
  return {
    name,
    path: name,
    size: 100,
    mtime: 1700000000,
    kind: 'html',
    mime: 'text/html',
  } as ProjectFile;
}

describe('AssistantMessage feedback gate (issue #1288)', () => {
  it('previews a linked generated image without switching to the canvas', () => {
    const onRequestOpenFile = vi.fn();
    const fileName = 'zamloan-poster-01.png';
    render(
      <AssistantMessage
        message={baseMessage({
          content: `Generated [${fileName}](/api/projects/proj-1/raw/${fileName}).`,
          events: [
            {
              kind: 'text',
              text: `Generated [${fileName}](/api/projects/proj-1/raw/${fileName}).`,
            } as ChatMessage['events'][number],
          ],
        })}
        streaming={false}
        projectId="proj-1"
        projectFiles={[
          {
            ...producedFile(fileName),
            kind: 'image',
            mime: 'image/png',
          },
        ]}
        projectFileNames={new Set([fileName])}
        onRequestOpenFile={onRequestOpenFile}
      />,
    );

    const [fileLink] = screen.getAllByRole('button', { name: fileName });
    fireEvent.click(fileLink);
    expect(
      screen.getByRole('dialog', { name: `Preview ${fileName}` }),
    ).toBeTruthy();
    expect(
      screen.getByTestId('image-lightbox-image').getAttribute('src'),
    ).toBe(
      `/api/projects/proj-1/image-preview/${fileName}?variant=preview&v=1700000000`,
    );
    expect(onRequestOpenFile).not.toHaveBeenCalled();
    expect(screen.queryByRole('link', { name: fileName })).toBeNull();
  });

  it('keeps a linked generated image visible when replay has not attached producedFiles', () => {
    const fileName = 'zamloan-poster-01.png';
    render(
      <AssistantMessage
        message={baseMessage({
          content: `Generated [${fileName}](/api/projects/proj-1/raw/${fileName}).`,
          events: [
            {
              kind: 'text',
              text: `Generated [${fileName}](/api/projects/proj-1/raw/${fileName}).`,
            } as ChatMessage['events'][number],
          ],
          producedFiles: [],
        })}
        streaming={false}
        projectId="proj-1"
        projectFiles={[
          {
            ...producedFile(fileName),
            kind: 'image',
            mime: 'image/png',
          },
        ]}
        projectFileNames={new Set([fileName])}
        onRequestOpenFile={vi.fn()}
      />,
    );

    expect(screen.getByTestId(`produced-file-thumbnail-${fileName}`)).toBeTruthy();
  });

  it('recovers a generated image from a successful media tool result', () => {
    const onRequestOpenFile = vi.fn();
    const fileName = 'zamloan-poster-01.png';
    render(
      <AssistantMessage
        message={baseMessage({
          content: `Generated [${fileName}](/workspace/${fileName}).`,
          events: [
            {
              kind: 'text',
              text: `Generated [${fileName}](/workspace/${fileName}).`,
            },
            {
              kind: 'tool_result',
              toolUseId: 'media-generate',
              isError: false,
              content: JSON.stringify({
                file: {
                  name: fileName,
                  size: 2_287_785,
                  mtime: 1_720_000_000,
                  kind: 'image',
                  mime: 'image/png',
                },
              }),
            },
          ] as ChatMessage['events'],
          producedFiles: [],
          runStatus: 'failed',
        })}
        streaming={false}
        projectId="proj-1"
        onRequestOpenFile={onRequestOpenFile}
      />,
    );

    const thumbnail = screen.getByTestId(
      `produced-file-thumbnail-${fileName}`,
    );
    expect(thumbnail).toBeTruthy();
    fireEvent.click(screen.getAllByRole('button', { name: fileName })[0]!);
    expect(
      screen.getByRole('dialog', { name: `Preview ${fileName}` }),
    ).toBeTruthy();
    expect(onRequestOpenFile).not.toHaveBeenCalled();
    expect(screen.queryByRole('link', { name: fileName })).toBeNull();
  });

  it('renders image deliverables as thumbnails beside their file copy', () => {
    const onRequestOpenFile = vi.fn();
    render(
      <AssistantMessage
        message={baseMessage({
          producedFiles: [
            {
              ...producedFile('zambia-support-poster-01.png'),
              kind: 'image',
              mime: 'image/png',
            },
          ],
        })}
        streaming={false}
        projectId="proj-1"
        onRequestOpenFile={onRequestOpenFile}
      />,
    );

    const thumbnail = screen.getByTestId(
      'produced-file-thumbnail-zambia-support-poster-01.png',
    ) as HTMLImageElement;
    expect(thumbnail.src).toContain(
      '/api/projects/proj-1/image-preview/zambia-support-poster-01.png?variant=thumbnail',
    );
    fireEvent.click(thumbnail.closest('button')!);
    expect(screen.getByTestId('image-lightbox-image')).toBeTruthy();
    expect(onRequestOpenFile).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    fireEvent.click(screen.getByRole('button', { name: 'zambia-support-poster-01.png' }));
    expect(screen.getByTestId('image-lightbox-image')).toBeTruthy();
    expect(onRequestOpenFile).not.toHaveBeenCalled();
    const preview = screen.getByRole('dialog', {
      name: 'Preview zambia-support-poster-01.png',
    });
    expect(within(preview).getByTestId('image-lightbox-footer-download').tagName).toBe('BUTTON');
    expect(within(preview).queryByRole('button', { name: 'Edit' })).toBeNull();
    fireEvent.click(within(preview).getByTestId('image-lightbox-footer-preview'));
    expect(screen.getByTestId('image-post-preview-feed')).toBeTruthy();
    expect(onRequestOpenFile).not.toHaveBeenCalled();
  });

  it('shows the feedback widget after a successful turn that produced files', () => {
    render(
      <AssistantMessage
        message={baseMessage({ producedFiles: [producedFile('index.html')] })}
        streaming={false}
        projectId="proj-1"
        onFeedback={vi.fn()}
      />,
    );
    expect(screen.getByRole('group', { name: 'Feedback' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Helpful' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Not helpful' })).toBeTruthy();
  });

  it('hides the feedback widget for a successful text-only turn with no producedFiles', () => {
    // Regression for lefarcen P2: the issue scopes feedback to
    // turns that delivered a final artifact, not every successful
    // turn. Text-only acknowledgements ("Got it.") must not prompt
    // for feedback.
    render(
      <AssistantMessage
        message={baseMessage({ producedFiles: [] })}
        streaming={false}
        projectId="proj-1"
        onFeedback={vi.fn()}
      />,
    );
    expect(screen.queryByRole('group', { name: 'Feedback' })).toBeNull();
  });

  it('hides the feedback widget while the turn is still streaming', () => {
    render(
      <AssistantMessage
        message={baseMessage({
          producedFiles: [producedFile('index.html')],
          runStatus: 'running',
          endedAt: undefined,
        })}
        streaming
        projectId="proj-1"
        onFeedback={vi.fn()}
      />,
    );
    expect(screen.queryByRole('group', { name: 'Feedback' })).toBeNull();
  });

  it('hides the feedback widget when the run failed', () => {
    render(
      <AssistantMessage
        message={baseMessage({
          producedFiles: [producedFile('index.html')],
          runStatus: 'failed',
        })}
        streaming={false}
        projectId="proj-1"
        onFeedback={vi.fn()}
      />,
    );
    expect(screen.queryByRole('group', { name: 'Feedback' })).toBeNull();
  });

  it('hides the feedback widget when the run ended with an empty_response status', () => {
    render(
      <AssistantMessage
        message={baseMessage({
          producedFiles: [producedFile('index.html')],
          events: [
            { kind: 'status', label: 'empty_response' } as ChatMessage['events'][number],
          ],
        })}
        streaming={false}
        projectId="proj-1"
        onFeedback={vi.fn()}
      />,
    );
    expect(screen.queryByRole('group', { name: 'Feedback' })).toBeNull();
  });
});

describe('AssistantMessage status badge updates (Bug A)', () => {
  // Regression coverage for the model-badge stale-detail bug. ACP agents
  // emit two `status: 'model'` events per turn:
  //   1. After session/new returns — the agent's initial default model
  //      (e.g. `swe-1-6-fast` for Devin for Terminal)
  //   2. After session/set_config_option (or legacy session/set_model)
  //      succeeds — the user-selected model (e.g. `claude-opus-4-7-max`)
  //
  // The previous `buildBlocks` dedupe SKIPPED the second event and the
  // badge stayed stuck on the initial default, even though the running
  // model and the conversation header were already correct. The fix
  // updates the existing block's detail to the latest value so the badge
  // tracks the most recent model the daemon reported.
  it('renders the most recent detail when multiple status events share a label', () => {
    render(
      <AssistantMessage
        message={baseMessage({
          events: [
            { kind: 'status', label: 'model', detail: 'swe-1-6-fast' } as ChatMessage['events'][number],
            { kind: 'status', label: 'model', detail: 'claude-opus-4-7-max' } as ChatMessage['events'][number],
            { kind: 'text', text: 'Done.' } as ChatMessage['events'][number],
          ],
        })}
        streaming={false}
        projectId="proj-1"
        onFeedback={vi.fn()}
      />,
    );

    // Latest detail should be rendered in the badge.
    expect(screen.getByText('claude-opus-4-7-max')).toBeTruthy();

    // The initial default must not be present — if it is, the stale-detail
    // bug is back.
    expect(screen.queryByText('swe-1-6-fast')).toBeNull();
  });

  it('still collapses repeated status events with the same label and detail into a single badge', () => {
    render(
      <AssistantMessage
        message={baseMessage({
          events: [
            { kind: 'status', label: 'model', detail: 'claude-opus-4-7-max' } as ChatMessage['events'][number],
            { kind: 'status', label: 'model', detail: 'claude-opus-4-7-max' } as ChatMessage['events'][number],
            { kind: 'text', text: 'Done.' } as ChatMessage['events'][number],
          ],
        })}
        streaming={false}
        projectId="proj-1"
        onFeedback={vi.fn()}
      />,
    );

    const matches = screen.queryAllByText('claude-opus-4-7-max');
    expect(matches.length).toBe(1);
  });
});
