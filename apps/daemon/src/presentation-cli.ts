import { randomUUID } from 'node:crypto';
import { NATIVE_HTML_TEMPLATES, NATIVE_HTML_THEMES, NATIVE_GUIZANG_THEMES, NATIVE_PRESENTATION_RESOURCES, nativePresentationDesignInstructions, nativePresentationWorkspaceUrl, type NativePresentationWorkflow, type Project } from '@open-design/contracts';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { parseArgs } from 'node:util';
import type {
  PresentationJob,
  PresentationListResponse,
  NativePresentationInspectionJob,
} from '@open-design/contracts';
import { resolveDaemonUrl } from './daemon-url.js';

const HELP = `od ppt inspect-native --project ID --file index.html [--json]\nod ppt native-templates --json\nod ppt native --workflow html-ppt|guizang-ppt-skill --prompt-file brief.md|- [--file source.pdf]
              [--template ID|auto|custom] [--theme ID] [--agent codex] [--model ID] [--json]
Creates an original-skill project. With --agent, starts its native conversation;
without --agent, saves the brief for the web workspace. Use od run watch <id> to follow.
od ppt generate --file document.pdf [--color emerald] [--ratio 16:9] [--pages auto|5|10|15|20]
                [--style swiss|editorial] [--density complete|brief]
                [--model ID] [--fallback-model ID] [--review-plan] [--family swiss|editorial|technical]
                [--prompt-file path|-] [--wait] [--json]
od ppt models|templates [--json]
od ppt continue --project ID --revision N [--plan-file plan.json] [--wait] [--json]
od ppt repair --project ID --revision N --page 1 [--prompt-file path|-] [--wait] [--json]
od ppt check --project ID --revision N [--wait] [--json]
od ppt review --project ID --revision N --prompt-file note.txt|- [--json]
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
        workflow: { type: 'string' },
        template: { type: 'string' },
        theme: { type: 'string' },
        agent: { type: 'string' },
        model: { type: 'string' },
        'fallback-model': { type: 'string' },
        family: { type: 'string' },
        'plan-file': { type: 'string' },
        'review-plan': { type: 'boolean' },
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
    if (command === 'inspect-native') {
      if (!id || !values.file) throw new Error('--project and --file are required');
      let inspection = await request<NativePresentationInspectionJob>(`/api/projects/${encodeURIComponent(id)}/native-presentation/inspect`, {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({entry: values.file}),
      });
      while (inspection.status === 'running') {
        await new Promise(resolve => setTimeout(resolve, 1000));
        inspection = await request<NativePresentationInspectionJob>(`/api/projects/${encodeURIComponent(id)}/native-presentation/inspections/${inspection.id}`);
      }
      if (inspection.status === 'failed') throw new Error(inspection.error || 'Native inspection failed');
      result = inspection.report;
    } else if (command === 'native-templates') {
      result = await request('/api/native-presentation-templates');
    } else if (command === 'native') {
      const workflow = values.workflow as NativePresentationWorkflow | undefined;
      if (!workflow || !Object.hasOwn(NATIVE_PRESENTATION_RESOURCES, workflow)) throw new Error('--workflow must be html-ppt or guizang-ppt-skill');
      if (!values['prompt-file']) throw new Error('--prompt-file is required');
      if (values.wait) throw new Error('Use od run watch <runId> for native runs; they may pause for design decisions.');
      const inputBrief = await readInput(values['prompt-file']);
      if (!inputBrief.trim()) throw new Error('Brief must not be empty');
      const template = values.template === 'auto' ? '' : values.template ?? '';
      if (template && workflow === 'html-ppt' && template !== 'custom' && !NATIVE_HTML_TEMPLATES.some(id => id === template)) throw new Error('Unknown native template; use od ppt native-templates --json');
      if (workflow === 'guizang-ppt-skill' && template && !/^[AB](?:$| · )/.test(template)) throw new Error('Guizang template must be A or B');
      const themes: readonly string[] = workflow === 'html-ppt' ? NATIVE_HTML_THEMES : template.startsWith('A') ? NATIVE_GUIZANG_THEMES.A : template.startsWith('B') ? NATIVE_GUIZANG_THEMES.B : [];
      if (values.theme && !themes.includes(values.theme)) throw new Error('Unknown theme for this workflow/style; use od ppt native-templates --json');
      const brief = `${inputBrief}\n\n${nativePresentationDesignInstructions(workflow, template, values.theme ?? '')}`;
      const registry = workflow === 'html-ppt' ? 'design-templates' : 'skills';
      await request(`/api/${registry}/${workflow}`);
      // Read input before creating the project; a missing file cannot leave an orphan draft.
      const bytes = values.file ? await readFile(values.file) : null;
      const metadata = { kind: 'deck' as const, nativePresentation: {
        version: 1 as const, workflow, selection: { template, theme: values.theme ?? '' }, resourceVersion: NATIVE_PRESENTATION_RESOURCES[workflow], brief,
      } };
      const created = await request<{ project: Project; conversationId: string }>('/api/projects', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id: randomUUID(), name: brief.trim().split('\n')[0]!.slice(0, 70), skillId: workflow, designSystemId: null, metadata }),
      });
      const projectId = created.project.id;
      let sourceName: string | undefined;
      if (bytes && values.file) {
        const form = new FormData();
        form.append('file', new Blob([bytes]), path.basename(values.file));
        const uploaded = await request<{ file: { name: string } }>(`/api/projects/${projectId}/files`, { method: 'POST', body: form });
        sourceName = uploaded.file.name;
      }
      const prompt = sourceName ? `${brief}\n\nRead the complete original project file ${JSON.stringify(sourceName)}; preserve its facts, tables and constraints.` : brief;
      await request(`/api/projects/${projectId}`, {
        method: 'PATCH', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ pendingPrompt: prompt, metadata: { ...metadata, nativePresentation: { ...metadata.nativePresentation, brief: prompt, sourceFileName: sourceName } } }),
      });
      const run = values.agent ? await request('/api/runs', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ projectId, conversationId: created.conversationId, clientRequestId: randomUUID(), assistantMessageId: randomUUID(), skillId: workflow, agentId: values.agent, model: values.model, message: prompt }),
      }) : null;
      result = { projectId, conversationId: created.conversationId, workflow, workspacePath: nativePresentationWorkspaceUrl(projectId), run };
    } else if (command === 'models' || command === 'templates')
      result = await request(`/api/presentations/${command}`);
    else if (['continue', 'repair', 'check', 'review'].includes(command)) {
      if (!values.revision) throw new Error('--revision is required');
      result = await request<PresentationJob>(`${jobUrl()}/action`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          action: command === 'review' ? 'accept-review' : command,
          revision: Number(values.revision),
          slideIndex: values.page ? Number(values.page) - 1 : undefined,
          note: values['prompt-file']
            ? await readInput(values['prompt-file'])
            : undefined,
          plan: values['plan-file']
            ? JSON.parse(await readInput(values['plan-file']))
            : undefined,
        }),
      });
      if (values.wait) {
        const deadline = Date.now() + 30 * 60_000;
        while (
          ['planning', 'generating', 'rendering', 'checking'].includes(
            (result as PresentationJob).status,
          )
        ) {
          if (Date.now() > deadline)
            throw new Error('Still running; use status to resume monitoring.');
          await new Promise((resolve) => setTimeout(resolve, 2000));
          result = await request<PresentationJob>(jobUrl());
        }
        if ((result as PresentationJob).status === 'failed')
          process.exitCode = 1;
      }
    } else if (command === 'list')
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
          model: values.model,
          fallbackModel: values['fallback-model'],
          reviewPlan: values['review-plan'] ?? false,
          templateFamily: values.family,
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
        const deadline = Date.now() + 30 * 60_000;
        while (
          ['planning', 'generating', 'rendering', 'checking'].includes(
            job.status,
          )
        ) {
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
      if (command === 'download' && job.quality?.status === 'blocked')
        throw new Error(
          'Quality checks found blocking issues. Inspect status and repair affected pages before download.',
        );
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
