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
  it('offers count, size, and brand through one compact filter menu', () => {
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
    expect(screen.getByTestId('home-hero-auto-poster-trigger').textContent)
      .toContain('1');
    expect(screen.queryByTestId('home-hero-auto-poster-menu')).toBeNull();

    fireEvent.click(screen.getByTestId('home-hero-auto-poster-trigger'));
    expect(screen.getByTestId('home-hero-auto-poster-menu')).toBeTruthy();
    fireEvent.click(screen.getAllByRole('menuitem')[0]!);
    fireEvent.click(screen.getByTestId('home-hero-auto-poster-count-option-7'));
    expect(onAutoPosterCountChange).toHaveBeenCalledWith(7);

    fireEvent.click(screen.getByTestId('home-hero-auto-poster-trigger'));
    fireEvent.click(screen.getAllByRole('menuitem')[1]!);
    fireEvent.click(screen.getByTestId('home-hero-auto-poster-size-option-1:1'));
    expect(onAutoPosterAspectRatioChange).toHaveBeenCalledWith('1:1');

    fireEvent.click(screen.getByTestId('home-hero-auto-poster-trigger'));
    fireEvent.click(screen.getAllByRole('menuitem')[2]!);
    fireEvent.click(screen.getByTestId('home-hero-auto-poster-brand-option-biumoney'));
    expect(onAutoPosterBrandChange).toHaveBeenCalledWith('biumoney');

    fireEvent.click(screen.getByTestId('home-hero-auto-poster-trigger'));
    fireEvent.click(screen.getAllByRole('menuitem')[0]!);
    fireEvent.click(screen.getByTestId('home-hero-auto-poster-submenu-close'));
    expect(screen.queryByTestId('home-hero-auto-poster-menu')).toBeNull();

    expect((screen.getByTestId('home-hero-submit') as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByTestId('home-hero-auto-poster-generate'));
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
    fireEvent.click(screen.getByTestId('home-hero-send-menu-close'));
    expect(screen.getByTestId('home-hero-send-menu-panel').hasAttribute('hidden')).toBe(true);

    fireEvent.click(screen.getByTestId('home-hero-submit'));
    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onAutoPoster).not.toHaveBeenCalled();
  });

  it('keeps extension registries out of the light homepage until requested', () => {
    const onLoadExtensions = vi.fn();
    renderHero({
      extensionsRequested: false,
      onLoadExtensions,
    });

    fireEvent.click(screen.getByTestId('home-hero-send-menu'));
    expect(screen.queryByTestId('home-hero-resource-picker')).toBeNull();
    expect(screen.queryByTestId('home-hero-rail')).toBeNull();
    fireEvent.click(screen.getByTestId('home-hero-load-extensions'));
    expect(onLoadExtensions).toHaveBeenCalledTimes(1);
  });

  it('disables all auto-poster controls while a batch is being prepared', () => {
    renderHero({ autoPosterPending: true });

    expect((screen.getByTestId('home-hero-submit') as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByTestId('home-hero-auto-poster-count') as HTMLSelectElement).disabled).toBe(true);
    expect((screen.getByTestId('home-hero-auto-poster-size') as HTMLSelectElement).disabled).toBe(true);
    expect((screen.getByTestId('home-hero-auto-poster-brand') as HTMLSelectElement).disabled).toBe(true);
    expect((screen.getByTestId('home-hero-auto-poster-generate') as HTMLButtonElement).disabled).toBe(true);
  });

  it('keeps poster controls at the right edge immediately before send', () => {
    renderHero();

    const controls = screen.getByTestId('home-hero-auto-poster-controls');
    const submit = screen.getByTestId('home-hero-submit');
    const rightActions = controls.closest('.home-hero__foot-right');

    expect(rightActions).toBeTruthy();
    expect(rightActions?.lastElementChild).toBe(submit);
    expect(controls.nextElementSibling).toBe(submit);
    expect(rightActions?.contains(screen.getByTestId('home-hero-send-menu'))).toBe(false);
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

  it('portals the intent rail above footer overflow while keeping its trigger before send', () => {
    renderHero();
    const rail = screen.getByTestId('home-hero-rail');
    const trigger = screen.getByTestId('home-hero-send-menu');
    const submit = screen.getByTestId('home-hero-submit');
    const footer = submit.closest('.home-hero__input-foot');

    expect(footer).toBeTruthy();
    expect(footer?.contains(trigger)).toBe(true);
    expect(footer?.contains(rail)).toBe(false);
    expect(rail.closest('.composer-add__portal')).toBeTruthy();
    expect(
      trigger.compareDocumentPosition(submit) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(document.querySelector('.home-hero__subtitle')).toBeNull();
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
