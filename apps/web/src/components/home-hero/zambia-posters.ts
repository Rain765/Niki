export const ZAMBIA_POSTER_MIN_COUNT = 1;
export const ZAMBIA_POSTER_MAX_COUNT = 10;
export const ZAMBIA_POSTER_DEFAULT_COUNT = 1;
export const ZAMBIA_POSTER_REFERENCE_URL = '/brand/zambia-support/z-reference.png';
export const ZAMBIA_POSTER_REFERENCE_NAME = 'loan-poster-z-reference.png';
export const ZAMLOAN_LOGO_URL = '/brand/zambia-support/zamloan-logo.svg';
export const ZAMLOAN_LOGO_NAME = 'zamloan-logo.svg';
export const LOAN_POSTER_SKILL_ID = 'loan-poster-skill-v1-1';
const LEGACY_LOAN_POSTER_SKILL_ID = 'loan-poster-skill-v1.1';
const POSTER_ASSET_TIMEOUT_MS = 12_000;
const POSTER_ASSET_RETRY_DELAYS_MS = [250, 750] as const;

export const AUTO_POSTER_ASPECT_RATIOS = ['1:1', '16:9', '3:4'] as const;
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
    || (
      (skillId === LOAN_POSTER_SKILL_ID || skillId === LEGACY_LOAN_POSTER_SKILL_ID)
      && metadata?.kind === 'image'
    );
}

export function isLoanPosterOutputName(name: string): boolean {
  return /^(?:zamloan|biumoney)-poster-(?:\d{8}-)?\d+\.png$/i.test(name);
}

export function isLoanPosterGenerationPrompt(value: string | null | undefined): boolean {
  if (!value) return false;
  const prompt = value.trim();
  return /^Generate exactly \d+ (?:Zamloan|BiuMoney) Zambia loan posters? now\./i.test(prompt)
    && [LOAN_POSTER_SKILL_ID, LEGACY_LOAN_POSTER_SKILL_ID]
      .some((skillId) => prompt.includes(`\`${skillId}\``));
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

export type LoanPosterLogoAnchor = 'left' | 'right';

export interface LoanPosterScenePlan {
  prompt: string;
  logoAnchor: LoanPosterLogoAnchor;
  foregroundPrompt?: string;
  headline?: string;
  subtitle?: string;
  textAnchor?: LoanPosterLogoAnchor;
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

export function autoPosterUsesZReference(_brand: AutoPosterBrand): boolean {
  // A complete poster generated in one pass is a flattened image. Applying
  // the Z reference afterward necessarily puts it above the model and copy.
  // Keep this false unless the renderer gains a true background-only edit or
  // a validated content mask; the model now composes the background Z itself.
  return false;
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

const BIUMONEY_PHONE_STATUS_COPY = [
  'Application Approved',
  'Approval Confirmed',
  'Request Approved',
  'Loan Approved',
  'Application Successful',
  'Funds Ready',
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

const WIDESCREEN_POSTER_COMPOSITIONS = [
  {
    logoAnchor: 'left' as const,
    instruction: 'Use a left text column beginning at 5.5% of the canvas width. Reserve the top 22% of that column as a dedicated logo-safe row, begin the headline below 25% of the canvas height, and keep a clear vertical gap between that logo-safe row and the headline. Place the model in the right third and keep the complete left text column unobstructed',
    backgroundInstruction: 'Keep the left 45% visually calm as a copy-safe field, with the top 22% reserved as a logo-safe row. Concentrate environmental depth and practical scene details in the right half without placing a person there',
    foregroundInstruction: 'Place the complete model group in the right third, leaving the left 45% completely empty and keeping all hair, hands, clothing, and the phone inside the canvas',
  },
  {
    logoAnchor: 'right' as const,
    instruction: 'Use a right text column beginning at 53% of the canvas width. Reserve the top 22% of that column as a dedicated logo-safe row, begin the headline below 25% of the canvas height, and keep a clear vertical gap between that logo-safe row and the headline. Place the model in the left third and keep the complete right text column unobstructed',
    backgroundInstruction: 'Keep the right 47% visually calm as a copy-safe field, with the top 22% reserved as a logo-safe row. Concentrate environmental depth and practical scene details in the left half without placing a person there',
    foregroundInstruction: 'Place the complete model group in the left third, leaving the right 47% completely empty and keeping all hair, hands, clothing, and the phone inside the canvas',
  },
] as const;

const ZAMLOAN_NON_WIDESCREEN_COMPOSITIONS = [
  {
    instruction: 'Use a left text column beginning at 5.5% of the canvas width. Treat the top 18% of the canvas as a dedicated logo-safe band and place the headline top edge at or below 20% of the canvas height. Keep that upper-left band free of all text, people, props, shelves, windows, and high-contrast details. Place the model in the right half and keep the complete left text column unobstructed',
    backgroundInstruction: 'Keep the left 48% calm and low-detail, with the top 18% reserved as a logo-safe band. Build the environment in the right half without rendering any person',
    foregroundInstruction: 'Place the complete model group in the right half and keep the left 48% empty. Keep all hair, hands, clothing, and the phone inside the canvas',
  },
  {
    instruction: 'Use a left text column beginning at 5.5% of the canvas width. Treat the top 18% of the canvas as a dedicated logo-safe band and place the headline top edge at or below 20% of the canvas height. Keep that upper-left band visually calm and free of all text or subject detail. Place the model in the lower-right half and preserve the complete left text column',
    backgroundInstruction: 'Keep the left 48% calm and low-detail, with the top 18% reserved as a logo-safe band. Build the environment in the right half without rendering any person',
    foregroundInstruction: 'Place the complete model group in the lower-right half and keep the left 48% empty. Keep all hair, hands, clothing, and the phone inside the canvas',
  },
  {
    instruction: 'Use a left text column beginning at 5.5% of the canvas width. Treat the top 18% of the canvas as a dedicated logo-safe band and place the headline top edge at or below 20% of the canvas height. Keep that upper-left band empty except for smooth background color. Use an editorial crop on the right and leave the complete left text column unobstructed',
    backgroundInstruction: 'Keep the left 48% as smooth background color, with the top 18% reserved as a logo-safe band. Build subtle environmental depth on the right without rendering any person',
    foregroundInstruction: 'Use an editorial waist-up crop in the right half and keep the left 48% empty. Keep all hair, hands, clothing, and the phone inside the canvas',
  },
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

export function buildLoanPosterScenePlans(options: AutoPosterOptions): LoanPosterScenePlan[] {
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
    const widescreenComposition = WIDESCREEN_POSTER_COMPOSITIONS[
      variationIndex % WIDESCREEN_POSTER_COMPOSITIONS.length
    ]!;
    const nonWidescreenComposition = ZAMLOAN_NON_WIDESCREEN_COMPOSITIONS[
      variationIndex % ZAMLOAN_NON_WIDESCREEN_COMPOSITIONS.length
    ]!;
    const composition = aspectRatio === '16:9'
      ? widescreenComposition.instruction
      : brand === 'zamloan'
        ? nonWidescreenComposition.instruction
        : MODEL_SAFE_POSTER_COMPOSITIONS[
          (variationIndex * 5) % MODEL_SAFE_POSTER_COMPOSITIONS.length
        ]!;
    const logoAnchor: LoanPosterLogoAnchor = aspectRatio === '16:9'
      ? widescreenComposition.logoAnchor
      : 'left';
    if (brand === 'biumoney') {
      const phoneStatus = BIUMONEY_PHONE_STATUS_COPY[
        variationIndex % BIUMONEY_PHONE_STATUS_COPY.length
      ]!;
      return {
        logoAnchor,
        prompt: `Create a premium ${brandLabel} Zambia mobile-loan advertising poster in ${aspectRatio}.

Use a clean ${palette.gradient} dominant background with subtle abstract depth and no letter Z, no alphabetic background motif, and no logo-shaped watermark. Render exactly two visible text elements on the poster canvas: “${plan.headline}” as a very large bold headline and “${plan.subline}” as a large supporting subtitle. Do not render any other poster words, numbers, labels, badges, benefit text, brand names, or disclaimers. ${composition}. Show ${plan.model} ${plan.scene}, clearly presenting an anatomically correct smartphone with its screen facing the camera, fully visible, unobstructed by fingers, and large enough for the interface to read clearly. The phone screen is the only text exception: build a clean white success interface with a compact solid green circle containing a crisp white checkmark. The entire circle must occupy no more than about one-sixth of the visible screen height. Place it in the upper half of the phone screen, then leave a generous vertical gap of at least one full circle diameter before the centered short black status copy “${phoneStatus}” below it. Do not render any other phone-screen words, numbers, labels, controls, or icons.

Keep the complete headline and subtitle inside the reserved negative-space region. The text must never overlap the model’s face, hair, body, hands, clothing, or phone. Preserve a clearly visible gap between the text block and the model silhouette. Use realistic Zambian lifestyle commercial photography, premium lighting, natural skin retouching, strong text hierarchy, oversized readable typography, and generous safe margins.

Negative prompt: letter Z, background letter, alphabetic background motif, logo, watermark, brand wordmark, benefit text, callout, badge, label, disclaimer, extra poster text, small typography, text over model, text over face, text over body, text over hands, text over phone, hidden phone screen, phone screen turned away, cropped phone, blank phone screen, screen glare, standalone green checkmark, green checkmark without a circle, green checkmark on white background, oversized success icon, icon touching status text, cramped phone UI, extra phone-screen text, blurry, low quality, distorted anatomy, deformed hands, extra fingers, unreadable poster text, duplicated elements, mixed brands.`,
      };
    }

    return {
      logoAnchor,
      prompt: `Create a premium ${brandLabel} Zambia mobile-loan advertising poster in ${aspectRatio} as one unified composition.

Use a ${palette.gradient} dominant background and one ${palette.ribbon} curved ribbon along the bottom. Render one large low-opacity Z silhouette as an integrated background graphic. The Z must remain visually behind every model, phone, headline, and subtitle pixel; it must never tint, cross, cover, or interrupt foreground content.

Render exactly two poster-copy text elements: “${plan.headline}” as a very large bold headline and “${plan.subline}” as a large supporting subtitle. Do not add benefit copy, feature callouts, labels, badges, disclaimers, or any other poster text. ${composition}. Show ${plan.model} ${plan.scene}, holding or clearly interacting with an anatomically correct smartphone. The phone screen is the only text exception: use a white screen, one solid green checkmark, and short black text “Application Successful”.

Keep the complete headline and subtitle inside the reserved negative-space region. Preserve a clearly visible gap between the copy and every model, including faces, bodies, hands, clothing, props, vehicles, and phones. Reserve the specified logo-safe row or logo-safe band with no generated wordmark or high-contrast detail. Use realistic Zambian lifestyle commercial photography, premium lighting, natural skin retouching, strong text hierarchy, expressive campaign typography, and generous safe margins.

Negative prompt: Z over subject, Z over text, foreground Z, duplicate Z, extra Z, logo, watermark, brand wordmark, benefit copy, feature callout, badge, label, disclaimer, extra poster text, small typography, text over model, text over face, text over body, text over hands, text over phone, text over prop, text over vehicle, blurry, low quality, distorted anatomy, deformed hands, extra fingers, unreadable text, bad typography, duplicated elements, mixed brands.`,
    };
  });
}

export function buildLoanPosterScenePrompts(options: AutoPosterOptions): string[] {
  return buildLoanPosterScenePlans(options).map((plan) => plan.prompt);
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
  const aspectDescription = {
    '1:1': '1:1 square',
    '16:9': '16:9 landscape',
    '3:4': '3:4 portrait',
  }[aspectRatio];
  const outputPrefix = `${brand}-poster`;
  const isZamloan = brand === 'zamloan';
  const referenceContract = isZamloan
    ? `Use a single-pass full-poster composition. Render one low-opacity background Z inside the generated artwork and keep that background Z behind every subject and copy pixel. Do not attach the legacy Z reference and do not pass \`--overlay-z\`: a post-generation overlay would necessarily sit above the flattened model and typography.`
    : `BiuMoney reference policy: Do not attach or use the Z reference. Do not render a letter Z, a background letter, or a replacement brand mark.`;
  const logoContract = isZamloan
    ? `The attached internal file \`${ZAMLOAN_LOGO_NAME}\` is the exact Zamloan logo. Locate its project-relative path and pass it through \`--overlay-logo\` for every generation. For 16:9 scenes, also pass \`--overlay-logo-anchor left|right\` matching the scene's title column. The daemon will composite it in the reserved logo-safe row with a unified soft backdrop after generation; do not redraw, typeset, or invent a replacement logo in the generated image.`
    : 'BiuMoney logo policy: Do not attach, use, or render the Zamloan logo.';
  const brandOverride = isZamloan
    ? `- Do not render \`${brandLabel}\`, another brand-name wordmark, or a replacement logo in the reserved logo-safe row.
- Generate the background, Z, model, phone, headline, and subtitle together in one image so the model can coordinate the complete composition.
- Render one large low-opacity Z as part of the background and keep it behind every model, phone, headline, and subtitle pixel.
- Render exactly one headline and one subtitle inside the scene's reserved negative space.
- The phone-screen exception is the only additional visible wording: retain the white screen, one solid green checkmark, and \`Application Successful\`.
- Keep the headline and subtitle entirely inside reserved negative space; they must never overlap the model’s face, body, hands, clothing, or phone.
- These Zamloan copy and placement rules take precedence over conflicting skill template rules.`
    : `- Do not render \`${brandLabel}\`, another brand-name wordmark, a logo, a letter Z, or any background alphabetic motif.
- Render exactly two visible text elements on the poster canvas: one headline and one subtitle. Do not add benefits, labels, badges, disclaimers, or other poster text.
- The phone-screen exception is the only additional visible wording: clearly present the phone with its screen facing the camera, fully visible and large enough to read. Use a compact solid green circle containing a white checkmark, keep the circle no larger than about one-sixth of the screen height, leave at least one full circle diameter before the copy below it, and use the scene-specific short status copy instead of repeating one status across every scene.
- Make both text elements large and readable, place them entirely in reserved negative space, and ensure they must never overlap the model, including the face, body, hands, clothing, and phone.
- This BiuMoney override takes precedence over conflicting skill template rules.`;
  const generationReference = ', without an `--image` reference';

  return `Generate exactly ${count} ${brandLabel} Zambia loan poster${count === 1 ? '' : 's'} now. Do not ask the user for a prompt, scene list, copy, or confirmation.

The active functional skill is \`${LOAN_POSTER_SKILL_ID}\`. Follow its workflow, template rules, libraries, and negative prompt as the source of truth for visual direction and scene construction.

Runtime inputs:
- brand: \`${brand}\` (${brandLabel}); use it for art direction and filenames, but do not mix in the other brand
- format: \`${aspectRatio}\` (${aspectDescription})
- quantity: \`${count}\`
- output prefix: \`${outputPrefix}\`

${referenceContract}
${logoContract}

Resolve exactly ${count} distinct internal scene plan${count === 1 ? '' : 's'} using the active skill, then render one poster per plan. Do not expose planning files as deliverables.

Visible-brand override:
${brandOverride}

Generation contract:
- Use the image model selected in the project metadata.
- Run \`"$OD_NODE_BIN" "$OD_BIN" media generate\` exactly once per scene with \`--surface image\`, \`--aspect ${aspectRatio}\`, the resolved full-poster prompt${generationReference}${isZamloan ? `, and \`--overlay-logo\` with the Zamloan logo path${aspectRatio === '16:9' ? ', plus `--overlay-logo-anchor` matching the scene title column' : ''}` : ''}. Do not pass \`--overlay-z\`, \`--foreground-prompt-file\`, \`--poster-headline\`, \`--poster-subtitle\`, or \`--poster-text-anchor\`.
- Write outputs as \`${outputPrefix}-01.png\` through \`${outputPrefix}-${String(count).padStart(2, '0')}.png\`.
- Complete all ${count} generation attempts. If one fails, continue with the remaining scenes and report the failed item accurately.
- Do not create \`critique.json\`, manifests, notes, or any other auxiliary files. Only the requested poster PNG files may remain as visible project outputs.
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
  return loadBundledPosterAsset({
    url: ZAMBIA_POSTER_REFERENCE_URL,
    name: ZAMBIA_POSTER_REFERENCE_NAME,
    fallbackType: 'image/png',
    label: 'Zambia Z reference',
  });
}

export async function loadZamloanLogo(): Promise<File> {
  return loadBundledPosterAsset({
    url: ZAMLOAN_LOGO_URL,
    name: ZAMLOAN_LOGO_NAME,
    fallbackType: 'image/svg+xml',
    label: 'Zamloan logo',
    requireImageContentType: true,
  });
}

async function loadBundledPosterAsset(options: {
  url: string;
  name: string;
  fallbackType: string;
  label: string;
  requireImageContentType?: boolean;
}): Promise<File> {
  let lastFailure: unknown;
  for (let attempt = 0; attempt <= POSTER_ASSET_RETRY_DELAYS_MS.length; attempt += 1) {
    const controller = new AbortController();
    const timeoutId = globalThis.setTimeout(() => {
      controller.abort(new DOMException(`${options.label} request timed out`, 'TimeoutError'));
    }, POSTER_ASSET_TIMEOUT_MS);
    try {
      const response = await fetch(options.url, {
        cache: attempt === 0 ? 'force-cache' : 'reload',
        signal: controller.signal,
      });
      const contentType = response.headers.get('content-type') ?? '';
      if (
        !response.ok
        || (options.requireImageContentType && !contentType.startsWith('image/'))
      ) {
        throw new Error(`Unable to load ${options.label} (${response.status})`);
      }
      const blob = await response.blob();
      return new File([blob], options.name, {
        type: blob.type || options.fallbackType,
      });
    } catch (reason) {
      lastFailure = reason;
      if (attempt >= POSTER_ASSET_RETRY_DELAYS_MS.length) break;
      await waitForPosterAssetRetry(POSTER_ASSET_RETRY_DELAYS_MS[attempt]!);
    } finally {
      globalThis.clearTimeout(timeoutId);
    }
  }
  const detail = lastFailure instanceof Error ? lastFailure.message : 'unknown error';
  throw new Error(`Unable to load ${options.label}: ${detail}`);
}

function waitForPosterAssetRetry(delayMs: number): Promise<void> {
  return new Promise((resolve) => globalThis.setTimeout(resolve, delayMs));
}
