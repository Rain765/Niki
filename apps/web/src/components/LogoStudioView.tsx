import { useState, type FormEvent } from 'react';
import type {
  LogoArchitecture,
  LogoBriefRequest,
  LogoBriefResponse,
  ProjectMetadata,
} from '@open-design/contracts';
import { useI18n } from '../i18n';
import type { CreateInput } from './NewProjectPanel';
import { Icon } from './Icon';

interface Props {
  onCreate: (
    input: CreateInput & {
      pendingPrompt?: string;
      pluginId?: string;
      pluginInputs?: Record<string, unknown>;
      autoSendFirstMessage?: boolean;
    },
  ) => void;
}

const PERSONALITIES = ['precise', 'warm', 'bold', 'playful', 'premium', 'organic'] as const;
const APPLICATIONS = ['web', 'favicon', 'social', 'app-icon', 'print'] as const;
const ARCHITECTURES: LogoArchitecture[] = ['combination', 'symbol', 'wordmark', 'monogram'];

const COPY = {
  en: {
    eyebrow: 'Logo Studio',
    title: 'Build a mark worth remembering.',
    intro: 'Shape a focused brief, compare four original directions, then refine one into a practical logo family.',
    brief: 'Brand brief',
    brand: 'Brand name',
    brandPlaceholder: 'e.g. Northstar',
    industry: 'Industry',
    industryPlaceholder: 'e.g. Climate analytics',
    audience: 'Audience',
    audiencePlaceholder: 'Who needs to trust or remember this brand?',
    architecture: 'Logo architecture',
    personality: 'Personality',
    palette: 'Starting palette',
    applications: 'Primary applications',
    avoid: 'Avoid',
    avoidPlaceholder: 'Competitor tropes, symbols, colors…',
    notes: 'Anything else?',
    notesPlaceholder: 'Origin story, naming meaning, cultural context, hard constraints…',
    submit: 'Generate 4 directions',
    submitting: 'Preparing studio…',
    preview: 'Live sketch',
    previewHint: 'A structural preview — the agent will explore four distinct ideas.',
    required: 'Add a brand name and industry to continue.',
    failed: 'Could not prepare the logo brief. Please try again.',
    architectureLabels: {
      combination: 'Symbol + name',
      symbol: 'Symbol',
      wordmark: 'Wordmark',
      monogram: 'Monogram',
    },
  },
  zh: {
    eyebrow: 'Logo Studio',
    title: '做一个真正能被记住的标志。',
    intro: '先把品牌简报收清楚，再并排比较 4 个原创方向，最后把选中的方案打磨成可用的 Logo 系统。',
    brief: '品牌简报',
    brand: '品牌名称',
    brandPlaceholder: '例如：北辰',
    industry: '行业 / 品类',
    industryPlaceholder: '例如：气候数据分析',
    audience: '目标受众',
    audiencePlaceholder: '谁需要信任并记住这个品牌？',
    architecture: 'Logo 架构',
    personality: '品牌气质',
    palette: '起始色板',
    applications: '主要使用场景',
    avoid: '需要避开',
    avoidPlaceholder: '竞品套路、禁用符号、颜色或表达……',
    notes: '补充说明',
    notesPlaceholder: '品牌故事、命名含义、文化语境、硬性限制……',
    submit: '生成 4 个方向',
    submitting: '正在准备工作台……',
    preview: '实时草图',
    previewHint: '这里只预览结构；生成后会探索四种真正不同的创意。',
    required: '请先填写品牌名称和行业。',
    failed: 'Logo 简报创建失败，请重试。',
    architectureLabels: {
      combination: '图形 + 字标',
      symbol: '独立图形',
      wordmark: '纯字标',
      monogram: '首字母组合',
    },
  },
} as const;

const PERSONALITY_LABELS: Record<(typeof PERSONALITIES)[number], { en: string; zh: string }> = {
  precise: { en: 'Precise', zh: '精准' },
  warm: { en: 'Warm', zh: '亲和' },
  bold: { en: 'Bold', zh: '大胆' },
  playful: { en: 'Playful', zh: '有趣' },
  premium: { en: 'Premium', zh: '高端' },
  organic: { en: 'Organic', zh: '自然' },
};

const APPLICATION_LABELS: Record<(typeof APPLICATIONS)[number], { en: string; zh: string }> = {
  web: { en: 'Web header', zh: '网页页头' },
  favicon: { en: 'Favicon', zh: '网站图标' },
  social: { en: 'Social avatar', zh: '社交头像' },
  'app-icon': { en: 'App icon', zh: '应用图标' },
  print: { en: 'Print', zh: '印刷物' },
};

function toggleValue<T extends string>(values: T[], value: T): T[] {
  return values.includes(value) ? values.filter((item) => item !== value) : [...values, value];
}

function splitList(value: string): string[] {
  return value.split(/[\n,，]+/u).map((item) => item.trim()).filter(Boolean);
}

export function LogoStudioView({ onCreate }: Props) {
  const { locale } = useI18n();
  const language = locale.startsWith('zh') ? 'zh' : 'en';
  const copy = COPY[language];
  const [brandName, setBrandName] = useState('');
  const [industry, setIndustry] = useState('');
  const [audience, setAudience] = useState('');
  const [architecture, setArchitecture] = useState<LogoArchitecture>('combination');
  const [personality, setPersonality] = useState<Array<(typeof PERSONALITIES)[number]>>([
    'precise',
    'bold',
  ]);
  const [applications, setApplications] = useState<Array<(typeof APPLICATIONS)[number]>>([
    'web',
    'favicon',
  ]);
  const [palette, setPalette] = useState(['#FF5A1F', '#151719', '#F4F1EA']);
  const [avoid, setAvoid] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const brandParts = brandName.trim().split(/\s+/u).filter(Boolean);
  const initials = brandParts.length === 0
    ? 'N'
    : brandParts.slice(0, 2).map((part) => Array.from(part)[0]).join('').toLocaleUpperCase();
  const primaryColor = palette[0] ?? '#FF5A1F';
  const inkColor = palette[1] ?? '#151719';
  const paperColor = palette[2] ?? '#F4F1EA';

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!brandName.trim() || !industry.trim()) {
      setError(copy.required);
      return;
    }
    setSubmitting(true);
    setError('');
    const request: LogoBriefRequest = {
      brandName,
      industry,
      audience,
      architecture,
      personality,
      palette,
      applications,
      avoid: splitList(avoid),
      notes,
    };
    try {
      const response = await fetch('/api/logo/brief', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request),
      });
      if (!response.ok) throw new Error(`logo brief failed: ${response.status}`);
      const { project } = await response.json() as LogoBriefResponse;
      const metadata: ProjectMetadata = project.metadata ?? {
        kind: 'image',
        imageAspect: '1:1',
      };
      onCreate({
        name: project.name,
        skillId: project.skillId ?? 'logo-generator',
        designSystemId: project.designSystemId ?? null,
        metadata,
        pendingPrompt: project.pendingPrompt,
        pluginId: project.pluginId,
        pluginInputs: project.pluginInputs,
        autoSendFirstMessage: true,
      });
    } catch {
      setError(copy.failed);
      setSubmitting(false);
    }
  }

  return (
    <section className="logo-studio" aria-labelledby="logo-studio-title">
      <header className="logo-studio__hero">
        <div>
          <div className="logo-studio__eyebrow">
            <Icon name="sparkles" size={15} />
            <span>{copy.eyebrow}</span>
          </div>
          <h1 id="logo-studio-title">{copy.title}</h1>
          <p>{copy.intro}</p>
        </div>
        <span className="logo-studio__step">01 / Brief</span>
      </header>

      <form className="logo-studio__layout" onSubmit={submit}>
        <div className="logo-studio__form-card">
          <div className="logo-studio__section-head">
            <span>{copy.brief}</span>
            <span>4 directions · 1 system</span>
          </div>

          <div className="logo-studio__field-grid">
            <label className="logo-studio__field">
              <span>{copy.brand}</span>
              <input
                value={brandName}
                onChange={(event) => setBrandName(event.target.value)}
                placeholder={copy.brandPlaceholder}
                maxLength={80}
                autoFocus
              />
            </label>
            <label className="logo-studio__field">
              <span>{copy.industry}</span>
              <input
                value={industry}
                onChange={(event) => setIndustry(event.target.value)}
                placeholder={copy.industryPlaceholder}
                maxLength={100}
              />
            </label>
          </div>

          <label className="logo-studio__field">
            <span>{copy.audience}</span>
            <input
              value={audience}
              onChange={(event) => setAudience(event.target.value)}
              placeholder={copy.audiencePlaceholder}
              maxLength={240}
            />
          </label>

          <fieldset className="logo-studio__fieldset">
            <legend>{copy.architecture}</legend>
            <div className="logo-studio__architecture-grid">
              {ARCHITECTURES.map((item) => (
                <button
                  type="button"
                  key={item}
                  className={architecture === item ? 'is-selected' : ''}
                  aria-pressed={architecture === item}
                  onClick={() => setArchitecture(item)}
                >
                  <LogoArchitectureGlyph architecture={item} />
                  <span>{copy.architectureLabels[item]}</span>
                </button>
              ))}
            </div>
          </fieldset>

          <fieldset className="logo-studio__fieldset">
            <legend>{copy.personality}</legend>
            <div className="logo-studio__chips">
              {PERSONALITIES.map((item) => (
                <button
                  type="button"
                  key={item}
                  className={personality.includes(item) ? 'is-selected' : ''}
                  aria-pressed={personality.includes(item)}
                  onClick={() => setPersonality((current) => toggleValue(current, item))}
                >
                  {PERSONALITY_LABELS[item][language]}
                </button>
              ))}
            </div>
          </fieldset>

          <fieldset className="logo-studio__fieldset">
            <legend>{copy.palette}</legend>
            <div className="logo-studio__palette">
              {palette.map((color, index) => (
                <label key={`${index}-${color}`} title={color}>
                  <input
                    type="color"
                    value={color}
                    aria-label={`${copy.palette} ${index + 1}`}
                    onChange={(event) => setPalette((current) => current.map((item, itemIndex) => (
                      itemIndex === index ? event.target.value.toUpperCase() : item
                    )))}
                  />
                  <span>{color}</span>
                </label>
              ))}
            </div>
          </fieldset>

          <fieldset className="logo-studio__fieldset">
            <legend>{copy.applications}</legend>
            <div className="logo-studio__chips">
              {APPLICATIONS.map((item) => (
                <button
                  type="button"
                  key={item}
                  className={applications.includes(item) ? 'is-selected' : ''}
                  aria-pressed={applications.includes(item)}
                  onClick={() => setApplications((current) => toggleValue(current, item))}
                >
                  {APPLICATION_LABELS[item][language]}
                </button>
              ))}
            </div>
          </fieldset>

          <div className="logo-studio__field-grid">
            <label className="logo-studio__field">
              <span>{copy.avoid}</span>
              <textarea
                value={avoid}
                onChange={(event) => setAvoid(event.target.value)}
                placeholder={copy.avoidPlaceholder}
                rows={3}
              />
            </label>
            <label className="logo-studio__field">
              <span>{copy.notes}</span>
              <textarea
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                placeholder={copy.notesPlaceholder}
                rows={3}
              />
            </label>
          </div>

          {error ? <p className="logo-studio__error" role="alert">{error}</p> : null}
          <button className="logo-studio__submit" type="submit" disabled={submitting}>
            <span>{submitting ? copy.submitting : copy.submit}</span>
            <Icon name="chevron-right" size={17} />
          </button>
        </div>

        <aside className="logo-studio__preview-card" aria-label={copy.preview}>
          <div className="logo-studio__preview-head">
            <span>{copy.preview}</span>
            <span>1:1</span>
          </div>
          <div
            className="logo-studio__preview-stage"
            style={{ backgroundColor: paperColor, color: inkColor }}
          >
            <LogoPreview
              architecture={architecture}
              brandName={brandName || copy.brandPlaceholder}
              initials={initials}
              primary={primaryColor}
              ink={inkColor}
            />
          </div>
          <div className="logo-studio__preview-meta">
            <div className="logo-studio__mini-marks">
              <span style={{ backgroundColor: inkColor, color: paperColor }}>{initials}</span>
              <span style={{ backgroundColor: paperColor, color: inkColor }}>{initials}</span>
              <span style={{ backgroundColor: primaryColor, color: paperColor }}>{initials}</span>
            </div>
            <p>{copy.previewHint}</p>
          </div>
        </aside>
      </form>
    </section>
  );
}

function LogoArchitectureGlyph({ architecture }: { architecture: LogoArchitecture }) {
  if (architecture === 'wordmark') return <span className="logo-studio__glyph-word">Aa</span>;
  if (architecture === 'monogram') return <span className="logo-studio__glyph-mono">NN</span>;
  if (architecture === 'symbol') return <span className="logo-studio__glyph-symbol" />;
  return (
    <span className="logo-studio__glyph-combo">
      <i />
      <b />
    </span>
  );
}

function LogoPreview({
  architecture,
  brandName,
  initials,
  primary,
  ink,
}: {
  architecture: LogoArchitecture;
  brandName: string;
  initials: string;
  primary: string;
  ink: string;
}) {
  const showSymbol = architecture !== 'wordmark';
  const showName = architecture === 'combination' || architecture === 'wordmark';
  return (
    <div className={`logo-studio__logo-preview is-${architecture}`}>
      {showSymbol ? (
        <svg viewBox="0 0 120 120" role="img" aria-label={`${brandName} mark preview`}>
          <path d="M18 75 49 21h53L71 75Z" fill={primary} />
          <path d="m18 75 31 24h53L71 75Z" fill={ink} />
          {architecture === 'monogram' ? (
            <text x="60" y="73" textAnchor="middle" fill="white" fontSize="28" fontWeight="800">
              {initials}
            </text>
          ) : null}
        </svg>
      ) : null}
      {showName ? <strong>{brandName}</strong> : null}
    </div>
  );
}
