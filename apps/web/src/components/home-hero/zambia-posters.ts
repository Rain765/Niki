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

export const AUTO_POSTER_BRANDS = [
  'zamloan',
  'biumoney',
  'zamcash',
  'zammoney',
  'fastako',
  'yangaloan',
] as const;
export type AutoPosterBrand = (typeof AUTO_POSTER_BRANDS)[number];
export const AUTO_POSTER_DEFAULT_BRAND: AutoPosterBrand = 'zamloan';

export const AUTO_POSTER_PURPOSES = ['acquisition', 'anti-fraud'] as const;
export type AutoPosterPurpose = (typeof AUTO_POSTER_PURPOSES)[number];
export const AUTO_POSTER_DEFAULT_PURPOSE: AutoPosterPurpose = 'acquisition';

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
  return /^(?:zamloan|biumoney|zamcash|zammoney|fastako|yangaloan)-poster-(?:\d{8}-)?\d+\.png$/i.test(name);
}

export function isLoanPosterGenerationPrompt(value: string | null | undefined): boolean {
  if (!value) return false;
  const prompt = value.trim();
  return /^Generate exactly \d+ (?:Zamloan|BiuMoney|ZamCash|ZamMoney|Fastako|Yangaloan) Zambia loan posters? now\./i.test(prompt)
    && [LOAN_POSTER_SKILL_ID, LEGACY_LOAN_POSTER_SKILL_ID]
      .some((skillId) => prompt.includes(`\`${skillId}\``));
}

export interface AutoPosterOptions {
  count: number;
  aspectRatio: AutoPosterAspectRatio;
  brand: AutoPosterBrand;
  purpose?: AutoPosterPurpose;
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

interface AutoPosterBrandConfig {
  label: string;
  domain: string;
  brandColors: readonly string[];
  logo?: {
    url: string;
    name: string;
  };
}

const AUTO_POSTER_BRAND_CONFIG: Record<AutoPosterBrand, AutoPosterBrandConfig> = {
  zamloan: {
    label: 'Zamloan',
    domain: 'zamloan.com',
    brandColors: ['#46A93C', '#D35430'],
    logo: { url: ZAMLOAN_LOGO_URL, name: ZAMLOAN_LOGO_NAME },
  },
  biumoney: { label: 'BiuMoney', domain: 'biumoney.com', brandColors: [] },
  zamcash: {
    label: 'ZamCash',
    domain: 'zamcash.com',
    brandColors: ['#43AA3E', '#D45330', '#DC5130'],
    logo: { url: '/brand/zambia-support/zamcash-logo.svg', name: 'zamcash-logo.svg' },
  },
  zammoney: {
    label: 'ZamMoney',
    domain: 'zammoney.com',
    brandColors: ['#0AB81C', '#0B1D0B'],
    logo: { url: '/brand/zambia-support/zammoney-logo.svg', name: 'zammoney-logo.svg' },
  },
  fastako: {
    label: 'Fastako',
    domain: 'fastako.com',
    brandColors: ['#0FCE65', '#24263F'],
    logo: { url: '/brand/zambia-support/fastako-logo.svg', name: 'fastako-logo.svg' },
  },
  yangaloan: {
    label: 'Yangaloan',
    domain: 'yangaloan.com',
    brandColors: ['#FE5200'],
    logo: { url: '/brand/zambia-support/yangaloan-logo.svg', name: 'yangaloan-logo.svg' },
  },
};

const PURPOSE_LABELS: Record<AutoPosterPurpose, string> = {
  acquisition: '引流',
  'anti-fraud': '防欺诈',
};

export function normalizeZambiaPosterCount(value: number): number {
  if (!Number.isFinite(value)) return ZAMBIA_POSTER_DEFAULT_COUNT;
  return Math.min(
    ZAMBIA_POSTER_MAX_COUNT,
    Math.max(ZAMBIA_POSTER_MIN_COUNT, Math.round(value)),
  );
}

export function autoPosterBrandLabel(brand: AutoPosterBrand): string {
  return AUTO_POSTER_BRAND_CONFIG[brand].label;
}

export function autoPosterBrandDomain(brand: AutoPosterBrand): string {
  return AUTO_POSTER_BRAND_CONFIG[brand].domain;
}

export function autoPosterBrandColors(brand: AutoPosterBrand): readonly string[] {
  return AUTO_POSTER_BRAND_CONFIG[brand].brandColors;
}

export function autoPosterPurposeLabel(purpose: AutoPosterPurpose): string {
  return PURPOSE_LABELS[purpose];
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

const ANTI_FRAUD_POSTER_SCENES = [
  {
    model: 'a young Zambian woman',
    wardrobe: 'wearing a modern coral blouse and relaxed neutral trousers',
    environment: 'in a bright, contemporary Lusaka home with warm daylight and restrained décor',
    riskCue: 'her free hand makes a decisive stop gesture toward the empty area reserved for a suspicious message overlay',
    safeAction: 'she presents the official website on the phone in her other hand',
    camera: 'a candid waist-up portrait with the safety decision readable at a glance',
  },
  {
    model: 'a Zambian neighborhood shop owner',
    wardrobe: 'wearing a patterned blouse and a practical emerald apron',
    environment: 'behind the counter of a tidy neighborhood shop with colorful products softly out of focus',
    riskCue: 'her free hand makes a decisive stop gesture toward the empty area reserved for a suspicious fake-agent message overlay',
    safeAction: 'she presents the official website on the phone in her other hand',
    camera: 'a confident counter-height environmental portrait',
  },
  {
    model: 'a young Zambian commuter',
    wardrobe: 'wearing smart-casual city clothing with a cobalt overshirt',
    environment: 'at a bright public transit shelter with an energetic Lusaka streetscape in the distance',
    riskCue: 'their free hand dismisses the empty area reserved for a suspicious-call overlay',
    safeAction: 'they present the official website on the phone in the other hand',
    camera: 'a dynamic mid-shot with clean directional movement from danger to safety',
  },
  {
    model: 'a Zambian parent',
    wardrobe: 'wearing warm neutrals with one deep-green accent',
    environment: 'in a welcoming family living room with soft afternoon light',
    riskCue: 'their free hand rejects the empty area reserved for a suspicious-profile message overlay',
    safeAction: 'they present the official website on a phone held toward the camera',
    camera: 'an intimate single-person waist-up portrait',
  },
  {
    model: 'a Zambian office worker',
    wardrobe: 'wearing a crisp cream shirt with a burgundy accent',
    environment: 'at a modern, uncluttered desk with graphic daylight and subtle office depth',
    riskCue: 'their free hand pushes away the empty area reserved for a suspicious-payment message overlay',
    safeAction: 'they present the official website on the phone in the other hand',
    camera: 'a polished desk-level editorial portrait',
  },
  {
    model: 'an older Zambian man',
    wardrobe: 'wearing reassuring blue and sand tones with natural everyday styling',
    environment: 'in a comfortable living room with warm practical lighting and familiar family details',
    riskCue: 'his free hand rejects the empty area reserved for a suspicious-caller message overlay',
    safeAction: 'he presents the official website on a phone held toward the camera',
    camera: 'a reassuring single-person portrait that emphasizes confidence',
  },
] as const;

interface AntiFraudPosterPalette {
  copyField: string;
  sceneField: string;
  protectsSceneHue: boolean;
  source?: 'logo-color';
}

const ANTI_FRAUD_POSTER_PALETTES = [
  {
    copyField: 'warm ivory (#f7ecd9)',
    sceneField: 'deep forest green (#153f2e)',
    protectsSceneHue: false,
  },
  {
    copyField: 'warm sand (#f1dfc3)',
    sceneField: 'rich burgundy (#6f2937)',
    protectsSceneHue: true,
  },
  {
    copyField: 'warm cream',
    sceneField: 'burnished terracotta',
    protectsSceneHue: true,
  },
] as const satisfies readonly AntiFraudPosterPalette[];

const ANTI_FRAUD_LOGO_COLOR_SWATCHES = [
  '#46A93C',
  '#D35430',
  '#43AA3E',
  '#D45330',
  '#DC5130',
  '#0AB81C',
  '#0B1D0B',
  '#0FCE65',
  '#FE5200',
] as const;

const ANTI_FRAUD_LOGO_COLOR_PALETTES: readonly AntiFraudPosterPalette[] =
  ANTI_FRAUD_LOGO_COLOR_SWATCHES.map((color) => ({
    copyField: `a very pale low-saturation tint derived only from ${color}`,
    sceneField: `the original saturated hue ${color}`,
    protectsSceneHue: false,
    source: 'logo-color',
  }));

function antiFraudPosterPalettes(): readonly AntiFraudPosterPalette[] {
  return [
    ...ANTI_FRAUD_POSTER_PALETTES,
    ...ANTI_FRAUD_LOGO_COLOR_PALETTES,
  ];
}

const ZAMLOAN_ANTI_FRAUD_HALF_SPLIT_INSTRUCTION =
  'Build a clean editorial diagonal split using one straight dividing edge from the exact bottom-left canvas corner (0%, 100%) to the right canvas edge at (100%, 8%). This creates approximately 54% light copy field and 46% environmental scene: the smooth light copy field is above-left and the environmental scene is below-right. The left endpoint must visibly touch the exact bottom-left corner with no gap or early exit. The right endpoint must touch the right edge 8% below the top. Do not move either endpoint, vary the angle, curve the edge, or add another wedge or split. Keep the model in the lower-right scene field, but let the open rejecting palm extend slightly into the light field beneath the copy';

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

const ZAMLOAN_ANTI_FRAUD_COPY_LAYOUTS: Record<AutoPosterAspectRatio, string> = {
  '3:4': 'Use a left text column beginning at 5.5% of the canvas width. Reserve the top 17% as a dedicated logo-safe band, keep that band blank and calm, and place the headline top edge between 19% and 20% of the canvas height. Set the subtitle exactly two lines: “Trust Only Official” / “Customer Service”, and keep its complete rendered block no wider than 36% of the canvas. Keep the model and phone in the right half, with at least 5% of the canvas width of uninterrupted background between the widest text pixel and the nearest phone, hand, or model pixel',
  '16:9': 'Use a left text column beginning at 5.5% of the canvas width. Reserve the top 20% as a dedicated logo-safe band, keep that band blank and calm, and place the headline top edge between 22.5% and 23.5% of the canvas height. Set the subtitle exactly two lines: “Trust Only Official” / “Customer Service”, and keep its complete rendered block no wider than 35% of the canvas. Keep the model and phone in the right portion, with at least 5% of the canvas width of uninterrupted background between the widest text pixel and the nearest phone, hand, or model pixel',
  '1:1': 'Use a left text column beginning at 5.5% of the canvas width. Reserve the top 17% as a dedicated logo-safe band, keep that band blank and calm, and place the headline top edge between 19% and 20% of the canvas height. Set the subtitle exactly three lines: “Trust Only” / “Official Customer” / “Service”, and keep its complete rendered block no wider than 31% of the canvas. Keep the model and phone in the right portion, with at least 5% of the canvas width of uninterrupted background between the widest text pixel and the nearest phone, hand, or model pixel',
};

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
  const purpose = options.purpose && AUTO_POSTER_PURPOSES.includes(options.purpose)
    ? options.purpose
    : AUTO_POSTER_DEFAULT_PURPOSE;
  const brandLabel = autoPosterBrandLabel(brand);
  const brandDomain = autoPosterBrandDomain(brand);
  const seedOffset = options.variationSeed
    ? stableStringHash(options.variationSeed)
    : 0;
  const variationOffset = seedOffset + normalizeVariationOffset(options.variationOffset);

  return Array.from({ length: count }, (_, index) => {
    const variationIndex = variationOffset + index;
    const plan = LOAN_POSTER_SCENES[variationIndex % LOAN_POSTER_SCENES.length]!;
    const antiFraudPlan = ANTI_FRAUD_POSTER_SCENES[
      variationIndex % ANTI_FRAUD_POSTER_SCENES.length
    ]!;
    const antiFraudPalettes = antiFraudPosterPalettes();
    const antiFraudPalette = antiFraudPalettes[
      variationIndex % antiFraudPalettes.length
    ]!;
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
      : nonWidescreenComposition.instruction;
    const logoAnchor: LoanPosterLogoAnchor = aspectRatio === '16:9'
      ? widescreenComposition.logoAnchor
      : 'left';
    if (purpose === 'anti-fraud') {
      const campaignComposition = ZAMLOAN_ANTI_FRAUD_COPY_LAYOUTS[aspectRatio];
      const lowerRightContinuityZone = {
        '3:4': 'x=73% to 100% and y=72% to 90% of the canvas',
        '1:1': 'x=71% to 100% and y=69% to 94% of the canvas',
        '16:9': 'x=78% to 100% and y=66% to 94% of the canvas',
      }[aspectRatio];
      const protectedBrandColor = brand === 'zamloan'
        ? 'Zamloan green'
        : `${brandLabel} brand colors`;
      const paletteProtection = antiFraudPalette.protectsSceneHue
        ? ` Do not replace the selected scene color with ${protectedBrandColor}; reserve brand colors for the supplied logo and the compact green phone shield only.`
        : '';
      const logoPaletteDirection = antiFraudPalette.source === 'logo-color'
        ? ' This palette uses one isolated logo color rather than a brand-matched color scheme. Keep the pale and original fields within that single hue family; do not introduce or pair it with another sampled logo color.'
        : '';
      const brandBackground = brand === 'zamloan'
        ? 'Render one large low-opacity Z silhouette as an integrated background graphic. The Z must remain visually behind every model, phone, headline, and subtitle pixel.'
        : 'Do not render a letter Z, alphabetic background motif, logo-shaped watermark, or invented brand symbol. Preserve the same visual depth with restrained non-alphabetic tonal texture.';
      const logoSafeCopy = AUTO_POSTER_BRAND_CONFIG[brand].logo
        ? `Keep the top-left logo-safe row completely blank and calm for the exact ${brandLabel} logo that will be composited later; keep the complete top-left logo-safe row near-white at no more than 8% color strength as a seamless part of the full pale copy field. Never place the original saturated hue behind the supplied logo. Do not add a separate logo patch, haze, shadow, glow, panel, or outline, and do not render, redraw, or typeset a logo or brand name.`
        : 'Keep the top-left brand-safe row completely blank and calm; do not render, redraw, or typeset a logo or brand name.';
      return {
        logoAnchor: 'left',
        textAnchor: 'right',
        headline: 'Prevent Fraud',
        subtitle: 'Trust Only Official Customer Service',
        prompt: `Create a premium ${brandLabel} Zambia public-safety anti-fraud poster in ${aspectRatio} as one unified composition, using the same campaign-quality composition system as the ${brandLabel} mobile-loan advertising posters.

Use ${antiFraudPalette.copyField} and ${antiFraudPalette.sceneField} for a crisp editorial diagonal split applied only as a background surface treatment. The selected palette is mandatory and must dominate the background.${paletteProtection}${logoPaletteDirection} ${ZAMLOAN_ANTI_FRAUD_HALF_SPLIT_INSTRUCTION}. ${campaignComposition}. ${logoSafeCopy} ${brandBackground}

Render exactly two poster-copy text elements: “Prevent Fraud” as the very large bold primary headline and “Trust Only Official Customer Service” as the large supporting subtitle. Reproduce both phrases exactly. Match the acquisition posters' expressive heavy campaign typography, oversized scale, tight line spacing, and compact headline-to-subtitle gap. Make the subtitle about 20% larger than a conventional supporting line and use one solid deep-charcoal color across every subtitle word; do not color any subtitle word green, red, or another accent. Do not reduce the established headline or subtitle font size to satisfy the new spacing; achieve separation only through the specified position, line breaks, width, and negative space. Keep the complete copy inside the reserved negative-space region with a visible gap from every person, hand, prop, and phone.

Show exactly one person: ${antiFraudPlan.model}, ${antiFraudPlan.wardrobe}, ${antiFraudPlan.environment}. Do not include a companion, background person, cropped person, or any limb entering from outside the frame. Preserve the acquisition posters' model scale, editorial crop, premium lighting, natural skin retouching, and clear model-to-copy balance. Use ${antiFraudPlan.camera}. The person should look alert, calm, and empowered. Render exactly two arms and two hands in the entire image. The phone hand and rejecting hand must belong to this one person, with both arms visibly and anatomically connected to that same person's shoulders and torso. The phone hand must present a smartphone at the same scale and visual prominence as the acquisition posters. Keep the phone on the inner side, nearer the copy-model intersection, and place the rejecting hand farther outward on the lower-right gesture side. Bend the rejecting arm naturally at the elbow and place the rejecting hand directly above and slightly left of the lower-right continuity zone. Angle that forearm diagonally down-right, away from the phone. Aim the motion vector from wrist through fingertips directly at the center of that zone, and tilt the open palm 25 to 40 degrees downward and slightly outward toward that center, with fingers naturally together, as if actively pushing an unseen threat down and out of the frame. The rejecting palm and fingers must never point inward toward the phone. Preserve a clear air gap between every fingertip, the wrist, and the lower-right continuity zone. Keep the model, both hands, and the complete phone above and to the left of that zone.

The smartphone must remain on the model side of the required 5%-wide copy-to-subject air gap rather than crowding the subtitle or sitting at the canvas edge. It must be upright, complete, perfectly front-on, unobstructed by fingers, free of glare, and large enough for its interface to read clearly. Use a clean white screen containing only a compact solid green shield silhouette with a crisp white checkmark above centered bold black text “${brandDomain}”. Reproduce this exact official domain with the full “.com” suffix; do not substitute, misspell, abbreviate, or show another brand. Keep the shield to about one-quarter of the visible screen height. The shield and domain together should occupy no more than half of the visible screen height with balanced spacing.

Across ${lowerRightContinuityZone}, the surrounding base background must flow continuously without any separate visual treatment. Its color, gradient, texture, depth, and lighting must be indistinguishable from the immediately adjacent background. Keep every person, phone, hand, prop, shelf edge, product label, and high-contrast detail outside this zone. Leave it visually empty and unbounded. Position its top edge directly beneath the rejecting hand within 2 to 4% of the canvas height, close enough that the gesture clearly pushes toward it without touching it. Keep the fingertips and wrist immediately above and slightly left of the zone, with their direction aimed at its center. This zone is ordinary surrounding background and must not appear as a separate designed element.

Use realistic Zambian lifestyle commercial photography, strong text hierarchy, expressive campaign typography, clear visual storytelling, and generous safe margins. Do not depict a scammer, completed payment, money rain, panic, intimidation, or instructions that could help commit fraud.

Negative prompt: Z over subject, Z over text, foreground Z, duplicate Z, extra Z, logo, watermark, brand wordmark, benefit copy, feature callout, badge, disclaimer, extra poster text, small typography, generic Arial-like typography, loose headline spacing, detached subtitle, multicolor subtitle, green subtitle word, red subtitle word, text over model, text over face, text over body, text over hands, text over phone, two people, multiple people, companion, background person, cropped person, extra person, third hand, extra arm, duplicate limb, disconnected arm, hands belonging to different people, arm entering from outside frame, upright stop-sign palm, vertical palm facing the camera, waving gesture, pointing finger, rejecting hand below the lower-right zone, hand entering or covering the lower-right zone, arm crossing the phone, rejecting palm aimed toward the phone, inward push gesture, hand gesture aimed away from the lower-right zone, phone at the canvas edge, phone in the lower-right zone, tiny phone, hidden phone screen, phone turned away, cropped phone, blank phone screen, missing domain, misspelled domain, wrong brand domain, missing .com suffix, outlined shield, oversized shield, excessive phone-screen whitespace, screen glare, full-page website screenshot, extra floating graphic, geometric foreground tile, discontinuous lower-right background, drop shadow, blurry, low quality, distorted anatomy, deformed hands, extra fingers, unreadable text, bad typography, duplicated elements, mixed brands.`,
      };
    }
    if (brand !== 'zamloan') {
      const phoneStatus = BIUMONEY_PHONE_STATUS_COPY[
        variationIndex % BIUMONEY_PHONE_STATUS_COPY.length
      ]!;
      return {
        logoAnchor,
        prompt: `Create a premium ${brandLabel} Zambia mobile-loan advertising poster in ${aspectRatio} as one unified composition, using the shared campaign-quality composition system.

Use a clean ${palette.gradient} dominant background with subtle abstract depth, one restrained ${palette.ribbon} curved ribbon along the bottom, and no letter Z, alphabetic background motif, or logo-shaped watermark. Render exactly two visible text elements on the poster canvas: “${plan.headline}” as a very large bold headline and “${plan.subline}” as a large supporting subtitle. Match the shared expressive heavy campaign typography, oversized scale, tight line spacing, and compact headline-to-subtitle gap. Do not render any other poster words, numbers, labels, badges, benefit text, brand names, or disclaimers. ${composition}. Show ${plan.model} ${plan.scene}, clearly presenting an anatomically correct smartphone at the same scale and visual prominence as the campaign baseline, with its screen facing the camera, fully visible, unobstructed by fingers, and large enough for the interface to read clearly. The phone screen is the only text exception: build a clean white success interface with a compact solid green circle containing a crisp white checkmark. The entire circle must occupy no more than about one-sixth of the visible screen height. Place it in the upper half of the phone screen, then leave a generous vertical gap of at least one full circle diameter before the centered short black status copy “${phoneStatus}” below it. Do not render any other phone-screen words, numbers, labels, controls, or icons.

Keep the complete headline and subtitle inside the reserved negative-space region. The text must never overlap the model’s face, hair, body, hands, clothing, or phone. Preserve the required copy-to-subject air gap: at least 5% of the canvas width of uninterrupted background between the widest copy pixel and the nearest model, hand, prop, or phone pixel. Use realistic Zambian lifestyle commercial photography, premium lighting, natural skin retouching, strong text hierarchy, expressive heavy campaign typography, and generous safe margins.

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
  const purpose = options.purpose && AUTO_POSTER_PURPOSES.includes(options.purpose)
    ? options.purpose
    : AUTO_POSTER_DEFAULT_PURPOSE;
  const brandLabel = autoPosterBrandLabel(brand);
  const brandDomain = autoPosterBrandDomain(brand);
  const aspectDescription = {
    '1:1': '1:1 square',
    '16:9': '16:9 landscape',
    '3:4': '3:4 portrait',
  }[aspectRatio];
  const outputPrefix = `${brand}-poster`;
  const isZamloan = brand === 'zamloan';
  const isBiuMoney = brand === 'biumoney';
  const bundledLogo = AUTO_POSTER_BRAND_CONFIG[brand].logo;
  const referenceContract = isZamloan
    ? `Use a single-pass full-poster composition. Render one low-opacity background Z inside the generated artwork and keep that background Z behind every subject and copy pixel. Do not attach the legacy Z reference and do not pass \`--overlay-z\`: a post-generation overlay would necessarily sit above the flattened model and typography.`
    : isBiuMoney
      ? `BiuMoney reference policy: Do not attach or use the Z reference. Do not render a letter Z, a background letter, or a replacement brand mark.`
      : `${brandLabel} reference policy: Do not attach or use the Z reference. Do not render a letter Z, a background letter, or a replacement brand mark.`;
  const logoContract = isZamloan
    ? purpose === 'anti-fraud'
      ? `The attached internal file \`${ZAMLOAN_LOGO_NAME}\` is the exact Zamloan logo. Locate its project-relative path and pass it through \`--overlay-logo\` with \`--overlay-logo-anchor left\` for every generation. The daemon will composite it in the reserved top-left logo-safe row after generation; do not redraw, typeset, or invent a replacement logo in the generated image.`
      : `The attached internal file \`${ZAMLOAN_LOGO_NAME}\` is the exact Zamloan logo. Locate its project-relative path and pass it through \`--overlay-logo\` for every generation. For 16:9 scenes, also pass \`--overlay-logo-anchor left|right\` matching the scene's title column. The daemon will composite it in the reserved logo-safe row with a unified soft backdrop after generation; do not redraw, typeset, or invent a replacement logo in the generated image.`
    : isBiuMoney
      ? 'BiuMoney logo policy: Do not attach, use, or render the Zamloan logo.'
      : purpose === 'anti-fraud'
        ? `The attached internal file \`${bundledLogo!.name}\` is the exact ${brandLabel} logo. Locate its project-relative path and pass it through \`--overlay-logo\` with \`--overlay-logo-anchor left\` for every generation. The daemon will composite it in the reserved top-left logo-safe row after generation; do not redraw, typeset, recolor, or invent a replacement logo in the generated image.`
        : `The attached internal file \`${bundledLogo!.name}\` is the exact ${brandLabel} logo. Locate its project-relative path and pass it through \`--overlay-logo\` for every generation. For 16:9 scenes, also pass \`--overlay-logo-anchor left|right\` matching the scene's title column. The daemon will composite it in the reserved logo-safe row after generation; do not redraw, typeset, recolor, or invent a replacement logo in the generated image.`;
  const acquisitionBrandOverride = isZamloan
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
- This ${isBiuMoney ? 'BiuMoney' : brandLabel} override takes precedence over conflicting skill template rules.`;
  const brandOverride = purpose === 'anti-fraud'
    ? isZamloan
      ? `- Use the same single-pass composition, oversized expressive typography, phone prominence, model scale, logo-safe region, and copy-safe geometry as the Zamloan acquisition posters.
- Keep the single background Z behind all foreground content and reserve the top-left logo-safe row or band for the supplied logo overlay.
- Render \`Prevent Fraud\` as the very large primary headline and \`Trust Only Official Customer Service\` as a supporting subtitle about 20% larger than the previous treatment. Reproduce both phrases exactly with tight line spacing and a compact gap between them. Use one solid deep-charcoal color for every subtitle word. Do not reduce either established font size.
- ${ZAMLOAN_ANTI_FRAUD_COPY_LAYOUTS[aspectRatio]}.
- Depict a calm Zambian customer presenting the official website on a large front-facing phone on the model side of the required copy-to-subject air gap. Keep the phone on the inner side and the rejecting hand farther outward on the lower-right gesture side. Bend the rejecting arm naturally at the elbow, place the rejecting hand above and slightly left of the lower-right continuity zone, angle the forearm diagonally down-right away from the phone, and aim the motion vector from wrist through fingertips directly at that zone's center. Tilt the open palm 25 to 40 degrees downward and slightly outward as if actively pushing an unseen threat down and out; never aim the rejecting palm toward the phone.
- Show exactly one person with exactly two arms and two hands. Both the phone hand and rejecting hand must belong to that person, and both arms must visibly connect to the same shoulders and torso. Do not include any companion, background person, cropped person, or out-of-frame limb.
- The phone-screen exception must contain only a compact solid green shield with a white checkmark above centered bold black text showing the exact official domain \`${brandDomain}\`. Preserve the full \`.com\` suffix and do not substitute, misspell, abbreviate, or mix in another brand. Keep the shield about one-quarter of the visible screen height and the complete group no more than half of the screen height.
- Keep the ratio-specific lower-right continuity zone free of every person, phone, hand, prop, text, and high-contrast detail. The surrounding base background must flow through it with indistinguishable color, gradient, texture, depth, and lighting. Describe only this positive background continuity and its coordinates inside the provider prompt.
- Generate the background, Z, model, phone, headline, and subtitle together in one image. The deterministic \`anti-fraud-message\` style is post-processing only; never describe, quote, or transfer its UI contents, shape, or visual vocabulary into the provider prompt, and do not use it to redraw the title, subtitle, or phone screen.
- Do not depict fraud instructions beyond the short warning example, cash transfer, panic, or intimidation.
- These Zamloan anti-fraud copy and scene rules take precedence over conflicting skill template rules.`
      : `- Use the same single-pass composition, oversized expressive typography, phone prominence, model scale, logo-safe region, and copy-safe geometry as the shared acquisition-poster baseline.
- Do not render a letter Z, background letter, alphabetic motif, or invented brand symbol. Preserve visual depth with restrained non-alphabetic tonal texture.
- ${bundledLogo ? `Reserve the top-left logo-safe row or band for the supplied exact ${brandLabel} logo overlay.` : 'Keep the top-left brand-safe row calm and empty; do not invent a logo.'}
- Render \`Prevent Fraud\` as the very large primary headline and \`Trust Only Official Customer Service\` as a supporting subtitle about 20% larger than the previous treatment. Reproduce both phrases exactly with tight line spacing and a compact gap between them. Use one solid deep-charcoal color for every subtitle word. Do not reduce either established font size.
- ${ZAMLOAN_ANTI_FRAUD_COPY_LAYOUTS[aspectRatio]}.
- Depict a calm Zambian customer presenting the official website on a large front-facing phone on the model side of the required copy-to-subject air gap. Keep the phone on the inner side and the rejecting hand farther outward on the lower-right gesture side. Bend the rejecting arm naturally at the elbow, place the rejecting hand above and slightly left of the lower-right continuity zone, angle the forearm diagonally down-right away from the phone, and aim the motion vector from wrist through fingertips directly at that zone's center. Tilt the open palm 25 to 40 degrees downward and slightly outward as if actively pushing an unseen threat down and out; never aim the rejecting palm toward the phone.
- Show exactly one person with exactly two arms and two hands. Both the phone hand and rejecting hand must belong to that person, and both arms must visibly connect to the same shoulders and torso. Do not include any companion, background person, cropped person, or out-of-frame limb.
- The phone-screen exception must contain only a compact solid green shield with a white checkmark above centered bold black text showing the exact official domain \`${brandDomain}\`. Preserve the full \`.com\` suffix and do not substitute, misspell, abbreviate, or mix in another brand. Keep the shield about one-quarter of the visible screen height and the complete group no more than half of the screen height.
- Keep the ratio-specific lower-right continuity zone free of every person, phone, hand, prop, text, and high-contrast detail. The surrounding base background must flow through it with indistinguishable color, gradient, texture, depth, and lighting. Describe only this positive background continuity and its coordinates inside the provider prompt.
- Generate the background, model, phone, headline, and subtitle together in one image. The deterministic \`anti-fraud-message\` style is post-processing only; never describe, quote, or transfer its UI contents, shape, or visual vocabulary into the provider prompt, and do not use it to redraw the title, subtitle, or phone screen.
- Do not depict fraud instructions beyond the short warning example, cash transfer, panic, or intimidation.
- These ${brandLabel} anti-fraud copy and scene rules take precedence over conflicting skill template rules.`
    : acquisitionBrandOverride;
  const generationReference = ', without an `--image` reference';
  const antiFraudLogoCommand = bundledLogo
    ? `, \`--overlay-logo\` with the ${brandLabel} logo path, and \`--overlay-logo-anchor left\``
    : '';
  const generationCommandExtras = purpose === 'anti-fraud'
    ? `${antiFraudLogoCommand}, \`--poster-headline "Prevent Fraud"\`, \`--poster-subtitle "Trust Only Official Customer Service"\`, \`--poster-text-anchor right\`, and \`--poster-copy-style anti-fraud-message\``
    : isZamloan
      ? `, and \`--overlay-logo\` with the Zamloan logo path${aspectRatio === '16:9' ? ', plus `--overlay-logo-anchor` matching the scene title column' : ''}`
      : bundledLogo
        ? `, and \`--overlay-logo\` with the ${brandLabel} logo path${aspectRatio === '16:9' ? ', plus `--overlay-logo-anchor` matching the scene title column' : ''}`
        : '';
  const generationFlagRestriction = purpose === 'anti-fraud'
    ? 'Do not pass `--overlay-z`, `--foreground-prompt-file`, or `--overlay-phone-screen`. Treat `anti-fraud-message` as deterministic post-processing and keep all of its UI semantics out of the full-poster provider prompt.'
    : 'Do not pass `--overlay-z`, `--foreground-prompt-file`, `--poster-headline`, `--poster-subtitle`, or `--poster-text-anchor`.';

  return `Generate exactly ${count} ${brandLabel} Zambia loan poster${count === 1 ? '' : 's'} now. Do not ask the user for a prompt, scene list, copy, or confirmation.

The active functional skill is \`${LOAN_POSTER_SKILL_ID}\`. Follow its workflow, template rules, libraries, and negative prompt as the source of truth for visual direction and scene construction.

Runtime inputs:
- brand: \`${brand}\` (${brandLabel}); use it for art direction and filenames, but do not mix in the other brand
- type: \`${purpose}\` (${autoPosterPurposeLabel(purpose)})
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
- Run \`"$OD_NODE_BIN" "$OD_BIN" media generate\` exactly once per scene with \`--surface image\`, \`--aspect ${aspectRatio}\`, the resolved full-poster prompt${generationReference}${generationCommandExtras}. ${generationFlagRestriction}
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
  const logo = await loadAutoPosterLogo('zamloan');
  if (!logo) throw new Error('Unable to load Zamloan logo: asset is not configured');
  return logo;
}

export async function loadAutoPosterLogo(brand: AutoPosterBrand): Promise<File | null> {
  const config = AUTO_POSTER_BRAND_CONFIG[brand];
  if (!config.logo) return null;
  return loadBundledPosterAsset({
    url: config.logo.url,
    name: config.logo.name,
    fallbackType: 'image/svg+xml',
    label: `${config.label} logo`,
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
