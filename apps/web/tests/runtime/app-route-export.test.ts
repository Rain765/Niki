import { describe, expect, it } from 'vitest';
import nextConfig, { DEV_NO_STORE_HEADERS } from '../../next.config';
import * as spaShellRoute from '../../app/[[...slug]]/page';

describe('SPA shell export route', () => {
  it('stays compatible with static export builds', () => {
    expect(nextConfig.output).toBe('export');
    expect('dynamicParams' in spaShellRoute).toBe(false);
    expect(spaShellRoute.generateStaticParams()).toEqual([{ slug: [] }]);
  });

  it('prevents the public development shell from being shared-cached', () => {
    expect(DEV_NO_STORE_HEADERS).toEqual([
      {
        source: '/:path*',
        headers: [
          {
            key: 'Cache-Control',
            value: 'no-store, no-cache, must-revalidate, proxy-revalidate',
          },
        ],
      },
    ]);
  });
});
