'use client';

import { NikiAuthGate } from '../src/auth/NikiAuth';
import { I18nProvider } from '../src/i18n';
import { PosterApp } from '../src/poster/PosterApp';

const NIKI_SUPPORTED_LOCALES = ['zh-CN', 'en'] as const;

export function ClientPosterApp() {
  return (
    <I18nProvider
      defaultLocale="zh-CN"
      supportedLocales={NIKI_SUPPORTED_LOCALES}
      deferUntilClient
    >
      <NikiAuthGate>
        <PosterApp />
      </NikiAuthGate>
    </I18nProvider>
  );
}
