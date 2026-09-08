'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { en } from './locales/en';
import { zhCN } from './locales/zh-CN';
import { LOCALES, type Dict, type Locale } from './types';

export { LOCALES, LOCALE_LABEL } from './types';
export type { Locale } from './types';

type DictKey = keyof Dict;

const SYNC_DICTS: Partial<Record<Locale, Dict>> = {
  'en': en,
  'zh-CN': zhCN,
};

const ASYNC_DICT_LOADERS: Partial<Record<Locale, () => Promise<Dict>>> = {
  'id': () => import('./locales/id').then((module) => module.id),
  'de': () => import('./locales/de').then((module) => module.de),
  'zh-TW': () => import('./locales/zh-TW').then((module) => module.zhTW),
  'pt-BR': () => import('./locales/pt-BR').then((module) => module.ptBR),
  'es-ES': () => import('./locales/es-ES').then((module) => module.esES),
  'ru': () => import('./locales/ru').then((module) => module.ru),
  'fa': () => import('./locales/fa').then((module) => module.fa),
  'ar': () => import('./locales/ar').then((module) => module.ar),
  'ja': () => import('./locales/ja').then((module) => module.ja),
  'ko': () => import('./locales/ko').then((module) => module.ko),
  'pl': () => import('./locales/pl').then((module) => module.pl),
  'hu': () => import('./locales/hu').then((module) => module.hu),
  'fr': () => import('./locales/fr').then((module) => module.fr),
  'uk': () => import('./locales/uk').then((module) => module.uk),
  'tr': () => import('./locales/tr').then((module) => module.tr),
  'th': () => import('./locales/th').then((module) => module.th),
  'it': () => import('./locales/it').then((module) => module.it),
};

async function loadDict(locale: Locale): Promise<Dict> {
  const sync = SYNC_DICTS[locale];
  if (sync) return sync;
  return ASYNC_DICT_LOADERS[locale]?.() ?? en;
}

const LS_KEY = 'open-design:locale';

export function resolveSystemLocale(languages: readonly string[]): Locale | null {
  const supported = LOCALES as readonly string[];
  for (const raw of languages) {
    const normalized = raw.trim();
    if (!normalized) continue;

    const exact = LOCALES.find((locale) => locale.toLowerCase() === normalized.toLowerCase());
    if (exact) return exact;

    const [language, regionOrScript] = normalized.toLowerCase().split('-');
    if (language === 'zh') {
      if (regionOrScript === 'hant' || regionOrScript === 'tw' || regionOrScript === 'hk' || regionOrScript === 'mo') {
        return 'zh-TW';
      }
      return 'zh-CN';
    }

    const baseMatch = LOCALES.find((locale) => locale.toLowerCase().split('-')[0] === language);
    if (baseMatch && supported.includes(baseMatch)) return baseMatch;
  }
  return null;
}

// An explicit user pick saved to localStorage always wins. Individual app
// shells may then provide a product default; otherwise first-run follows the
// browser/system language and unsupported languages fall back to English.
function detectInitialLocale(defaultLocale?: Locale): Locale {
  if (typeof window === 'undefined') return 'en';
  try {
    const stored = window.localStorage.getItem(LS_KEY);
    if (stored && (LOCALES as string[]).includes(stored)) {
      return stored as Locale;
    }
  } catch {
    /* ignore */
  }
  if (defaultLocale) return defaultLocale;
  const detected = resolveSystemLocale(
    navigator.languages?.length ? navigator.languages : [navigator.language],
  );
  return detected ?? 'en';
}

interface I18nContextValue {
  locale: Locale;
  setLocale: (next: Locale) => void;
  t: (key: DictKey, vars?: Record<string, string | number>) => string;
}

const I18nContext = createContext<I18nContextValue | null>(null);

interface ProviderProps {
  initial?: Locale;
  defaultLocale?: Locale;
  deferUntilClient?: boolean;
  children: ReactNode;
}

const RTL_LOCALES: Locale[] = ['ar', 'fa'];

export function I18nProvider({
  initial,
  defaultLocale,
  deferUntilClient = false,
  children,
}: ProviderProps) {
  // Keep the server render and the browser's first render deterministic.
  // Reading localStorage or navigator in the state initializer makes the
  // browser render a different language than the prerendered HTML, forcing
  // React to discard and rebuild the whole page during hydration.
  const initialLocale = initial ?? defaultLocale ?? 'en';
  const [locale, setLocaleState] = useState<Locale>(initialLocale);
  const [dict, setDict] = useState<Dict>(() => SYNC_DICTS[initialLocale] ?? en);
  const [ready, setReady] = useState(initial != null || !deferUntilClient);

  const activateLocale = useCallback((next: Locale) => {
    // Language metadata is UI state, not part of the lazy payload. Update it
    // immediately so direction, accessibility metadata, and locale controls
    // respond synchronously while a non-default dictionary downloads.
    setLocaleState(next);
    const sync = SYNC_DICTS[next];
    if (sync) {
      setDict(sync);
      return;
    }
    void loadDict(next).then((loaded) => {
      setDict(loaded);
    });
  }, []);

  useEffect(() => {
    if (initial != null) return;
    const detected = detectInitialLocale(defaultLocale);
    let active = true;
    setLocaleState(detected);

    const sync = SYNC_DICTS[detected];
    if (sync) {
      setDict(sync);
      setReady(true);
      return;
    }

    void loadDict(detected).then((loaded) => {
      if (!active) return;
      setDict(loaded);
      setReady(true);
    });
    return () => {
      active = false;
    };
  }, [defaultLocale, initial]);

  // Keep <html lang="…" dir="…"> in sync so screen readers and CSS hooks
  // pick the right language token and direction without each component
  // having to set it itself.
  useEffect(() => {
    if (typeof document !== 'undefined') {
      const dir = RTL_LOCALES.includes(locale) ? 'rtl' : 'ltr';
      document.documentElement.setAttribute('lang', locale);
      document.documentElement.setAttribute('dir', dir);
    }
  }, [locale]);

  const setLocale = useCallback((next: Locale) => {
    activateLocale(next);
    try {
      window.localStorage.setItem(LS_KEY, next);
    } catch {
      /* ignore */
    }
  }, [activateLocale]);

  const t = useCallback(
    (key: DictKey, vars?: Record<string, string | number>): string => {
      const raw = dict[key] ?? en[key] ?? key;
      if (!vars) return raw;
      return raw.replace(/\{(\w+)\}/g, (_, name: string) => {
        const v = vars[name];
        return v == null ? `{${name}}` : String(v);
      });
    },
    [dict],
  );

  const value = useMemo<I18nContextValue>(
    () => ({ locale, setLocale, t }),
    [locale, setLocale, t],
  );

  if (deferUntilClient && !ready) {
    return (
      <div
        className="locale-bootstrap"
        data-testid="locale-bootstrap"
        role="status"
        aria-label="Niki"
      >
        <img className="locale-bootstrap__logo" src="/logo.svg" alt="" />
        <span className="locale-bootstrap__name">Niki</span>
        <span className="locale-bootstrap__spinner" aria-hidden="true" />
      </div>
    );
  }

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nContextValue {
  const ctx = useContext(I18nContext);
  if (!ctx) {
    // Fall back to a stand-alone English translator when no provider is
    // mounted (e.g. an isolated test). This keeps the API safe to call
    // without requiring every callsite to wrap in a provider.
    return {
      locale: 'en',
      setLocale: () => { },
      t: (key, vars) => {
        const raw = en[key] ?? key;
        if (!vars) return raw;
        return raw.replace(/\{(\w+)\}/g, (_, n: string) => {
          const v = vars[n];
          return v == null ? `{${n}}` : String(v);
        });
      },
    };
  }
  return ctx;
}

// Convenience for components that only need the translator function.
export function useT(): I18nContextValue['t'] {
  return useI18n().t;
}
