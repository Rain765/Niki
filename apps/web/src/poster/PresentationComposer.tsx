'use client';

import { useRef, useState, type CSSProperties, type FormEvent } from 'react';
import { ArrowRight, Check, FileText, Upload, X } from 'lucide-react';
import {
  PRESENTATION_PAGE_COUNTS,
  PRESENTATION_PALETTES,
  PRESENTATION_RATIOS,
  type PresentationOptions,
} from '@open-design/contracts';
import { Button } from '../components/Button';
import { SelectField } from '../components/SelectField';

export function PresentationComposer({
  file,
  options,
  locked,
  busy,
  zh,
  onFile,
  onOptions,
  onSubmit,
}: {
  file: File | null;
  options: PresentationOptions;
  locked: boolean;
  busy: boolean;
  zh: boolean;
  onFile: (file: File | null) => void;
  onOptions: (options: PresentationOptions) => void;
  onSubmit: (event: FormEvent) => void;
}) {
  const chooser = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [showBrief, setShowBrief] = useState(false);
  const style = options.style ?? 'swiss';
  return (
    <>
      <header className="ppt-workbench__intro">
        <div>
          <h1>
            {zh
              ? '把文档，变成一场清晰的表达。'
              : 'From document to presentation.'}
          </h1>
          <p>
            {zh
              ? '上传内容，选好风格。生成后逐页审阅，继续编辑。'
              : 'Upload your content, choose a direction, then review and refine each slide.'}
          </p>
        </div>
        <span className="ppt-workbench__intro-note">
          {zh ? '可编辑 PPTX' : 'Editable PPTX'}
        </span>
      </header>
      <form className="ppt-workbench__composer" onSubmit={onSubmit}>
        <div className="ppt-workbench__compose-main">
          <section
            className="ppt-workbench__source-upload"
            aria-labelledby="ppt-source-heading"
          >
            <div className="ppt-workbench__section-label">
              <span>01</span>
              <h2 id="ppt-source-heading">
                {zh ? '上传文档' : 'Your document'}
              </h2>
              {file && (
                <span className="ppt-workbench__ready">
                  <Check size={14} />
                  {zh ? '已选择' : 'Selected'}
                </span>
              )}
            </div>
            <input
              ref={chooser}
              type="file"
              tabIndex={-1}
              className="ppt-workbench__hidden"
              accept=".pdf,.docx,.md,.txt"
              aria-label={zh ? '上传文档' : 'Upload document'}
              disabled={locked}
              onChange={(event) => {
                if (event.target.files?.[0]) onFile(event.target.files[0]);
                event.target.value = '';
              }}
            />
            <div
              className={`ppt-workbench__upload ${dragging ? 'is-dragging' : ''} ${file ? 'has-file' : ''}`}
              onDragOver={(e) => {
                e.preventDefault();
                if (!locked) setDragging(true);
              }}
              onDragLeave={(e) => {
                if (!e.currentTarget.contains(e.relatedTarget as Node | null))
                  setDragging(false);
              }}
              onDrop={(e) => {
                e.preventDefault();
                setDragging(false);
                if (!locked && e.dataTransfer.files[0])
                  onFile(e.dataTransfer.files[0]);
              }}
            >
              <button
                className="ppt-workbench__drop"
                type="button"
                disabled={locked}
                onClick={() => chooser.current?.click()}
              >
                <span className="ppt-workbench__file-symbol">
                  {file ? (
                    <FileText size={28} strokeWidth={1.5} />
                  ) : (
                    <Upload size={28} strokeWidth={1.5} />
                  )}
                </span>
                <strong>
                  {file
                    ? file.name
                    : zh
                      ? '拖入文档，或点击上传'
                      : 'Drop a document, or browse'}
                </strong>
                <span>
                  {file
                    ? `${Math.max(1, Math.round(file.size / 1024))} KB · ${file.name.split('.').pop()?.toUpperCase()}`
                    : 'PDF · DOCX · Markdown · TXT'}
                </span>
                <small>
                  {file
                    ? zh
                      ? '点击替换文档'
                      : 'Click to replace'
                    : zh
                      ? '最大 10 MB'
                      : 'Up to 10 MB'}
                </small>
              </button>
              {file && (
                <Button
                  variant="ghost"
                  className="ppt-workbench__remove-file"
                  disabled={locked}
                  aria-label={zh ? '移除文档' : 'Remove document'}
                  onClick={() => onFile(null)}
                >
                  <X size={16} />
                </Button>
              )}
            </div>
            <p className="ppt-workbench__upload-help">
              {zh
                ? '支持可复制文字的文档；扫描件请先识别文字。'
                : 'Use documents with selectable text. Scanned files need OCR first.'}
            </p>
            <Button
              variant="ghost"
              className="ppt-workbench__brief-toggle"
              aria-expanded={showBrief}
              aria-controls="ppt-brief"
              onClick={() => setShowBrief(!showBrief)}
            >
              <span>
                {zh ? '补充要求' : 'Add instructions'}
                <small>
                  {zh
                    ? '选填 · 受众、用途、重点'
                    : 'Optional · audience, purpose, priorities'}
                </small>
              </span>
              <span aria-hidden="true">{showBrief ? '−' : '+'}</span>
            </Button>
            <div
              id="ppt-brief"
              className={`accordion-collapsible ${showBrief ? 'open' : ''}`}
              inert={!showBrief ? true : undefined}
            >
              <div className="accordion-collapsible-inner">
                <label className="ppt-workbench__brief">
                  <span className="ppt-workbench__hidden">
                    {zh ? '补充要求' : 'Instructions'}
                  </span>
                  <textarea
                    rows={3}
                    maxLength={2000}
                    disabled={locked}
                    value={options.prompt}
                    onChange={(e) =>
                      onOptions({ ...options, prompt: e.target.value })
                    }
                    placeholder={
                      zh
                        ? '例如：给业务团队培训，重点讲解流程、异常处理和关键数据。'
                        : 'For example: Train the team, with a focus on workflows, exceptions and key data.'
                    }
                  />
                </label>
              </div>
            </div>
          </section>
          <section
            className="ppt-workbench__design"
            aria-labelledby="ppt-design-heading"
          >
            <div className="ppt-workbench__section-label">
              <span>02</span>
              <h2 id="ppt-design-heading">
                {zh ? '选择视觉风格' : 'Visual direction'}
              </h2>
            </div>
            <div className="ppt-workbench__style-preview">
              <img
                src={`/api/presentations/styles/${style}?palette=${options.palette}`}
                alt={
                  zh
                    ? '所选风格的版式示例'
                    : 'Layout sample for the selected style'
                }
              />
              <span>
                {zh
                  ? '版式示例 · 非生成结果'
                  : 'Layout sample · not generated content'}
              </span>
            </div>
            <div
              className="ppt-workbench__styles"
              role="group"
              aria-label={zh ? '视觉风格' : 'Visual style'}
            >
              {(['swiss', 'editorial'] as const).map((value) => (
                <button
                  type="button"
                  key={value}
                  disabled={locked}
                  aria-pressed={style === value}
                  onClick={() => onOptions({ ...options, style: value })}
                >
                  <span>
                    <strong>
                      {value === 'swiss'
                        ? zh
                          ? '瑞士网格'
                          : 'Swiss grid'
                        : zh
                          ? '编辑式报告'
                          : 'Editorial report'}
                    </strong>
                    <span className="ppt-workbench__selection-mark">
                      {style === value && <Check size={13} />}
                    </span>
                  </span>
                  <small>
                    {value === 'swiss'
                      ? zh
                        ? '图形结构 · 流程 · 数据'
                        : 'Structure · Process · Data'
                      : zh
                        ? '文字层次 · 论述 · 阅读'
                        : 'Typography · Detail · Reading'}
                  </small>
                </button>
              ))}
            </div>
            <fieldset className="ppt-workbench__palette" disabled={locked}>
              <legend>
                {zh ? '主题色' : 'Color'}
                <span>
                  {PRESENTATION_PALETTES[options.palette][zh ? 'zh' : 'name']}
                </span>
              </legend>
              <div>
                {Object.entries(PRESENTATION_PALETTES).map(([key, value]) => (
                  <button
                    type="button"
                    key={key}
                    title={value[zh ? 'zh' : 'name']}
                    aria-label={value[zh ? 'zh' : 'name']}
                    aria-pressed={options.palette === key}
                    onClick={() =>
                      onOptions({
                        ...options,
                        palette: key as PresentationOptions['palette'],
                      })
                    }
                    style={
                      {
                        '--ppt-swatch': `var(--presentation-${key})`,
                      } as CSSProperties
                    }
                  >
                    <span>
                      {options.palette === key && (
                        <Check size={15} strokeWidth={3} />
                      )}
                    </span>
                  </button>
                ))}
              </div>
            </fieldset>
          </section>
        </div>
        <footer className="ppt-workbench__settings od-generation-toolbar od-filter-grid">
          <SelectField
            className="od-filter-grid__item"
            label={zh ? '画布比例' : 'Canvas ratio'}
            disabled={locked}
            value={options.ratio}
            options={PRESENTATION_RATIOS.map((ratio) => ({
              value: ratio,
              label:
                ratio === '16:9'
                  ? `${ratio} · ${zh ? '宽屏' : 'Widescreen'}`
                  : ratio,
            }))}
            onChange={(ratio) =>
              onOptions({
                ...options,
                ratio: ratio as PresentationOptions['ratio'],
              })
            }
          />
          <SelectField
            className="od-filter-grid__item"
            label={zh ? '页数' : 'Slide count'}
            disabled={locked}
            value={String(options.pageCount)}
            options={PRESENTATION_PAGE_COUNTS.map((count) => ({
              value: String(count),
              label:
                count === 'auto'
                  ? zh
                    ? '自动 · 按内容安排'
                    : 'Automatic · Fit content'
                  : `${count} ${zh ? '页' : 'slides'}`,
            }))}
            onChange={(count) =>
              onOptions({
                ...options,
                pageCount:
                  count === 'auto'
                    ? 'auto'
                    : (Number(count) as PresentationOptions['pageCount']),
              })
            }
          />
          <SelectField
            className="od-filter-grid__item od-filter-grid__wide"
            label={zh ? '内容深度' : 'Content depth'}
            disabled={locked}
            value={options.density ?? 'complete'}
            options={[
              { value: 'complete', label: zh ? '完整讲解' : 'Full detail' },
              { value: 'brief', label: zh ? '重点摘要' : 'Brief summary' },
            ]}
            onChange={(density) =>
              onOptions({
                ...options,
                density: density as PresentationOptions['density'],
              })
            }
          />
          <Button
            className="od-filter-grid__action"
            type="submit"
            variant="primary"
            disabled={!file || locked}
            loading={busy}
          >
            {busy
              ? zh
                ? '提交中…'
                : 'Starting…'
              : zh
                ? '生成演示文稿'
                : 'Create presentation'}
            <ArrowRight size={17} />
          </Button>
          <p className="ppt-workbench__footnote od-filter-grid__meta">
            {options.pageCount === 'auto'
              ? zh
                ? '自动安排 5–30 页，包含封面与结尾。长文档建议使用自动页数与完整讲解。'
                : 'Plans 5–30 slides, including cover and closing. Automatic length and full detail suit longer documents.'
              : zh
                ? '页数包含封面与结尾。长文档选较少页数会限制内容空间，建议使用自动页数。'
                : 'Includes cover and closing. Fewer pages limit space for detail; use automatic length for long documents.'}
          </p>
        </footer>
      </form>
    </>
  );
}
