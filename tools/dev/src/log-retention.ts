import { rename, rm, stat } from "node:fs/promises";

export interface LogRotationOptions {
  maxBytes: number;
  retention: number;
}

async function pathExists(file: string): Promise<boolean> {
  try {
    await stat(file);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw error;
  }
}

/**
 * Rotate `latest.log` into numbered archives before a new app process opens it.
 * Numbered names keep pruning deterministic and avoid unbounded timestamped
 * files. The foreground lifecycle reopens logs after each maintenance restart.
 */
export async function rotateLogFile(
  logPath: string,
  options: LogRotationOptions,
): Promise<void> {
  const maxBytes = Math.max(1, Math.floor(options.maxBytes));
  const retention = Math.max(1, Math.floor(options.retention));
  let current;
  try {
    current = await stat(logPath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
    throw error;
  }
  if (current.size <= maxBytes) return;

  for (let index = retention; index >= 2; index -= 1) {
    const source = `${logPath}.${index - 1}`;
    const destination = `${logPath}.${index}`;
    await rm(destination, { force: true });
    if (await pathExists(source)) await rename(source, destination);
  }
  await rm(`${logPath}.1`, { force: true });
  await rename(logPath, `${logPath}.1`);
}
