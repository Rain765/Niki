import { useRef, useState } from 'react';
import { X } from 'lucide-react';
import previewAssets from './native-preview-assets.json';
import { NATIVE_HTML_TEMPLATES, NATIVE_HTML_THEMES, NATIVE_GUIZANG_THEMES, type NativePresentationWorkflow } from '@open-design/contracts';
import { useI18n } from '../i18n';
import { SelectField } from '../components/SelectField';

const LABELS = ['融资路演', '产品发布', '技术分享', '周报汇报', '图文分享', '培训课程', '演讲者模式', '白底编辑风', '深色关系图', '架构蓝图', '终端风', '渐变叙事', '测试报告', '柔和卡片', '极简导航'];
export function NativeTemplatePicker({ workflow, template, theme, onChange, disabled = false }: {
  workflow: NativePresentationWorkflow; template: string; theme: string; disabled?: boolean;
  onChange: (workflow: NativePresentationWorkflow, template: string, theme: string) => void;
}) {
  const { locale } = useI18n();
  const zh = locale.startsWith('zh');
  const html = workflow === 'html-ppt';
  const themes: readonly string[] = html ? NATIVE_HTML_THEMES : template.startsWith('A') ? NATIVE_GUIZANG_THEMES.A : NATIVE_GUIZANG_THEMES.B;
  const htmlOptions = NATIVE_HTML_TEMPLATES.map((id, index) => ({ value: `html-ppt:${id}`, label: zh ? LABELS[index]! : id, workflow: 'html-ppt' as const, template: id as string }));
  const options = [
    ...htmlOptions.filter(option => option.template === 'xhs-white-editorial'),
    {value:'guizang-ppt-skill:A',label:zh ? '电子杂志' : 'Editorial',workflow:'guizang-ppt-skill' as const,template:'A · 电子杂志'},
    {value:'guizang-ppt-skill:B',label:zh ? '瑞士国际主义' : 'Swiss',workflow:'guizang-ppt-skill' as const,template:'B · 瑞士国际主义'},
    ...htmlOptions.filter(option => option.template !== 'xhs-white-editorial'),
    {value:'html-ppt:custom',label:zh ? '自由编排' : 'Compose from layouts',workflow:'html-ppt' as const,template:'custom'},
  ];
  const selected = options.find(option => option.workflow === workflow && option.template === template)!;
  return <>
    <SelectField className="od-filter-grid__item" disabled={disabled} label={zh ? '模板与风格' : 'Template & style'} value={selected.value} onChange={value => {
      const next = options.find(option => option.value === value);
      if (!next || next.value === selected.value) return;
      const nextTheme = next.workflow === 'html-ppt' ? '' : next.template.startsWith('A') ? NATIVE_GUIZANG_THEMES.A[0] : NATIVE_GUIZANG_THEMES.B[0];
      onChange(next.workflow, next.template, nextTheme);
    }} options={options} />
    <SelectField className="od-filter-grid__item" label={zh ? '主题' : 'Theme'} value={theme} disabled={disabled} onChange={value => onChange(workflow,template,value)} options={[...(html ? [{value:'',label:zh ? '模板默认' : 'Template default'}] : []), ...themes.map(value=>({value,label:value}))]} />
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
