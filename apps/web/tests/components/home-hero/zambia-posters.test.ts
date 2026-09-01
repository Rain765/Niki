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
    expect(prompt).toContain('single-pass full-poster composition');
    expect(prompt).toContain('background Z behind every subject and copy pixel');
    expect(prompt).toContain('Do not pass `--overlay-z`');
    expect(prompt).toContain(
      'Do not pass `--overlay-z`, `--foreground-prompt-file`, `--poster-headline`',
    );
    expect(prompt).toContain('phone-screen exception');
    expect(prompt).toContain('must never overlap the model');
    expect(prompt).toContain('zamloan-poster-03.png');
    expect(prompt).toContain('Complete all 3 generation attempts.');
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

  it('keeps Zamloan anti-fraud execution on the acquisition single-pass contract', () => {
    const prompt = buildLoanPosterPrompt({
      count: 1,
      aspectRatio: '3:4',
      brand: 'zamloan',
      purpose: 'anti-fraud',
    });

    expect(prompt).toContain('same single-pass composition');
    expect(prompt).toContain('oversized expressive typography');
    expect(prompt).toContain('`Prevent Fraud`');
    expect(prompt).toContain('`Trust Only Official Customer Service`');
    expect(prompt).toContain('`zamloan.com`');
    expect(prompt).toContain('`Unknown Sender`');
    expect(prompt).toContain('one solid deep-charcoal color');
    expect(prompt).toContain('reserved right-side area directly beneath the stop hand');
    expect(prompt).toContain('forearm diagonally down-right');
    expect(prompt).toContain('pushing the suspicious message down and out');
    expect(prompt).toContain('`--overlay-logo-anchor left`');
    expect(prompt).toContain('`--poster-text-anchor right`');
    expect(prompt).toContain('`--poster-copy-style anti-fraud-message`');
    expect(prompt).toContain('must render only the exact notification');
    expect(prompt).toContain('Do not pass `--overlay-z`, `--foreground-prompt-file`');
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
    expect(prompt).toContain('phone-screen exception');
    expect(prompt).toContain('compact solid green circle');
    expect(prompt).toContain('white checkmark');
    expect(prompt).toContain('one full circle diameter');
    expect(prompt).toContain('scene-specific short status copy');
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

  it('builds ready-to-dispatch single-pass scene plans without an agent planning turn', () => {
    const plans = buildLoanPosterScenePlans({
      count: 2,
      aspectRatio: '16:9',
      brand: 'zamloan',
    });

    expect(plans).toHaveLength(2);
    expect(plans.every((plan) => plan.foregroundPrompt === undefined)).toBe(true);
    expect(plans.every((plan) => plan.headline === undefined)).toBe(true);
    expect(plans.every((plan) => plan.prompt.includes('Application Successful'))).toBe(true);
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
    expect(plans[0]?.prompt).toContain('left text column');
    expect(plans[1]?.prompt).toContain('right text column');
    expect(plans.every((plan) => plan.prompt.includes('logo-safe row'))).toBe(true);
    expect(plans.every((plan) => plan.textAnchor === undefined)).toBe(true);
    expect(plans[0]?.prompt).toContain('Get Cash In 1 Hour');
    expect(plans[0]?.prompt).toContain('Fast approval through your phone');
    expect(plans[0]?.prompt).toContain('young Zambian man');
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
        'logo-safe band',
      ))).toBe(true);
      expect(plans.every((plan) => plan.textAnchor === undefined)).toBe(true);
    },
  );

  it('keeps Zamloan copy minimal while retaining the phone success UI', () => {
    const [plan] = buildLoanPosterScenePlans({
      count: 1,
      aspectRatio: '16:9',
      brand: 'zamloan',
    });

    expect(plan?.prompt).toContain('one large low-opacity Z silhouette');
    expect(plan?.prompt).toContain('behind every model, phone, headline, and subtitle pixel');
    expect(plan?.prompt).toContain('solid green checkmark');
    expect(plan?.prompt).toContain('Application Successful');
    expect(plan?.prompt).toContain('Get Cash In 1 Hour');
    expect(plan?.prompt).toContain('Fast approval through your phone');
    expect(plan?.foregroundPrompt).toBeUndefined();
  });

  it('keeps BiuMoney scenes Z-free while clearly showing the phone success UI', () => {
    const prompts = buildLoanPosterScenePrompts({
      count: 6,
      aspectRatio: '16:9',
      brand: 'biumoney',
    });

    expect(prompts).toHaveLength(6);
    expect(prompts.every((prompt) => prompt.includes('no letter Z'))).toBe(true);
    expect(prompts.every((prompt) => prompt.includes(
      'exactly two visible text elements',
    ))).toBe(true);
    expect(prompts.every((prompt) => prompt.includes('very large'))).toBe(true);
    expect(prompts.every((prompt) => prompt.includes(
      'screen facing the camera',
    ))).toBe(true);
    expect(prompts.every((prompt) => prompt.includes(
      'compact solid green circle',
    ))).toBe(true);
    expect(prompts.every((prompt) => prompt.includes('white checkmark'))).toBe(true);
    expect(prompts.every((prompt) => prompt.includes(
      'no more than about one-sixth of the visible screen height',
    ))).toBe(true);
    expect(prompts.every((prompt) => prompt.includes(
      'at least one full circle diameter',
    ))).toBe(true);
    expect(prompts.every((prompt) => prompt.includes('never overlap'))).toBe(true);
    expect(prompts.every((prompt) => !prompt.includes('benefit callouts'))).toBe(true);
    expect(prompts.every((prompt) => !prompt.includes(
      'one solid green checkmark',
    ))).toBe(true);
    expect(prompts.map((prompt) => [
      'Application Approved',
      'Approval Confirmed',
      'Request Approved',
      'Loan Approved',
      'Application Successful',
      'Funds Ready',
    ].find((status) => prompt.includes(`“${status}”`)))).toEqual([
      'Application Approved',
      'Approval Confirmed',
      'Request Approved',
      'Loan Approved',
      'Application Successful',
      'Funds Ready',
    ]);
    expect(autoPosterUsesZReference('biumoney')).toBe(false);
    expect(autoPosterUsesZReference('zamloan')).toBe(false);
  });

  it('builds Zamloan anti-fraud scenes with the acquisition poster composition system', () => {
    const plans = buildLoanPosterScenePlans({
      count: 4,
      aspectRatio: '3:4',
      brand: 'zamloan',
      purpose: 'anti-fraud',
      variationOffset: 0,
    });
    const prompts = plans.map((plan) => plan.prompt);

    expect(prompts).toHaveLength(4);
    expect(new Set(prompts).size).toBe(4);
    expect(plans.every((plan) => plan.logoAnchor === 'left')).toBe(true);
    expect(plans.every((plan) => plan.headline === 'Prevent Fraud')).toBe(true);
    expect(plans.every((plan) => (
      plan.subtitle === 'Trust Only Official Customer Service'
    ))).toBe(true);
    expect(plans.every((plan) => plan.textAnchor === 'right')).toBe(true);
    expect(prompts.every((prompt) => prompt.includes('as one unified composition'))).toBe(true);
    expect(prompts.every((prompt) => prompt.includes('logo-safe band'))).toBe(true);
    expect(prompts.every((prompt) => prompt.includes('top-left logo-safe row'))).toBe(true);
    expect(prompts.every((prompt) => prompt.includes('very large bold primary headline'))).toBe(true);
    expect(prompts.every((prompt) => prompt.includes('about 20% larger'))).toBe(true);
    expect(prompts.every((prompt) => prompt.includes('one solid deep-charcoal color'))).toBe(true);
    expect(prompts.every((prompt) => prompt.includes('do not color any subtitle word'))).toBe(true);
    expect(prompts.every((prompt) => prompt.includes('Prevent Fraud'))).toBe(true);
    expect(prompts.every((prompt) => (
      prompt.includes('Trust Only Official Customer Service')
    ))).toBe(true);
    expect(prompts.every((prompt) => prompt.includes('same scale and visual prominence'))).toBe(true);
    expect(prompts.every((prompt) => prompt.includes('visual intersection'))).toBe(true);
    expect(prompts.every((prompt) => prompt.includes('compact solid green shield'))).toBe(true);
    expect(prompts.every((prompt) => prompt.includes('about one-quarter'))).toBe(true);
    expect(prompts.every((prompt) => prompt.includes('smaller than the phone screen'))).toBe(true);
    expect(prompts.every((prompt) => (
      prompt.includes('directly beneath the stop hand within 2 to 4% of the canvas height')
    ))).toBe(true);
    expect(prompts.every((prompt) => (
      prompt.includes('rejecting hand directly above and slightly left')
    ))).toBe(true);
    expect(prompts.every((prompt) => prompt.includes('forearm diagonally down-right'))).toBe(true);
    expect(prompts.every((prompt) => prompt.includes('away from the phone'))).toBe(true);
    expect(prompts.every((prompt) => (
      prompt.includes('motion vector from wrist through fingertips directly at the center')
    ))).toBe(true);
    expect(prompts.every((prompt) => (
      prompt.includes('must never point inward toward the phone')
    ))).toBe(true);
    expect(prompts.every((prompt) => prompt.includes('palm 25 to 40 degrees downward'))).toBe(true);
    expect(prompts.every((prompt) => (
      prompt.includes('pushing the suspicious message down and out')
    ))).toBe(true);
    expect(prompts.every((prompt) => prompt.includes('clear air gap'))).toBe(true);
    expect(prompts.every((prompt) => prompt.includes('upright stop-sign palm'))).toBe(true);
    expect(prompts.every((prompt) => prompt.includes('rejecting palm aimed toward the phone'))).toBe(true);
    expect(prompts.every((prompt) => (
      !prompt.includes('open palm extended toward the camera in a firm stop gesture')
    ))).toBe(true);
    expect(prompts.every((prompt) => prompt.includes('“zamloan.com”'))).toBe(true);
    expect(prompts.every((prompt) => prompt.includes('no more than half'))).toBe(true);
    expect(prompts.every((prompt) => (
      prompt.includes('rightmost 27% of the vertical band from 72% to 90%')
    ))).toBe(true);
    expect(prompts.every((prompt) => prompt.includes('notification-safe area'))).toBe(true);
    expect(prompts.every((prompt) => prompt.includes('composited into that reserved region'))).toBe(true);
    expect(prompts.every((prompt) => !prompt.includes('“Unknown Sender”'))).toBe(true);
    expect(prompts.every((prompt) => !prompt.includes('Pay a processing fee now.'))).toBe(true);
    expect(prompts.every((prompt) => !prompt.includes('solid saturated magenta'))).toBe(true);
    expect(prompts.every((prompt) => !prompt.includes('Application Successful'))).toBe(true);
  });

  it('keeps BiuMoney anti-fraud scenes on their existing deterministic copy path', () => {
    const plans = buildLoanPosterScenePlans({
      count: 4,
      aspectRatio: '3:4',
      brand: 'biumoney',
      purpose: 'anti-fraud',
      variationOffset: 0,
    });
    const prompts = plans.map((plan) => plan.prompt);

    expect(plans.every((plan) => plan.headline === 'Prevent Fraud')).toBe(true);
    expect(plans.every((plan) => (
      plan.subtitle === 'Trust Only Official Customer Service'
    ))).toBe(true);
    expect(plans.every((plan) => plan.textAnchor === 'left')).toBe(true);
    expect(prompts.every((prompt) => !prompt.includes('Prevent Fraud'))).toBe(true);
    expect(prompts.every((prompt) => prompt.includes('Do not render any visible text'))).toBe(true);
    expect(prompts.every((prompt) => prompt.includes('compact light-gray isometric notification'))).toBe(true);
    expect(prompts.every((prompt) => prompt.includes('Do not generate floating'))).toBe(true);
    expect(prompts.every((prompt) => !prompt.includes('Application Successful'))).toBe(true);
  });

  it.each([
    ['1:1', 'rightmost 29% of the vertical band from 69% to 94%'],
    ['16:9', 'rightmost 22% of the vertical band from 66% to 94%'],
  ] as const)(
    'keeps the %s anti-fraud logo left and reserves its ratio-specific message area',
    (aspectRatio, safeArea) => {
      const [plan] = buildLoanPosterScenePlans({
        count: 1,
        aspectRatio,
        brand: 'zamloan',
        purpose: 'anti-fraud',
        variationOffset: 1,
      });

      expect(plan?.logoAnchor).toBe('left');
      expect(plan?.textAnchor).toBe('right');
      expect(plan?.prompt).toContain(safeArea);
      expect(plan?.prompt).toContain('one solid deep-charcoal color');
    },
  );

  it('rotates ten stable color templates without defaulting every scene to green', () => {
    const prompts = buildLoanPosterScenePlans({
      count: 10,
      aspectRatio: '3:4',
      brand: 'zamloan',
      purpose: 'anti-fraud',
      variationOffset: 0,
    }).map((plan) => plan.prompt);

    expect(prompts).toHaveLength(10);
    expect(prompts[0]).toContain('warm ivory (#f7ecd9)');
    expect(prompts[0]).toContain('deep forest green (#153f2e)');
    expect(prompts[1]).toContain('mist blue-gray (#e5edf3)');
    expect(prompts[1]).toContain('deep cobalt blue (#174a82)');
    expect(prompts[2]).toContain('warm sand (#f1dfc3)');
    expect(prompts[2]).toContain('rich burgundy (#6f2937)');
    expect(prompts[3]).toContain('pale peach (#f7dfd2)');
    expect(prompts[3]).toContain('deep navy blue (#173554)');
    expect(prompts[4]).toContain('pale lavender (#ece5f2)');
    expect(prompts[4]).toContain('charcoal plum (#49374f)');
    expect(prompts[5]).toContain('soft silver-gray');
    expect(prompts[5]).toContain('saturated royal purple');
    expect(prompts[6]).toContain('warm cream');
    expect(prompts[6]).toContain('burnished terracotta');
    expect(prompts[7]).toContain('pale sky blue');
    expect(prompts[7]).toContain('midnight indigo');
    expect(prompts[8]).toContain('soft rose');
    expect(prompts[8]).toContain('charcoal blue');
    expect(prompts[9]).toContain('soft mint (#e2f1e8)');
    expect(prompts[9]).toContain('deep teal (#0c514e)');
    expect(prompts.every((prompt) => (
      prompt.includes('The selected palette is mandatory and must dominate the background')
    ))).toBe(true);
    expect(prompts.slice(1, 9).every((prompt) => (
      prompt.includes('Do not replace the selected scene color with Zamloan green')
    ))).toBe(true);
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

    expect(firstBatch[0]?.prompt).toContain('Get Cash In 1 Hour');
    expect(secondBatch[0]?.prompt).toContain('Support Your Family Today');
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

    expect(fetchMock).toHaveBeenCalledWith(ZAMBIA_POSTER_REFERENCE_URL, {
      cache: 'force-cache',
      signal: expect.any(AbortSignal),
    });
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
      {
        cache: 'force-cache',
        signal: expect.any(AbortSignal),
      },
    );
    expect(file.name).toBe('zamloan-logo.svg');
    expect(file.type).toBe('image/svg+xml');
  });
});
