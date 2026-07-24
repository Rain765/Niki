// @vitest-environment jsdom
//
// Stage B of plugin-driven-flow-plan — Home intent rail interactions.
// Covers:
//   - Every chip in the catalog renders with its test id.
//   - Clicking a chip forwards the full chip descriptor to onPickChip
//     so the dispatcher in HomeView can route to the right flow.
//   - The active + pending UI states light up the right chip and
//     disable all chips while a plugin is mid-apply.

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { HomeHero } from '../../src/components/HomeHero';
import {
  HOME_HERO_CHIPS,
  findChip,
} from '../../src/components/home-hero/chips';

afterEach(() => {
  cleanup();
});

function renderHero(overrides: Partial<React.ComponentProps<typeof HomeHero>> = {}) {
  const onPickChip = vi.fn();
  const onPickPlugin = vi.fn();
  render(
    <HomeHero
      prompt=""
      onPromptChange={() => undefined}
      onSubmit={() => undefined}
      activePluginTitle={null}
      activeChipId={null}
      onClearActivePlugin={() => undefined}
      pluginOptions={[]}
      pluginsLoading={false}
      pendingPluginId={null}
      pendingChipId={null}
      onPickPlugin={onPickPlugin}
      onPickChip={onPickChip}
      contextItemCount={0}
      error={null}
      {...overrides}
    />,
  );
  return { onPickChip, onPickPlugin };
}

describe('HomeHero intent rail', () => {
  it('offers count, size, and brand selectors in order for one-click poster generation', () => {
    const onAutoPoster = vi.fn();
    const onAutoPosterCountChange = vi.fn();
    const onAutoPosterAspectRatioChange = vi.fn();
    const onAutoPosterBrandChange = vi.fn();
    renderHero({
      autoPosterCount: 1,
      autoPosterAspectRatio: '16:9',
      autoPosterBrand: 'zamloan',
      onAutoPoster,
      onAutoPosterCountChange,
      onAutoPosterAspectRatioChange,
      onAutoPosterBrandChange,
    });

    const controls = screen.getByTestId('home-hero-auto-poster-controls');
    const count = screen.getByTestId('home-hero-auto-poster-count') as HTMLSelectElement;
    const size = screen.getByTestId('home-hero-auto-poster-size') as HTMLSelectElement;
    const brand = screen.getByTestId('home-hero-auto-poster-brand') as HTMLSelectElement;
    expect(count.options).toHaveLength(10);
    expect(count.value).toBe('1');
    expect(Array.from(size.options).map((option) => option.value)).toEqual(['1:1', '16:9']);
    expect(size.value).toBe('16:9');
    expect(Array.from(brand.options).map((option) => option.value)).toEqual(['zamloan', 'biumoney']);
    expect(brand.value).toBe('zamloan');
    expect(Array.from(controls.querySelectorAll('select')).map((select) => select.dataset.testid))
      .toEqual([
        'home-hero-auto-poster-count',
        'home-hero-auto-poster-size',
        'home-hero-auto-poster-brand',
      ]);
    expect(controls.querySelectorAll('.home-hero__auto-poster-select-icon')).toHaveLength(3);

    fireEvent.change(count, { target: { value: '7' } });
    expect(onAutoPosterCountChange).toHaveBeenCalledWith(7);
    fireEvent.change(size, { target: { value: '1:1' } });
    expect(onAutoPosterAspectRatioChange).toHaveBeenCalledWith('1:1');
    fireEvent.change(brand, { target: { value: 'biumoney' } });
    expect(onAutoPosterBrandChange).toHaveBeenCalledWith('biumoney');

    fireEvent.click(screen.getByTestId('home-hero-submit'));
    expect(onAutoPoster).toHaveBeenCalledTimes(1);
  });

  it('uses the same send action for manual prompts and keeps resources in its menu', () => {
    const onSubmit = vi.fn();
    const onAutoPoster = vi.fn();
    renderHero({
      prompt: 'Create a campaign poster',
      onSubmit,
      onAutoPoster,
    });

    expect(screen.queryByTestId('home-hero-attach')).toBeNull();
    fireEvent.click(screen.getByTestId('home-hero-send-menu'));
    expect(screen.getByTestId('home-hero-resource-picker')).toBeTruthy();
    expect(screen.getByTestId('home-hero-attach')).toBeTruthy();

    fireEvent.click(screen.getByTestId('home-hero-submit'));
    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onAutoPoster).not.toHaveBeenCalled();
  });

  it('disables all auto-poster controls while a batch is being prepared', () => {
    renderHero({ autoPosterPending: true });

    expect((screen.getByTestId('home-hero-submit') as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByTestId('home-hero-auto-poster-count') as HTMLSelectElement).disabled).toBe(true);
    expect((screen.getByTestId('home-hero-auto-poster-size') as HTMLSelectElement).disabled).toBe(true);
    expect((screen.getByTestId('home-hero-auto-poster-brand') as HTMLSelectElement).disabled).toBe(true);
  });

  it('renders one chip per HOME_HERO_CHIPS entry', () => {
    renderHero();
    const rail = screen.getByTestId('home-hero-rail');
    for (const chip of HOME_HERO_CHIPS) {
      const node = screen.getByTestId(`home-hero-rail-${chip.id}`);
      expect(node).toBeTruthy();
      expect(rail.contains(node)).toBe(true);
    }
  });

  it('keeps the intent rail in the input footer before the send control', () => {
    renderHero();
    const rail = screen.getByTestId('home-hero-rail');
    const submit = screen.getByTestId('home-hero-submit');
    const footer = submit.closest('.home-hero__input-foot');

    expect(footer).toBeTruthy();
    expect(footer?.contains(rail)).toBe(true);
    expect(
      rail.compareDocumentPosition(submit) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(screen.getByText(/Shift/).closest('.home-hero__subtitle')).toBeTruthy();
    expect(footer?.querySelector('.home-hero__hint')).toBeNull();
  });

  it('forwards the matching chip descriptor when clicked', () => {
    const { onPickChip } = renderHero();
    fireEvent.click(screen.getByTestId('home-hero-rail-image'));
    expect(onPickChip).toHaveBeenCalledTimes(1);
    expect(onPickChip).toHaveBeenCalledWith(findChip('image'));
  });

  it('marks the active chip with aria-pressed=true and the is-active class', () => {
    renderHero({ activeChipId: 'video' });
    const node = screen.getByTestId('home-hero-rail-video');
    expect(node.getAttribute('aria-pressed')).toBe('true');
    expect(node.className).toContain('is-active');
  });

  it('disables every chip while a plugin apply is in flight', () => {
    renderHero({ pendingPluginId: 'od-figma-migration', pendingChipId: 'figma' });
    for (const chip of HOME_HERO_CHIPS) {
      const node = screen.getByTestId(`home-hero-rail-${chip.id}`);
      expect((node as HTMLButtonElement).disabled).toBe(true);
    }
    expect(screen.getByTestId('home-hero-rail-figma').className).toContain('is-pending');
  });

  it('groups plugin authoring with the lower starter shortcuts', () => {
    renderHero();
    const createPluginGroup = screen
      .getByTestId('home-hero-rail-create-plugin')
      .closest('[data-rail-group]');

    expect(createPluginGroup?.getAttribute('data-rail-group')).toBe('migrate');
    for (const id of ['figma', 'folder', 'template']) {
      expect(screen.getByTestId(`home-hero-rail-${id}`).closest('[data-rail-group]'))
        .toBe(createPluginGroup);
    }
  });

  it('keeps the generic fallback in the free-form prompt instead of an Other chip', () => {
    renderHero();

    expect(findChip('other')).toBeUndefined();
    expect(screen.queryByTestId('home-hero-rail-other')).toBeNull();
  });

  it('migration chips carry the right action discriminator', () => {
    expect(findChip('create-plugin')?.action).toMatchObject({ kind: 'create-plugin' });
    expect(findChip('figma')?.action).toMatchObject({ kind: 'apply-figma-migration' });
    expect(findChip('folder')?.action).toMatchObject({ kind: 'import-folder' });
    expect(findChip('template')?.action).toMatchObject({ kind: 'open-template-picker' });
  });

  it('media chips route to od-media-generation with the matching project kind', () => {
    expect(findChip('image')?.action).toMatchObject({
      kind: 'apply-scenario',
      pluginId: 'od-media-generation',
      projectKind: 'image',
    });
    expect(findChip('video')?.action).toMatchObject({ pluginId: 'od-media-generation', projectKind: 'video' });
    expect(findChip('audio')?.action).toMatchObject({ pluginId: 'od-media-generation', projectKind: 'audio' });
  });

  it('prototype and slide-deck chips route to their specialised bundled scenario plugin', () => {
    // Prototype now binds to web-prototype's seed template instead of
    // the generic od-new-generation router. Same for Slide deck →
    // simple-deck. See packages/contracts/src/plugins/scenario-defaults.ts
    // for the rationale (battle-tested seed + layouts + checklist).
    expect(findChip('prototype')?.action).toMatchObject({ pluginId: 'example-web-prototype', projectKind: 'prototype' });
    expect(findChip('deck')?.action).toMatchObject({ pluginId: 'example-simple-deck', projectKind: 'deck' });
  });

  it('specialised category chips route to their bundled scenario plugin', () => {
    // HyperFrames is the motion-graphics specialisation of Video,
    // surfaced as a separate chip so users can target it directly
    // instead of routing through the generic Video chip.
    expect(findChip('hyperframes')?.action).toMatchObject({
      kind: 'apply-scenario',
      pluginId: 'example-hyperframes',
      projectKind: 'video',
    });
    expect(findChip('live-artifact')).toBeUndefined();
  });
});
