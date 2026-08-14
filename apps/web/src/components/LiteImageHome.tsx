'use client';

import { useState } from 'react';
import {
  AUTO_POSTER_ASPECT_RATIOS,
  AUTO_POSTER_BRANDS,
  AUTO_POSTER_DEFAULT_ASPECT_RATIO,
  AUTO_POSTER_DEFAULT_BRAND,
  autoPosterBrandLabel,
  buildLoanPosterPrompt,
  LOAN_POSTER_SKILL_ID,
  loadZamloanLogo,
  normalizeZambiaPosterCount,
  type AutoPosterAspectRatio,
  type AutoPosterBrand,
  ZAMBIA_POSTER_DEFAULT_COUNT,
} from './home-hero/zambia-posters';

const MEDIA_PLUGIN_ID = 'od-media-generation';
const IMAGE_MODEL = 'gpt-image-2';

interface LiteImageHomeProps {
  onOpenWorkspace?: () => void;
  onProjectCreated?: (projectId: string) => void;
}

interface CreateProjectResult {
  project: { id: string };
  conversationId: string;
  appliedPluginSnapshotId?: string;
}

interface UploadedAttachment {
  path: string;
  name: string;
  kind: 'image';
  size?: number;
}

export function LiteImageHome({
  onOpenWorkspace,
  onProjectCreated,
}: LiteImageHomeProps) {
  const [count, setCount] = useState(ZAMBIA_POSTER_DEFAULT_COUNT);
  const [aspectRatio, setAspectRatio] = useState<AutoPosterAspectRatio>(
    AUTO_POSTER_DEFAULT_ASPECT_RATIO,
  );
  const [brand, setBrand] = useState<AutoPosterBrand>(AUTO_POSTER_DEFAULT_BRAND);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (pending) return;
    setPending(true);
    setError(null);

    try {
      const normalizedCount = normalizeZambiaPosterCount(count);
      const brandLabel = autoPosterBrandLabel(brand);
      const pluginInputs = {
        mediaKind: 'image',
        subject: `${normalizedCount} unified ${brandLabel} Zambia loan posters`,
        style: `premium realistic commercial photography with consistent ${brandLabel} red brand art direction`,
        aspect: aspectRatio,
        template: '',
        model: IMAGE_MODEL,
        ratio: aspectRatio,
      };

      const referencePromises = brand === 'zamloan'
        ? [loadZamloanLogo()]
        : [];
      const project = await createImageProject({
        id: browserUuid(),
        name: `${brandLabel} 贷款海报`,
        pendingPrompt: buildLoanPosterPrompt({
          count: normalizedCount,
          aspectRatio,
          brand,
        }),
        pluginId: MEDIA_PLUGIN_ID,
        pluginInputs,
        aspectRatio,
      });
      const attachments = referencePromises.length > 0
        ? (await Promise.all(
            (await Promise.all(referencePromises)).map((file) =>
              uploadInternalReference(project.project.id, file),
            ),
          )).flat()
        : [];

      try {
        window.sessionStorage.setItem(`od:auto-send-first:${project.project.id}`, '1');
        window.sessionStorage.setItem(
          `od:auto-send-attachments:${project.project.id}`,
          JSON.stringify(attachments),
        );
      } catch {
        // Private browsing can disable storage. The project still exists, so
        // continue into it and let the user send the prepared prompt manually.
      }

      if (onProjectCreated) {
        onProjectCreated(project.project.id);
      } else {
        window.location.assign(`/projects/${encodeURIComponent(project.project.id)}`);
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '出图任务启动失败，请重试。');
      setPending(false);
    }
  };

  return (
    <main className="lite-image-home" data-testid="lite-image-home">
      <header className="lite-image-home__header">
        <div className="lite-image-home__brand">
          <img
            className="lite-image-home__logo"
            src="/logo.svg"
            alt="Niki"
            width="28"
            height="28"
          />
          <span>Niki</span>
        </div>
        <button
          className="lite-image-home__workspace-link"
          type="button"
          onClick={onOpenWorkspace}
        >
          完整工作区
        </button>
      </header>

      <section className="lite-image-home__content">
        <div className="lite-image-home__eyebrow">AI IMAGE STUDIO</div>
        <h1>一键生成贷款海报</h1>
        <p>选择数量、尺寸和品牌，Niki 会直接创建项目并开始出图。</p>

        <div className="lite-image-home__composer">
          <label>
            <span>数量</span>
            <select
              data-testid="lite-image-count"
              value={count}
              disabled={pending}
              onChange={(event) => setCount(normalizeZambiaPosterCount(Number(event.target.value)))}
            >
              {Array.from({ length: 10 }, (_, index) => index + 1).map((value) => (
                <option key={value} value={value}>{value} 张</option>
              ))}
            </select>
          </label>

          <label>
            <span>尺寸</span>
            <select
              data-testid="lite-image-aspect"
              value={aspectRatio}
              disabled={pending}
              onChange={(event) => setAspectRatio(event.target.value as AutoPosterAspectRatio)}
            >
              {AUTO_POSTER_ASPECT_RATIOS.map((value) => (
                <option key={value} value={value}>{value}</option>
              ))}
            </select>
          </label>

          <label>
            <span>品牌</span>
            <select
              data-testid="lite-image-brand"
              value={brand}
              disabled={pending}
              onChange={(event) => setBrand(event.target.value as AutoPosterBrand)}
            >
              {AUTO_POSTER_BRANDS.map((value) => (
                <option key={value} value={value}>{autoPosterBrandLabel(value)}</option>
              ))}
            </select>
          </label>

          <button
            className="lite-image-home__submit"
            data-testid="lite-image-submit"
            type="button"
            disabled={pending}
            onClick={() => void submit()}
          >
            {pending ? '正在启动出图…' : '立即出图'}
          </button>
        </div>

        {error ? <div className="lite-image-home__error" role="alert">{error}</div> : null}
      </section>
    </main>
  );
}

async function createImageProject(input: {
  id: string;
  name: string;
  pendingPrompt: string;
  pluginId: string;
  pluginInputs: Record<string, unknown>;
  aspectRatio: AutoPosterAspectRatio;
}): Promise<CreateProjectResult> {
  const response = await fetch('/api/projects', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      id: input.id,
      name: input.name,
      skillId: LOAN_POSTER_SKILL_ID,
      designSystemId: null,
      pendingPrompt: input.pendingPrompt,
      pluginId: input.pluginId,
      pluginInputs: input.pluginInputs,
      metadata: {
        kind: 'image',
        imageModel: IMAGE_MODEL,
        imageAspect: input.aspectRatio,
      },
    }),
  });
  if (!response.ok) throw new Error('无法创建出图项目。');
  return (await response.json()) as CreateProjectResult;
}

async function uploadInternalReference(
  projectId: string,
  referenceFile: File,
): Promise<UploadedAttachment[]> {
  const form = new FormData();
  form.append('files', referenceFile);
  const response = await fetch(
    `/api/projects/${encodeURIComponent(projectId)}/upload?visibility=internal`,
    { method: 'POST', body: form },
  );
  if (!response.ok) throw new Error('无法上传品牌参考图。');
  const payload = (await response.json()) as {
    files?: Array<{
      name: string;
      originalName?: string;
      path: string;
      size?: number;
    }>;
  };
  return (payload.files ?? []).map((file) => ({
    path: file.path,
    name: file.originalName ?? file.name,
    kind: 'image',
    ...(file.size != null ? { size: file.size } : {}),
  }));
}

function browserUuid(): string {
  if (typeof globalThis.crypto?.randomUUID === 'function') {
    return globalThis.crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}
