// @vitest-environment jsdom

import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useRuntimeReleaseRefresh } from '../../src/poster/useRuntimeReleaseRefresh';

const OLD_RELEASE = '1111111111111111111111111111111111111111';
const NEW_RELEASE = '2222222222222222222222222222222222222222';

describe('useRuntimeReleaseRefresh', () => {
  beforeEach(() => {
    window.sessionStorage.clear();
    window.history.replaceState({}, '', '/');
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    cleanup();
  });

  it('reloads a stale client when the runtime release changes', async () => {
    window.sessionStorage.setItem('niki:runtime-release', OLD_RELEASE);
    const reloadPage = vi.fn();
    const onReloading = vi.fn();
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      version: { release: NEW_RELEASE },
    }), { status: 200, headers: { 'content-type': 'application/json' } })));

    renderHook(() => useRuntimeReleaseRefresh({
      blocked: false,
      onReloading,
      reloadPage,
    }));

    await waitFor(() => expect(reloadPage).toHaveBeenCalledOnce());
    expect(reloadPage).toHaveBeenCalledWith(NEW_RELEASE);
    expect(onReloading).toHaveBeenCalledOnce();
  });

  it('defers a detected refresh until submission is no longer blocked', async () => {
    window.sessionStorage.setItem('niki:runtime-release', OLD_RELEASE);
    const reloadPage = vi.fn();
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      version: { release: NEW_RELEASE },
    }), { status: 200, headers: { 'content-type': 'application/json' } })));

    const { rerender } = renderHook(
      ({ blocked }) => useRuntimeReleaseRefresh({ blocked, reloadPage }),
      { initialProps: { blocked: true } },
    );

    await waitFor(() => expect(fetch).toHaveBeenCalledOnce());
    expect(reloadPage).not.toHaveBeenCalled();

    act(() => rerender({ blocked: false }));
    await waitFor(() => expect(reloadPage).toHaveBeenCalledWith(NEW_RELEASE));
  });

  it('records the first release without reloading and stamps the page URL', async () => {
    const reloadPage = vi.fn();
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      version: { release: NEW_RELEASE },
    }), { status: 200, headers: { 'content-type': 'application/json' } })));

    renderHook(() => useRuntimeReleaseRefresh({ blocked: false, reloadPage }));

    await waitFor(() => {
      expect(window.sessionStorage.getItem('niki:runtime-release')).toBe(NEW_RELEASE);
    });
    expect(reloadPage).not.toHaveBeenCalled();
    expect(new URL(window.location.href).searchParams.get('release')).toBe(NEW_RELEASE.slice(0, 12));
  });
});
