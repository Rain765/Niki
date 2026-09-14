import { useState } from 'react';
import { useI18n } from '../i18n';
import { projectFileUrl } from '../providers/registry';
import { NativePresentationEditor } from './NativePresentationEditor';

export function NativePresentationPreview({ projectId, name }: { projectId: string; name: string }) {
  const { locale } = useI18n(); const zh = locale.startsWith('zh');
  const [editing, setEditing] = useState(false);
  if (editing) return <NativePresentationEditor projectId={projectId} name={name} onClose={() => setEditing(false)} />;
  return <div className="native-ppt-open" data-testid="native-presentation-preview">
    <strong>{name}</strong>
    <div className="native-ppt-open__actions"><button onClick={() => setEditing(true)}>{zh ? '编辑文案' : 'Edit text'}</button><a href={projectFileUrl(projectId, name)} target="_blank" rel="noopener noreferrer">{zh ? '演示 ↗' : 'Present ↗'}</a></div>
  </div>;
}
