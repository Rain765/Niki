export type PresentationTextField = { path: number[]; text: string; slide: number };
export function presentationTextFields(source: string): PresentationTextField[] {
  const doc = new DOMParser().parseFromString(source, 'text/html');
  const slides = Array.from(doc.querySelectorAll('.slide'));
  const fields: PresentationTextField[] = [];
  const visit = (node: Node, path: number[]) => {
    if (node.nodeType === 3 && node.textContent?.trim()) {
      const parent = node.parentElement;
      if (!parent || parent.closest('script,style,noscript,.notes,aside,template,[hidden]')) return;
      const slide = slides.indexOf(parent.closest('.slide')!);
      if (slide >= 0) fields.push({ path, text: node.textContent, slide });
    }
    Array.from(node.childNodes).forEach((child, i) => visit(child, [...path, i]));
  };
  visit(doc.documentElement, []);
  return fields;
}
/** Edit individual text nodes, retaining nested emphasis, diagrams, CSS and runtime code. */
export function replacePresentationText(source: string, changes: { path: number[]; before: string; after: string }[]): string {
  const doc = new DOMParser().parseFromString(source, 'text/html');
  for (const change of changes) {
    let node: Node = doc.documentElement;
    for (const index of change.path) {
      const child = node.childNodes[index];
      if (!child) throw new Error('文稿已变化，请重新打开编辑');
      node = child;
    }
    if (node.nodeType !== 3 || node.textContent !== change.before) throw new Error('文稿已变化，请重新打开编辑');
    node.textContent = change.after;
  }
  return `${source.match(/^\s*<!doctype[^>]*>/i)?.[0] ?? '<!DOCTYPE html>'}\n${doc.documentElement.outerHTML}`;
}
