import { useI18n } from '../i18n';
import { projectFileUrl } from '../providers/registry';

/** Original presentation runtimes use storage and popup windows, unlike sandbox previews. */
export function NativePresentationPreview({ projectId, name }: { projectId: string; name: string }) {
  const { locale } = useI18n();
  const zh = locale.startsWith('zh');
  return <div className="native-ppt-open" data-testid="native-presentation-preview">
    <strong>{name}</strong>
    <p>{zh ? '在独立窗口打开完整演示稿，保留原始布局、动效、备注和演讲者模式。修改内容后重新打开即可查看。' : 'Open the complete deck in a separate window, preserving its layout, motion, notes and presenter mode. Reopen after editing to see changes.'}</p>
    <a href={projectFileUrl(projectId, name)} target="_blank" rel="noopener noreferrer">{zh ? '打开原生演示 ↗' : 'Open original presentation ↗'}</a>
  </div>;
}
