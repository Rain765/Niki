/** Runs inside a fresh browser context; observes the active original slide without changing its design. */
export const NATIVE_INSPECTION_SCRIPT = String.raw`(index) => {
  const slide = document.querySelectorAll('#deck > .slide, .deck > .slide, body > .slide')[index];
  const issues = [];
  const seen = new Set();
  const textRects = [];
  const elements = [];
  const rgba = color => { const x = color.match(/[\d.]+/g); return x && x.length >= 3 ? [Number(x[0]),Number(x[1]),Number(x[2]),x.length > 3 ? Number(x[3]) : 1] : null; };
  const luminance = color => color.slice(0,3).map(x=>{x/=255;return x<=0.04045?x/12.92:Math.pow((x+0.055)/1.055,2.4)}).reduce((n,x,i)=>n+x*[0.2126,0.7152,0.0722][i],0);
  const add = (kind, text) => {
    const key = kind + ':' + text;
    if (!seen.has(key)) { issues.push({kind, text}); seen.add(key); }
  };
  for (const img of slide.querySelectorAll('img')) {
    if (!img.complete || !img.naturalWidth) add('missing-image', img.getAttribute('src') || '(image)');
  }
  if (slide.dataset.animate === 'pipeline') {
    for (const el of slide.querySelectorAll('[data-anim]')) {
      if (!['step', 'arrow'].includes(el.dataset.anim)) {
        add('pipeline-markup', (el.textContent || '').trim().slice(0, 160));
      }
    }
  }
  const textElements = [...slide.querySelectorAll('*')].filter(el => [...el.childNodes].some(node => node.nodeType === Node.TEXT_NODE && node.textContent.trim()));
  for (const el of textElements) {
    if (!el.textContent.trim() || el.closest('.notes,aside,[hidden],[aria-hidden="true"],.ghost,script,style')) continue;
    const b = el.getBoundingClientRect();
    const style = getComputedStyle(el);
    if (!b.width || !b.height || style.visibility === 'hidden' || style.display === 'none') continue;
    const text = el.textContent.trim().slice(0, 160);
    if (b.x < -2 || b.right > innerWidth + 2 || b.y < -2 || b.bottom > innerHeight + 2) add('overflow', text);
    let opacity = 1;
    for (let p = el; p && p !== document.documentElement; p = p.parentElement) opacity *= Number(getComputedStyle(p).opacity);
    if (opacity < 0.5) add('dim-text', text);
    // Only measure against a known solid background. Images/gradients still require visual review.
    let background = null;
    for (let p = el; p; p = p.parentElement) {
      const s = getComputedStyle(p);
      if (s.backgroundImage !== 'none') { add('visual-review', '背景图片或渐变上的文字需对照截图：' + text); break; }
      const color = rgba(s.backgroundColor);
      if (color && color[3] >= 0.99) { background = color; break; }
      if (color && color[3] > 0) { add('visual-review', '半透明背景上的文字需对照截图：' + text); break; }
    }
    const foreground = rgba(style.color);
    if (background && foreground) {
      const alpha = foreground[3] * opacity;
      const visible = foreground.slice(0,3).map((v,i)=>v*alpha+background[i]*(1-alpha));
      const a = luminance(visible), b = luminance(background);
      const contrast = (Math.max(a,b)+0.05)/(Math.min(a,b)+0.05);
      const large = parseFloat(style.fontSize)>=24 || (parseFloat(style.fontSize)>=18.66 && Number(style.fontWeight)>=700);
      if (contrast < (large ? 3 : 4.5)) add('low-contrast', text);
    }
  }
  // A box can fit the viewport but still be clipped by a card or diagram container.
  const walker = document.createTreeWalker(slide, NodeFilter.SHOW_TEXT);
  while (walker.nextNode()) {
    const node = walker.currentNode;
    const el = node.parentElement;
    const text = node.textContent.trim();
    if (!text || !el || el.closest('.notes,aside,[hidden],[aria-hidden="true"],.ghost,script,style')) continue;
    const style = getComputedStyle(el);
    if (style.visibility === 'hidden' || style.display === 'none') continue;
    const range = document.createRange(); range.selectNodeContents(node);
    for (const rect of range.getClientRects()) {
      if (!rect.width || !rect.height) continue;
      if (rect.left < -2 || rect.right > innerWidth + 2 || rect.top < -2 || rect.bottom > innerHeight + 2) add('overflow', text.slice(0,160));
      textRects.push({el,rect,text:text.slice(0,160)});
      elements.push({text:text.slice(0,160),font:style.fontFamily,size:style.fontSize,weight:style.fontWeight,color:style.color,x:rect.x,y:rect.y,width:rect.width,height:rect.height});
      for (let parent = el; parent; parent = parent.parentElement) {
        const css = getComputedStyle(parent), box = parent.getBoundingClientRect();
        const clipX = /hidden|clip|auto|scroll/.test(css.overflowX);
        const clipY = /hidden|clip|auto|scroll/.test(css.overflowY);
        if ((clipX && (rect.left < box.left-2 || rect.right > box.right+2)) ||
            (clipY && (rect.top < box.top-2 || rect.bottom > box.bottom+2))) {
          add('overflow', text.slice(0,160)); break;
        }
      }
    }
  }
  for (let i = 0; i < textRects.length; i++) {
    const a = textRects[i];
    for (let j = i + 1; j < textRects.length; j++) {
      const b = textRects[j];
      if (a.el === b.el || a.el.contains(b.el) || b.el.contains(a.el)) continue;
      const w = Math.min(a.rect.right,b.rect.right)-Math.max(a.rect.left,b.rect.left);
      const h = Math.min(a.rect.bottom,b.rect.bottom)-Math.max(a.rect.top,b.rect.top);
      if (w > 3 && h > Math.min(a.rect.height,b.rect.height)*0.35) add('text-overlap', a.text + ' / ' + b.text);
    }
  }
  const css = getComputedStyle(slide);
  return {text: slide.innerText, issues, design:{layout:slide.dataset.layout || slide.className,background:css.backgroundColor,backgroundImage:css.backgroundImage,elements}};
}`;
