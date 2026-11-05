import { NativeTemplateOption } from './NativeTemplateOption';
import previewAssets from './native-preview-assets.json';
import { NATIVE_HTML_TEMPLATES, nativePresentationThemes, type NativePresentationWorkflow } from '@open-design/contracts';
import { useI18n } from '../i18n';
import { SelectField } from '../components/SelectField';

const LABELS = ['融资路演', '产品发布', '技术分享', '周报汇报', '图文分享', '培训课程', '演讲者模式', '白底编辑风', '深色关系图', '架构蓝图', '终端风', '渐变叙事', '测试报告', '柔和卡片', '极简导航'];
const THEME_LABELS: Record<string, string> = {
  'minimal-white':'极简白', 'editorial-serif':'衬线编辑', 'soft-pastel':'柔和粉彩', 'sharp-mono':'黑白利落', 'arctic-cool':'冰川蓝', 'sunset-warm':'暖色日落',
  'catppuccin-latte':'奶咖浅色', 'catppuccin-mocha':'摩卡深色', dracula:'暗夜紫', 'tokyo-night':'都市夜色', nord:'北欧冷色', 'solarized-light':'米白阅读',
  'gruvbox-dark':'复古暖黑', 'rose-pine':'松木玫瑰', 'neo-brutalism':'粗线撞色', glassmorphism:'磨砂玻璃', bauhaus:'包豪斯', 'swiss-grid':'瑞士网格',
  'terminal-green':'终端绿', 'xiaohongshu-white':'清爽白', 'rainbow-gradient':'彩虹渐变', aurora:'极光', blueprint:'蓝图', 'memphis-pop':'孟菲斯撞色',
  'cyberpunk-neon':'霓虹科技', 'y2k-chrome':'千禧金属', 'retro-tv':'复古电视', 'japanese-minimal':'日式极简', vaporwave:'蒸汽波', midcentury:'中古设计',
  'corporate-clean':'简洁商务', 'academic-paper':'学术论文', 'news-broadcast':'新闻播报', 'pitch-deck-vc':'融资提案', 'magazine-bold':'醒目杂志', 'engineering-whiteprint':'工程白图',
  Monocle:'经典杂志', 'Indigo Porcelain':'靛蓝瓷白', 'Forest Ink':'森林墨绿', 'Kraft Paper':'牛皮纸', Dune:'沙丘暖色',
  IKB:'克莱因蓝', Lemon:'柠檬黄', 'Lemon Green':'青柠绿', 'Safety Orange':'安全橙',
};
export function NativeTemplatePicker({ workflow, template, theme, onChange, disabled = false }: {
  workflow: NativePresentationWorkflow; template: string; theme: string; disabled?: boolean;
  onChange: (workflow: NativePresentationWorkflow, template: string, theme: string) => void;
}) {
  const { locale } = useI18n();
  const zh = locale.startsWith('zh');
  const htmlOptions = NATIVE_HTML_TEMPLATES.map((id, index) => ({ value: `html-ppt:${id}`, label: zh ? LABELS[index]! : id, workflow: 'html-ppt' as const, template: id as string }));
  const templates = [
    ...htmlOptions.filter(option => option.template === 'xhs-white-editorial'),
    {value:'guizang-ppt-skill:A',label:zh ? '电子杂志' : 'Editorial',workflow:'guizang-ppt-skill' as const,template:'A · 电子杂志'},
    {value:'guizang-ppt-skill:B',label:zh ? '瑞士国际主义' : 'Swiss',workflow:'guizang-ppt-skill' as const,template:'B · 瑞士国际主义'},
    ...htmlOptions.filter(option => option.template !== 'xhs-white-editorial'),
    {value:'html-ppt:custom',label:zh ? '自由编排' : 'Compose from layouts',workflow:'html-ppt' as const,template:'custom'},
  ];
  const options = templates.map(item => {
    const themes = nativePresentationThemes(item.workflow, item.template);
    const variants = previews[item.workflow === 'html-ppt' ? item.template : `guizang-${item.template[0]}`] ?? previews.recommend!;
    const subOptions = themes.length ? (item.workflow === 'html-ppt' ? ['', ...themes] : themes).map(themeValue => ({
      value: `${item.value}/${themeValue}`,
      label: themeValue ? (zh ? THEME_LABELS[themeValue] ?? themeValue : themeValue) : (zh ? '模板默认' : 'Template default'),
      theme: themeValue,
      asset: variants[themeValue || 'default'] ?? variants.default!,
    })) : undefined;
    return { ...item, subOptions, asset: variants.default! };
  });
  const selected = options.find(item => item.workflow === workflow && item.template === template) ?? options[0]!;
  const selectedTheme = selected.subOptions?.find(item => item.theme === theme);
  const chosenValue = selectedTheme?.value ?? selected.value;
  return (
    <SelectField
      className="od-filter-grid__item"
      disabled={disabled}
      label={zh ? '模板与风格' : 'Template & style'}
      submenuLabel={zh ? '配色与字体' : 'Colors & type'}
      value={chosenValue}
      onChange={value => {
        const item = options.find(item => item.value === value || item.subOptions?.some(child => child.value === value));
        if (!item) return;
        const palette = item.subOptions?.find(child => child.value === value);
        onChange(item.workflow, item.template, palette?.theme ?? '');
      }}
      options={options}
      menuMinWidth={240}
      renderValue={() => (
        <NativeTemplateOption
          label={selectedTheme ? `${selected.label} · ${selectedTheme.label}` : selected.label}
          asset={selectedTheme?.asset ?? selected.asset}
          keyboardActive={false}
          keyboardNavigation={false}
          disabled={disabled}
        />
      )}
      renderOption={(option, keyboardActive, keyboardNavigation) => {
        const item = options.find(item => item.value === option.value);
        const palette = options.flatMap(item => item.subOptions ?? []).find(child => child.value === option.value);
        const asset = item?.value === selected.value ? selectedTheme?.asset ?? item.asset : item?.asset ?? palette!.asset;
        return (
          <NativeTemplateOption
            label={option.label}
            asset={asset}
            keyboardActive={keyboardActive}
            keyboardNavigation={keyboardNavigation}
            disabled={disabled}
            previewable={!item?.subOptions}
          />
        );
      }}
    />
  );
}

type PreviewAsset = { thumb: string; full: string; width: number; height: number };
const previews: Record<string, Record<string, PreviewAsset>> = previewAssets;
