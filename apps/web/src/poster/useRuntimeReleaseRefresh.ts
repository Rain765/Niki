'use client';

import { useCallback, useEffect, useRef } from 'react';

const RELEASE_STORAGE_KEY = 'niki:runtime-release';
const RELEASE_QUERY_KEY = 'release';
const RELEASE_CHECK_INTERVAL_MS = 60_000;
const RELOAD_DELAY_MS = 180;

interface RuntimeVersionPayload {
  version?: {
    release?: string;
  };
}

interface RuntimeReleaseRefreshOptions {
  blocked: boolean;
  onReloading?: () => void;
  reloadPage?: (release: string) => void;
}

function shortRelease(release: string): string {
  return release.slice(0, 12);
}

function currentUrlRelease(): string | null {
  try {
    return new URL(window.location.href).searchParams.get(RELEASE_QUERY_KEY);
  } catch {
    return null;
  }
}

function stampCurrentUrl(release: string): void {
  try {
    const url = new URL(window.location.href);
    const short = shortRelease(release);
    if (url.searchParams.get(RELEASE_QUERY_KEY) === short) return;
    url.searchParams.set(RELEASE_QUERY_KEY, short);
    window.history.replaceState(window.history.state, '', url);
  } catch {
    // Some embedded browsers can restrict history writes. Session storage
    // still provides the release baseline for the next focus check.
  }
}

function defaultReloadPage(release: string): void {
  const url = new URL(window.location.href);
  url.searchParams.set(RELEASE_QUERY_KEY, shortRelease(release));
  url.searchParams.set('refresh', String(Date.now()));
  window.setTimeout(() => window.location.replace(url.toString()), RELOAD_DELAY_MS);
}

function readStoredRelease(): string | null {
  try {
    return window.sessionStorage.getItem(RELEASE_STORAGE_KEY);
  } catch {
    return null;
  }
}

function storeRelease(release: string): void {
  try {
    window.sessionStorage.setItem(RELEASE_STORAGE_KEY, release);
  } catch {
    // Versioned URL remains as the fallback for restricted storage modes.
  }
}

export function useRuntimeReleaseRefresh({
  blocked,
  onReloading,
  reloadPage = defaultReloadPage,
}: RuntimeReleaseRefreshOptions): void {
  const blockedRef = useRef(blocked);
  const inFlightRef = useRef(false);
  const pendingReleaseRef = useRef<string | null>(null);
  const onReloadingRef = useRef(onReloading);
  const reloadPageRef = useRef(reloadPage);
  blockedRef.current = blocked;
  onReloadingRef.current = onReloading;
  reloadPageRef.current = reloadPage;

  const refreshToRelease = useCallback((release: string) => {
    pendingReleaseRef.current = null;
    storeRelease(release);
    onReloadingRef.current?.();
    reloadPageRef.current(release);
  }, []);

  const checkRelease = useCallback(async () => {
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    try {
      const response = await fetch(`/api/version?release-check=${Date.now()}`, {
        cache: 'no-store',
        headers: { Accept: 'application/json' },
      });
      if (!response.ok) return;
      const payload = await response.json() as RuntimeVersionPayload;
      const release = payload.version?.release?.trim();
      if (!release) return;

      const storedRelease = readStoredRelease();
      const urlRelease = currentUrlRelease();
      const urlMatches = urlRelease !== null && release.startsWith(urlRelease);
      if (!storedRelease) {
        if (urlRelease && !urlMatches) {
          if (blockedRef.current) {
            pendingReleaseRef.current = release;
          } else {
            refreshToRelease(release);
          }
          return;
        }
        storeRelease(release);
        stampCurrentUrl(release);
        return;
      }

      if (storedRelease === release) {
        stampCurrentUrl(release);
        return;
      }
      if (blockedRef.current) {
        pendingReleaseRef.current = release;
        return;
      }
      refreshToRelease(release);
    } catch {
      // A temporary offline or daemon restart should not disturb the user.
      // The next focus, visibility, online, or interval check retries.
    } finally {
      inFlightRef.current = false;
    }
  }, [refreshToRelease]);

  useEffect(() => {
    if (blocked) return;
    const pendingRelease = pendingReleaseRef.current;
    if (pendingRelease) refreshToRelease(pendingRelease);
  }, [blocked, refreshToRelease]);

  useEffect(() => {
    const checkWhenVisible = () => {
      if (document.visibilityState === 'visible') void checkRelease();
    };
    void checkRelease();
    const intervalId = window.setInterval(checkWhenVisible, RELEASE_CHECK_INTERVAL_MS);
    window.addEventListener('focus', checkWhenVisible);
    window.addEventListener('online', checkWhenVisible);
    window.addEventListener('pageshow', checkWhenVisible);
    document.addEventListener('visibilitychange', checkWhenVisible);
    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener('focus', checkWhenVisible);
      window.removeEventListener('online', checkWhenVisible);
      window.removeEventListener('pageshow', checkWhenVisible);
      document.removeEventListener('visibilitychange', checkWhenVisible);
    };
  }, [checkRelease]);
}
