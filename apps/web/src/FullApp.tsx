'use client';

import { AnalyticsProvider } from './analytics/provider';
import { App } from './App';
import { I18nProvider } from './i18n';
import { NikiAuthGate } from './auth/NikiAuth';

export function FullApp() {
  return (
    <NikiAuthGate>
      <I18nProvider deferUntilClient>
        <AnalyticsProvider>
          <App />
        </AnalyticsProvider>
      </I18nProvider>
    </NikiAuthGate>
  );
}
