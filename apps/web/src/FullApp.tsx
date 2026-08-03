'use client';

import { lazy, Suspense } from 'react';
import { AnalyticsProvider } from './analytics/provider';
import { I18nProvider } from './i18n';
import { NikiAuthGate } from './auth/NikiAuth';

const App = lazy(() => import('./App').then((module) => ({ default: module.App })));

function AppBootstrap() {
  return (
    <div className="locale-bootstrap" role="status" aria-label="正在加载 Niki">
      <div className="locale-bootstrap__brand">
        <img className="locale-bootstrap__logo" src="/logo.svg" alt="" />
        <span className="locale-bootstrap__name">Niki</span>
        <span className="locale-bootstrap__spinner" aria-hidden="true" />
      </div>
      <div className="locale-bootstrap__surface" aria-hidden="true">
        <aside className="locale-bootstrap__rail">
          <span className="locale-bootstrap__rail-line is-title" />
          <span className="locale-bootstrap__rail-line" />
          <span className="locale-bootstrap__rail-line" />
          <span className="locale-bootstrap__rail-line is-short" />
        </aside>
        <main className="locale-bootstrap__main">
          <span className="locale-bootstrap__hero-line is-title" />
          <span className="locale-bootstrap__hero-line" />
          <span className="locale-bootstrap__hero-line is-short" />
          <div className="locale-bootstrap__composer">
            <span />
            <b />
          </div>
        </main>
      </div>
    </div>
  );
}

export function FullApp() {
  return (
    <NikiAuthGate>
      <I18nProvider deferUntilClient>
        <AnalyticsProvider>
          <Suspense fallback={<AppBootstrap />}>
            <App />
          </Suspense>
        </AnalyticsProvider>
      </I18nProvider>
    </NikiAuthGate>
  );
}
