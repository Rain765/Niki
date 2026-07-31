export const ZAMBIA_POSTER_MIN_COUNT = 1;
export const ZAMBIA_POSTER_MAX_COUNT = 10;
export const ZAMBIA_POSTER_DEFAULT_COUNT = 1;
export const ZAMBIA_POSTER_REFERENCE_URL = '/brand/zambia-support/z-reference.png';
export const ZAMBIA_POSTER_REFERENCE_NAME = 'loan-poster-z-reference.png';
export const LOAN_POSTER_SKILL_ID = 'loan-poster-skill-v1.1';

export const AUTO_POSTER_ASPECT_RATIOS = ['1:1', '16:9'] as const;
export type AutoPosterAspectRatio = (typeof AUTO_POSTER_ASPECT_RATIOS)[number];
export const AUTO_POSTER_DEFAULT_ASPECT_RATIO: AutoPosterAspectRatio = '16:9';

export const AUTO_POSTER_BRANDS = ['zamloan', 'biumoney'] as const;
export type AutoPosterBrand = (typeof AUTO_POSTER_BRANDS)[number];
export const AUTO_POSTER_DEFAULT_BRAND: AutoPosterBrand = 'zamloan';

export function isDirectLoanPosterProject(
  skillId: string | null | undefined,
  metadata: {
    kind?: string;
    directGeneration?: { kind?: string };
  } | null | undefined,
): boolean {
  return metadata?.directGeneration?.kind === 'loan-poster'
    || (skillId === LOAN_POSTER_SKILL_ID && metadata?.kind === 'image');
}

export function isLoanPosterOutputName(name: string): boolean {
  return /^(?:zamloan|biumoney)-poster-(?:\d{8}-)?\d+\.png$/i.test(name);
}

export function isLoanPosterGenerationPrompt(value: string | null | undefined): boolean {
  if (!value) return false;
  const prompt = value.trim();
  return /^Generate exactly \d+ (?:Zamloan|BiuMoney) Zambia loan posters? now\./i.test(prompt)
    && prompt.includes(`\`${LOAN_POSTER_SKILL_ID}\``);
}

export interface AutoPosterOptions {
  count: number;
  aspectRatio: AutoPosterAspectRatio;
  brand: AutoPosterBrand;
  /**
   * Advances the creative sequence for outputs that already exist in the
   * current project. One-click batches pass the next output number here so a
   * new batch does not restart from the first creative.
   */
  variationOffset?: number;
  /**
   * Gives each project a stable starting point in the creative sequence.
   * Different projects therefore do not all open with the same poster.
   */
  variationSeed?: string;
}

const BRAND_LABELS: Record<AutoPosterBrand, string> = {
  zamloan: 'Zamloan',
  biumoney: 'BiuMoney',
};

export function normalizeZambiaPosterCount(value: number): number {
  if (!Number.isFinite(value)) return ZAMBIA_POSTER_DEFAULT_COUNT;
  return Math.min(
    ZAMBIA_POSTER_MAX_COUNT,
    Math.max(ZAMBIA_POSTER_MIN_COUNT, Math.round(value)),
  );
}

export function autoPosterBrandLabel(brand: AutoPosterBrand): string {
  return BRAND_LABELS[brand];
}

export function autoPosterUsesZReference(brand: AutoPosterBrand): boolean {
  return brand === 'zamloan';
}

const LOAN_POSTER_SCENES = [
  {
    headline: 'Get Cash In 1 Hour',
    subline: 'Fast approval through your phone',
    model: 'a young Zambian man',
    scene: 'outside a modern Lusaka home after handling an urgent expense',
    benefits: ['Apply 100% via mobile', 'Simple online application'],
  },
  {
    headline: 'Support Your Family Today',
    subline: 'Simple mobile support when it matters',
    model: 'a Zambian mother with her child',
    scene: 'in a warm, authentic family home',
    benefits: ['No paperwork', 'Fast approval process'],
  },
  {
    headline: 'Ready For Unexpected Moments',
    subline: 'Apply online with no paperwork',
    model: 'a young Zambian couple',
    scene: 'planning a household repair together',
    benefits: ['Simple online application', 'Receive money quickly'],
  },
  {
    headline: 'Keep Your Business Moving',
    subline: 'Mobile support for your next opportunity',
    model: 'a Zambian small business owner',
    scene: 'inside a tidy neighborhood shop with stocked shelves',
    benefits: ['Fast approval process', 'Apply 100% via mobile'],
  },
  {
    headline: 'Simple Cash Through Your Phone',
    subline: 'Apply 100% by mobile',
    model: 'a young Zambian woman',
    scene: 'beside a compact car in a bright urban setting',
    benefits: ['No paperwork', 'Simple online application'],
  },
  {
    headline: 'School Plans Made Simpler',
    subline: 'Be ready for the term ahead',
    model: 'a Zambian father and his school-age daughter',
    scene: 'packing books and school supplies at a dining table',
    benefits: ['Apply 100% via mobile', 'Fast approval process'],
  },
  {
    headline: 'Fix It Today',
    subline: 'Support for the repairs that cannot wait',
    model: 'a confident Zambian woman',
    scene: 'speaking with a local mechanic beside her car',
    benefits: ['Receive money quickly', 'Simple online application'],
  },
  {
    headline: 'Make This Month Easier',
    subline: 'Everyday support from your phone',
    model: 'a young Zambian couple',
    scene: 'reviewing their household shopping in a bright kitchen',
    benefits: ['No paperwork', 'Apply 100% via mobile'],
  },
  {
    headline: 'Your Next Step Starts Here',
    subline: 'A simple application for important plans',
    model: 'a young Zambian entrepreneur',
    scene: 'preparing a market stall before opening for the day',
    benefits: ['Simple online application', 'Fast approval process'],
  },
  {
    headline: 'Mobile Support When Needed',
    subline: 'Handle important moments with confidence',
    model: 'a Zambian healthcare worker',
    scene: 'leaving a neighborhood clinic at the end of a shift',
    benefits: ['Receive money quickly', 'Apply 100% via mobile'],
  },
] as const;

const LOAN_POSTER_PALETTES = [
  { gradient: 'vivid red to fresh green', ribbon: 'glossy deep green' },
  { gradient: 'vivid red to deep blue', ribbon: 'glossy cobalt blue' },
  { gradient: 'warm red to mango yellow', ribbon: 'glossy mango gold' },
  { gradient: 'rich red to turquoise', ribbon: 'glossy turquoise' },
  { gradient: 'deep red to golden glow', ribbon: 'glossy warm gold' },
  { gradient: 'coral red to emerald green', ribbon: 'glossy emerald green' },
  { gradient: 'burgundy red to electric cyan', ribbon: 'glossy cyan blue' },
  { gradient: 'sunset red to fresh lime', ribbon: 'glossy forest green' },
] as const;

const MODEL_SAFE_POSTER_COMPOSITIONS = [
  'Place the model in the right third and reserve the entire left half as clean negative space for the two-line text block',
  'Place the model in the left third and reserve the entire right half as clean negative space for the two-line text block',
  'Place the model in the lower-right quadrant and keep the upper-left quadrant clear for the two-line text block',
  'Use an editorial waist-up crop on the right with an uncluttered text-safe panel on the left',
  'Place the model in the lower-left quadrant and keep the upper-right quadrant clear for the two-line text block',
  'Use a wide environmental composition with the model confined to one outer third and the opposite side reserved for text',
] as const;

function stableStringHash(value: string): number {
  let hash = 2_166_136_261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16_777_619);
  }
  return hash >>> 0;
}

function normalizeVariationOffset(value: number | undefined): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.trunc(value ?? 0));
}

export function buildLoanPosterScenePrompts(options: AutoPosterOptions): string[] {
  const count = normalizeZambiaPosterCount(options.count);
  const brand = AUTO_POSTER_BRANDS.includes(options.brand)
    ? options.brand
    : AUTO_POSTER_DEFAULT_BRAND;
  const aspectRatio = AUTO_POSTER_ASPECT_RATIOS.includes(options.aspectRatio)
    ? options.aspectRatio
    : AUTO_POSTER_DEFAULT_ASPECT_RATIO;
  const brandLabel = autoPosterBrandLabel(brand);
  const seedOffset = options.variationSeed
    ? stableStringHash(options.variationSeed)
    : 0;
  const variationOffset = seedOffset + normalizeVariationOffset(options.variationOffset);

  return Array.from({ length: count }, (_, index) => {
    const variationIndex = variationOffset + index;
    const plan = LOAN_POSTER_SCENES[variationIndex % LOAN_POSTER_SCENES.length]!;
    const palette = LOAN_POSTER_PALETTES[
      (variationIndex * 3) % LOAN_POSTER_PALETTES.length
    ]!;
    const compositions = MODEL_SAFE_POSTER_COMPOSITIONS;
    const composition = compositions[
      (variationIndex * 5) % compositions.length
    ]!;
    if (brand === 'biumoney') {
      return `Create a premium ${brandLabel} Zambia mobile-loan advertising poster in ${aspectRatio}.

Use a clean ${palette.gradient} dominant background with subtle abstract depth and no letter Z, no alphabetic background motif, and no logo-shaped watermark. Render exactly two visible text elements: “${plan.headline}” as a very large bold headline and “${plan.subline}” as a large supporting subtitle. Do not render any other words, numbers, labels, badges, benefit text, brand names, disclaimers, or phone-screen text. ${composition}. Show ${plan.model} ${plan.scene}, holding or naturally interacting with an anatomically correct smartphone whose screen contains no text.

Keep the complete headline and subtitle inside the reserved negative-space region. The text must never overlap the model’s face, hair, body, hands, clothing, or phone. Preserve a clearly visible gap between the text block and the model silhouette. Use realistic Zambian lifestyle commercial photography, premium lighting, natural skin retouching, strong text hierarchy, oversized readable typography, and generous safe margins.

Negative prompt: letter Z, background letter, alphabetic background motif, logo, watermark, brand wordmark, benefit text, callout, badge, label, disclaimer, phone text, extra text, small typography, text over model, text over face, text over body, text over hands, text over phone, blurry, low quality, distorted anatomy, deformed hands, extra fingers, unreadable text, duplicated elements, mixed brands.`;
    }

    return `Create a premium ${brandLabel} Zambia mobile-loan advertising poster in ${aspectRatio}.

Use a ${palette.gradient} dominant background, one large supplied semi-transparent Z as the only brand mark, and one ${palette.ribbon} curved ribbon along the bottom. Reproduce the exact silhouette geometry of the supplied Z reference, including its distinctive angled terminals, curved outer corners, and diagonal stroke; use the reference for shape only and freely adapt color, material, opacity, scale, and position. Do not invent another Z glyph or alter its outline.

Render exactly two poster-copy text elements: “${plan.headline}” as a very large bold headline and “${plan.subline}” as a large supporting subtitle. Do not add benefit copy, feature callouts, labels, badges, disclaimers, or any other poster text. ${composition}. Show ${plan.model} ${plan.scene}, holding or clearly interacting with an anatomically correct smartphone. The phone screen is the only text exception: keep its white screen, one solid green checkmark, and short black text “Application Successful”.

Keep the complete headline and subtitle inside the reserved negative-space region. The text must never overlap the model’s face, hair, body, hands, clothing, or phone. Preserve a clearly visible gap between the text block and the model silhouette. Use realistic Zambian lifestyle commercial photography, premium lighting, natural skin retouching, strong text hierarchy, oversized readable typography, and generous safe margins. Do not render ${brandLabel}, another brand-name wordmark, an icon logo, or a corner badge in the top-left. Do not add another Z.

Negative prompt: alternate Z glyph, distorted Z outline, extra Z, duplicate Z, benefit copy, feature callout, badge, label, disclaimer, extra poster text, small typography, text over model, text over face, text over body, text over hands, text over phone, blurry, low quality, distorted anatomy, deformed hands, extra fingers, unreadable text, bad typography, duplicated elements, top-left brand wordmark, standalone text logo, corner logo badge, mixed brands.`;
  });
}

export function buildLoanPosterPrompt(options: AutoPosterOptions): string {
  const count = normalizeZambiaPosterCount(options.count);
  const brand = AUTO_POSTER_BRANDS.includes(options.brand)
    ? options.brand
    : AUTO_POSTER_DEFAULT_BRAND;
  const aspectRatio = AUTO_POSTER_ASPECT_RATIOS.includes(options.aspectRatio)
    ? options.aspectRatio
    : AUTO_POSTER_DEFAULT_ASPECT_RATIO;
  const brandLabel = autoPosterBrandLabel(brand);
  const aspectDescription = aspectRatio === '1:1' ? '1:1 square' : '16:9 landscape';
  const outputPrefix = `${brand}-poster`;
  const usesZReference = autoPosterUsesZReference(brand);
  const referenceContract = usesZReference
    ? `The attached file \`${ZAMBIA_POSTER_REFERENCE_NAME}\` is the sole internal Z shape reference. Locate its project-relative path and pass it through \`--image\` for every generation. Reproduce its exact silhouette geometry for every visible Z, but use it for shape only: ignore the source color and freely adapt color, material, opacity, scale, and position. Never invent an alternate Z glyph. Never copy the Z reference into a visible output path or list it as a deliverable.`
    : `BiuMoney reference policy: Do not attach or use the Z reference. Do not render a letter Z, a background letter, or a replacement brand mark.`;
  const brandOverride = usesZReference
    ? `- Do not render \`${brandLabel}\`, another brand-name wordmark, or a replacement logo in the top-left corner.
- The single semi-transparent background Z defined by the skill is the only permitted brand mark, and it must preserve the exact silhouette geometry of the supplied reference.
- Render exactly two poster-copy text elements: one very large headline and one large subtitle. Do not add benefit copy, feature callouts, labels, badges, disclaimers, or other poster text.
- The phone-screen exception is the only additional visible wording: retain the white screen, one solid green checkmark, and \`Application Successful\`.
- Keep the headline and subtitle entirely inside reserved negative space; they must never overlap the model’s face, body, hands, clothing, or phone.
- These Zamloan copy and placement rules take precedence over conflicting skill template rules.`
    : `- Do not render \`${brandLabel}\`, another brand-name wordmark, a logo, a letter Z, or any background alphabetic motif.
- Render exactly two visible text elements: one headline and one subtitle. Do not add benefits, labels, badges, disclaimers, or phone-screen text.
- Make both text elements large and readable, place them entirely in reserved negative space, and ensure they must never overlap the model, including the face, body, hands, clothing, and phone.
- This BiuMoney override takes precedence over conflicting skill template rules.`;
  const generationReference = usesZReference
    ? ', and the Z reference via `--image`'
    : ', without an `--image` reference';
  const referenceCleanup = usesZReference
    ? '- Remove the internal Z reference after all image generation attempts finish.\n'
    : '';

  return `Generate exactly ${count} ${brandLabel} Zambia loan poster${count === 1 ? '' : 's'} now. Do not ask the user for a prompt, scene list, copy, or confirmation.

The active functional skill is \`${LOAN_POSTER_SKILL_ID}\`. Follow its workflow, template rules, libraries, and negative prompt as the source of truth for visual direction and scene construction.

Runtime inputs:
- brand: \`${brand}\` (${brandLabel}); use it for art direction and filenames, but do not mix in the other brand
- format: \`${aspectRatio}\` (${aspectDescription})
- quantity: \`${count}\`
- output prefix: \`${outputPrefix}\`

${referenceContract}

Resolve exactly ${count} distinct internal scene plan${count === 1 ? '' : 's'} using the active skill, then render one poster per plan. Do not expose planning files as deliverables.

Visible-brand override:
${brandOverride}

Generation contract:
- Use the image model selected in the project metadata.
- Run \`"$OD_NODE_BIN" "$OD_BIN" media generate\` exactly once per scene with \`--surface image\`, \`--aspect ${aspectRatio}\`, the resolved full prompt${generationReference}.
- Write outputs as \`${outputPrefix}-01.png\` through \`${outputPrefix}-${String(count).padStart(2, '0')}.png\`.
- Complete all ${count} generation attempts. If one fails, continue with the remaining scenes and report the failed item accurately.
${referenceCleanup}- Do not create \`critique.json\`, manifests, notes, or any other auxiliary files. Only the requested poster PNG files may remain as visible project outputs.
- Do not emit HTML artifacts. The generated image files are the deliverables and will be placed on the canvas automatically.`;
}

export function buildZambiaPosterPrompt(requestedCount: number): string {
  return buildLoanPosterPrompt({
    count: requestedCount,
    aspectRatio: AUTO_POSTER_DEFAULT_ASPECT_RATIO,
    brand: AUTO_POSTER_DEFAULT_BRAND,
  });
}

export async function loadZambiaPosterReference(): Promise<File> {
  const response = await fetch(ZAMBIA_POSTER_REFERENCE_URL, { cache: 'force-cache' });
  if (!response.ok) {
    throw new Error(`Unable to load Zambia Z reference (${response.status})`);
  }
  const blob = await response.blob();
  return new File([blob], ZAMBIA_POSTER_REFERENCE_NAME, {
    type: blob.type || 'image/png',
  });
}
