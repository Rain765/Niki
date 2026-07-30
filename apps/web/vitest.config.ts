import { defineConfig } from 'vitest/config';

export default defineConfig({
  server: {
    // Keep the test runner independent from the machine's localhost DNS
    // entry. Some managed macOS environments intentionally expose an empty
    // /etc/hosts file, while the loopback address itself remains available.
    host: '127.0.0.1',
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.{ts,tsx}'],
  },
});
