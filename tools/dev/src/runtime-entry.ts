export type SidecarRuntimeEntry = {
  args: string[];
  command: string;
};

/**
 * Production must execute the artifact that was built and validated for the
 * release. Development keeps the source + tsx loop for fast local iteration.
 */
export function resolveSidecarRuntimeEntry(options: {
  nodePath: string;
  prod: boolean;
  productionEntryPath: string;
  sourceEntryPath: string;
  stampArgs: string[];
  tsxCliPath: string;
}): SidecarRuntimeEntry {
  return {
    command: options.nodePath,
    args: options.prod
      ? [options.productionEntryPath, ...options.stampArgs]
      : [options.tsxCliPath, options.sourceEntryPath, ...options.stampArgs],
  };
}
