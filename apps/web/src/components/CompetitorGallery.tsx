import {
  useEffect,
  useMemo,
  useState,
} from 'react';
import { Icon } from './Icon';
import {
  COMPETITOR_SCREENSHOTS,
  type CompetitorScreenshot,
} from './competitor-screenshots';

interface Props {
  screenshots?: CompetitorScreenshot[];
}

const ALL_CATEGORIES = '全部';

function searchableText(screenshot: CompetitorScreenshot): string {
  return [
    screenshot.title,
    screenshot.category,
    screenshot.brand,
    ...(screenshot.tags ?? []),
  ]
    .filter(Boolean)
    .join(' ')
    .toLocaleLowerCase('zh-CN');
}

export function filterCompetitorScreenshots(
  screenshots: CompetitorScreenshot[],
  category: string,
  query: string,
): CompetitorScreenshot[] {
  const normalizedQuery = query.trim().toLocaleLowerCase('zh-CN');
  return screenshots.filter((screenshot) => (
    (category === ALL_CATEGORIES || screenshot.category === category)
    && (!normalizedQuery || searchableText(screenshot).includes(normalizedQuery))
  ));
}

export function CompetitorGallery({
  screenshots = COMPETITOR_SCREENSHOTS,
}: Props) {
  const [category, setCategory] = useState(ALL_CATEGORIES);
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const categories = useMemo(() => [
    ALL_CATEGORIES,
    ...Array.from(new Set(screenshots.map((item) => item.category))),
  ], [screenshots]);
  const filtered = useMemo(
    () => filterCompetitorScreenshots(screenshots, category, query),
    [category, query, screenshots],
  );
  const selectedIndex = selectedId
    ? filtered.findIndex((item) => item.id === selectedId)
    : -1;
  const selected = selectedIndex >= 0 ? filtered[selectedIndex] : null;

  useEffect(() => {
    if (!selectedId) return;
    if (filtered.some((item) => item.id === selectedId)) return;
    setSelectedId(null);
  }, [filtered, selectedId]);

  useEffect(() => {
    if (!selected) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setSelectedId(null);
      } else if (event.key === 'ArrowLeft' && filtered.length > 1) {
        const previous = (selectedIndex - 1 + filtered.length) % filtered.length;
        setSelectedId(filtered[previous]?.id ?? null);
      } else if (event.key === 'ArrowRight' && filtered.length > 1) {
        const next = (selectedIndex + 1) % filtered.length;
        setSelectedId(filtered[next]?.id ?? null);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [filtered, selected, selectedIndex]);

  const categoryCount = (candidate: string) => candidate === ALL_CATEGORIES
    ? screenshots.length
    : screenshots.filter((item) => item.category === candidate).length;

  function moveSelection(direction: -1 | 1) {
    if (filtered.length < 2) return;
    const next = (selectedIndex + direction + filtered.length) % filtered.length;
    setSelectedId(filtered[next]?.id ?? null);
  }

  return (
    <section className="competitor-gallery" aria-label="竞品截图">
      <aside className="competitor-gallery__sidebar" aria-label="截图分类">
        <div className="competitor-gallery__sidebar-head">
          <span className="competitor-gallery__eyebrow">灵感库</span>
          <h1>竞品截图</h1>
          <p>按页面类型浏览信贷产品设计参考</p>
        </div>
        <nav className="competitor-gallery__categories" aria-label="竞品截图分类">
          {categories.map((item) => {
            const active = item === category;
            return (
              <button
                key={item}
                type="button"
                className={active ? 'is-active' : ''}
                aria-current={active ? 'page' : undefined}
                onClick={() => setCategory(item)}
              >
                <span>{item}</span>
                <span className="competitor-gallery__category-count">
                  {categoryCount(item)}
                </span>
              </button>
            );
          })}
        </nav>
      </aside>

      <div className="competitor-gallery__content">
        <header className="competitor-gallery__toolbar">
          <div>
            <h2>{category}</h2>
            <p>{filtered.length} 张截图</p>
          </div>
          <label className="competitor-gallery__search">
            <Icon name="search" size={16} />
            <span className="sr-only">搜索竞品截图</span>
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="搜索产品、页面或关键词"
            />
            {query ? (
              <button
                type="button"
                onClick={() => setQuery('')}
                aria-label="清除搜索"
              >
                <Icon name="close" size={14} />
              </button>
            ) : null}
          </label>
        </header>

        {screenshots.length === 0 ? (
          <div className="competitor-gallery__empty" data-testid="competitor-gallery-empty">
            <span className="competitor-gallery__empty-icon">
              <Icon name="image" size={26} />
            </span>
            <h3>竞品素材待导入</h3>
            <p>页面和交互已就绪，导入截图素材后会按分类自动显示在这里。</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="competitor-gallery__empty">
            <span className="competitor-gallery__empty-icon">
              <Icon name="search" size={26} />
            </span>
            <h3>没有匹配的截图</h3>
            <p>换个关键词，或选择其他分类试试。</p>
            <button type="button" onClick={() => setQuery('')}>清除搜索</button>
          </div>
        ) : (
          <div className="competitor-gallery__grid" data-testid="competitor-gallery-grid">
            {filtered.map((screenshot) => (
              <article className="competitor-gallery__card" key={screenshot.id}>
                <button
                  type="button"
                  className="competitor-gallery__preview"
                  onClick={() => setSelectedId(screenshot.id)}
                  aria-label={`预览 ${screenshot.title}`}
                >
                  <img
                    src={screenshot.src}
                    alt={screenshot.alt ?? screenshot.title}
                    loading="lazy"
                    decoding="async"
                    referrerPolicy="no-referrer"
                    onError={(event) => {
                      event.currentTarget.hidden = true;
                    }}
                  />
                  <span className="competitor-gallery__image-fallback" aria-hidden>
                    <Icon name="image" size={24} />
                    <strong>{screenshot.brand ?? '竞品截图'}</strong>
                    <small>点击查看原图</small>
                  </span>
                  <span className="competitor-gallery__preview-action" aria-hidden>
                    <Icon name="zoom-in" size={16} />
                    查看大图
                  </span>
                </button>
                <div className="competitor-gallery__card-info">
                  <div>
                    <h3>{screenshot.title}</h3>
                    <p>{screenshot.brand ?? screenshot.category}</p>
                  </div>
                  <span>{screenshot.category}</span>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>

      {selected ? (
        <div
          className="competitor-gallery__lightbox"
          role="dialog"
          aria-modal="true"
          aria-label={`预览 ${selected.title}`}
          data-testid="competitor-gallery-lightbox"
        >
          <button
            type="button"
            className="competitor-gallery__lightbox-backdrop"
            onClick={() => setSelectedId(null)}
            aria-label="关闭预览"
          />
          <div className="competitor-gallery__lightbox-panel">
            <header>
              <div>
                <strong>{selected.title}</strong>
                <span>{selected.brand ?? selected.category} · {selected.category}</span>
              </div>
              <div className="competitor-gallery__lightbox-actions">
                {selected.sourcePage ? (
                  <a
                    href={selected.sourcePage}
                    target="_blank"
                    rel="noreferrer"
                    title="查看来源页面"
                    aria-label="查看来源页面"
                  >
                    <Icon name="external-link" size={17} />
                  </a>
                ) : null}
                <a href={selected.src} download title="下载原图" aria-label="下载原图">
                  <Icon name="download" size={17} />
                </a>
                <button type="button" onClick={() => setSelectedId(null)} aria-label="关闭预览">
                  <Icon name="close" size={18} />
                </button>
              </div>
            </header>
            <div className="competitor-gallery__lightbox-image">
              <img
                src={selected.src}
                alt={selected.alt ?? selected.title}
                referrerPolicy="no-referrer"
                onError={(event) => {
                  event.currentTarget.hidden = true;
                }}
              />
              <span className="competitor-gallery__lightbox-fallback">
                <Icon name="image" size={30} />
                <strong>原图暂时无法加载</strong>
                <a href={selected.src} target="_blank" rel="noreferrer">在新窗口打开</a>
              </span>
            </div>
            {filtered.length > 1 ? (
              <>
                <button
                  type="button"
                  className="competitor-gallery__lightbox-nav is-previous"
                  onClick={() => moveSelection(-1)}
                  aria-label="上一张"
                >
                  <Icon name="chevron-left" size={23} />
                </button>
                <button
                  type="button"
                  className="competitor-gallery__lightbox-nav is-next"
                  onClick={() => moveSelection(1)}
                  aria-label="下一张"
                >
                  <Icon name="chevron-right" size={23} />
                </button>
                <span className="competitor-gallery__lightbox-counter">
                  {selectedIndex + 1} / {filtered.length}
                </span>
              </>
            ) : null}
          </div>
        </div>
      ) : null}
    </section>
  );
}
