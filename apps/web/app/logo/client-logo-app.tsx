'use client';

import { NikiAuthGate } from '../../src/auth/NikiAuth';
import { I18nProvider } from '../../src/i18n';
import { PosterApp } from '../../src/poster/PosterApp';

export function ClientLogoApp() {
  return (
    <NikiAuthGate>
      <I18nProvider defaultLocale="zh-CN" deferUntilClient>
        <PosterApp initialMode="logo" />
      </I18nProvider>
    </NikiAuthGate>
  );
}
