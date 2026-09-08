'use client';

import { NikiAuthGate } from '../src/auth/NikiAuth';
import { I18nProvider } from '../src/i18n';
import { PosterApp } from '../src/poster/PosterApp';

export function ClientPosterApp() {
  return (
    <NikiAuthGate>
      <I18nProvider defaultLocale="zh-CN" deferUntilClient>
        <PosterApp />
      </I18nProvider>
    </NikiAuthGate>
  );
}
