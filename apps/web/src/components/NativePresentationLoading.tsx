import { useEffect, useState } from 'react';
import { ResultLoading } from './NikiResultControls';
import { useI18n } from '../i18n';
import './native-presentation-loading.css';

const labels = {
  loading: ['正在加载文稿', 'Loading presentation'],
  preparing: ['正在准备资料…', 'Preparing materials…'],
  uploading: ['正在上传文档…', 'Uploading document…'],
  starting: ['正在启动生成…', 'Starting generation…'],
  queued: ['正在等待生成…', 'Waiting to start…'],
  planning: ['正在读取资料和规划页面…', 'Reading materials and planning slides…'],
  layout: ['正在排版…', 'Laying out slides…'],
  review: ['正在逐页检查…', 'Reviewing slides…'],
  rechecking: ['正在复检…', 'Rechecking slides…'],
} as const;

export type NativePresentationStage = keyof typeof labels;

export function NativePresentationLoading({ stage, startedAt, checkedPages }: {
  stage: NativePresentationStage;
  startedAt?: number;
  checkedPages?: number;
}) {
  const { locale } = useI18n();
  const zh = locale.startsWith('zh');
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    if (startedAt === undefined) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [startedAt]);
  const seconds = Math.max(0, Math.floor((now - (startedAt ?? now)) / 1000));
  const elapsed = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
  const label = labels[stage][zh ? 0 : 1];
  return <div className="native-ppt__progress">
    <ResultLoading label={label}>
      <strong>{label}</strong>
      {checkedPages !== undefined && <small>{zh ? `已渲染 ${checkedPages} 页供检查` : `${checkedPages} slides rendered for review`}</small>}
      {startedAt !== undefined && <time className="native-ppt__elapsed">{zh ? '已用时' : 'Elapsed'} {elapsed}</time>}
    </ResultLoading>
  </div>;
}
