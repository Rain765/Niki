import { describe, expect, it } from 'vitest';

import {
  readPosthogConfig,
  readPublicConfigResponse,
} from '../src/analytics.js';

describe('legacy PostHog configuration', () => {
  it('stays disabled by default even when a key is present', () => {
    expect(readPosthogConfig({ POSTHOG_KEY: 'phc_test' })).toBeNull();
    expect(readPublicConfigResponse({ POSTHOG_KEY: 'phc_test' })).toEqual({
      enabled: false,
      key: null,
      host: null,
    });
  });

  it('can be enabled explicitly for local smoke tests', () => {
    expect(
      readPosthogConfig({
        NIKI_ENABLE_LEGACY_TELEMETRY: 'true',
        POSTHOG_KEY: 'phc_test',
        POSTHOG_HOST: 'https://example.test///',
      }),
    ).toEqual({
      key: 'phc_test',
      host: 'https://example.test',
    });
  });
});
