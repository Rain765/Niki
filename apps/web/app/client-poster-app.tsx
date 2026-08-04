'use client';

import { NikiAuthGate } from '../src/auth/NikiAuth';
import { PosterApp } from '../src/poster/PosterApp';

export function ClientPosterApp() {
  return (
    <NikiAuthGate>
      <PosterApp />
    </NikiAuthGate>
  );
}
