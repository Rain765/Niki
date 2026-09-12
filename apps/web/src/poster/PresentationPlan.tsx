import { useEffect, useState } from 'react';
import type {
  PresentationDeck,
  PresentationJob,
  PresentationTemplate,
} from '@open-design/contracts';
import { Button } from '../components/Button';
import { SelectField } from '../components/SelectField';

export function PresentationPlan({
  job,
  templates,
  saving,
  onContinue,
  onDirty,
}: {
  job: PresentationJob;
  templates: PresentationTemplate[];
  saving: boolean;
  onContinue: (plan: PresentationDeck) => void;
  onDirty: (dirty: boolean) => void;
}) {
  const [plan, setPlan] = useState(job.plan!);
  const [page, setPage] = useState(0);
  useEffect(() => {
    setPlan(job.plan!);
    onDirty(false);
  }, [job.projectId, job.revision]);
  const slide = plan.slides[page]!;
  const update = (value: Partial<typeof slide>) => {
    onDirty(true);
    setPlan({
      ...plan,
      slides: plan.slides.map((s, i) => (i === page ? { ...s, ...value } : s)),
    });
  };
  return (
    <section className="ppt-plan">
      <header>
        <div>
          <p className="ppt-plan__eyebrow">内容规划</p>
          <h1>先确认每一页要讲什么</h1>
          <p>
            共 {plan.slides.length} 页 · 原文 {job.source?.facts.length ?? 0}{' '}
            条核对项 · 可调整标题和版式
          </p>
        </div>
        <Button
          disabled={saving}
          onClick={() => {
            setPlan(job.plan!);
            onDirty(false);
          }}
        >
          恢复原计划
        </Button>
        <Button
          variant="primary"
          loading={saving}
          onClick={() => onContinue(plan)}
        >
          确认计划，生成文稿
        </Button>
      </header>
      {plan.warnings?.map((warning, i) => (
        <p className="ppt-workbench__notice" key={i} role="status">
          {warning}
        </p>
      ))}
      <div className="ppt-plan__grid">
        <nav aria-label="页面计划">
          {plan.slides.map((s, i) => (
            <button
              type="button"
              key={i}
              aria-current={page === i ? 'page' : undefined}
              onClick={() => setPage(i)}
            >
              <span>{String(i + 1).padStart(2, '0')}</span>
              <strong>{s.title}</strong>
              <small>{s.factIds?.length ?? 0} 条内容</small>
            </button>
          ))}
        </nav>
        <div className="ppt-plan__detail">
          <label>
            页面标题
            <input
              value={slide.title}
              maxLength={100}
              onChange={(e) => update({ title: e.target.value })}
            />
          </label>
          <p>{slide.purpose}</p>
          <SelectField
            label="页面版式"
            value={slide.templateId ?? 'E-report'}
            options={templates
              .filter((t) => !slide.table || t.layout === 'table')
              .map((t) => ({
                value: t.id,
                label: `${t.name} · ${t.id}`,
              }))}
            onChange={(id) => {
              const t = templates.find((t) => t.id === id);
              if (t) update({ templateId: id, layout: t.layout });
            }}
          />
          <img
            alt="所选版式示例，尚未填入文档内容"
            src={`/api/presentations/styles/${job.options.style ?? 'swiss'}?template=${encodeURIComponent(slide.templateId ?? 'E-report')}&palette=${job.options.palette}&ratio=${encodeURIComponent(job.options.ratio)}`}
          />
          <small>版式示例 · 确认后按这页原文生成</small>
          <details open>
            <summary>本页原文依据</summary>
            {(slide.sourceRefs ?? []).map((ref) => (
              <p className="ppt-plan__source" key={ref}>
                <b>原文 {ref}</b>
                {job.source?.blocks[ref - 1]}
              </p>
            ))}
          </details>
        </div>
      </div>
    </section>
  );
}
