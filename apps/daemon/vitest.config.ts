import { defineConfig } from 'vitest/config';

export default defineConfig({
  server: {
    // Keep the test runner independent from machines whose localhost DNS
    // entry is unavailable while the loopback address remains healthy.
    host: '127.0.0.1',
  },
  test: {
    environment: 'node',
    // These suites mutate process-wide env/PATH and bind real local servers.
    // Keep files serial so fake agent binaries stay scoped to their tests.
    fileParallelism: false,
    include: ['tests/**/*.test.{ts,tsx,js,mjs,cjs}'],
    setupFiles: ['tests/setup.ts'],
    testTimeout: 20_000,
  },
});
