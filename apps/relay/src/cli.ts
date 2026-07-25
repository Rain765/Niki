#!/usr/bin/env node

import { createRelayServer } from './server.js';

const port = Number(process.env.PORT ?? process.env.NIKI_RELAY_PORT ?? 18765);
const host = process.env.NIKI_RELAY_HOST ?? '0.0.0.0';
const allowedOrigins = (process.env.NIKI_RELAY_ALLOWED_ORIGINS ?? '')
  .split(',')
  .map((value) => value.trim())
  .filter(Boolean);
const publicUrl =
  process.env.NIKI_RELAY_PUBLIC_URL ??
  process.env.RENDER_EXTERNAL_URL ??
  (process.env.RAILWAY_PUBLIC_DOMAIN
    ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}`
    : undefined);
const dataFile = process.env.NIKI_RELAY_DATA_FILE;

if (process.env.NODE_ENV === 'production' && allowedOrigins.length === 0) {
  throw new Error('NIKI_RELAY_ALLOWED_ORIGINS is required in production.');
}

const relay = await createRelayServer({
  host,
  port,
  allowedOrigins,
  ...(publicUrl ? { publicUrl } : {}),
  ...(dataFile ? { dataFile } : {}),
});
console.log(`[niki-relay] listening on ${relay.url}`);

const shutdown = async () => {
  await relay.close();
  process.exit(0);
};

process.once('SIGINT', () => void shutdown());
process.once('SIGTERM', () => void shutdown());
