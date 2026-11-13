import { useState } from 'react';
import type { PresentationJob } from '@open-design/contracts';
import { Button } from '../components/Button';
import { SelectField } from '../components/SelectField';

export function PresentationQuality({
  job,
  busy,
  onAction,
  onPage,
}: {
  job: PresentationJob;
  busy: boolean;
  onAction: (action: string, page?: number, note?: string) => void;
  onPage: (page: number) => void;
}) {
  const [note, setNote] = useState('');
  const [repairNote, setRepairNote] = useState('');
  const [targetPage, setTargetPage] = useState('0');
  const [showAll, setShowAll] = useState(false);
  const q = job.quality;
  if (!q) return null;
  const errors = q.issues.filter((i) => i.severity === 'error');
  const orderedIssues = [
    ...errors,
    ...q.issues.filter((i) => i.severity !== 'error'),
  ];
  const visibleIssues = showAll ? orderedIssues : orderedIssues.slice(0, 12);
  const pages = [
    ...new Set(errors.map((i) => i.page).filter((p): p is number => !!p)),
  ];
  return (
    <details className="ppt-quality" open={q.status === 'blocked'}>
      <summary>
        <strong>
          {q.status === 'passed'
            ? '已人工验收'
            : q.status === 'blocked'
              ? `需要修订 · ${errors.length} 项问题`
              : '待人工核对'}
        </strong>
        <span>
          {q.renderedPages}/{job.deck?.slides.length} 页已渲染 ·{' '}
          {q.facts.candidates}/{q.facts.total} 条原文文字候选命中
        </span>
      </summary>
      <p>
        文字命中不等于事实正确。模型复核：
        {q.visualReview?.status === 'reviewed' ? '已完成' : '未完成'}
        ；跨办公软件显示仍需核对。
      </p>
      <div className="ppt-quality__actions">
        <Button disabled={busy} onClick={() => onAction('check')}>
          重新检查
        </Button>
        {pages.map((page) => (
          <Button
            key={page}
            disabled={busy}
            onClick={() => onAction('repair', page - 1)}
          >
            修复第 {page} 页
          </Button>
        ))}
      </div>
      <ul>
        {visibleIssues.map((issue, i) => (
          <li
            key={`${issue.code}-${i}`}
            className={issue.severity === 'error' ? 'is-error' : ''}
          >
            {issue.page && (
              <button
                type="button"
                disabled={busy}
                onClick={() => onPage(issue.page! - 1)}
              >
                第 {issue.page} 页
              </button>
            )}
            <span>{issue.message}</span>
          </li>
        ))}
      </ul>
      {orderedIssues.length > 12 && (
        <Button onClick={() => setShowAll(!showAll)}>
          {showAll
            ? '收起检查项'
            : `展开其余 ${orderedIssues.length - 12} 项检查`}
        </Button>
      )}
      <details>
        <summary>按要求修订一页</summary>
        <div className="ppt-quality__review">
          <SelectField
            label="修订页面"
            value={targetPage}
            options={(job.deck?.slides ?? []).map((slide, i) => ({
              value: String(i),
              label: `第 ${i + 1} 页 · ${slide.title}`,
            }))}
            onChange={setTargetPage}
          />
          <label>
            修订要求
            <textarea
              value={repairNote}
              maxLength={2000}
              onChange={(e) => setRepairNote(e.target.value)}
              placeholder="说明需要补充的原文或调整的编排；此操作会调用模型。"
            />
          </label>
          <Button
            disabled={busy || repairNote.trim().length < 3}
            onClick={() => onAction('repair', Number(targetPage), repairNote)}
          >
            修订这一页
          </Button>
        </div>
      </details>
      {!errors.length && q.status !== 'passed' && (
        <div className="ppt-quality__review">
          <label>
            验收记录
            <textarea
              value={note}
              maxLength={2000}
              onChange={(e) => setNote(e.target.value)}
              placeholder="已核对的原文、页面与结论；仍有疑问时请先修改。"
            />
          </label>
          <Button
            disabled={busy || note.trim().length < 3}
            onClick={() => onAction('accept-review', undefined, note)}
          >
            记录人工验收
          </Button>
        </div>
      )}
      {q.humanReview && <p>验收记录：{q.humanReview.note}</p>}
    </details>
  );
}
