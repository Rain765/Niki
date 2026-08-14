import type { ChatRunStatus, ChatRunStatusResponse } from '@open-design/contracts';
import { useCallback, useEffect, useRef, useState } from 'react';

import type { AgentEvent, ChatMessage, Project, ProjectFile, ProjectMetadata } from '../../types';
import {
  fetchChatRunStatus,
  listProjectRuns,
  reattachDaemonRun,
  streamViaDaemon,
} from '../../providers/daemon';
import {
  deleteProjectFile,
  fetchAgents,
  fetchProjectFiles,
  uploadProjectFiles,
} from '../../providers/registry';
import { fetchDaemonConfig } from '../../state/config';
import {
  createProject,
  getProject,
  listMessages,
  listProjects,
  saveMessage,
} from '../../state/projects';
import { randomUUID } from '../../utils/uuid';
import {
  buildLoanVideoPrompt,
  LOAN_VIDEO_PLUGIN_ID,
  LOAN_VIDEO_SKILL_ID,
  loanVideoProjectName,
} from './loan-video';
import {
  LOAN_VIDEO_ASPECT_RATIOS,
  type LoanVideoAspectRatio,
  type LoanVideoDraft,
} from './types';

export type LoanVideoGenerationPhase =
  | 'idle'
  | 'restoring'
  | 'preparing'
  | 'uploading'
  | ChatRunStatus;

export interface LoanVideoGenerationState {
  aspectRatio: LoanVideoAspectRatio;
  error: string | null;
  files: ProjectFile[];
  phase: LoanVideoGenerationPhase;
  projectId: string | null;
  requestedAt: number | null;
  runId: string | null;
}

const INITIAL_STATE: LoanVideoGenerationState = {
  aspectRatio: '9:16',
  error: null,
  files: [],
  phase: 'restoring',
  projectId: null,
  requestedAt: null,
  runId: null,
};

const LAST_VIDEO_PROJECT_STORAGE_KEY = 'niki:loan-video:last-project';
const RUN_FINISHED_WITHOUT_MP4 = 'The generation run finished without producing an MP4. Submit again to retry.';

interface StoredVideoRunPointer {
  conversationId: string;
  projectId: string;
  runId?: string;
}

interface RestoredVideoRun {
  files: ProjectFile[];
  project: Project;
  run: ChatRunStatusResponse | null;
}

function scopedStorageKey(sessionScope: string): string {
  return `${LAST_VIDEO_PROJECT_STORAGE_KEY}:${encodeURIComponent(sessionScope.trim())}`;
}

function readStoredPointer(sessionScope: string): StoredVideoRunPointer | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(scopedStorageKey(sessionScope));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StoredVideoRunPointer>;
    if (typeof parsed.projectId !== 'string' || typeof parsed.conversationId !== 'string') {
      return null;
    }
    return {
      projectId: parsed.projectId,
      conversationId: parsed.conversationId,
      ...(typeof parsed.runId === 'string' ? { runId: parsed.runId } : {}),
    };
  } catch {
    return null;
  }
}

function writeStoredPointer(sessionScope: string, pointer: StoredVideoRunPointer): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(scopedStorageKey(sessionScope), JSON.stringify(pointer));
  } catch {
    // Persistence is an optimization. The project and run remain durable in SQLite.
  }
}

function clearStoredPointer(sessionScope: string): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(scopedStorageKey(sessionScope));
  } catch {
    // Ignore browsers that block localStorage.
  }
}

function isTutorialVideoProject(project: Project): boolean {
  return project.skillId === LOAN_VIDEO_SKILL_ID
    && project.metadata?.kind === 'video'
    && project.metadata.videoModel === 'hyperframes-html';
}

function latestProjectRun(
  projectId: string,
  runs: ChatRunStatusResponse[],
  preferredRunId?: string,
): ChatRunStatusResponse | null {
  const projectRuns = runs.filter((run) => run.projectId === projectId);
  if (preferredRunId) {
    const preferred = projectRuns.find((run) => run.id === preferredRunId);
    if (preferred) return preferred;
  }
  return projectRuns.sort((left, right) => right.createdAt - left.createdAt)[0] ?? null;
}

async function restoreLatestVideoRun(sessionScope: string): Promise<RestoredVideoRun | null> {
  const pointer = readStoredPointer(sessionScope);
  const [storedProject, storedRun, projects, runs] = await Promise.all([
    pointer ? getProject(pointer.projectId) : Promise.resolve(null),
    pointer?.runId ? fetchChatRunStatus(pointer.runId) : Promise.resolve(null),
    listProjects(),
    listProjectRuns(),
  ]);
  const candidates = projects.filter(isTutorialVideoProject);
  if (
    storedProject
    && isTutorialVideoProject(storedProject)
    && !candidates.some((candidate) => candidate.id === storedProject.id)
  ) {
    candidates.push(storedProject);
  }
  const project = candidates.sort((left, right) => right.updatedAt - left.updatedAt)[0] ?? null;
  if (!project) {
    if (pointer) clearStoredPointer(sessionScope);
    return null;
  }

  const run = storedRun?.projectId === project.id
    ? storedRun
    : latestProjectRun(project.id, runs, pointer?.runId);
  if (run?.conversationId) {
    writeStoredPointer(sessionScope, {
      projectId: project.id,
      conversationId: run.conversationId,
      runId: run.id,
    });
  }
  return {
    project,
    run,
    files: await fetchProjectFiles(project.id),
  };
}

function phaseFromRun(run: ChatRunStatusResponse, hasVideo: boolean): LoanVideoGenerationPhase {
  if (run.status === 'canceled') return 'failed';
  if (run.status === 'succeeded' && !hasVideo) return 'failed';
  return run.status;
}

function videoFiles(files: ProjectFile[]): ProjectFile[] {
  return files
    .filter((file) => file.kind === 'video' || file.name.toLowerCase().endsWith('.mp4'))
    .sort((left, right) => right.mtime - left.mtime);
}

function projectAspectRatio(project: Project): LoanVideoAspectRatio {
  const aspectRatio = project.metadata?.videoAspect;
  return LOAN_VIDEO_ASPECT_RATIOS.find((candidate) => candidate === aspectRatio) ?? '9:16';
}

function restoredRequestedAt(project: Project, run: ChatRunStatusResponse | null): number {
  return run?.createdAt
    ?? project.metadata?.directGeneration?.requestedAt
    ?? project.createdAt;
}

function runFailureMessage(run: ChatRunStatusResponse): string {
  if (run.status === 'canceled') return 'Video generation was canceled. Submit again to retry.';
  return run.error?.trim() || 'Video generation failed. Submit again to retry.';
}

async function resolveExecutionChoice(): Promise<{
  agentId: string;
  model: string | null;
  reasoning: string | null;
}> {
  const [config, agents] = await Promise.all([fetchDaemonConfig(), fetchAgents()]);
  const configuredAgent = config?.agentId
    ? agents.find((agent) => agent.id === config.agentId)
    : null;
  const agentId = configuredAgent?.available
    ? configuredAgent.id
    : agents.find((agent) => agent.available)?.id
      ?? (agents.length === 0 ? config?.agentId : null);
  if (!agentId) {
    throw new Error('No local generation agent is available. Configure an agent and try again.');
  }
  const choice = config?.agentModels?.[agentId];
  return {
    agentId,
    model: choice?.model ?? null,
    reasoning: choice?.reasoning ?? null,
  };
}

function activePhase(phase: LoanVideoGenerationPhase): boolean {
  return phase === 'restoring'
    || phase === 'preparing'
    || phase === 'uploading'
    || phase === 'queued'
    || phase === 'running';
}

export function useLoanVideoGeneration(sessionScope: string, enabled = true) {
  const [state, setState] = useState<LoanVideoGenerationState>(INITIAL_STATE);
  const stateRef = useRef(state);
  const startGuardRef = useRef(false);
  const subscriptionRef = useRef<AbortController | null>(null);

  const updateState = useCallback((
    update: Partial<LoanVideoGenerationState>
      | ((current: LoanVideoGenerationState) => LoanVideoGenerationState),
  ) => {
    setState((current) => {
      const next = typeof update === 'function' ? update(current) : { ...current, ...update };
      stateRef.current = next;
      return next;
    });
  }, []);

  const refreshFiles = useCallback(async (projectId: string): Promise<ProjectFile[]> => {
    const files = await fetchProjectFiles(projectId);
    if (stateRef.current.projectId === projectId) {
      updateState({ files });
    }
    return files;
  }, [updateState]);

  useEffect(() => {
    if (!enabled) return undefined;
    const controller = new AbortController();
    subscriptionRef.current?.abort();
    subscriptionRef.current = controller;
    updateState(INITIAL_STATE);

    void restoreLatestVideoRun(sessionScope).then(async (restored) => {
      if (controller.signal.aborted) return;
      if (!restored) {
        updateState({ ...INITIAL_STATE, phase: 'idle' });
        return;
      }

      const restoredVideos = videoFiles(restored.files);
      const run = restored.run;
      if (!run) {
        updateState({
          aspectRatio: projectAspectRatio(restored.project),
          projectId: restored.project.id,
          requestedAt: restoredRequestedAt(restored.project, null),
          runId: null,
          files: restored.files,
          phase: restoredVideos.length > 0 ? 'succeeded' : 'failed',
          error: restoredVideos.length > 0
            ? null
            : 'This video project did not start. Submit again to retry.',
        });
        return;
      }

      updateState({
        aspectRatio: projectAspectRatio(restored.project),
        projectId: restored.project.id,
        requestedAt: restoredRequestedAt(restored.project, run),
        runId: run.id,
        files: restored.files,
        phase: phaseFromRun(run, restoredVideos.length > 0),
        error: run.status === 'succeeded' && restoredVideos.length === 0
          ? RUN_FINISHED_WITHOUT_MP4
          : run.status === 'failed' || run.status === 'canceled'
            ? runFailureMessage(run)
            : null,
      });

      if (run.status !== 'queued' && run.status !== 'running') return;
      const messages = run.conversationId
        ? await listMessages(restored.project.id, run.conversationId)
        : [];
      if (controller.signal.aborted) return;
      let assistantMessage = messages.find((message) => message.id === run.assistantMessageId)
        ?? (run.assistantMessageId
          ? {
              id: run.assistantMessageId,
              role: 'assistant' as const,
              content: '',
              createdAt: run.createdAt,
              startedAt: run.createdAt,
              runId: run.id,
              runStatus: run.status,
              events: [],
            }
          : null);
      let persistQueue = Promise.resolve();
      const persistAssistant = (options: { finalized?: boolean } = {}) => {
        if (!assistantMessage || !run.conversationId) return;
        const snapshot = assistantMessage;
        persistQueue = persistQueue.then(() => saveMessage(
          restored.project.id,
          run.conversationId!,
          snapshot,
          options.finalized ? { telemetryFinalized: true } : {},
        ));
      };
      let streamedText = assistantMessage?.content ?? '';

      await reattachDaemonRun({
        runId: run.id,
        signal: controller.signal,
        initialLastEventId: assistantMessage?.lastRunEventId ?? null,
        handlers: {
          onDelta: (delta) => {
            streamedText += delta;
          },
          onAgentEvent: (event) => {
            if (assistantMessage) {
              assistantMessage = {
                ...assistantMessage,
                events: [...(assistantMessage.events ?? []), event],
              };
            }
          },
          onDone: (fullText = '') => {
            const endedAt = Date.now();
            if (assistantMessage) {
              assistantMessage = {
                ...assistantMessage,
                content: fullText || streamedText,
                endedAt,
                runStatus: 'succeeded',
              };
              persistAssistant({ finalized: true });
            }
            updateState({ phase: 'succeeded', error: null });
          },
          onError: (error) => {
            const endedAt = Date.now();
            if (assistantMessage) {
              assistantMessage = {
                ...assistantMessage,
                endedAt,
                runStatus: 'failed',
              };
              persistAssistant({ finalized: true });
            }
            updateState({ phase: 'failed', error: error.message });
          },
        },
        onRunStatus: (status) => {
          const phase = status === 'canceled' ? 'failed' : status;
          updateState({
            phase,
            error: status === 'canceled'
              ? 'Video generation was canceled. Submit again to retry.'
              : status === 'failed'
                ? 'Video generation failed. Submit again to retry.'
                : null,
          });
          if (assistantMessage) {
            assistantMessage = {
              ...assistantMessage,
              runStatus: status,
              ...(status === 'succeeded' || status === 'failed' || status === 'canceled'
                ? { endedAt: assistantMessage.endedAt ?? Date.now() }
                : {}),
            };
            persistAssistant({
              finalized: status === 'succeeded' || status === 'failed' || status === 'canceled',
            });
          }
        },
        onRunEventId: (lastRunEventId) => {
          if (assistantMessage) assistantMessage = { ...assistantMessage, lastRunEventId };
        },
      });
      await persistQueue;
      if (!controller.signal.aborted) {
        const finalFiles = await refreshFiles(restored.project.id);
        if (
          stateRef.current.phase === 'succeeded'
          && videoFiles(finalFiles).length === 0
        ) {
          updateState({ phase: 'failed', error: RUN_FINISHED_WITHOUT_MP4 });
        }
      }
    }).catch((error) => {
      if (controller.signal.aborted) return;
      updateState({
        phase: 'failed',
        error: error instanceof Error ? error.message : 'Could not restore video generation.',
      });
    });

    return () => {
      controller.abort();
      subscriptionRef.current?.abort();
      subscriptionRef.current = null;
    };
  }, [enabled, refreshFiles, sessionScope, updateState]);

  useEffect(() => {
    if (!enabled || !state.projectId || state.phase === 'failed') return undefined;
    const projectId = state.projectId;
    const reconcile = () => {
      if (document.visibilityState === 'visible') void refreshFiles(projectId);
    };
    const interval = window.setInterval(
      reconcile,
      activePhase(state.phase) || videoFiles(state.files).length === 0 ? 1_500 : 5_000,
    );
    window.addEventListener('focus', reconcile);
    window.addEventListener('online', reconcile);
    window.addEventListener('pageshow', reconcile);
    document.addEventListener('visibilitychange', reconcile);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener('focus', reconcile);
      window.removeEventListener('online', reconcile);
      window.removeEventListener('pageshow', reconcile);
      document.removeEventListener('visibilitychange', reconcile);
    };
  }, [enabled, refreshFiles, state.files, state.phase, state.projectId]);

  const start = useCallback(async (draft: LoanVideoDraft) => {
    if (startGuardRef.current) return;
    startGuardRef.current = true;
    subscriptionRef.current?.abort();
    subscriptionRef.current = null;
    const requestedAt = Date.now();
    updateState({
      aspectRatio: draft.aspectRatio,
      error: null,
      files: [],
      phase: 'preparing',
      projectId: null,
      requestedAt,
      runId: null,
    });

    try {
      const executionPromise = resolveExecutionChoice();
      const metadata: ProjectMetadata = {
        kind: 'video',
        nameSource: 'prompt',
        videoModel: 'hyperframes-html',
        videoAspect: draft.aspectRatio,
        videoLength: draft.durationSeconds,
        skipDiscoveryBrief: true,
      };
      const result = await createProject({
        name: loanVideoProjectName(draft),
        skillId: LOAN_VIDEO_SKILL_ID,
        designSystemId: null,
        metadata,
        pluginId: LOAN_VIDEO_PLUGIN_ID,
        pluginInputs: {
          mediaKind: 'video',
          subject: draft.title.trim(),
          style: 'lively interactive tutorial, adaptive image background, focused camera motion, subtle one-line captions',
          aspect: draft.aspectRatio,
        },
      });
      if (!result) throw new Error('Could not create the video project.');

      const projectId = result.project.id;
      const conversationId = result.conversationId;
      writeStoredPointer(sessionScope, { projectId, conversationId });
      updateState({ projectId, phase: 'uploading' });

      const screenshots = draft.steps
        .map((step) => step.screenshot)
        .filter((file): file is File => file instanceof File);
      const [uploadResult, execution] = await Promise.all([
        uploadProjectFiles(projectId, screenshots, { visibility: 'internal' }),
        executionPromise,
      ]);
      if (uploadResult.failed.length > 0) {
        throw new Error(`Could not upload ${uploadResult.failed.length} screenshot(s).`);
      }
      const prompt = buildLoanVideoPrompt(
        draft,
        uploadResult.uploaded.map((attachment) => attachment.path),
      );

      const startedAt = Date.now();
      const userMessage: ChatMessage = {
        id: randomUUID(),
        role: 'user',
        content: prompt,
        createdAt: startedAt,
        attachments: uploadResult.uploaded,
      };
      await saveMessage(projectId, conversationId, userMessage);

      const assistantMessageId = randomUUID();
      let assistantMessage: ChatMessage = {
        id: assistantMessageId,
        role: 'assistant',
        content: '',
        agentId: execution.agentId,
        events: [],
        createdAt: startedAt,
        startedAt,
        runStatus: 'running',
      };
      let streamedText = '';
      let persistQueue = Promise.resolve();
      const persistAssistant = (options: { finalized?: boolean } = {}) => {
        const snapshot = assistantMessage;
        persistQueue = persistQueue.then(() => saveMessage(
          projectId,
          conversationId,
          snapshot,
          options.finalized ? { telemetryFinalized: true } : {},
        ));
      };
      const controller = new AbortController();
      subscriptionRef.current = controller;
      updateState({ phase: 'queued' });

      await streamViaDaemon({
        agentId: execution.agentId,
        history: [userMessage],
        signal: controller.signal,
        handlers: {
          onDelta: (delta) => {
            streamedText += delta;
          },
          onAgentEvent: (event: AgentEvent) => {
            assistantMessage = {
              ...assistantMessage,
              events: [...(assistantMessage.events ?? []), event],
            };
          },
          onDone: (fullText = '') => {
            assistantMessage = {
              ...assistantMessage,
              content: fullText || streamedText,
              endedAt: Date.now(),
              runStatus: 'succeeded',
            };
            persistAssistant({ finalized: true });
            updateState({ phase: 'succeeded', error: null });
          },
          onError: (error) => {
            assistantMessage = {
              ...assistantMessage,
              endedAt: Date.now(),
              runStatus: 'failed',
            };
            persistAssistant({ finalized: true });
            updateState({ phase: 'failed', error: error.message });
          },
        },
        projectId,
        conversationId,
        assistantMessageId,
        clientRequestId: randomUUID(),
        skillId: result.project.skillId ?? LOAN_VIDEO_SKILL_ID,
        designSystemId: result.project.designSystemId ?? null,
        attachments: uploadResult.uploaded.map((attachment) => attachment.path),
        model: execution.model,
        reasoning: execution.reasoning,
        onRunCreated: (runId) => {
          writeStoredPointer(sessionScope, { projectId, conversationId, runId });
          assistantMessage = {
            ...assistantMessage,
            runId,
            runStatus: 'queued',
          };
          persistAssistant();
          updateState({ runId, phase: 'queued' });
        },
        onRunStatus: (status) => {
          const terminal = status === 'succeeded' || status === 'failed' || status === 'canceled';
          assistantMessage = {
            ...assistantMessage,
            runStatus: status,
            ...(terminal ? { endedAt: assistantMessage.endedAt ?? Date.now() } : {}),
          };
          persistAssistant({ finalized: terminal });
          updateState({
            phase: status === 'canceled' ? 'failed' : status,
            error: status === 'canceled'
              ? 'Video generation was canceled. Submit again to retry.'
              : status === 'failed'
                ? 'Video generation failed. Submit again to retry.'
                : null,
          });
        },
        onRunEventId: (lastRunEventId) => {
          assistantMessage = { ...assistantMessage, lastRunEventId };
        },
      });
      await persistQueue;
      const finalFiles = await refreshFiles(projectId);
      if (
        stateRef.current.phase === 'succeeded'
        && videoFiles(finalFiles).length === 0
      ) {
        updateState({ phase: 'failed', error: RUN_FINISHED_WITHOUT_MP4 });
      }
    } catch (error) {
      updateState({
        phase: 'failed',
        error: error instanceof Error ? error.message : 'Could not submit the video task.',
      });
    } finally {
      startGuardRef.current = false;
    }
  }, [refreshFiles, sessionScope, updateState]);

  const removeVideo = useCallback(async (file: ProjectFile): Promise<boolean> => {
    const projectId = stateRef.current.projectId;
    if (!projectId) return false;
    const deleted = await deleteProjectFile(projectId, file.name);
    if (!deleted) return false;
    const nextFiles = await fetchProjectFiles(projectId);
    const remainingVideos = videoFiles(nextFiles);
    updateState((current) => ({
      ...current,
      files: nextFiles,
      ...(current.phase === 'succeeded' && remainingVideos.length === 0
        ? { phase: 'idle', error: null }
        : {}),
    }));
    return true;
  }, [updateState]);

  const videos = videoFiles(state.files);

  return {
    active: activePhase(state.phase),
    latestVideo: videos[0] ?? null,
    removeVideo,
    refreshFiles,
    start,
    state,
    videos,
  };
}
