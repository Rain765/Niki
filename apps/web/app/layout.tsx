import type { Metadata, Viewport } from 'next';
import Script from 'next/script';
import type { ReactNode } from 'react';
import '../src/index.css';
import '../src/styles/home/index.css';
import '../src/styles/ndesign-system.css';

export const metadata: Metadata = {
  title: 'Niki',
  icons: {
    icon: '/app-icon.svg?v=20260527',
    // Safari pinned-tab mask icon — Next.js's Metadata API doesn't have a
    // dedicated `mask` field, so we surface it via the generic `other`
    // bucket which renders as a raw <link rel="mask-icon" ...>.
    other: [{ rel: 'mask-icon', url: '/app-icon.svg?v=20260527', color: '#363636' }],
  },
};

export const viewport: Viewport = {
  themeColor: '#08090b',
};

/**
 * Critical first-paint styles stay inline so a slow public connection cannot
 * leave mobile users staring at the browser's default white canvas while the
 * hashed application stylesheets download. The full rules in `src/index.css`
 * take over as soon as they arrive because every selector here has zero
 * specificity through `:where()`.
 */
const firstPaintStyle = `
:where(html, body) {
  min-height: 100%;
  margin: 0;
  background: #08090b;
  color: #f7f7f8;
}
:where(.niki-auth, .locale-bootstrap) {
  min-height: 100vh;
  min-height: 100dvh;
  background: #08090b;
  color: #f7f7f8;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
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
  border: 1px solid #2a2e35;
  border-radius: 24px;
  background: #111318;
}
:where(.niki-auth__logo) {
  width: 52px;
  height: 52px;
}
:where(.niki-auth h1) {
  margin: 24px 0 10px;
  font-size: 30px;
  line-height: 1.2;
}
:where(.niki-auth__loading, .locale-bootstrap) {
  display: flex;
  align-items: center;
  gap: 10px;
}
:where(.locale-bootstrap) {
  justify-content: center;
  flex-direction: column;
  align-items: stretch;
  gap: 22px;
  padding: 24px;
  box-sizing: border-box;
}
:where(.locale-bootstrap__brand) {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
}
:where(.locale-bootstrap__name) {
  font-size: 16px;
  font-weight: 650;
}
:where(.locale-bootstrap__surface) {
  display: grid;
  grid-template-columns: minmax(92px, 18%) minmax(0, 1fr);
  width: min(100%, 760px);
  min-height: min(58vh, 520px);
  margin: 0 auto;
  overflow: hidden;
  border: 1px solid #2a2e35;
  border-radius: 18px;
  background: #111318;
}
:where(.locale-bootstrap__rail) {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 20px 14px;
  border-right: 1px solid #2a2e35;
}
:where(.locale-bootstrap__rail-line, .locale-bootstrap__hero-line, .locale-bootstrap__composer span, .locale-bootstrap__composer b) {
  display: block;
  background: linear-gradient(90deg, #1a1e25 0%, #252a33 50%, #1a1e25 100%);
  background-size: 500px 100%;
  animation: niki-first-paint-shimmer 1.4s linear infinite;
}
:where(.locale-bootstrap__rail-line) {
  width: 100%;
  height: 10px;
  border-radius: 999px;
}
:where(.locale-bootstrap__rail-line.is-title) {
  width: 72%;
  height: 14px;
  margin-bottom: 6px;
}
:where(.locale-bootstrap__rail-line.is-short) { width: 58%; }
:where(.locale-bootstrap__main) {
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
  gap: 12px;
  padding: 26px;
}
:where(.locale-bootstrap__hero-line) {
  width: 58%;
  height: 13px;
  border-radius: 999px;
}
:where(.locale-bootstrap__hero-line.is-title) {
  width: 42%;
  height: 18px;
  margin-bottom: 2px;
}
:where(.locale-bootstrap__hero-line.is-short) { width: 32%; }
:where(.locale-bootstrap__composer) {
  display: flex;
  align-items: center;
  gap: 10px;
  min-height: 46px;
  margin-top: 18px;
  padding: 8px 10px 8px 14px;
  border: 1px solid #2a2e35;
  border-radius: 16px;
}
:where(.locale-bootstrap__composer span) { flex: 1; height: 12px; border-radius: 999px; }
:where(.locale-bootstrap__composer b) { width: 28px; height: 28px; border-radius: 50%; }
@keyframes niki-first-paint-shimmer {
  0% { background-position: -250px 0; }
  100% { background-position: 250px 0; }
}
:where(.locale-bootstrap__logo) {
  width: 32px;
  height: 32px;
}
:where(.niki-auth__spinner, .locale-bootstrap__spinner) {
  display: inline-block;
  width: 16px;
  height: 16px;
  border: 2px solid rgb(255 255 255 / 18%);
  border-top-color: #fe5200;
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
const themeInitScript = `(function(){try{var c=JSON.parse(localStorage.getItem('open-design:config')||'{}');var t=c.theme;if(t==='light'||t==='dark')document.documentElement.setAttribute('data-theme',t);var a=typeof c.accentColor==='string'&&/^#[0-9a-fA-F]{6}$/.test(c.accentColor.trim())?c.accentColor.trim().toLowerCase():'#fe5200';if(a==='#c96442'||a==='#ff5f53')a='#fe5200';if(a==='#fe5200')return;var s=document.documentElement.style;s.setProperty('--accent',a);s.setProperty('--accent-strong','color-mix(in srgb, '+a+' 86%, var(--text-strong))');s.setProperty('--accent-soft','color-mix(in srgb, '+a+' 22%, var(--bg-panel))');s.setProperty('--accent-tint','color-mix(in srgb, '+a+' 12%, var(--bg-panel))');s.setProperty('--accent-hover','color-mix(in srgb, '+a+' 90%, var(--text-strong))');}catch(e){}})();`;

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang='en' suppressHydrationWarning>
      <head>
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
