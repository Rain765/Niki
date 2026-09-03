'use client';

import { useState } from 'react';
import { Button } from './Button';
import { SelectField } from './SelectField';
import { Toast } from './Toast';
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
const COUNT_OPTIONS = Array.from({ length: 10 }, (_, index) => ({
  value: String(index + 1),
  label: `${index + 1} 张`,
}));
const ASPECT_OPTIONS = AUTO_POSTER_ASPECT_RATIOS.map((value) => ({ value, label: value }));
const BRAND_OPTIONS = AUTO_POSTER_BRANDS.map((value) => ({
  value,
  label: autoPosterBrandLabel(value),
}));

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

        <div className="lite-image-home__composer od-filter-grid">
          <SelectField
            className="od-filter-grid__item"
            label="数量"
            value={String(count)}
            options={COUNT_OPTIONS}
            testId="lite-image-count"
            disabled={pending}
            onChange={(value) => setCount(normalizeZambiaPosterCount(Number(value)))}
          />

          <SelectField
            className="od-filter-grid__item"
            label="尺寸"
            value={aspectRatio}
            options={ASPECT_OPTIONS}
            testId="lite-image-aspect"
            disabled={pending}
            onChange={(value) => setAspectRatio(value as AutoPosterAspectRatio)}
          />

          <SelectField
            className="od-filter-grid__item od-filter-grid__wide"
            label="品牌"
            value={brand}
            options={BRAND_OPTIONS}
            testId="lite-image-brand"
            disabled={pending}
            onChange={(value) => setBrand(value as AutoPosterBrand)}
          />

          <Button
            className="lite-image-home__submit od-filter-grid__action"
            data-testid="lite-image-submit"
            variant="primary"
            loading={pending}
            disabled={pending}
            onClick={() => void submit()}
          >
            {pending ? '正在启动出图…' : '立即出图'}
          </Button>
        </div>

        {error ? (
          <Toast
            message={error}
            tone="error"
            persistent
            dismissible
            dismissLabel="关闭错误提示"
            onDismiss={() => setError(null)}
          />
        ) : null}
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
