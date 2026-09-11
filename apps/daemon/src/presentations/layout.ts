import type {
  PresentationDeck,
  PresentationOptions,
  PresentationSlide,
} from '@open-design/contracts';
import { PresentationError } from './content.js';
import { buildPresentationScene } from './render.js';

/** Recover layout overflow without deleting text, changing graph relationships,
 * or silently exceeding an explicitly requested page count. */
export function fitPresentationDeck(
  deck: PresentationDeck,
  options: PresentationOptions,
): PresentationDeck {
  const fit = (
    slide: PresentationSlide,
    index: number,
  ): PresentationSlide[] => {
    try {
      buildPresentationScene(slide, options, index, deck.slides.length);
      return [slide];
    } catch (error) {
      if (!(error instanceof PresentationError) || error.status !== 422)
        throw error;
      // A text layout cannot faithfully replace a graph or a cover.
      if (
        ['cover', 'closing', 'architecture', 'flow', 'cycle'].includes(
          slide.layout,
        ) ||
        slide.edges.length
      )
        throw error;
      const editorial: PresentationSlide = { ...slide, layout: 'editorial' };
      try {
        buildPresentationScene(editorial, options, index, deck.slides.length);
        return [editorial];
      } catch (fallbackError) {
        if (
          !(fallbackError instanceof PresentationError) ||
          fallbackError.status !== 422
        )
          throw fallbackError;
        if (options.pageCount !== 'auto' || slide.items.length < 2) throw error;
        const middle = Math.ceil(slide.items.length / 2);
        return [
          ...fit({ ...editorial, items: slide.items.slice(0, middle) }, index),
          ...fit({ ...editorial, items: slide.items.slice(middle) }, index + 1),
        ];
      }
    }
  };
  const slides = deck.slides.flatMap((slide, index) => fit(slide, index));
  if (slides.length > 30)
    throw new PresentationError(
      'Content needs more than 30 slides. Generate one document section at a time.',
      422,
    );
  // Revalidate with final numbering after any automatic split.
  slides.forEach((slide, index) =>
    buildPresentationScene(slide, options, index, slides.length),
  );
  return { ...deck, slides };
}
