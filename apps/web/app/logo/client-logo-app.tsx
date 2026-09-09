'use client';

import { NikiAuthGate } from '../../src/auth/NikiAuth';
import { I18nProvider } from '../../src/i18n';
import { PosterApp } from '../../src/poster/PosterApp';

const NIKI_SUPPORTED_LOCALES = ['zh-CN', 'en'] as const;

export function ClientLogoApp() {
  return (
    <I18nProvider
      defaultLocale="zh-CN"
      supportedLocales={NIKI_SUPPORTED_LOCALES}
      deferUntilClient
    >
      <NikiAuthGate>
        <PosterApp initialMode="logo" />
      </NikiAuthGate>
    </I18nProvider>
  );
}
