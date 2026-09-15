import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, writeFile, lstat } from 'node:fs/promises';
import path from 'node:path';

interface ImageResult { bytes: Buffer; providerNote: string; suggestedExt?: string | undefined }
const digest = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');

/** Persist provider bytes before any local check. Replays reuse the exact request,
 * not a different brand/prompt/output. Recovery-only runs never buy another image.
 * The private cache is not a finished artifact and never enters the poster gallery.
 */
export function posterCheckpoint(projectDir: string, identity: string, recoveryOnly = false, generationId?: string) {
  const root = path.join(projectDir, '.poster-checkpoints');
  // Identical output names/settings in a NEW task are a new generation, not a
  // continuation. Only the same server-owned task id may reuse its candidates.
  const directory = path.join(root, digest(generationId ? JSON.stringify([identity, generationId]) : identity));
  async function prepare() {
    for (const dir of [root, directory]) {
      await mkdir(dir, { recursive: false, mode: 0o700 }).catch((e: NodeJS.ErrnoException) => { if (e.code !== 'EEXIST') throw e; });
      if (!(await lstat(dir)).isDirectory() || (await lstat(dir)).isSymbolicLink()) throw new Error('Unsafe poster checkpoint directory');
    }
  }
  return {
    async render(prompt: string, render: () => Promise<ImageResult>): Promise<ImageResult> {
      await prepare();
      const key = digest(prompt);
      const record = path.join(directory, `${key}.json`);
      try {
        if ((await lstat(record)).isSymbolicLink()) throw new Error('Unsafe poster checkpoint record');
        const saved = JSON.parse(await readFile(record, 'utf8'));
        const bytes = Buffer.from(saved.base64, 'base64');
        if (saved.version !== 1 || saved.sha256 !== digest(bytes) || typeof saved.providerNote !== 'string') throw new Error('Invalid poster checkpoint');
        console.info(`[poster-checkpoint] stage=resume key=${key.slice(0, 8)} bytes=${bytes.length}`);
        return { bytes, providerNote: saved.providerNote, suggestedExt: saved.suggestedExt };
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      }
      if (recoveryOnly) throw Object.assign(new Error('Poster checkpoint missing; recovery did not call the image provider'), { code: 'poster_checkpoint_missing', status: 409 });
      const result = await render();
      const temporary = path.join(directory, `${key}.${randomUUID()}.tmp`);
      await writeFile(temporary, JSON.stringify({ version: 1, base64: result.bytes.toString('base64'), sha256: digest(result.bytes), providerNote: result.providerNote, suggestedExt: result.suggestedExt }), { flag: 'wx', mode: 0o600 });
      await rename(temporary, record);
      console.info(`[poster-checkpoint] stage=saved key=${key.slice(0, 8)} bytes=${result.bytes.length}`);
      return result;
    },
  };
}
