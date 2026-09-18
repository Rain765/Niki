import { useRef, useState } from 'react';
import { X } from 'lucide-react';
import previewAssets from './native-preview-assets.json';
import { NATIVE_HTML_TEMPLATES, NATIVE_HTML_THEMES, NATIVE_GUIZANG_THEMES, type NativePresentationWorkflow } from '@open-design/contracts';
import { useI18n } from '../i18n';
import { SelectField } from '../components/SelectField';

const LABELS = ['融资路演', '产品发布', '技术分享', '周报汇报', '图文分享', '培训课程', '演讲者模式', '白底编辑风', '深色关系图', '架构蓝图', '终端风', '渐变叙事', '测试报告', '柔和卡片', '极简导航'];
export function NativeTemplatePicker({ workflow, template, theme, onChange, disabled = false }: {
  workflow: NativePresentationWorkflow; template: string; theme: string; disabled?: boolean; onChange: (template: string, theme: string) => void;
}) {
  const { locale } = useI18n();
  const zh = locale.startsWith('zh');
  const html = workflow === 'html-ppt';
  const themes: readonly string[] = html ? NATIVE_HTML_THEMES : template.startsWith('A') ? NATIVE_GUIZANG_THEMES.A : template.startsWith('B') ? NATIVE_GUIZANG_THEMES.B : [];
  const options = [{value:'',label:zh ? '按原流程推荐' : 'Recommend in workflow'}, ...(html ? [...NATIVE_HTML_TEMPLATES.map((id,index)=>({value:id,label:zh ? LABELS[index]! : id})),{value:'custom',label:zh ? '自由编排' : 'Compose from layouts'}] : [{value:'A · 电子杂志',label:zh ? '电子杂志' : 'Editorial'},{value:'B · 瑞士国际主义',label:zh ? '瑞士国际主义' : 'Swiss'}])];
  return <>
    <SelectField className="od-filter-grid__item" disabled={disabled} label={zh ? (html ? '模板' : '风格') : (html ? 'Template' : 'Style')} value={template} onChange={value => onChange(value, '')} options={options} />
    <SelectField className="od-filter-grid__item" label={zh ? '主题' : 'Theme'} value={theme} disabled={disabled || !themes.length} onChange={value => onChange(template,value)} options={[{value:'',label:zh ? '按原流程推荐 / 模板默认' : 'Recommend / template default'}, ...themes.map(value=>({value,label:value}))]} />
  </>;
}

type PreviewAsset = { thumb: string; full: string; width: number; height: number };
const previews: Record<string, Record<string, PreviewAsset>> = previewAssets;

export function NativeTemplatePreview({ workflow, template, theme }: {
  workflow: NativePresentationWorkflow; template: string; theme: string;
}) {
  const { locale } = useI18n();
  const zh = locale.startsWith('zh');
  const html = workflow === 'html-ppt';
  const dialog = useRef<HTMLDialogElement>(null);
  const [expanded, setExpanded] = useState(false);
  const key = html ? (template || (theme ? 'custom' : 'recommend')) : 'guizang';
  const variants = previews[key] ?? previews.recommend!;
  const asset = variants[html && theme ? theme : 'default'] ?? variants.default!;
  const title = html ? (zh ? '模板预览' : 'Template preview') : (zh ? '风格参考' : 'Style reference');
  const alt = html ? (zh ? '原始模板预览' : 'Original template preview') : (zh ? '设计创作风格参考' : 'Design style reference');
  const close = () => { dialog.current?.close(); setExpanded(false); };
  return <aside className="native-ppt__templates" aria-label={title}>
    <span className="od-field__label">{title}</span>
    <button type="button" className="native-ppt__template-preview" aria-label={zh ? `放大${title}` : `Enlarge ${title.toLowerCase()}`} onClick={() => { setExpanded(true); dialog.current?.showModal(); }}>
      <img key={asset.thumb} src={asset.thumb} alt={alt} width={asset.width} height={asset.height} decoding="async" />
    </button>
    <dialog ref={dialog} className="native-ppt__preview-dialog" aria-label={title} onClose={() => setExpanded(false)} onCancel={close} onClick={event => { if (event.target === event.currentTarget) { const rect = event.currentTarget.getBoundingClientRect(); if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) close(); } }}>
      <button type="button" className="native-ppt__preview-close" aria-label={zh ? '关闭预览' : 'Close preview'} onClick={close}><X size={20} aria-hidden="true" /></button>
      {expanded && <img src={asset.full} alt={alt} width={asset.width} height={asset.height} />}
    </dialog>
  </aside>;
}
