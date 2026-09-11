import type { PresentationDeck } from '@open-design/contracts';
import { PresentationError } from './content.js';

/** Preserve all source characters; references point to bounded, readable passages. */
export function presentationSourceBlocks(document: string): string[] {
  const blocks: string[] = [];
  let pending = '';
  for (const line of document.split('\n')) {
    if (pending.length + line.length > 900 && pending) {
      blocks.push(pending);
      pending = '';
    }
    pending += (pending ? '\n' : '') + line;
    while (pending.length > 1200) {
      blocks.push(pending.slice(0, 1200));
      pending = pending.slice(1200);
    }
  }
  if (pending) blocks.push(pending);
  return blocks;
}

/** These are reference-coverage checks, not a claim of semantic completeness. */
export function attachPresentationSources(
  deck: PresentationDeck,
  blocks: string[],
): PresentationDeck {
  const refs = new Set<number>();
  for (const slide of deck.slides) {
    for (const ref of slide.sourceRefs ?? []) {
      if (!Number.isInteger(ref) || ref < 1 || ref > blocks.length)
        throw new PresentationError('Invalid source passage reference', 422);
      refs.add(ref);
    }
  }
  const missing = blocks.map((_, i) => i + 1).filter((i) => !refs.has(i));
  return {
    ...deck,
    sourceBlocks: blocks,
    warnings: missing.length
      ? [
          `${missing.length} 段原文尚未被页面引用（${missing.join(', ')}）。请在原文面板核对，必要时增加页数。 / ${missing.length} source passages are not referenced; review the source or increase the page count.`,
        ]
      : [],
  };
}
