export const FOREGROUND_RECOVERY_MISS_THRESHOLD = 3;

export type ForegroundRecoveryPlan = {
  start: Array<'daemon' | 'web'>;
  stop: Array<'web' | 'daemon'>;
};

/**
 * A production foreground supervisor must outlive and supervise both detached
 * sidecars. Three consecutive IPC misses avoid restarting a healthy process
 * because of one busy event-loop turn while still recovering well inside a
 * normal mobile request timeout.
 */
export function resolveForegroundRecoveryPlan(options: {
  daemonMisses: number;
  webMisses: number;
  threshold?: number;
}): ForegroundRecoveryPlan | null {
  const threshold = options.threshold ?? FOREGROUND_RECOVERY_MISS_THRESHOLD;
  if (options.daemonMisses >= threshold) {
    return options.webMisses >= threshold
      ? { stop: ['web', 'daemon'], start: ['web', 'daemon'] }
      : { stop: ['daemon'], start: ['daemon'] };
  }
  if (options.webMisses >= threshold) {
    return { stop: ['web'], start: ['web'] };
  }
  return null;
}
