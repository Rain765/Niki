import {
  DEVICE_BRIDGE_PROTOCOL_VERSION,
  type DeviceBridgeDeviceMessage,
  type DeviceBridgeRelayMessage,
  type DeviceBridgeStatusResponse,
  type RelayRegisterDeviceRequest,
  type RelayRegisterDeviceResponse,
  type StartDevicePairingRequest,
  type StartDevicePairingResponse,
} from '@open-design/contracts';
import { generateKeyPairSync, randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { WebSocket } from 'ws';

const HEARTBEAT_INTERVAL_MS = 15_000;
const RECONNECT_MAX_DELAY_MS = 30_000;

interface StoredDeviceBridgeConfig {
  protocolVersion: typeof DEVICE_BRIDGE_PROTOCOL_VERSION;
  deviceId: string;
  deviceName: string;
  platform: string;
  publicKey: string;
  privateKey: string;
  relayUrl?: string;
  websocketUrl?: string;
  deviceToken?: string;
}

export interface DeviceBridgeService {
  status: () => DeviceBridgeStatusResponse;
  pair: (request: StartDevicePairingRequest) => Promise<StartDevicePairingResponse>;
  disconnect: () => Promise<DeviceBridgeStatusResponse>;
  stop: () => Promise<void>;
}

function bridgeFile(dataDir: string): string {
  return path.join(dataDir, 'device-bridge.json');
}

function normalizeRelayUrl(value: string): string {
  const url = new URL(value.trim());
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('Relay URL must use http:// or https://.');
  }
  url.pathname = url.pathname.replace(/\/+$/, '');
  url.search = '';
  url.hash = '';
  return url.toString().replace(/\/$/, '');
}

function createIdentity(deviceName?: string): StoredDeviceBridgeConfig {
  const pair = generateKeyPairSync('ed25519');
  return {
    protocolVersion: DEVICE_BRIDGE_PROTOCOL_VERSION,
    deviceId: randomUUID(),
    deviceName: deviceName?.trim().slice(0, 80) || os.hostname(),
    platform: process.platform,
    publicKey: pair.publicKey.export({ type: 'spki', format: 'pem' }).toString(),
    privateKey: pair.privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
  };
}

async function readIdentity(dataDir: string): Promise<StoredDeviceBridgeConfig> {
  try {
    const parsed = JSON.parse(await readFile(bridgeFile(dataDir), 'utf8')) as StoredDeviceBridgeConfig;
    if (
      parsed.protocolVersion === DEVICE_BRIDGE_PROTOCOL_VERSION &&
      parsed.deviceId &&
      parsed.publicKey &&
      parsed.privateKey
    ) {
      return parsed;
    }
  } catch {
    // First launch or invalid legacy data: create a fresh local identity.
  }
  const identity = createIdentity();
  await writeIdentity(dataDir, identity);
  return identity;
}

async function writeIdentity(
  dataDir: string,
  identity: StoredDeviceBridgeConfig,
): Promise<void> {
  await mkdir(dataDir, { recursive: true });
  const file = bridgeFile(dataDir);
  const temp = `${file}.${randomUUID()}.tmp`;
  await writeFile(temp, `${JSON.stringify(identity, null, 2)}\n`, { mode: 0o600 });
  await rename(temp, file);
}

export async function createDeviceBridgeService(
  dataDir: string,
): Promise<DeviceBridgeService> {
  let identity = await readIdentity(dataDir);
  let socket: WebSocket | null = null;
  let heartbeat: NodeJS.Timeout | null = null;
  let reconnect: NodeJS.Timeout | null = null;
  let reconnectAttempt = 0;
  let stopped = false;
  let state: DeviceBridgeStatusResponse['state'] = identity.deviceToken
    ? 'connecting'
    : 'unpaired';
  let lastSeenAt: number | null = null;
  let lastError: string | null = null;
  let pairCode: string | null = null;
  let pairCodeExpiresAt: number | null = null;

  const clearTimers = () => {
    if (heartbeat) clearInterval(heartbeat);
    if (reconnect) clearTimeout(reconnect);
    heartbeat = null;
    reconnect = null;
  };

  const currentStatus = (): DeviceBridgeStatusResponse => ({
    protocolVersion: DEVICE_BRIDGE_PROTOCOL_VERSION,
    state,
    relayUrl: identity.relayUrl ?? null,
    device: {
      id: identity.deviceId,
      name: identity.deviceName,
      platform: identity.platform,
      state: state === 'online' ? 'online' : 'offline',
      lastSeenAt,
    },
    pairCode,
    pairCodeExpiresAt,
    error: lastError,
  });

  const send = (message: DeviceBridgeDeviceMessage) => {
    if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message));
  };

  const scheduleReconnect = () => {
    if (stopped || !identity.websocketUrl || !identity.deviceToken || reconnect) return;
    const delay = Math.min(1_000 * 2 ** reconnectAttempt, RECONNECT_MAX_DELAY_MS);
    reconnectAttempt += 1;
    reconnect = setTimeout(() => {
      reconnect = null;
      connect();
    }, delay);
    reconnect.unref();
  };

  const connect = () => {
    if (stopped || !identity.websocketUrl || !identity.deviceToken) return;
    clearTimers();
    state = 'connecting';
    lastError = null;
    socket = new WebSocket(identity.websocketUrl);
    socket.on('open', () => {
      reconnectAttempt = 0;
      lastSeenAt = Date.now();
      send({
        type: 'device.hello',
        protocolVersion: DEVICE_BRIDGE_PROTOCOL_VERSION,
        deviceId: identity.deviceId,
      });
      heartbeat = setInterval(() => {
        send({ type: 'device.heartbeat', sentAt: Date.now() });
      }, HEARTBEAT_INTERVAL_MS);
      heartbeat.unref();
    });
    socket.on('message', (raw) => {
      let message: DeviceBridgeRelayMessage;
      try {
        message = JSON.parse(raw.toString()) as DeviceBridgeRelayMessage;
      } catch {
        lastError = 'Relay returned an invalid message.';
        return;
      }
      if (message.type === 'relay.ready') {
        state = 'online';
        lastSeenAt = Date.now();
        return;
      }
      if (message.type === 'relay.status') {
        pairCode = null;
        pairCodeExpiresAt = null;
        lastSeenAt = message.device.lastSeenAt;
        return;
      }
      if (message.type === 'relay.ping') {
        const receivedAt = Date.now();
        lastSeenAt = receivedAt;
        send({
          type: 'device.pong',
          requestId: message.requestId,
          sentAt: message.sentAt,
          receivedAt,
        });
        return;
      }
      if (message.type === 'relay.error') lastError = message.message;
    });
    socket.on('close', () => {
      socket = null;
      if (heartbeat) clearInterval(heartbeat);
      heartbeat = null;
      if (!stopped && identity.deviceToken) {
        state = 'offline';
        scheduleReconnect();
      }
    });
    socket.on('error', (error) => {
      lastError = error.message;
      state = 'error';
    });
  };

  const pair = async (
    request: StartDevicePairingRequest,
  ): Promise<StartDevicePairingResponse> => {
    const relayUrl = normalizeRelayUrl(request.relayUrl);
    const deviceName = request.deviceName?.trim().slice(0, 80) || identity.deviceName;
    const body: RelayRegisterDeviceRequest = {
      protocolVersion: DEVICE_BRIDGE_PROTOCOL_VERSION,
      deviceId: identity.deviceId,
      deviceName,
      platform: identity.platform,
      publicKey: identity.publicKey,
    };
    const response = await fetch(`${relayUrl}/v1/devices/register`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      throw new Error(`Relay registration failed (${response.status}).`);
    }
    const registration = (await response.json()) as RelayRegisterDeviceResponse;
    if (
      registration.protocolVersion !== DEVICE_BRIDGE_PROTOCOL_VERSION ||
      !registration.deviceToken ||
      !registration.websocketUrl
    ) {
      throw new Error('Relay registration returned an incompatible response.');
    }

    identity = {
      ...identity,
      deviceName,
      relayUrl,
      websocketUrl: registration.websocketUrl,
      deviceToken: registration.deviceToken,
    };
    await writeIdentity(dataDir, identity);
    pairCode = registration.pairCode;
    pairCodeExpiresAt = registration.pairCodeExpiresAt;
    stopped = false;
    socket?.close(1000, 'new pairing');
    connect();

    return {
      ...currentStatus(),
      pairCode: registration.pairCode,
      pairCodeExpiresAt: registration.pairCodeExpiresAt,
    };
  };

  const disconnect = async (): Promise<DeviceBridgeStatusResponse> => {
    clearTimers();
    socket?.close(1000, 'device disconnected');
    socket = null;
    identity = createIdentity(identity.deviceName);
    await writeIdentity(dataDir, identity);
    state = 'unpaired';
    lastSeenAt = null;
    lastError = null;
    pairCode = null;
    pairCodeExpiresAt = null;
    return currentStatus();
  };

  if (identity.deviceToken && identity.websocketUrl) connect();

  return {
    status: currentStatus,
    pair,
    disconnect,
    stop: async () => {
      stopped = true;
      clearTimers();
      if (socket) {
        await new Promise<void>((resolve) => {
          const timeout = setTimeout(resolve, 500);
          socket?.once('close', () => {
            clearTimeout(timeout);
            resolve();
          });
          socket?.close(1000, 'daemon shutdown');
        });
      }
      socket = null;
    },
  };
}
