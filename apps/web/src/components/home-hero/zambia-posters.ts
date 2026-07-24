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

export interface AutoPosterOptions {
  count: number;
  aspectRatio: AutoPosterAspectRatio;
  brand: AutoPosterBrand;
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

  return `Generate exactly ${count} ${brandLabel} Zambia loan poster${count === 1 ? '' : 's'} now. Do not ask the user for a prompt, scene list, copy, or confirmation.

The active functional skill is \`${LOAN_POSTER_SKILL_ID}\`. Follow its workflow, template rules, libraries, and negative prompt as the source of truth for visual direction and scene construction.

Runtime inputs:
- brand: \`${brand}\` (${brandLabel}); use it for art direction and filenames, but do not mix in the other brand
- format: \`${aspectRatio}\` (${aspectDescription})
- quantity: \`${count}\`
- output prefix: \`${outputPrefix}\`

The attached file \`${ZAMBIA_POSTER_REFERENCE_NAME}\` is an internal Z reference. Locate its project-relative path and pass it through \`--image\` for every generation. Never copy the Z reference into a visible output path or list it as a deliverable.

Resolve exactly ${count} distinct internal scene plan${count === 1 ? '' : 's'} using the active skill, then render one poster per plan. Do not expose planning files as deliverables.

Visible-brand override:
- Do not render \`${brandLabel}\`, another brand-name wordmark, or a replacement logo in the top-left corner.
- The single semi-transparent background Z defined by the skill is the only permitted brand mark.

Generation contract:
- Use the image model selected in the project metadata.
- Run \`"$OD_NODE_BIN" "$OD_BIN" media generate\` exactly once per scene with \`--surface image\`, \`--aspect ${aspectRatio}\`, the resolved full prompt, and the Z reference via \`--image\`.
- Write outputs as \`${outputPrefix}-01.png\` through \`${outputPrefix}-${String(count).padStart(2, '0')}.png\`.
- Complete all ${count} generation attempts. If one fails, continue with the remaining scenes and report the failed item accurately.
- Remove the internal Z reference after all image generation attempts finish.
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
  const response = await fetch(ZAMBIA_POSTER_REFERENCE_URL, { cache: 'force-cache' });
  if (!response.ok) {
    throw new Error(`Unable to load Zambia Z reference (${response.status})`);
  }
  const blob = await response.blob();
  return new File([blob], ZAMBIA_POSTER_REFERENCE_NAME, {
    type: blob.type || 'image/png',
  });
}
