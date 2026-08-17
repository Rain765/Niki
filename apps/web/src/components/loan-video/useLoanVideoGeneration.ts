import type { MediaTaskSnapshot } from '@open-design/contracts';
import { useCallback, useEffect, useRef, useState } from 'react';

import type { Project, ProjectFile, ProjectMetadata } from '../../types';
import {
  listProjectMediaTasks,
  startProjectMediaTask,
  waitForMediaTask,
} from '../../providers/media';
import {
  deleteProjectFile,
  fetchProjectFiles,
  uploadProjectFiles,
} from '../../providers/registry';
import {
  createProject,
  getProject,
  listProjects,
} from '../../state/projects';
import { randomUUID } from '../../utils/uuid';
import {
  buildLoanVideoStoryboard,
  LOAN_VIDEO_PLUGIN_ID,
  LOAN_VIDEO_SKILL_ID,
  loanVideoOutputName,
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
  | 'queued'
  | 'running'
  | 'succeeded'
  | 'failed';

export interface LoanVideoGenerationState {
  aspectRatio: LoanVideoAspectRatio;
  error: string | null;
  files: ProjectFile[];
  phase: LoanVideoGenerationPhase;
  projectId: string | null;
  requestedAt: number | null;
  taskId: string | null;
}

const INITIAL_STATE: LoanVideoGenerationState = {
  aspectRatio: '9:16',
  error: null,
  files: [],
  phase: 'restoring',
  projectId: null,
  requestedAt: null,
  taskId: null,
};

const LAST_VIDEO_PROJECT_STORAGE_KEY = 'niki:loan-video:last-project';
const RUN_FINISHED_WITHOUT_MP4 = 'The video task finished without producing a durable MP4. Submit again to retry.';

interface StoredVideoTaskPointer {
  projectId: string;
  taskId?: string;
}

interface RestoredVideoTask {
  files: ProjectFile[];
  project: Project;
  task: MediaTaskSnapshot | null;
}

function scopedStorageKey(sessionScope: string): string {
  return `${LAST_VIDEO_PROJECT_STORAGE_KEY}:${encodeURIComponent(sessionScope.trim())}`;
}

function readStoredPointer(sessionScope: string): StoredVideoTaskPointer | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(scopedStorageKey(sessionScope));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StoredVideoTaskPointer>;
    if (typeof parsed.projectId !== 'string') return null;
    return {
      projectId: parsed.projectId,
      ...(typeof parsed.taskId === 'string' ? { taskId: parsed.taskId } : {}),
    };
  } catch {
    return null;
  }
}

function writeStoredPointer(sessionScope: string, pointer: StoredVideoTaskPointer): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(scopedStorageKey(sessionScope), JSON.stringify(pointer));
  } catch {
    // SQLite-backed projects and tasks remain authoritative if storage is blocked.
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

function videoFiles(files: ProjectFile[]): ProjectFile[] {
  return files
    .filter((file) => file.kind === 'video' || file.name.toLowerCase().endsWith('.mp4'))
    .sort((left, right) => right.mtime - left.mtime);
}

function projectAspectRatio(project: Project): LoanVideoAspectRatio {
  const aspectRatio = project.metadata?.videoAspect;
  return LOAN_VIDEO_ASPECT_RATIOS.find((candidate) => candidate === aspectRatio) ?? '9:16';
}

function phaseFromTask(task: MediaTaskSnapshot | null, hasVideo: boolean): LoanVideoGenerationPhase {
  if (hasVideo) return 'succeeded';
  if (!task) return 'failed';
  if (task.status === 'queued' || task.status === 'running') return task.status;
  return 'failed';
}

function taskFailureMessage(task: MediaTaskSnapshot | null): string {
  if (!task) return 'This video project did not start. Submit again to retry.';
  if (task.status === 'done') return RUN_FINISHED_WITHOUT_MP4;
  if (task.status === 'interrupted') {
    return task.error?.message || 'Video generation was interrupted. Submit again to retry.';
  }
  return task.error?.message || 'Video generation failed. Submit again to retry.';
}

function activePhase(phase: LoanVideoGenerationPhase): boolean {
  return phase === 'restoring'
    || phase === 'preparing'
    || phase === 'uploading'
    || phase === 'queued'
    || phase === 'running';
}

async function restoreLatestVideoTask(sessionScope: string): Promise<RestoredVideoTask | null> {
  const pointer = readStoredPointer(sessionScope);
  const [storedProject, projects] = await Promise.all([
    pointer ? getProject(pointer.projectId) : Promise.resolve(null),
    listProjects(),
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
  const [files, taskResponse] = await Promise.all([
    fetchProjectFiles(project.id),
    listProjectMediaTasks(project.id),
  ]);
  const videoTasks = taskResponse.tasks.filter((task) => (
    task.surface === 'video' && task.model === 'hyperframes-html'
  ));
  const task = (
    pointer?.taskId
      ? videoTasks.find((candidate) => candidate.taskId === pointer.taskId)
      : null
  ) ?? videoTasks[0] ?? null;
  if (task) writeStoredPointer(sessionScope, { projectId: project.id, taskId: task.taskId });
  return { project, files, task };
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
    if (stateRef.current.projectId === projectId) updateState({ files });
    return files;
  }, [updateState]);

  const monitorTask = useCallback(async (
    projectId: string,
    taskId: string,
    signal: AbortSignal,
    initialSince = 0,
  ): Promise<void> => {
    let since = initialSince;
    while (!signal.aborted) {
      const task = await waitForMediaTask(taskId, since, signal);
      since = task.nextSince;
      if (task.status === 'queued' || task.status === 'running') {
        updateState({ phase: task.status, error: null });
        continue;
      }
      if (task.status === 'failed' || task.status === 'interrupted') {
        updateState({ phase: 'failed', error: taskFailureMessage(task) });
        return;
      }
      const files = await refreshFiles(projectId);
      const expectedName = task.file?.name;
      const persisted = videoFiles(files).find((file) => !expectedName || file.name === expectedName);
      if (!persisted || persisted.size <= 0) {
        updateState({ phase: 'failed', error: RUN_FINISHED_WITHOUT_MP4 });
        return;
      }
      updateState({ phase: 'succeeded', error: null, files });
      return;
    }
  }, [refreshFiles, updateState]);

  useEffect(() => {
    if (!enabled) return undefined;
    const controller = new AbortController();
    subscriptionRef.current?.abort();
    subscriptionRef.current = controller;
    updateState(INITIAL_STATE);

    void restoreLatestVideoTask(sessionScope).then(async (restored) => {
      if (controller.signal.aborted) return;
      if (!restored) {
        updateState({ ...INITIAL_STATE, phase: 'idle' });
        return;
      }
      const videos = videoFiles(restored.files);
      const phase = phaseFromTask(restored.task, videos.length > 0);
      updateState({
        aspectRatio: projectAspectRatio(restored.project),
        projectId: restored.project.id,
        requestedAt: restored.task?.startedAt ?? restored.project.createdAt,
        taskId: restored.task?.taskId ?? null,
        files: restored.files,
        phase,
        error: phase === 'failed' ? taskFailureMessage(restored.task) : null,
      });
      if (
        restored.task
        && (restored.task.status === 'queued' || restored.task.status === 'running')
      ) {
        await monitorTask(
          restored.project.id,
          restored.task.taskId,
          controller.signal,
          restored.task.nextSince,
        );
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
      if (subscriptionRef.current === controller) subscriptionRef.current = null;
    };
  }, [enabled, monitorTask, sessionScope, updateState]);

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
    const controller = new AbortController();
    subscriptionRef.current = controller;
    const requestedAt = Date.now();
    updateState({
      aspectRatio: draft.aspectRatio,
      error: null,
      files: [],
      phase: 'preparing',
      projectId: null,
      requestedAt,
      taskId: null,
    });

    try {
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
      writeStoredPointer(sessionScope, { projectId });
      updateState({ projectId, phase: 'uploading' });
      const screenshots = draft.steps
        .map((step) => step.screenshot)
        .filter((file): file is File => file instanceof File);
      const uploadResult = await uploadProjectFiles(
        projectId,
        screenshots,
        { visibility: 'internal' },
      );
      if (uploadResult.failed.length > 0) {
        throw new Error(`Could not upload ${uploadResult.failed.length} screenshot(s).`);
      }
      const storyboard = buildLoanVideoStoryboard(
        draft,
        uploadResult.uploaded.map((attachment) => attachment.path),
      );
      const accepted = await startProjectMediaTask(projectId, {
        clientRequestId: `loan-video-${randomUUID()}`,
        surface: 'video',
        model: 'hyperframes-html',
        output: loanVideoOutputName(draft),
        aspect: draft.aspectRatio,
        length: draft.durationSeconds,
        loanVideoStoryboard: storyboard,
      });
      writeStoredPointer(sessionScope, { projectId, taskId: accepted.taskId });
      updateState({
        taskId: accepted.taskId,
        phase: accepted.status === 'running' ? 'running' : 'queued',
      });
      await monitorTask(projectId, accepted.taskId, controller.signal);
    } catch (error) {
      if (controller.signal.aborted) return;
      updateState({
        phase: 'failed',
        error: error instanceof Error ? error.message : 'Could not submit the video task.',
      });
    } finally {
      startGuardRef.current = false;
    }
  }, [monitorTask, sessionScope, updateState]);

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
