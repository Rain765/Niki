import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { parseArgs } from 'node:util';
import type {
  PresentationJob,
  PresentationListResponse,
} from '@open-design/contracts';
import { resolveDaemonUrl } from './daemon-url.js';

const HELP = `od ppt generate --file document.pdf [--color emerald] [--ratio 16:9] [--pages auto|5|10|15|20]
                [--style swiss|editorial] [--density complete|brief]
                [--prompt-file path|-] [--wait] [--json]
od ppt list [--json]
od ppt status --project ID [--json]
od ppt edit --project ID --page 1 --revision N --slide-file slide.json|- [--json]
od ppt download --project ID --output deck.pptx [--format pptx|html] [--json]
od ppt preview --project ID --page 1 --output slide.svg [--json]
All commands accept --daemon-url URL. Feishu instances use OD_NIKI_SESSION_TOKEN.
Edit expects a PresentationSlide JSON object; get the current slide and revision with status.
Colors: emerald, blue, hermes, purple, red, jade, orange, yellow, magenta, coral, zamred.`;

async function readInput(file: string): Promise<string> {
  if (file !== '-') return readFile(file, 'utf8');
  let value = '';
  for await (const chunk of process.stdin) value += chunk.toString();
  return value;
}
export async function runPresentationCli(args: string[]): Promise<void> {
  try {
    const [command, ...rest] = args;
    if (!command || command === 'help' || args.includes('--help')) {
      console.log(HELP);
      return;
    }
    const { values } = parseArgs({
      args: rest,
      strict: true,
      options: {
        file: { type: 'string' },
        color: { type: 'string' },
        ratio: { type: 'string' },
        pages: { type: 'string' },
        style: { type: 'string' },
        density: { type: 'string' },
        'prompt-file': { type: 'string' },
        project: { type: 'string' },
        page: { type: 'string' },
        revision: { type: 'string' },
        'slide-file': { type: 'string' },
        output: { type: 'string' },
        format: { type: 'string' },
        'daemon-url': { type: 'string' },
        json: { type: 'boolean' },
        wait: { type: 'boolean' },
      },
    });
    const base = (
      await resolveDaemonUrl({ flagUrl: values['daemon-url'] ?? null })
    ).replace(/\/+$/, '');
    const request = async <T>(url: string, init?: RequestInit): Promise<T> => {
      const response = await fetch(base + url, init);
      const body = (await response.json()) as T & { error?: string };
      if (!response.ok)
        throw new Error(body.error || `HTTP ${response.status}`);
      return body;
    };
    const id = values.project;
    const jobUrl = () => {
      if (!id) throw new Error('--project is required');
      return `/api/projects/${encodeURIComponent(id)}/presentation`;
    };
    let result: unknown;
    if (command === 'list')
      result = await request<PresentationListResponse>('/api/presentations');
    else if (command === 'status')
      result = await request<PresentationJob>(jobUrl());
    else if (command === 'generate') {
      if (!values.file) throw new Error('--file is required');
      const bytes = await readFile(values.file);
      const form = new FormData();
      form.append('file', new Blob([bytes]), path.basename(values.file));
      form.append(
        'options',
        JSON.stringify({
          palette: values.color ?? 'emerald',
          ratio: values.ratio ?? '16:9',
          style: values.style ?? 'swiss',
          density: values.density ?? 'complete',
          pageCount:
            !values.pages || values.pages === 'auto'
              ? 'auto'
              : Number(values.pages),
          prompt: values['prompt-file']
            ? await readInput(values['prompt-file'])
            : '',
        }),
      );
      let job = await request<PresentationJob>('/api/presentations', {
        method: 'POST',
        body: form,
      });
      if (values.wait) {
        const deadline = Date.now() + 12 * 60_000;
        while (job.status === 'generating' || job.status === 'rendering') {
          if (Date.now() > deadline)
            throw new Error(
              `Still generating. Check with od ppt status --project ${job.projectId}`,
            );
          await new Promise((resolve) => setTimeout(resolve, 2000));
          job = await request<PresentationJob>(
            `/api/projects/${encodeURIComponent(job.projectId)}/presentation`,
          );
        }
        if (job.status === 'failed') process.exitCode = 1;
      }
      result = job;
    } else if (command === 'edit') {
      if (!values['slide-file'] || !values.page || !values.revision)
        throw new Error('--slide-file, --page and --revision are required');
      result = await request<PresentationJob>(jobUrl(), {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          revision: Number(values.revision),
          slideIndex: Number(values.page) - 1,
          slide: JSON.parse(await readInput(values['slide-file'])),
        }),
      });
    } else if (command === 'download' || command === 'preview') {
      if (!values.output) throw new Error('--output is required');
      const job = await request<PresentationJob>(jobUrl());
      if (values.format && !['pptx', 'html'].includes(values.format))
        throw new Error('--format must be pptx or html');
      const page = Number(values.page ?? 1);
      const file =
        command === 'download'
          ? values.format === 'html'
            ? job.html
            : job.pptx
          : Number.isInteger(page)
            ? job.previews?.[page - 1]
            : undefined;
      if (job.status !== 'complete' || !file)
        throw new Error('The requested presentation or slide is not ready');
      const response = await fetch(
        `${base}/api/projects/${encodeURIComponent(job.projectId)}/raw/${file.split('/').map(encodeURIComponent).join('/')}`,
      );
      if (!response.ok)
        throw new Error(`Download failed: HTTP ${response.status}`);
      await writeFile(
        values.output,
        Buffer.from(await response.arrayBuffer()),
        { flag: 'wx' },
      );
      result = {
        projectId: job.projectId,
        output: path.resolve(values.output),
      };
    } else throw new Error(`Unknown command: ${command}\n${HELP}`);
    console.log(JSON.stringify(result, null, values.json ? undefined : 2));
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Presentation command failed';
    if (args.includes('--json'))
      console.error(JSON.stringify({ error: message }));
    else console.error(message);
    process.exitCode = 1;
  }
}
