import { describe, expect, it, vi } from 'vitest';

import {
  autoPosterUsesZReference,
  buildLoanPosterPrompt,
  buildLoanPosterScenePlans,
  buildLoanPosterScenePrompts,
  buildZambiaPosterPrompt,
  isLoanPosterGenerationPrompt,
  isLoanPosterOutputName,
  LOAN_POSTER_SKILL_ID,
  AUTO_POSTER_ASPECT_RATIOS,
  loadZamloanLogo,
  loadZambiaPosterReference,
  normalizeZambiaPosterCount,
  ZAMBIA_POSTER_REFERENCE_NAME,
  ZAMBIA_POSTER_REFERENCE_URL,
} from '../../../src/components/home-hero/zambia-posters';

describe('Zambia poster preset', () => {
  it('offers portrait 3:4 posters alongside square and landscape formats', () => {
    expect(AUTO_POSTER_ASPECT_RATIOS).toEqual(['1:1', '16:9', '3:4']);
  });

  it('clamps the requested poster count to 1 through 10', () => {
    expect(normalizeZambiaPosterCount(-3)).toBe(1);
    expect(normalizeZambiaPosterCount(4.6)).toBe(5);
    expect(normalizeZambiaPosterCount(99)).toBe(10);
    expect(normalizeZambiaPosterCount(Number.NaN)).toBe(1);
  });

  it('builds a thin square Zamloan runtime prompt with the selected inputs', () => {
    const prompt = buildLoanPosterPrompt({
      count: 3,
      aspectRatio: '1:1',
      brand: 'zamloan',
    });

    expect(prompt).toContain('Generate exactly 3 Zamloan Zambia loan posters now.');
    expect(prompt).toContain(`active functional skill is \`${LOAN_POSTER_SKILL_ID}\``);
    expect(prompt).toContain('quantity: `3`');
    expect(prompt).toContain('exactly 3 distinct internal scene plans');
    expect(prompt).toContain('1:1 square');
    expect(prompt).toContain('--aspect 1:1');
    expect(prompt).toContain('single semi-transparent background Z');
    expect(prompt).toContain(
      'background → exact supplied Z → transparent model → deterministic copy → exact logo',
    );
    expect(prompt).toContain('--overlay-z');
    expect(prompt).not.toContain('Z reference via `--image`');
    expect(prompt).toContain('--foreground-prompt-file');
    expect(prompt).toContain('--poster-headline');
    expect(prompt).toContain('--poster-subtitle');
    expect(prompt).toContain('--poster-text-anchor');
    expect(prompt).toContain('phone-screen exception');
    expect(prompt).toContain('must never overlap the model');
    expect(prompt).toContain('zamloan-poster-03.png');
    expect(prompt).toContain(`\`${ZAMBIA_POSTER_REFERENCE_NAME}\``);
    expect(prompt).toContain('Complete all 3 generation attempts.');
    expect(prompt).toContain('Never copy the Z reference into a visible output path');
    expect(prompt).toContain('Remove the internal Z reference');
    expect(prompt).toContain('Do not create `critique.json`');
    expect(prompt).toContain('Only the requested poster PNG files');
    expect(prompt).toContain('Do not render `Zamloan`');
    expect(prompt).not.toContain('Fixed rules:');
    expect(prompt).not.toContain('[SCENE_NAME]');
  });

  it('describes portrait output and the deterministic Zamloan logo overlay', () => {
    const prompt = buildLoanPosterPrompt({
      count: 1,
      aspectRatio: '3:4',
      brand: 'zamloan',
    });

    expect(prompt).toContain('3:4 portrait');
    expect(prompt).toContain('--aspect 3:4');
    expect(prompt).toContain('--overlay-logo');
    expect(prompt).toContain('zamloan-logo.svg');
  });

  it('builds a landscape BiuMoney prompt without mixing brands', () => {
    const prompt = buildLoanPosterPrompt({
      count: 2,
      aspectRatio: '16:9',
      brand: 'biumoney',
    });

    expect(prompt).toContain('2 BiuMoney Zambia loan posters');
    expect(prompt).toContain('brand: `biumoney` (BiuMoney)');
    expect(prompt).toContain('16:9 landscape');
    expect(prompt).toContain('--aspect 16:9');
    expect(prompt).toContain('biumoney-poster-02.png');
    expect(prompt).toContain('do not mix in the other brand');
    expect(prompt).toContain('Do not render `BiuMoney`');
    expect(prompt).toContain('Do not attach or use the Z reference');
    expect(prompt).toContain('exactly two visible text elements');
    expect(prompt).toContain('must never overlap the model');
    expect(prompt).not.toContain('The single semi-transparent background Z');
  });

  it('keeps the legacy Zambia builder on the Zamloan 16:9 default', () => {
    const prompt = buildZambiaPosterPrompt(1);

    expect(prompt).toContain('1 Zamloan Zambia loan poster');
    expect(prompt).toContain('16:9 landscape');
  });

  it('recognizes generated execution prompts without matching ordinary chat', () => {
    const prompt = buildLoanPosterPrompt({
      count: 1,
      aspectRatio: '16:9',
      brand: 'zamloan',
    });

    expect(isLoanPosterGenerationPrompt(prompt)).toBe(true);
    expect(isLoanPosterGenerationPrompt(
      prompt.replace(LOAN_POSTER_SKILL_ID, 'loan-poster-skill-v1.1'),
    )).toBe(true);
    expect(isLoanPosterGenerationPrompt('Design a Zamloan poster for me.')).toBe(false);
  });

  it('recognizes legacy and date-scoped numbered poster outputs', () => {
    expect(isLoanPosterOutputName('zamloan-poster-01.png')).toBe(true);
    expect(isLoanPosterOutputName('zamloan-poster-20260728-001.png')).toBe(true);
    expect(isLoanPosterOutputName('poster.png')).toBe(false);
  });

  it('builds ready-to-dispatch layered scene plans without an agent planning turn', () => {
    const plans = buildLoanPosterScenePlans({
      count: 2,
      aspectRatio: '16:9',
      brand: 'zamloan',
    });

    expect(plans).toHaveLength(2);
    expect(plans.map((plan) => plan.headline)).toEqual([
      'Get Cash In 1 Hour',
      'Support Your Family Today',
    ]);
    expect(plans.every((plan) => plan.foregroundPrompt?.includes(
      'Application Successful',
    ))).toBe(true);
    expect(plans.every((plan) => plan.prompt.includes('Negative prompt:'))).toBe(true);
  });

  it('pairs every 16:9 Zamloan scene with a deterministic title-column logo anchor', () => {
    const plans = buildLoanPosterScenePlans({
      count: 2,
      aspectRatio: '16:9',
      brand: 'zamloan',
      variationOffset: 0,
    });

    expect(plans.map((plan) => plan.logoAnchor)).toEqual(['left', 'right']);
    expect(plans[0]?.prompt).toContain('left 45% visually calm');
    expect(plans[1]?.prompt).toContain('right 47% visually calm');
    expect(plans.every((plan) => plan.prompt.includes('logo-safe row'))).toBe(true);
    expect(plans.every((plan) => plan.foregroundPrompt?.includes(
      'transparent background',
    ))).toBe(true);
    expect(plans.map((plan) => plan.textAnchor)).toEqual(['left', 'right']);
    expect(plans[0]).toMatchObject({
      headline: 'Get Cash In 1 Hour',
      subtitle: 'Fast approval through your phone',
    });
    expect(plans[0]?.prompt).toContain('Do not render people');
    expect(plans[0]?.prompt).toContain('Do not render text');
  });

  it.each(['3:4', '1:1'] as const)(
    'reserves a deterministic left logo-safe band for %s Zamloan posters',
    (aspectRatio) => {
      const plans = buildLoanPosterScenePlans({
        count: 3,
        aspectRatio,
        brand: 'zamloan',
        variationOffset: 0,
      });

      expect(plans.map((plan) => plan.logoAnchor)).toEqual(['left', 'left', 'left']);
      expect(plans.every((plan) => plan.prompt.includes(
        'left 48%',
      ))).toBe(true);
      expect(plans.every((plan) => plan.prompt.includes(
        'top 18% reserved as a logo-safe band',
      ))).toBe(true);
      expect(plans.every((plan) => plan.textAnchor === 'left')).toBe(true);
    },
  );

  it('keeps Zamloan copy minimal while retaining the phone success UI', () => {
    const [plan] = buildLoanPosterScenePlans({
      count: 1,
      aspectRatio: '16:9',
      brand: 'zamloan',
    });

    expect(plan?.prompt).toContain('Do not draw any letter Z');
    expect(plan?.prompt).toContain('exact supplied Z will be composited');
    expect(plan?.prompt).toContain('Do not render people');
    expect(plan?.prompt).toContain('Do not render text');
    expect(plan?.foregroundPrompt).toContain('transparent background PNG');
    expect(plan?.foregroundPrompt).toContain('solid green checkmark');
    expect(plan?.foregroundPrompt).toContain('Application Successful');
    expect(plan).toMatchObject({
      headline: 'Get Cash In 1 Hour',
      subtitle: 'Fast approval through your phone',
    });
    expect(plan?.foregroundPrompt).not.toContain('Apply 100% via mobile');
  });

  it('keeps BiuMoney scenes Z-free with only large model-safe title copy', () => {
    const [prompt] = buildLoanPosterScenePrompts({
      count: 1,
      aspectRatio: '16:9',
      brand: 'biumoney',
    });

    expect(prompt).toContain('no letter Z');
    expect(prompt).toContain('exactly two visible text elements');
    expect(prompt).toContain('very large');
    expect(prompt).toContain('never overlap');
    expect(prompt).not.toContain('benefit callouts');
    expect(prompt).not.toContain('Application Successful');
    expect(autoPosterUsesZReference('biumoney')).toBe(false);
    expect(autoPosterUsesZReference('zamloan')).toBe(true);
  });

  it('rotates every creative dimension instead of restarting at scene one', () => {
    const firstBatch = buildLoanPosterScenePlans({
      count: 1,
      aspectRatio: '16:9',
      brand: 'zamloan',
      variationOffset: 0,
    });
    const secondBatch = buildLoanPosterScenePlans({
      count: 1,
      aspectRatio: '16:9',
      brand: 'zamloan',
      variationOffset: 1,
    });

    expect(firstBatch[0]?.headline).toBe('Get Cash In 1 Hour');
    expect(secondBatch[0]?.headline).toBe('Support Your Family Today');
    expect(secondBatch[0]?.prompt).not.toBe(firstBatch[0]?.prompt);
  });

  it('produces ten distinct prompts in one maximum-size batch', () => {
    const prompts = buildLoanPosterScenePrompts({
      count: 10,
      aspectRatio: '1:1',
      brand: 'biumoney',
      variationSeed: 'project-variation-seed',
    });

    expect(prompts).toHaveLength(10);
    expect(new Set(prompts).size).toBe(10);
  });

  it('uses a stable project seed so separate projects start differently', () => {
    const buildForProject = (variationSeed: string) => buildLoanPosterScenePrompts({
      count: 1,
      aspectRatio: '16:9',
      brand: 'zamloan',
      variationSeed,
    })[0];

    expect(buildForProject('project-1')).toBe(buildForProject('project-1'));
    expect(buildForProject('project-1')).not.toBe(buildForProject('project-2'));
  });

  it('loads the bundled Z reference as an internal project attachment', async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => new Response(
      new Blob(['z-reference'], { type: 'image/png' }),
      { status: 200 },
    ));
    vi.stubGlobal('fetch', fetchMock);

    const file = await loadZambiaPosterReference();

    expect(fetchMock).toHaveBeenCalledWith(ZAMBIA_POSTER_REFERENCE_URL, { cache: 'force-cache' });
    expect(file.name).toBe(ZAMBIA_POSTER_REFERENCE_NAME);
    expect(file.type).toBe('image/png');
  });

  it('loads the scalable Zamloan logo as an internal project attachment', async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => new Response(
      new Blob(['<svg/>'], { type: 'image/svg+xml' }),
      {
        status: 200,
        headers: { 'content-type': 'image/svg+xml' },
      },
    ));
    vi.stubGlobal('fetch', fetchMock);

    const file = await loadZamloanLogo();

    expect(fetchMock).toHaveBeenCalledWith(
      '/brand/zambia-support/zamloan-logo.svg',
      { cache: 'force-cache' },
    );
    expect(file.name).toBe('zamloan-logo.svg');
    expect(file.type).toBe('image/svg+xml');
  });
});
