import { createHash } from 'node:crypto';

import { describe, expect, it, vi } from 'vitest';
import { ANTI_FRAUD_OPEN_PALM_RULE } from '@open-design/contracts';

import {
  AUTO_POSTER_BRANDS,
  autoPosterBrandColors,
  autoPosterBrandDomain,
  autoPosterUsesZReference,
  autoPosterBrandLabel,
  buildLoanPosterPrompt,
  buildLoanPosterScenePlans,
  buildLoanPosterScenePrompts,
  buildZambiaPosterPrompt,
  isLoanPosterGenerationPrompt,
  isLoanPosterOutputName,
  LOAN_POSTER_SKILL_ID,
  AUTO_POSTER_ASPECT_RATIOS,
  loadAutoPosterLogo,
  loadZamloanLogo,
  loadZambiaPosterReference,
  normalizeZambiaPosterCount,
  ZAMBIA_POSTER_REFERENCE_NAME,
  ZAMBIA_POSTER_REFERENCE_URL,
} from '../../../src/components/home-hero/zambia-posters';

describe('Zambia poster preset', () => {
  it('shares the open-palm pose across brands, ratios and both generation entry points without changing acquisition', () => {
    for (const brand of AUTO_POSTER_BRANDS) {
      for (const aspectRatio of AUTO_POSTER_ASPECT_RATIOS) {
        const options = { brand, aspectRatio, purpose: 'anti-fraud' as const, count: 4 };
        for (const prompt of [buildLoanPosterPrompt(options), ...buildLoanPosterScenePrompts(options)]) {
          expect(prompt).toContain(ANTI_FRAUD_OPEN_PALM_RULE);
          expect(prompt).not.toContain('Turn the palm sideways');
          expect(prompt).not.toContain('vertical palm facing the camera');
          expect(prompt).not.toContain('upright stop-sign palm');
        }
        for (const prompt of [buildLoanPosterPrompt({ ...options, purpose: 'acquisition' }),
          ...buildLoanPosterScenePrompts({ ...options, purpose: 'acquisition' })]) {
          expect(prompt).not.toContain(ANTI_FRAUD_OPEN_PALM_RULE);
        }
      }
    }
  });
  it('locks anti-fraud phone shields to emerald across brands, ratios, palettes and both prompt paths', () => {
    for (const brand of AUTO_POSTER_BRANDS) {
      for (const aspectRatio of AUTO_POSTER_ASPECT_RATIOS) {
        const options = { brand, aspectRatio, purpose: 'anti-fraud' as const, count: 10 };
        const prompts = [buildLoanPosterPrompt(options), ...buildLoanPosterScenePrompts(options)];
        for (const prompt of prompts) {
          expect(prompt).toContain('fixed emerald green (#00C853)');
          expect(prompt).toContain('independent of the brand, background, scene palette and lighting');
          expect(prompt).not.toContain('reserve brand colors for the supplied logo and the compact green phone shield');
        }
        const acquisition = buildLoanPosterScenePrompts({ ...options, purpose: 'acquisition' });
        expect(acquisition.every((prompt) => !prompt.includes('fixed emerald green (#00C853)'))).toBe(true);
      }
    }
  });

  const additionalBrands = [
    { brand: 'zamcash' as const, label: 'ZamCash', logo: 'zamcash-logo.svg', domain: 'zamcash.com' },
    { brand: 'zammoney' as const, label: 'ZamMoney', logo: 'zammoney-logo.svg', domain: 'zammoney.com' },
    { brand: 'fastako' as const, label: 'Fastako', logo: 'fastako-logo.svg', domain: 'fastako.com' },
    { brand: 'yangaloan' as const, label: 'Yangaloan', logo: 'yangaloan-logo.svg', domain: 'yangaloan.com' },
  ];

  const brandDomains = [
    { brand: 'zamloan' as const, domain: 'zamloan.com' },
    { brand: 'biumoney' as const, domain: 'biumoney.com' },
    ...additionalBrands.map(({ brand, domain }) => ({ brand, domain })),
  ];

  it('offers portrait 3:4 posters alongside square and landscape formats', () => {
    expect(AUTO_POSTER_ASPECT_RATIOS).toEqual(['1:1', '16:9', '3:4']);
  });

  it('appends four brands without changing the existing product options', () => {
    expect(AUTO_POSTER_BRANDS).toEqual([
      'zamloan',
      'biumoney',
      'zamcash',
      'zammoney',
      'fastako',
      'yangaloan',
    ]);
    expect(additionalBrands.map(({ brand }) => autoPosterBrandLabel(brand))).toEqual([
      'ZamCash',
      'ZamMoney',
      'Fastako',
      'Yangaloan',
    ]);
  });

  it.each(brandDomains)(
    'maps $brand to the exact official domain $domain',
    ({ brand, domain }) => {
      expect(autoPosterBrandDomain(brand)).toBe(domain);
    },
  );

  it('exposes only the non-neutral colors found in each bundled brand logo', () => {
    expect(autoPosterBrandColors('zamloan')).toEqual(['#46A93C', '#D35430']);
    expect(autoPosterBrandColors('biumoney')).toEqual([]);
    expect(autoPosterBrandColors('zamcash')).toEqual(['#43AA3E', '#D45330', '#DC5130']);
    expect(autoPosterBrandColors('zammoney')).toEqual(['#0AB81C', '#0B1D0B']);
    expect(autoPosterBrandColors('fastako')).toEqual(['#0FCE65', '#24263F']);
    expect(autoPosterBrandColors('yangaloan')).toEqual(['#FE5200']);

    expect(AUTO_POSTER_BRANDS.flatMap(autoPosterBrandColors)).not.toContain('#191919');
    expect(AUTO_POSTER_BRANDS.flatMap(autoPosterBrandColors)).not.toContain('#595959');
  });

  it.each(brandDomains)(
    'uses the shared high-legibility anti-fraud phone and composition rules for $brand',
    ({ brand, domain }) => {
      const plan = buildLoanPosterScenePlans({
        count: 1,
        aspectRatio: '3:4',
        brand,
        purpose: 'anti-fraud',
      })[0];
      const prompt = buildLoanPosterPrompt({
        count: 1,
        aspectRatio: '3:4',
        brand,
        purpose: 'anti-fraud',
      });

      expect(plan).toMatchObject({
        logoAnchor: 'left',
        headline: 'Prevent Fraud',
        subtitle: 'Trust Only Official Customer Service',
        textAnchor: 'right',
      });
      expect(plan?.prompt).toContain('same campaign-quality composition system');
      expect(plan?.prompt).toContain(`centered bold black text “${domain}”`);
      expect(plan?.prompt).toContain('large enough for its interface to read clearly');
      expect(prompt).toContain(`exact official domain \`${domain}\``);
      expect(prompt).toContain('`--poster-copy-style anti-fraud-message`');
      for (const other of brandDomains) {
        if (other.domain !== domain) expect(plan?.prompt).not.toContain(other.domain);
      }
    },
  );

  it.each(AUTO_POSTER_BRANDS.filter((brand) => brand !== 'zamloan'))(
    'aligns the additional-brand acquisition typography, phone prominence, and copy spacing for %s',
    (brand) => {
      const plan = buildLoanPosterScenePlans({
        count: 1,
        aspectRatio: '3:4',
        brand,
        purpose: 'acquisition',
      })[0];

      expect(plan?.prompt).toContain('expressive heavy campaign typography');
      expect(plan?.prompt).toContain('same scale and visual prominence');
      expect(plan?.prompt).toContain('required copy-to-subject air gap');
    },
  );

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
    expect(prompt).toContain('one solid deep-charcoal color');
    expect(prompt).toContain('lower-right continuity zone');
    expect(prompt).toContain('surrounding base background must flow through it');
    expect(prompt).toContain('OPEN-PALM SIDEWARD REJECTION');
    expect(prompt).toContain('Do not thrust the hand toward the camera');
    expect(prompt).toContain('`--overlay-logo-anchor left`');
    expect(prompt).toContain('`--poster-text-anchor right`');
    expect(prompt).toContain('`--poster-copy-style anti-fraud-message`');
    expect(prompt).toContain('keep all of its UI semantics out of the full-poster provider prompt');
    expect(prompt).not.toContain('`Unknown Sender`');
    expect(prompt).not.toContain('Pay a processing fee now.');
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

  it.each(additionalBrands)(
    'builds isolated acquisition and anti-fraud prompts for $label',
    ({ brand, label, logo }) => {
      const acquisitionPlan = buildLoanPosterScenePlans({
        count: 1,
        aspectRatio: '3:4',
        brand,
        purpose: 'acquisition',
      })[0];
      const acquisitionPrompt = buildLoanPosterPrompt({
        count: 1,
        aspectRatio: '3:4',
        brand,
        purpose: 'acquisition',
      });
      const antiFraudPrompt = buildLoanPosterPrompt({
        count: 1,
        aspectRatio: '3:4',
        brand,
        purpose: 'anti-fraud',
      });

      expect(acquisitionPlan?.prompt).toContain(label);
      expect(acquisitionPlan?.prompt).not.toContain('low-opacity Z');
      expect(acquisitionPrompt).toContain(`brand: \`${brand}\` (${label})`);
      expect(acquisitionPrompt).toContain(`\`${logo}\``);
      expect(acquisitionPrompt).toContain(`\`${brand}-poster-01.png\``);
      expect(acquisitionPrompt).toContain('`--overlay-logo`');
      expect(acquisitionPrompt).not.toContain('`zamloan.com`');
      expect(antiFraudPrompt).toContain(`brand: \`${brand}\` (${label})`);
      expect(antiFraudPrompt).toContain(`\`${logo}\``);
      expect(antiFraudPrompt).toContain('`--overlay-logo`');
      expect(antiFraudPrompt).not.toContain('`zamloan.com`');
    },
  );

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
    for (const { brand, label } of additionalBrands) {
      expect(isLoanPosterGenerationPrompt(buildLoanPosterPrompt({
        count: 1,
        aspectRatio: '3:4',
        brand,
      })), label).toBe(true);
    }
    expect(isLoanPosterGenerationPrompt('Design a Zamloan poster for me.')).toBe(false);
  });

  it('recognizes legacy and date-scoped numbered poster outputs', () => {
    expect(isLoanPosterOutputName('zamloan-poster-01.png')).toBe(true);
    expect(isLoanPosterOutputName('zamloan-poster-20260728-001.png')).toBe(true);
    for (const { brand } of additionalBrands) {
      expect(isLoanPosterOutputName(`${brand}-poster-20260909-001.png`)).toBe(true);
    }
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
    expect(prompts.every((prompt) => prompt.includes('model side of the required 5%-wide'))).toBe(true);
    expect(prompts.every((prompt) => prompt.includes('compact solid green shield'))).toBe(true);
    expect(prompts.every((prompt) => prompt.includes('about one-quarter'))).toBe(true);
    expect(prompts.every((prompt) => (
      prompt.includes('directly beneath the rejecting hand within 2 to 4% of the canvas height')
    ))).toBe(true);
    expect(prompts.every((prompt) => (
      prompt.includes('Keep the full palm comfortably inside the frame')
    ))).toBe(true);
    expect(prompts.every((prompt) => prompt.includes('OPEN-PALM SIDEWARD REJECTION'))).toBe(true);
    expect(prompts.every((prompt) => prompt.includes('separated from the phone hand'))).toBe(true);
    expect(prompts.every((prompt) => (
      prompt.includes('palm surface clearly faces the viewer')
    ))).toBe(true);
    expect(prompts.every((prompt) => (
      prompt.includes('Do not thrust the hand toward the camera')
    ))).toBe(true);
    expect(prompts.every((prompt) => !prompt.includes('Turn the palm sideways'))).toBe(true);
    expect(prompts.every((prompt) => !prompt.includes('vertical palm facing the camera'))).toBe(true);
    expect(prompts.every((prompt) => (
      prompt.includes('beside the torso and below the shoulder')
    ))).toBe(true);
    expect(prompts.every((prompt) => prompt.includes('ordinary scene space immediately below-right'))).toBe(true);
    expect(prompts.every((prompt) => !prompt.includes('upright stop-sign palm'))).toBe(true);
    expect(prompts.every((prompt) => prompt.includes('rejecting palm aimed toward the phone'))).toBe(true);
    expect(prompts.every((prompt) => (
      !prompt.includes('open palm extended toward the camera in a firm stop gesture')
    ))).toBe(true);
    expect(prompts.every((prompt) => prompt.includes('“zamloan.com”'))).toBe(true);
    expect(prompts.every((prompt) => prompt.includes('no more than half'))).toBe(true);
    expect(prompts.every((prompt) => (
      prompt.includes('x=73% to 100% and y=72% to 90% of the canvas')
    ))).toBe(true);
    expect(prompts.every((prompt) => prompt.includes('ordinary scene space immediately below-right'))).toBe(true);
    expect(prompts.every((prompt) => prompt.includes('exactly one person'))).toBe(true);
    expect(prompts.every((prompt) => prompt.includes('exactly two arms and two hands'))).toBe(true);
    expect(prompts.every((prompt) => prompt.includes('No crossed arms, folded arms'))).toBe(true);
    expect(prompts.every((prompt) => (
      prompt.includes('both arms visibly and anatomically connected to that same person')
    ))).toBe(true);
    expect(prompts.every((prompt) => (
      prompt.includes('surrounding base background must flow continuously')
    ))).toBe(true);
    expect(prompts.every((prompt) => !prompt.includes('mother and her adult daughter'))).toBe(true);
    expect(prompts.every((prompt) => !prompt.includes('with a younger relative'))).toBe(true);
    expect(prompts.every((prompt) => !prompt.includes('“Unknown Sender”'))).toBe(true);
    expect(prompts.every((prompt) => !prompt.includes('Pay a processing fee now.'))).toBe(true);
    expect(prompts.every((prompt) => !prompt.includes('solid saturated magenta'))).toBe(true);
    expect(prompts.every((prompt) => !prompt.includes('Application Successful'))).toBe(true);
  });

  it('keeps notification semantics out of the Zamloan anti-fraud provider prompt', () => {
    const providerPrompts = AUTO_POSTER_ASPECT_RATIOS.flatMap((aspectRatio) => (
      buildLoanPosterScenePrompts({
        count: 3,
        aspectRatio,
        brand: 'zamloan',
        purpose: 'anti-fraud',
      })
    ));

    expect(providerPrompts).not.toHaveLength(0);
    expect(providerPrompts.every((prompt) => (
      !/notification|message card|placeholder|backing plate|solid rectangle|color block/i.test(prompt)
    ))).toBe(true);
    expect(providerPrompts.every((prompt) => (
      prompt.includes('surrounding base background must flow continuously')
    ))).toBe(true);
  });

  it.each(AUTO_POSTER_ASPECT_RATIOS)(
    'locks the %s anti-fraud background to the lower-right fixed diagonal',
    (aspectRatio) => {
      const [plan] = buildLoanPosterScenePlans({
        count: 1,
        aspectRatio,
        brand: 'zamloan',
        purpose: 'anti-fraud',
      });

      expect(plan?.prompt).toContain(
        'one straight dividing edge from the exact bottom-left canvas corner (0%, 100%) to the right canvas edge at (100%, 8%)',
      );
      expect(plan?.prompt).toContain('approximately 54% light copy field and 46% environmental scene');
      expect(plan?.prompt).toContain(
        'The left endpoint must visibly touch the exact bottom-left corner',
      );
      expect(plan?.prompt).toContain('The right endpoint must touch the right edge 8% below the top');
      expect(plan?.prompt).not.toContain('exact top-right canvas corner (100%, 0%)');
      expect(plan?.prompt).not.toMatch(/58%|45%|lower-middle|upper-center/);
    },
  );

  it('does not alter the existing Zamloan acquisition provider prompts', () => {
    const expectedHashes = {
      '3:4': 'd9200c60c7e4e9ea9bc0cab9aef7706b8b4a0c4d064a0505dc45f59442449629',
      '16:9': 'd37e5174bf700154f04d7e8fef6e1a6c00925c80599fc79c9658042f2c7017a1',
      '1:1': 'a1f6d717ea3b1f97c7a1704cf6af75be4dc7d74b7cd91816e343c0a7324d0528',
    } as const;

    for (const aspectRatio of AUTO_POSTER_ASPECT_RATIOS) {
      const prompts = buildLoanPosterScenePrompts({
        count: 3,
        aspectRatio,
        brand: 'zamloan',
        purpose: 'acquisition',
        variationOffset: 0,
      });
      const hash = createHash('sha256').update(prompts.join('\n---\n')).digest('hex');
      expect(hash).toBe(expectedHashes[aspectRatio]);
    }
  });

  it('moves BiuMoney anti-fraud scenes onto the shared high-legibility path', () => {
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
    expect(plans.every((plan) => plan.textAnchor === 'right')).toBe(true);
    expect(prompts.every((prompt) => prompt.includes('Prevent Fraud'))).toBe(true);
    expect(prompts.every((prompt) => prompt.includes('biumoney.com'))).toBe(true);
    expect(prompts.every((prompt) => prompt.includes('centered bold black text'))).toBe(true);
    expect(prompts.every((prompt) => prompt.includes('same campaign-quality composition system'))).toBe(true);
    expect(prompts.every((prompt) => prompt.includes('geometric foreground tile'))).toBe(true);
    expect(prompts.every((prompt) => prompt.includes('exactly one person'))).toBe(true);
    expect(prompts.every((prompt) => prompt.includes('exactly two arms and two hands'))).toBe(true);
    expect(prompts.every((prompt) => !prompt.includes('mother and her adult daughter'))).toBe(true);
    expect(prompts.every((prompt) => !prompt.includes('with a younger relative'))).toBe(true);
    expect(prompts.every((prompt) => !prompt.includes('Application Successful'))).toBe(true);
  });

  it.each([
    ['1:1', 'x=71% to 100% and y=69% to 94% of the canvas'],
    ['16:9', 'x=78% to 100% and y=66% to 94% of the canvas'],
  ] as const)(
    'keeps the %s anti-fraud logo left and preserves its ratio-specific continuity zone',
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

  it.each([
    [
      '3:4',
      'headline top edge between 19% and 20% of the canvas height',
      'exactly two lines: “Trust Only Official” / “Customer Service”',
      'no wider than 36% of the canvas',
    ],
    [
      '16:9',
      'headline top edge between 22.5% and 23.5% of the canvas height',
      'exactly two lines: “Trust Only Official” / “Customer Service”',
      'no wider than 35% of the canvas',
    ],
    [
      '1:1',
      'headline top edge between 19% and 20% of the canvas height',
      'exactly three lines: “Trust Only” / “Official Customer” / “Service”',
      'no wider than 31% of the canvas',
    ],
  ] as const)(
    'keeps the %s anti-fraud copy large while separating it from the phone and model',
    (aspectRatio, headlinePosition, subtitleLines, subtitleWidth) => {
      const [plan] = buildLoanPosterScenePlans({
        count: 1,
        aspectRatio,
        brand: 'zamloan',
        purpose: 'anti-fraud',
      });

      expect(plan?.prompt).toContain(headlinePosition);
      expect(plan?.prompt).toContain(subtitleLines);
      expect(plan?.prompt).toContain(subtitleWidth);
      expect(plan?.prompt).toContain('at least 5% of the canvas width');
      expect(plan?.prompt).toContain('Do not reduce the established headline or subtitle font size');
    },
  );

  it('rotates three stable warm-or-green templates without purple or blue backgrounds', () => {
    const prompts = buildLoanPosterScenePlans({
      count: 3,
      aspectRatio: '3:4',
      brand: 'zamloan',
      purpose: 'anti-fraud',
      variationOffset: 0,
    }).map((plan) => plan.prompt);

    expect(prompts).toHaveLength(3);
    expect(prompts[0]).toContain('warm ivory (#f7ecd9)');
    expect(prompts[0]).toContain('deep forest green (#153f2e)');
    expect(prompts[1]).toContain('warm sand (#f1dfc3)');
    expect(prompts[1]).toContain('rich burgundy (#6f2937)');
    expect(prompts[2]).toContain('warm cream');
    expect(prompts[2]).toContain('burnished terracotta');
    expect(prompts.every((prompt) => (
      prompt.includes('The selected palette is mandatory and must dominate the background')
    ))).toBe(true);
    expect(prompts.slice(1).every((prompt) => (
      prompt.includes('Do not replace the selected scene color with Zamloan green')
    ))).toBe(true);
  });

  it('never emits a purple, blue, navy, cobalt, cyan, indigo, or teal anti-fraud background', () => {
    const prompts = Array.from({ length: 12 }, (_, variationOffset) => (
      buildLoanPosterScenePlans({
        count: 1,
        aspectRatio: '3:4',
        brand: 'zamloan',
        purpose: 'anti-fraud',
        variationOffset,
      })[0]?.prompt ?? ''
    ));

    const forbiddenBackgroundTerms = [
      'purple',
      'lavender',
      'plum',
      'indigo',
      'mist blue-gray',
      'cobalt blue',
      'navy blue',
      'charcoal blue',
      'cyan',
      'teal',
      '#24263F',
    ];
    expect(prompts.every((prompt) => (
      forbiddenBackgroundTerms.every((term) => !prompt.includes(term))
    ))).toBe(true);
  });

  it.each(AUTO_POSTER_BRANDS)(
    'scatters every allowed non-blue logo color into independent light-and-original palettes for %s',
    (brand) => {
      const logoColors = [
        '#46A93C',
        '#D35430',
        '#43AA3E',
        '#D45330',
        '#DC5130',
        '#0AB81C',
        '#0B1D0B',
        '#0FCE65',
        '#FE5200',
      ];
      const prompts = buildLoanPosterScenePlans({
        count: 9,
        aspectRatio: '3:4',
        brand,
        purpose: 'anti-fraud',
        variationOffset: 3,
      }).map((plan) => plan.prompt);

      expect(prompts).toHaveLength(logoColors.length);
      for (const [index, color] of logoColors.entries()) {
        expect(prompts[index]).toContain('one isolated logo color');
        expect(prompts[index]).toContain(`very pale low-saturation tint derived only from ${color}`);
        expect(prompts[index]).toContain(`original saturated hue ${color}`);
        expect(prompts[index]).not.toContain('logo-derived brand palette');
      }
    },
  );

  it.each(AUTO_POSTER_BRANDS.filter((brand) => brand !== 'biumoney'))(
    'keeps the supplied %s logo on a near-white safe field instead of its saturated hue',
    (brand) => {
      const prompt = buildLoanPosterScenePlans({
        count: 1,
        aspectRatio: '3:4',
        brand,
        purpose: 'anti-fraud',
        variationOffset: 3,
      })[0]?.prompt;

      expect(prompt).toContain('keep the complete top-left logo-safe row near-white');
      expect(prompt).toContain('Never place the original saturated hue behind the supplied logo');
    },
  );

  it('does not pair two different logo colors in one added palette', () => {
    const prompts = buildLoanPosterScenePlans({
      count: 9,
      aspectRatio: '3:4',
      brand: 'zamloan',
      purpose: 'anti-fraud',
      variationOffset: 3,
    }).map((plan) => plan.prompt);

    for (const prompt of prompts) {
      const usedColors = AUTO_POSTER_BRANDS
        .flatMap(autoPosterBrandColors)
        .filter((color) => prompt.includes(color));
      expect(new Set(usedColors).size).toBe(1);
    }
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

  it.each(additionalBrands)('loads the exact bundled $label logo', async ({ brand, logo }) => {
    const fetchMock = vi.fn<typeof fetch>(async () => new Response(
      new Blob(['<svg/>'], { type: 'image/svg+xml' }),
      {
        status: 200,
        headers: { 'content-type': 'image/svg+xml' },
      },
    ));
    vi.stubGlobal('fetch', fetchMock);

    const file = await loadAutoPosterLogo(brand);

    expect(fetchMock).toHaveBeenCalledWith(
      `/brand/zambia-support/${logo}`,
      {
        cache: 'force-cache',
        signal: expect.any(AbortSignal),
      },
    );
    expect(file?.name).toBe(logo);
    expect(file?.type).toBe('image/svg+xml');
  });

  it('keeps BiuMoney on its existing no-bundled-logo path', async () => {
    const fetchMock = vi.fn<typeof fetch>();
    vi.stubGlobal('fetch', fetchMock);

    await expect(loadAutoPosterLogo('biumoney')).resolves.toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
