import { NATIVE_HTML_TEMPLATES, NATIVE_HTML_THEMES, NATIVE_GUIZANG_THEMES, type NativePresentationWorkflow } from '@open-design/contracts';
import { useI18n } from '../i18n';
import { SelectField } from '../components/SelectField';

const LABELS = ['融资路演', '产品发布', '技术分享', '周报汇报', '图文分享', '培训课程', '演讲者模式', '白底编辑风', '深色关系图', '架构蓝图', '终端风', '渐变叙事', '测试报告', '柔和卡片', '极简导航'];
export function NativeTemplatePicker({ workflow, template, theme, onChange }: {
  workflow: NativePresentationWorkflow; template: string; theme: string; onChange: (template: string, theme: string) => void;
}) {
  const { locale } = useI18n();
  const zh = locale.startsWith('zh');
  const html = workflow === 'html-ppt';
  const base = `/api/native-presentation-resources/${workflow}/`;
  const path = html ? !template ? 'templates/full-decks-index.html' : template === 'custom' ? 'templates/deck.html' : `templates/full-decks/${template}/index.html` : template.startsWith('A') ? 'assets/template.html' : template.startsWith('B') ? 'assets/template-swiss.html' : '';
  const themes: readonly string[] = html ? NATIVE_HTML_THEMES : template.startsWith('A') ? NATIVE_GUIZANG_THEMES.A : template.startsWith('B') ? NATIVE_GUIZANG_THEMES.B : [];
  const options = [{value:'',label:zh ? '按原流程推荐' : 'Recommend in workflow'}, ...(html ? [...NATIVE_HTML_TEMPLATES.map((id,index)=>({value:id,label:zh ? LABELS[index]! : id})),{value:'custom',label:zh ? '自由编排' : 'Compose from layouts'}] : [{value:'A · 电子杂志',label:zh ? '电子杂志' : 'Editorial'},{value:'B · 瑞士国际主义',label:zh ? '瑞士国际主义' : 'Swiss'}])];
  const themeIndex = NATIVE_HTML_THEMES.findIndex(id => id === theme);
  return <div className="native-ppt__templates" role="tabpanel" aria-label={zh ? '模板选择' : 'Template selection'}>
    <SelectField label={zh ? '模板' : 'Template'} value={template} onChange={value => onChange(value, '')} options={options} />
    <SelectField label={zh ? '主题' : 'Theme'} value={theme} disabled={!themes.length} onChange={value => onChange(template,value)} options={[{value:'',label:zh ? '按原流程推荐 / 模板默认' : 'Recommend / template default'}, ...themes.map(value=>({value,label:value}))]} />
    {path && <div className="native-ppt__template-preview"><iframe title={zh ? '原始模板预览' : 'Original template preview'} src={`${base}${path}?preview=1`} sandbox="allow-scripts" /></div>}
    {!html && !path && <img className="native-ppt__original-showcase" src={`${base}assets/ppt-skill-showcase.png`} alt={zh ? 'Guizang 原作者效果参考' : 'Original Guizang showcase'} />}
    <div className="native-ppt__template-actions">{path && <a href={`${base}${path}`} target="_blank" rel="noreferrer">{zh ? '查看原模板 ↗' : 'Open template ↗'}</a>}{html && <a href={`${base}templates/theme-showcase.html${themeIndex >= 0 ? `?preview=${themeIndex+1}` : ''}`} target="_blank" rel="noreferrer">{zh ? '查看原主题 ↗' : 'Open themes ↗'}</a>}</div>
  </div>;
}
