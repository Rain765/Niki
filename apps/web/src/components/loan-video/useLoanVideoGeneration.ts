import type { LoanVideoStoryboard, MediaTaskSnapshot } from '@open-design/contracts';
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
  patchProject,
} from '../../state/projects';
import { randomUUID } from '../../utils/uuid';
import {
  buildLoanVideoStoryboard,
  LOAN_VIDEO_PLUGIN_ID,
  LOAN_VIDEO_SKILL_ID,
  loanVideoOutputName,
  loanVideoPresetOutputName,
  loanVideoProjectName,
} from './loan-video';
import {
  LOAN_VIDEO_ASPECT_RATIOS,
  LOAN_VIDEO_BRANDS,
  LOAN_VIDEO_PURPOSES,
  loanVideoPresetKey,
  type LoanVideoAspectRatio,
  type LoanVideoDraft,
  type LoanVideoQuickOptions,
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
  configuredPresetKeys: string[];
  error: string | null;
  files: ProjectFile[];
  phase: LoanVideoGenerationPhase;
  projectId: string | null;
  requestedAt: number | null;
  taskId: string | null;
}

const INITIAL_STATE: LoanVideoGenerationState = {
  aspectRatio: '9:16',
  configuredPresetKeys: [],
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
  configuredPresetKeys: string[];
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

function projectPresetKey(project: Project): string {
  const preset = project.metadata?.loanVideoPreset;
  if (
    preset?.version === 1
    && LOAN_VIDEO_BRANDS.includes(preset.brand)
    && LOAN_VIDEO_PURPOSES.includes(preset.purpose)
  ) {
    return loanVideoPresetKey(preset.brand, preset.purpose);
  }
  const legacyBrand = project.name.toLowerCase().includes('biumoney') ? 'biumoney' : 'zamloan';
  return loanVideoPresetKey(legacyBrand, 'tutorial');
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
  const [projectFileEntries, taskResponse] = await Promise.all([
    Promise.all(candidates.map(async (candidate) => ({
      project: candidate,
      files: await fetchProjectFiles(candidate.id),
    }))),
    listProjectMediaTasks(project.id),
  ]);
  const files = projectFileEntries.find((entry) => entry.project.id === project.id)?.files ?? [];
  const configuredPresetKeys = Array.from(new Set(
    projectFileEntries
      .filter((entry) => videoFiles(entry.files).length > 0)
      .map((entry) => projectPresetKey(entry.project)),
  ));
  const videoTasks = taskResponse.tasks.filter((task) => (
    task.surface === 'video' && task.model === 'hyperframes-html'
  ));
  const task = (
    pointer?.taskId
      ? videoTasks.find((candidate) => candidate.taskId === pointer.taskId)
      : null
  ) ?? videoTasks[0] ?? null;
  if (task) writeStoredPointer(sessionScope, { projectId: project.id, taskId: task.taskId });
  return { configuredPresetKeys, project, files, task };
}

async function readSavedStoryboard(projectId: string): Promise<LoanVideoStoryboard> {
  const path = '.hyperframes-cache/loan-video-fast/storyboard.json'
    .split('/')
    .map(encodeURIComponent)
    .join('/');
  const response = await fetch(
    `/api/projects/${encodeURIComponent(projectId)}/raw/${path}`,
    { credentials: 'include', cache: 'no-store' },
  );
  if (!response.ok) throw new Error('The saved page plan could not be loaded. Open Edit mode and generate it again.');
  return await response.json() as LoanVideoStoryboard;
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
    expectedOutputName?: string,
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
      const expectedName = expectedOutputName ?? task.file?.name;
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
        configuredPresetKeys: restored.configuredPresetKeys,
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
        loanVideoPreset: {
          version: 1,
          brand: draft.brand,
          purpose: draft.purpose,
        },
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
      if (!draft.intro || !draft.background || !draft.outro) {
        throw new Error('Intro, background, and outro images are required.');
      }
      const assets = [draft.intro, draft.background, ...screenshots, draft.outro];
      const uploadResult = await uploadProjectFiles(
        projectId,
        assets,
        { visibility: 'internal' },
      );
      if (uploadResult.failed.length > 0) {
        throw new Error(`Could not upload ${uploadResult.failed.length} tutorial asset(s).`);
      }
      const storyboard = buildLoanVideoStoryboard(
        draft,
        {
          intro: uploadResult.uploaded[0]!.path,
          background: uploadResult.uploaded[1]!.path,
          pages: uploadResult.uploaded.slice(2, -1).map((attachment) => attachment.path),
          outro: uploadResult.uploaded.at(-1)!.path,
        },
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
      await monitorTask(
        projectId,
        accepted.taskId,
        controller.signal,
        0,
        loanVideoOutputName(draft),
      );
      if (stateRef.current.phase === 'succeeded') {
        updateState((current) => ({
          ...current,
          configuredPresetKeys: Array.from(new Set([
            ...current.configuredPresetKeys,
            loanVideoPresetKey(draft.brand, draft.purpose),
          ])),
        }));
      }
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

  const regenerate = useCallback(async (options: LoanVideoQuickOptions): Promise<boolean> => {
    if (startGuardRef.current) return false;
    startGuardRef.current = true;
    subscriptionRef.current?.abort();
    const controller = new AbortController();
    subscriptionRef.current = controller;
    const requestedAt = Date.now();
    updateState({
      aspectRatio: options.aspectRatio,
      error: null,
      phase: 'preparing',
      requestedAt,
      taskId: null,
    });

    try {
      const presetKey = loanVideoPresetKey(options.brand, options.purpose);
      const projects = (await listProjects())
        .filter(isTutorialVideoProject)
        .filter((project) => projectPresetKey(project) === presetKey)
        .sort((left, right) => right.updatedAt - left.updatedAt);
      const presetProjects = await Promise.all(projects.map(async (project) => ({
        project,
        files: await fetchProjectFiles(project.id),
      })));
      const selected = presetProjects.find((entry) => videoFiles(entry.files).length > 0) ?? null;
      if (!selected) {
        throw new Error('No approved page plan exists for this product and purpose. Configure it in Edit mode first.');
      }

      const storyboard = await readSavedStoryboard(selected.project.id);
      const nextStoryboard: LoanVideoStoryboard = {
        ...storyboard,
        aspectRatio: options.aspectRatio,
      };
      const patched = await patchProject(selected.project.id, {
        metadata: {
          ...selected.project.metadata,
          kind: 'video',
          videoAspect: options.aspectRatio,
          loanVideoPreset: {
            version: 1,
            brand: options.brand,
            purpose: options.purpose,
          },
        },
        updatedAt: requestedAt,
      });
      if (!patched) throw new Error('Could not update the saved video project.');

      const requestId = randomUUID();
      const projectId = selected.project.id;
      writeStoredPointer(sessionScope, { projectId });
      updateState({ projectId, files: selected.files, phase: 'queued' });
      const outputName = loanVideoPresetOutputName(options.brand, options.purpose, requestId);
      const accepted = await startProjectMediaTask(projectId, {
        clientRequestId: `loan-video-quick-${requestId}`,
        surface: 'video',
        model: 'hyperframes-html',
        output: outputName,
        aspect: options.aspectRatio,
        length: nextStoryboard.durationSeconds,
        loanVideoStoryboard: nextStoryboard,
      });
      writeStoredPointer(sessionScope, { projectId, taskId: accepted.taskId });
      updateState({
        taskId: accepted.taskId,
        phase: accepted.status === 'running' ? 'running' : 'queued',
      });
      await monitorTask(projectId, accepted.taskId, controller.signal, 0, outputName);
      return stateRef.current.phase === 'succeeded';
    } catch (error) {
      if (!controller.signal.aborted) {
        updateState({
          phase: 'failed',
          error: error instanceof Error ? error.message : 'Could not submit the video task.',
        });
      }
      return false;
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
    regenerate,
    removeVideo,
    refreshFiles,
    start,
    state,
    videos,
  };
}
