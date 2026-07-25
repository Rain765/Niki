import {
  DEVICE_BRIDGE_PROTOCOL_VERSION,
  type DeviceBridgeBrowserMessage,
  type DeviceBridgeDevice,
  type DeviceBridgeDeviceMessage,
  type DeviceBridgeRelayMessage,
  type RelayClaimPairingRequest,
  type RelayClaimPairingResponse,
  type RelayRegisterDeviceRequest,
  type RelayRegisterDeviceResponse,
} from '@open-design/contracts';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import path from 'node:path';
import { WebSocket, WebSocketServer } from 'ws';

const PAIR_CODE_TTL_MS = 10 * 60_000;
const DEVICE_OFFLINE_AFTER_MS = 30_000;
const PING_TIMEOUT_MS = 15_000;
const CLAIM_WINDOW_MS = 60_000;
const CLAIM_ATTEMPT_LIMIT = 10;

interface DeviceRecord {
  id: string;
  name: string;
  platform: string;
  publicKey: string;
  deviceTokenHash: Buffer;
  pairCode: string | null;
  pairCodeExpiresAt: number | null;
  socket: WebSocket | null;
  lastSeenAt: number | null;
  browserTokens: Set<string>;
}

interface BrowserSession {
  tokenHash: Buffer;
  deviceId: string;
}

interface PendingPing {
  socket: WebSocket;
  sentAt: number;
  timeout: NodeJS.Timeout;
}

interface PersistedDeviceRecord {
  id: string;
  name: string;
  platform: string;
  publicKey: string;
  deviceTokenHash: string;
  pairCode: string | null;
  pairCodeExpiresAt: number | null;
  browserTokens: string[];
}

interface PersistedBrowserSession {
  tokenHash: string;
  deviceId: string;
}

interface PersistedRelayState {
  protocolVersion: typeof DEVICE_BRIDGE_PROTOCOL_VERSION;
  devices: PersistedDeviceRecord[];
  browserSessions: PersistedBrowserSession[];
}

export interface RelayServerOptions {
  host?: string;
  port?: number;
  allowedOrigins?: string[];
  dataFile?: string;
  publicUrl?: string;
  now?: () => number;
}

export interface RelayServer {
  url: string;
  close: () => Promise<void>;
}

function token(): string {
  return randomBytes(32).toString('base64url');
}

function tokenHash(value: string): Buffer {
  return createHash('sha256').update(value).digest();
}

function tokenMatches(value: string, expected: Buffer): boolean {
  const actual = tokenHash(value);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

function normalizePublicUrl(value: string | undefined): URL | null {
  if (!value) return null;
  const url = new URL(value.trim());
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('Relay public URL must use http:// or https://.');
  }
  url.pathname = url.pathname.replace(/\/+$/, '');
  url.search = '';
  url.hash = '';
  return url;
}

async function readPersistedState(
  dataFile: string | undefined,
): Promise<PersistedRelayState | null> {
  if (!dataFile) return null;
  try {
    const parsed = JSON.parse(await readFile(dataFile, 'utf8')) as PersistedRelayState;
    if (
      parsed.protocolVersion !== DEVICE_BRIDGE_PROTOCOL_VERSION ||
      !Array.isArray(parsed.devices) ||
      !Array.isArray(parsed.browserSessions)
    ) {
      throw new Error('Relay state uses an incompatible protocol version.');
    }
    return parsed;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw error;
  }
}

async function writePersistedState(
  dataFile: string,
  state: PersistedRelayState,
): Promise<void> {
  await mkdir(path.dirname(dataFile), { recursive: true });
  const temporaryFile = `${dataFile}.${process.pid}.${randomBytes(6).toString('hex')}.tmp`;
  await writeFile(temporaryFile, `${JSON.stringify(state, null, 2)}\n`, { mode: 0o600 });
  await rename(temporaryFile, dataFile);
}

function pairingCode(existingCodes: Set<string>): string {
  for (;;) {
    const code = String(randomBytes(4).readUInt32BE(0) % 1_000_000).padStart(6, '0');
    if (!existingCodes.has(code)) return code;
  }
}

function isOpen(socket: WebSocket | null): socket is WebSocket {
  return socket?.readyState === WebSocket.OPEN;
}

function send(socket: WebSocket | null, message: DeviceBridgeRelayMessage): void {
  if (isOpen(socket)) socket.send(JSON.stringify(message));
}

function json(
  res: ServerResponse,
  status: number,
  body: unknown,
  origin: string | undefined,
): void {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  if (origin) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  }
  res.end(JSON.stringify(body));
}

async function readJson<T>(req: IncomingMessage): Promise<T> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > 64 * 1024) throw new Error('request body too large');
    chunks.push(buffer);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8')) as T;
}

function publicWebSocketUrl(
  req: IncomingMessage,
  routePath: string,
  configuredPublicUrl: URL | null,
): string {
  if (configuredPublicUrl) {
    const websocketUrl = new URL(configuredPublicUrl);
    const routeUrl = new URL(routePath, 'http://relay.local');
    websocketUrl.protocol = configuredPublicUrl.protocol === 'https:' ? 'wss:' : 'ws:';
    websocketUrl.pathname =
      `${configuredPublicUrl.pathname.replace(/\/+$/, '')}${routeUrl.pathname}`;
    websocketUrl.search = routeUrl.search;
    return websocketUrl.toString();
  }
  const forwardedProtocol = req.headers['x-forwarded-proto'];
  const secure =
    (Array.isArray(forwardedProtocol) ? forwardedProtocol[0] : forwardedProtocol) === 'https';
  return `${secure ? 'wss' : 'ws'}://${req.headers.host ?? '127.0.0.1'}${routePath}`;
}

function deviceSummary(record: DeviceRecord, now: number): DeviceBridgeDevice {
  const online =
    isOpen(record.socket) &&
    record.lastSeenAt !== null &&
    now - record.lastSeenAt <= DEVICE_OFFLINE_AFTER_MS;
  return {
    id: record.id,
    name: record.name,
    platform: record.platform,
    state: online ? 'online' : 'offline',
    lastSeenAt: record.lastSeenAt,
  };
}

export async function createRelayServer(
  options: RelayServerOptions = {},
): Promise<RelayServer> {
  const host = options.host ?? '127.0.0.1';
  const port = options.port ?? 18765;
  const allowedOrigins = new Set(options.allowedOrigins ?? []);
  const configuredPublicUrl = normalizePublicUrl(options.publicUrl);
  const now = options.now ?? Date.now;
  const devices = new Map<string, DeviceRecord>();
  const browserSessions = new Map<string, BrowserSession>();
  const browserSockets = new Map<string, Set<WebSocket>>();
  const pendingPings = new Map<string, PendingPing>();
  const claimAttempts = new Map<string, number[]>();
  const websocketServer = new WebSocketServer({ noServer: true });
  let persistQueue = Promise.resolve();

  const restored = await readPersistedState(options.dataFile);
  for (const item of restored?.devices ?? []) {
    devices.set(item.id, {
      id: item.id,
      name: item.name,
      platform: item.platform,
      publicKey: item.publicKey,
      deviceTokenHash: Buffer.from(item.deviceTokenHash, 'hex'),
      pairCode: item.pairCode,
      pairCodeExpiresAt: item.pairCodeExpiresAt,
      socket: null,
      lastSeenAt: null,
      browserTokens: new Set(item.browserTokens),
    });
  }
  for (const item of restored?.browserSessions ?? []) {
    browserSessions.set(item.tokenHash, {
      tokenHash: Buffer.from(item.tokenHash, 'hex'),
      deviceId: item.deviceId,
    });
  }

  const persist = async (): Promise<void> => {
    if (!options.dataFile) return;
    persistQueue = persistQueue.catch(() => undefined).then(() =>
      writePersistedState(options.dataFile as string, {
        protocolVersion: DEVICE_BRIDGE_PROTOCOL_VERSION,
        devices: [...devices.values()].map((record) => ({
          id: record.id,
          name: record.name,
          platform: record.platform,
          publicKey: record.publicKey,
          deviceTokenHash: record.deviceTokenHash.toString('hex'),
          pairCode: record.pairCode,
          pairCodeExpiresAt: record.pairCodeExpiresAt,
          browserTokens: [...record.browserTokens],
        })),
        browserSessions: [...browserSessions.entries()].map(([tokenKey, session]) => ({
          tokenHash: tokenKey,
          deviceId: session.deviceId,
        })),
      }),
    );
    await persistQueue;
  };

  const allowedOrigin = (req: IncomingMessage): string | undefined => {
    const origin = req.headers.origin;
    if (!origin) return undefined;
    if (allowedOrigins.size === 0 || allowedOrigins.has(origin)) return origin;
    return undefined;
  };

  const isOriginRejected = (req: IncomingMessage): boolean =>
    Boolean(req.headers.origin) && !allowedOrigin(req);

  const notifyBrowsers = (record: DeviceRecord): void => {
    const message: DeviceBridgeRelayMessage = {
      type: 'relay.status',
      device: deviceSummary(record, now()),
    };
    for (const browserToken of record.browserTokens) {
      for (const socket of browserSockets.get(browserToken) ?? []) {
        send(socket, message);
      }
    }
  };

  const server = createServer(async (req, res) => {
    const origin = allowedOrigin(req);
    if (req.method === 'OPTIONS') {
      if (isOriginRejected(req)) {
        json(res, 403, { error: 'origin_not_allowed' }, undefined);
        return;
      }
      res.statusCode = 204;
      if (origin) {
        res.setHeader('Access-Control-Allow-Origin', origin);
        res.setHeader('Vary', 'Origin');
      }
      res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      res.end();
      return;
    }
    if (isOriginRejected(req)) {
      json(res, 403, { error: 'origin_not_allowed' }, undefined);
      return;
    }

    const url = new URL(req.url ?? '/', `http://${req.headers.host ?? '127.0.0.1'}`);
    try {
      if (req.method === 'GET' && url.pathname === '/health') {
        json(res, 200, { ok: true, protocolVersion: DEVICE_BRIDGE_PROTOCOL_VERSION }, origin);
        return;
      }

      if (req.method === 'POST' && url.pathname === '/v1/devices/register') {
        const body = await readJson<RelayRegisterDeviceRequest>(req);
        if (
          body.protocolVersion !== DEVICE_BRIDGE_PROTOCOL_VERSION ||
          typeof body.deviceId !== 'string' ||
          !body.deviceId ||
          typeof body.deviceName !== 'string' ||
          !body.deviceName ||
          typeof body.platform !== 'string' ||
          typeof body.publicKey !== 'string'
        ) {
          json(res, 400, { error: 'invalid_registration' }, origin);
          return;
        }

        const activeCodes = new Set(
          [...devices.values()]
            .filter((item) => item.pairCode && (item.pairCodeExpiresAt ?? 0) > now())
            .map((item) => item.pairCode as string),
        );
        const code = pairingCode(activeCodes);
        const deviceToken = token();
        const pairCodeExpiresAt = now() + PAIR_CODE_TTL_MS;
        const record: DeviceRecord = {
          id: body.deviceId,
          name: body.deviceName.slice(0, 80),
          platform: body.platform.slice(0, 40),
          publicKey: body.publicKey,
          deviceTokenHash: tokenHash(deviceToken),
          pairCode: code,
          pairCodeExpiresAt,
          socket: devices.get(body.deviceId)?.socket ?? null,
          lastSeenAt: devices.get(body.deviceId)?.lastSeenAt ?? null,
          browserTokens: devices.get(body.deviceId)?.browserTokens ?? new Set(),
        };
        devices.set(record.id, record);
        await persist();

        const response: RelayRegisterDeviceResponse = {
          protocolVersion: DEVICE_BRIDGE_PROTOCOL_VERSION,
          deviceToken,
          pairCode: code,
          pairCodeExpiresAt,
          websocketUrl: publicWebSocketUrl(
            req,
            `/v1/device?deviceId=${encodeURIComponent(record.id)}&token=${encodeURIComponent(deviceToken)}`,
            configuredPublicUrl,
          ),
        };
        json(res, 201, response, origin);
        return;
      }

      if (req.method === 'POST' && url.pathname === '/v1/pair/claim') {
        const clientKey = req.socket.remoteAddress ?? 'unknown';
        const recent = (claimAttempts.get(clientKey) ?? []).filter(
          (timestamp) => now() - timestamp < CLAIM_WINDOW_MS,
        );
        recent.push(now());
        claimAttempts.set(clientKey, recent);
        if (recent.length > CLAIM_ATTEMPT_LIMIT) {
          json(res, 429, { error: 'too_many_attempts' }, origin);
          return;
        }

        const body = await readJson<RelayClaimPairingRequest>(req);
        const normalizedCode = String(body.code ?? '').replace(/\D/g, '');
        const record = [...devices.values()].find(
          (item) =>
            item.pairCode === normalizedCode &&
            (item.pairCodeExpiresAt ?? 0) > now(),
        );
        if (!record) {
          json(res, 401, { error: 'invalid_or_expired_code' }, origin);
          return;
        }

        const browserToken = token();
        const browserTokenHash = tokenHash(browserToken);
        browserSessions.set(browserTokenHash.toString('hex'), {
          tokenHash: browserTokenHash,
          deviceId: record.id,
        });
        record.browserTokens.add(browserTokenHash.toString('hex'));
        record.pairCode = null;
        record.pairCodeExpiresAt = null;
        await persist();
        if (isOpen(record.socket)) {
          send(record.socket, {
            type: 'relay.status',
            device: deviceSummary(record, now()),
          });
        }

        const response: RelayClaimPairingResponse = {
          protocolVersion: DEVICE_BRIDGE_PROTOCOL_VERSION,
          browserToken,
          websocketUrl: publicWebSocketUrl(
            req,
            `/v1/browser?token=${encodeURIComponent(browserToken)}`,
            configuredPublicUrl,
          ),
          device: deviceSummary(record, now()),
        };
        json(res, 200, response, origin);
        return;
      }

      if (req.method === 'GET' && url.pathname === '/v1/session') {
        const bearer = req.headers.authorization?.replace(/^Bearer\s+/i, '') ?? '';
        const session = browserSessions.get(tokenHash(bearer).toString('hex'));
        const record = session ? devices.get(session.deviceId) : null;
        if (!session || !record || !tokenMatches(bearer, session.tokenHash)) {
          json(res, 401, { error: 'unauthorized' }, origin);
          return;
        }
        json(res, 200, { device: deviceSummary(record, now()) }, origin);
        return;
      }

      json(res, 404, { error: 'not_found' }, origin);
    } catch (error) {
      json(
        res,
        400,
        { error: error instanceof Error ? error.message : String(error) },
        origin,
      );
    }
  });

  server.on('upgrade', (req, socket, head) => {
    if (isOriginRejected(req)) {
      socket.write('HTTP/1.1 403 Forbidden\r\n\r\n');
      socket.destroy();
      return;
    }
    const url = new URL(req.url ?? '/', `http://${req.headers.host ?? '127.0.0.1'}`);
    if (url.pathname !== '/v1/device' && url.pathname !== '/v1/browser') {
      socket.write('HTTP/1.1 404 Not Found\r\n\r\n');
      socket.destroy();
      return;
    }
    websocketServer.handleUpgrade(req, socket, head, (ws) => {
      websocketServer.emit('connection', ws, req);
    });
  });

  websocketServer.on('connection', (socket, req) => {
    const url = new URL(req.url ?? '/', `http://${req.headers.host ?? '127.0.0.1'}`);
    if (url.pathname === '/v1/device') {
      const deviceId = url.searchParams.get('deviceId') ?? '';
      const deviceToken = url.searchParams.get('token') ?? '';
      const record = devices.get(deviceId);
      if (!record || !tokenMatches(deviceToken, record.deviceTokenHash)) {
        socket.close(1008, 'unauthorized');
        return;
      }

      record.socket?.close(1000, 'replaced');
      record.socket = socket;
      record.lastSeenAt = now();
      send(socket, {
        type: 'relay.ready',
        protocolVersion: DEVICE_BRIDGE_PROTOCOL_VERSION,
      });
      notifyBrowsers(record);

      socket.on('message', (raw) => {
        let message: DeviceBridgeDeviceMessage;
        try {
          message = JSON.parse(raw.toString()) as DeviceBridgeDeviceMessage;
        } catch {
          send(socket, {
            type: 'relay.error',
            code: 'invalid_message',
            message: 'Expected JSON message.',
          });
          return;
        }
        if (message.type === 'device.hello' || message.type === 'device.heartbeat') {
          record.lastSeenAt = now();
          notifyBrowsers(record);
          return;
        }
        if (message.type === 'device.pong') {
          record.lastSeenAt = now();
          const pending = pendingPings.get(message.requestId);
          if (!pending) return;
          clearTimeout(pending.timeout);
          pendingPings.delete(message.requestId);
          send(pending.socket, {
            type: 'relay.pong',
            requestId: message.requestId,
            sentAt: pending.sentAt,
            deviceReceivedAt: message.receivedAt,
            relayReceivedAt: now(),
          });
          notifyBrowsers(record);
          return;
        }
        send(socket, {
          type: 'relay.error',
          code: 'invalid_message',
          message: 'Message type is not allowed.',
        });
      });
      socket.on('close', () => {
        if (record.socket === socket) {
          record.socket = null;
          notifyBrowsers(record);
        }
      });
      return;
    }

    const browserToken = url.searchParams.get('token') ?? '';
    const browserTokenHash = tokenHash(browserToken);
    const tokenKey = browserTokenHash.toString('hex');
    const session = browserSessions.get(tokenKey);
    const record = session ? devices.get(session.deviceId) : null;
    if (!session || !record || !tokenMatches(browserToken, session.tokenHash)) {
      socket.close(1008, 'unauthorized');
      return;
    }

    const sockets = browserSockets.get(tokenKey) ?? new Set<WebSocket>();
    sockets.add(socket);
    browserSockets.set(tokenKey, sockets);
    send(socket, {
      type: 'relay.ready',
      protocolVersion: DEVICE_BRIDGE_PROTOCOL_VERSION,
    });
    send(socket, { type: 'relay.status', device: deviceSummary(record, now()) });

    socket.on('message', (raw) => {
      let message: DeviceBridgeBrowserMessage;
      try {
        message = JSON.parse(raw.toString()) as DeviceBridgeBrowserMessage;
      } catch {
        send(socket, {
          type: 'relay.error',
          code: 'invalid_message',
          message: 'Expected JSON message.',
        });
        return;
      }
      if (message.type === 'browser.hello') {
        send(socket, { type: 'relay.status', device: deviceSummary(record, now()) });
        return;
      }
      if (message.type !== 'browser.ping') {
        send(socket, {
          type: 'relay.error',
          code: 'invalid_message',
          message: 'Message type is not allowed.',
        });
        return;
      }
      if (!isOpen(record.socket)) {
        send(socket, {
          type: 'relay.error',
          code: 'device_offline',
          message: 'The device is offline.',
          requestId: message.requestId,
        });
        return;
      }
      const timeout = setTimeout(() => {
        pendingPings.delete(message.requestId);
        send(socket, {
          type: 'relay.error',
          code: 'timeout',
          message: 'The device did not respond in time.',
          requestId: message.requestId,
        });
      }, PING_TIMEOUT_MS);
      pendingPings.set(message.requestId, {
        socket,
        sentAt: message.sentAt,
        timeout,
      });
      send(record.socket, {
        type: 'relay.ping',
        requestId: message.requestId,
        sentAt: message.sentAt,
      });
    });
    socket.on('close', () => {
      sockets.delete(socket);
      if (sockets.size === 0) browserSockets.delete(tokenKey);
    });
  });

  const sweep = setInterval(() => {
    for (const record of devices.values()) {
      if (
        isOpen(record.socket) &&
        record.lastSeenAt !== null &&
        now() - record.lastSeenAt > DEVICE_OFFLINE_AFTER_MS
      ) {
        record.socket.terminate();
        record.socket = null;
        notifyBrowsers(record);
      }
    }
  }, 5_000);
  sweep.unref();

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, resolve);
  });
  const address = server.address() as AddressInfo;
  const url = `http://${host}:${address.port}`;

  return {
    url,
    close: async () => {
      clearInterval(sweep);
      for (const pending of pendingPings.values()) clearTimeout(pending.timeout);
      for (const record of devices.values()) record.socket?.close(1001, 'server shutdown');
      for (const sockets of browserSockets.values()) {
        for (const socket of sockets) socket.close(1001, 'server shutdown');
      }
      websocketServer.close();
      await persistQueue;
      await new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      });
    },
  };
}
