import { NATIVE_HTML_TEMPLATES, type NativePresentationWorkflow } from '@open-design/contracts';
import { useI18n } from '../i18n';

const LABELS = ['融资路演', '产品发布', '技术分享', '周报汇报', '图文分享', '培训课程', '演讲者模式', '白底编辑风', '深色关系图', '架构蓝图', '终端风', '渐变叙事', '测试报告', '柔和卡片', '极简导航'];
export function NativeTemplatePicker({ workflow, template, theme, onChange }: {
  workflow: NativePresentationWorkflow; template: string; theme: string; onChange: (template: string, theme: string) => void;
}) {
  const { locale } = useI18n();
  const zh = locale.startsWith('zh');
  const html = workflow === 'html-ppt';
  const base = `/api/native-presentation-resources/${workflow}/`;
  const path = html ? `templates/full-decks/${template}/index.html` : template.startsWith('A') ? 'assets/template.html' : 'assets/template-swiss.html';
  const themes = template.startsWith('A') ? ['Monocle', 'Indigo Porcelain', 'Forest Ink', 'Kraft Paper', 'Dune'] : ['IKB', 'Lemon', 'Lemon Green', 'Safety Orange'];
  return <div className="native-ppt__templates" role="tabpanel" aria-label={zh ? '模板选择' : 'Template selection'}>
    <label>{zh ? '模板' : 'Template'}<select value={template} onChange={e => onChange(e.target.value, '')}>
      {html ? NATIVE_HTML_TEMPLATES.map((id, index) => <option key={id} value={id}>{zh ? LABELS[index] : id}</option>) : <><option value="A · 电子杂志">{zh ? '电子杂志' : 'Editorial'}</option><option value="B · 瑞士国际主义">{zh ? '瑞士国际主义' : 'Swiss'}</option></>}
    </select></label>
    {!html && <label>{zh ? '主题' : 'Theme'}<select value={theme} onChange={e => onChange(template, e.target.value)}><option value="">{zh ? '模板默认' : 'Template default'}</option>{themes.map(t => <option key={t}>{t}</option>)}</select></label>}
    <div className="native-ppt__template-preview"><iframe key={path} title={zh ? '原始模板预览' : 'Original template preview'} src={`${base}${path}?preview=1`} sandbox="allow-scripts" /></div>
    <div className="native-ppt__template-actions"><a href={`${base}${path}`} target="_blank" rel="noreferrer">{zh ? '查看原模板 ↗' : 'Open template ↗'}</a>{html && <a href={`${base}templates/full-decks-index.html`} target="_blank" rel="noreferrer">{zh ? '全部模板 ↗' : 'All templates ↗'}</a>}</div>
  </div>;
}
