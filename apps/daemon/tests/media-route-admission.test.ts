import { describe, expect, it, vi } from 'vitest';

import { resolveMediaGenerationTaskAdmission } from '../src/media-routes.js';

describe('resolveMediaGenerationTaskAdmission', () => {
  it('reuses the existing task for an idempotent client retry', () => {
    const existing = {
      id: 'loan-poster:batch-1:0',
      projectId: 'project-1',
      status: 'running',
    };
    const randomUUID = vi.fn(() => 'random-task');

    expect(resolveMediaGenerationTaskAdmission({
      clientRequestId: existing.id,
      projectId: 'project-1',
      getTask: () => existing,
      randomUUID,
    })).toEqual({ taskId: existing.id, existingTask: existing });
    expect(randomUUID).not.toHaveBeenCalled();
  });

  it('rejects reuse of a client task id owned by another project', () => {
    expect(() => resolveMediaGenerationTaskAdmission({
      clientRequestId: 'loan-poster:batch-1:0',
      projectId: 'project-2',
      getTask: () => ({
        id: 'loan-poster:batch-1:0',
        projectId: 'project-1',
        status: 'running',
      }),
      randomUUID: () => 'random-task',
    })).toThrow('clientRequestId already belongs to another project');
  });
});
