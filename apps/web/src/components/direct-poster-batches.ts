import type {
  DirectLoanPosterBatchStatus,
  ProjectFile,
  ProjectMetadata,
} from '@open-design/contracts';

export interface DirectPosterBatchView {
  id: string;
  status?: DirectLoanPosterBatchStatus;
  requestedAt?: number;
  queuedAt?: number;
  completedAt?: number;
  failedAt?: number;
  lastError?: string;
  expectedCount: number | null;
  files: ProjectFile[];
  batchNumber: number | null;
  legacyHistory: boolean;
}

/**
 * Rebuilds the direct-generation timeline from durable output-name mappings.
 * Files created before batch metadata existed remain visible in one legacy
 * history group instead of being incorrectly attached to the newest batch.
 */
export function buildDirectPosterBatches(
  files: ProjectFile[],
  lifecycle: ProjectMetadata['directGeneration'] | null,
): DirectPosterBatchView[] {
  const persistedBatches = lifecycle?.batches ?? [];
  if (persistedBatches.length === 0) {
    return [{
      id: 'legacy-current',
      status: lifecycle?.status,
      requestedAt: lifecycle?.requestedAt,
      queuedAt: lifecycle?.queuedAt,
      completedAt: lifecycle?.completedAt,
      failedAt: lifecycle?.failedAt,
      lastError: lifecycle?.lastError,
      expectedCount: lifecycle?.expectedOutputs ?? null,
      files,
      batchNumber: null,
      legacyHistory: true,
    }];
  }

  const fileByName = new Map(files.map((file) => [file.name, file]));
  const claimedNames = new Set<string>();
  const timeline = persistedBatches.map((batch, index): DirectPosterBatchView => {
    const batchFiles = batch.outputNames.flatMap((name) => {
      const file = fileByName.get(name);
      if (!file) return [];
      claimedNames.add(name);
      return [file];
    });
    return {
      id: batch.id,
      status: batch.status,
      requestedAt: batch.requestedAt,
      queuedAt: batch.queuedAt,
      completedAt: batch.completedAt,
      failedAt: batch.failedAt,
      lastError: batch.lastError,
      expectedCount: batch.expectedOutputs,
      files: batchFiles,
      batchNumber: index + 1,
      legacyHistory: false,
    };
  });
  const legacyFiles = files.filter((file) => !claimedNames.has(file.name));
  if (legacyFiles.length === 0) return timeline;
  return [{
    id: 'legacy-history',
    status: 'complete',
    expectedCount: legacyFiles.length,
    files: legacyFiles,
    batchNumber: null,
    legacyHistory: true,
  }, ...timeline];
}
