import { describe, expect, it, vi } from 'vitest';

import {
  autoPosterUsesZReference,
  buildLoanPosterPrompt,
  buildLoanPosterScenePrompts,
  buildZambiaPosterPrompt,
  isLoanPosterGenerationPrompt,
  isLoanPosterOutputName,
  LOAN_POSTER_SKILL_ID,
  loadZambiaPosterReference,
  normalizeZambiaPosterCount,
  ZAMBIA_POSTER_REFERENCE_NAME,
  ZAMBIA_POSTER_REFERENCE_URL,
} from '../../../src/components/home-hero/zambia-posters';

describe('Zambia poster preset', () => {
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
    expect(isLoanPosterGenerationPrompt('Design a Zamloan poster for me.')).toBe(false);
  });

  it('recognizes legacy and date-scoped numbered poster outputs', () => {
    expect(isLoanPosterOutputName('zamloan-poster-01.png')).toBe(true);
    expect(isLoanPosterOutputName('zamloan-poster-20260728-001.png')).toBe(true);
    expect(isLoanPosterOutputName('poster.png')).toBe(false);
  });

  it('builds ready-to-dispatch scene prompts without an agent planning turn', () => {
    const prompts = buildLoanPosterScenePrompts({
      count: 2,
      aspectRatio: '16:9',
      brand: 'zamloan',
    });

    expect(prompts).toHaveLength(2);
    expect(prompts[0]).toContain('Get Cash In 1 Hour');
    expect(prompts[1]).toContain('Support Your Family Today');
    expect(prompts.every((prompt) => prompt.includes('Application Successful'))).toBe(true);
    expect(prompts.every((prompt) => prompt.includes('Negative prompt:'))).toBe(true);
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
    const firstBatch = buildLoanPosterScenePrompts({
      count: 1,
      aspectRatio: '16:9',
      brand: 'zamloan',
      variationOffset: 0,
    });
    const secondBatch = buildLoanPosterScenePrompts({
      count: 1,
      aspectRatio: '16:9',
      brand: 'zamloan',
      variationOffset: 1,
    });

    expect(firstBatch[0]).toContain('Get Cash In 1 Hour');
    expect(secondBatch[0]).toContain('Support Your Family Today');
    expect(secondBatch[0]).not.toBe(firstBatch[0]);
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
});
