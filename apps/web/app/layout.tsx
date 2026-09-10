import type { Metadata, Viewport } from 'next';
import Script from 'next/script';
import type { ReactNode } from 'react';
import {
  NIKI_POSTER_COLOR_CSS,
  NIKI_POSTER_COLOR_VALUES,
  NIKI_POSTER_LEGACY_ACCENT_COLORS,
  NIKI_POSTER_MASK_ICON_COLOR,
  NIKI_POSTER_THEME_COLOR,
} from '../src/poster/color-tokens';
import './poster.css';
import './account-manager.css';
import '../src/styles/ui-controls.css';
import '../src/styles/home/loan-video.css';
import '../src/styles/home/logo-studio.css';

export const metadata: Metadata = {
  title: 'Niki',
  icons: {
    icon: '/app-icon.svg?v=20260527',
    // Safari pinned-tab mask icon — Next.js's Metadata API doesn't have a
    // dedicated `mask` field, so we surface it via the generic `other`
    // bucket which renders as a raw <link rel="mask-icon" ...>.
    other: [{
      rel: 'mask-icon',
      url: '/app-icon.svg?v=20260527',
      color: NIKI_POSTER_MASK_ICON_COLOR,
    }],
  },
};

export const viewport: Viewport = {
  themeColor: NIKI_POSTER_THEME_COLOR,
};

/**
 * Critical first-paint styles stay inline so a slow public connection cannot
 * leave mobile users staring at the browser's default white canvas while the
 * hashed application stylesheets download. The full rules in `poster.css`
 * take over as soon as they arrive because every selector here has zero
 * specificity through `:where()`.
 */
const firstPaintStyle = `
:where(html, body) {
  min-height: 100%;
  margin: 0;
  background: var(--poster-bg);
  color: var(--poster-text);
}
:where(.niki-auth, .poster-app) {
  min-height: 100vh;
  min-height: 100dvh;
  background: var(--poster-bg);
  color: var(--poster-text);
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
}
:where(.locale-bootstrap) {
  position: fixed;
  inset: 0;
  display: grid;
  place-items: center;
  min-height: 100vh;
  min-height: 100dvh;
  background: var(--poster-bg);
}
:where(.locale-bootstrap__spinner) {
  display: inline-block;
  box-sizing: border-box;
  width: 18px;
  height: 18px;
  border: 2px solid color-mix(in srgb, var(--poster-mask-dark) 14%, transparent);
  border-top-color: var(--poster-accent);
  border-radius: 50%;
  animation: niki-first-paint-spin 700ms linear infinite;
}
:where(.niki-auth) {
  display: grid;
  place-items: center;
  padding: 24px;
}
:where(.niki-auth__card) {
  width: min(100%, 440px);
  box-sizing: border-box;
  padding: 36px;
  border: 0;
  border-radius: 24px;
  background: var(--poster-panel);
}
:where(.niki-auth__logo) {
  width: 52px;
  height: 52px;
}
:where(.niki-auth h1) {
  margin: 24px 0 10px;
  font-size: 26px;
  line-height: 1.2;
}
:where(.niki-auth__loading) {
  display: flex;
  align-items: center;
  gap: 10px;
}
:where(.niki-auth__spinner) {
  display: inline-block;
  width: 16px;
  height: 16px;
  border: 2px solid color-mix(in srgb, var(--poster-mask-dark) 14%, transparent);
  border-top-color: var(--poster-accent);
  border-radius: 50%;
  animation: niki-first-paint-spin 700ms linear infinite;
}
@keyframes niki-first-paint-spin {
  to { transform: rotate(360deg); }
}
`;

/**
 * Inline script that runs before React hydrates to apply the saved theme
 * preference without a flash of unstyled content. It reads the same
 * localStorage key used by `state/config.ts` and sets `data-theme` on
 * `<html>` immediately — before any CSS or React paint.
 * Keep the accent variable mix ratios in sync with `accentVars()` in
 * `src/state/appearance.ts`; this script cannot import application modules.
 */
const defaultAccentColor = NIKI_POSTER_COLOR_VALUES.accent;
const [legacyAccentColor, legacyAlternateAccentColor] = NIKI_POSTER_LEGACY_ACCENT_COLORS;
const themeInitScript = `(function(){try{var c=JSON.parse(localStorage.getItem('open-design:config')||'{}');var t=c.theme;if(t==='light'||t==='dark')document.documentElement.setAttribute('data-theme',t);var a=typeof c.accentColor==='string'&&/^#[0-9a-fA-F]{6}$/.test(c.accentColor.trim())?c.accentColor.trim().toLowerCase():'${defaultAccentColor}';if(a==='${legacyAccentColor}'||a==='${legacyAlternateAccentColor}')a='${defaultAccentColor}';if(a==='${defaultAccentColor}')return;var s=document.documentElement.style;s.setProperty('--accent',a);s.setProperty('--accent-strong','color-mix(in srgb, '+a+' 86%, var(--text-strong))');s.setProperty('--accent-soft','color-mix(in srgb, '+a+' 22%, var(--bg-panel))');s.setProperty('--accent-tint','color-mix(in srgb, '+a+' 12%, var(--bg-panel))');s.setProperty('--accent-hover','color-mix(in srgb, '+a+' 90%, var(--text-strong))');}catch(e){}})();`;

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang='en' suppressHydrationWarning>
      <head>
        <style
          id='niki-color-tokens'
          dangerouslySetInnerHTML={{ __html: NIKI_POSTER_COLOR_CSS }}
        />
        <style
          id='niki-first-paint'
          dangerouslySetInnerHTML={{ __html: firstPaintStyle }}
        />
        <Script
          id='open-design-theme-init'
          strategy='beforeInteractive'
          dangerouslySetInnerHTML={{ __html: themeInitScript }}
        />
      </head>
      <body suppressHydrationWarning>
        {children}
      </body>
    </html>
  );
}
