import { parentPort, workerData } from 'node:worker_threads';
import { createRequire } from 'node:module';
import { staticFont } from './native-export-fonts.js';

const fontkit = createRequire(import.meta.url)('fontkit') as {
  create: (bytes: Buffer, name?: string) => Parameters<typeof staticFont>[0];
};
try {
  const input = workerData as { bytes: Uint8Array; postscript?: string; weight: number; italic: boolean };
  const bytes = Buffer.from(input.bytes);
  const source = fontkit.create(bytes, bytes.toString('ascii', 0, 4) === 'ttcf' ? input.postscript : undefined);
  const { font: _font, ...result } = staticFont(source, input.weight, input.italic);
  parentPort?.postMessage(result);
} catch (error) {
  parentPort?.postMessage({ error: error instanceof Error ? error.message : '字体处理失败' });
} finally { parentPort?.close(); }
