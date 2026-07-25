import {
  DEVICE_BRIDGE_PROTOCOL_VERSION,
  type RelayClaimPairingResponse,
  type RelayRegisterDeviceResponse,
} from '@open-design/contracts';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { WebSocket } from 'ws';
import { createRelayServer, type RelayServer } from '../src/server.js';

let relay: RelayServer | null = null;
let temporaryDirectory: string | null = null;

afterEach(async () => {
  await relay?.close();
  relay = null;
  if (temporaryDirectory) {
    await rm(temporaryDirectory, { recursive: true, force: true });
    temporaryDirectory = null;
  }
});

function waitForMessage<T>(socket: WebSocket, type: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(`Timed out waiting for ${type}`)), 2_000);
    socket.on('message', (raw) => {
      const message = JSON.parse(raw.toString()) as { type?: string };
      if (message.type !== type) return;
      clearTimeout(timeout);
      resolve(message as T);
    });
  });
}

describe('device relay', () => {
  it('pairs one browser and relays ping/pong without command messages', async () => {
    relay = await createRelayServer({ port: 0 });
    const registration = await fetch(`${relay.url}/v1/devices/register`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        protocolVersion: DEVICE_BRIDGE_PROTOCOL_VERSION,
        deviceId: 'device-1',
        deviceName: 'Test Mac',
        platform: 'darwin',
        publicKey: 'test-public-key',
      }),
    }).then((response) => response.json() as Promise<RelayRegisterDeviceResponse>);

    const device = new WebSocket(registration.websocketUrl);
    await waitForMessage(device, 'relay.ready');

    const claimResponse = await fetch(`${relay.url}/v1/pair/claim`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ code: registration.pairCode }),
    });
    expect(claimResponse.status).toBe(200);
    const claim = (await claimResponse.json()) as RelayClaimPairingResponse;

    const browser = new WebSocket(claim.websocketUrl);
    await waitForMessage(browser, 'relay.ready');
    const status = waitForMessage(browser, 'relay.status');
    browser.send(
      JSON.stringify({
        type: 'browser.hello',
        protocolVersion: DEVICE_BRIDGE_PROTOCOL_VERSION,
      }),
    );
    await status;

    device.on('message', (raw) => {
      const message = JSON.parse(raw.toString()) as {
        type?: string;
        requestId?: string;
        sentAt?: number;
      };
      if (message.type !== 'relay.ping' || !message.requestId || !message.sentAt) return;
      device.send(
        JSON.stringify({
          type: 'device.pong',
          requestId: message.requestId,
          sentAt: message.sentAt,
          receivedAt: Date.now(),
        }),
      );
    });

    const pong = waitForMessage<{ requestId: string }>(browser, 'relay.pong');
    browser.send(
      JSON.stringify({
        type: 'browser.ping',
        requestId: 'ping-1',
        sentAt: Date.now(),
      }),
    );
    await expect(pong).resolves.toMatchObject({ requestId: 'ping-1' });

    const replay = await fetch(`${relay.url}/v1/pair/claim`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ code: registration.pairCode }),
    });
    expect(replay.status).toBe(401);

    browser.close();
    device.close();
  });

  it('does not reveal a device without a browser token', async () => {
    relay = await createRelayServer({ port: 0 });
    const response = await fetch(`${relay.url}/v1/session`, {
      headers: { authorization: 'Bearer invalid' },
    });
    expect(response.status).toBe(401);
  });

  it('restores hashed device and browser sessions after a restart', async () => {
    temporaryDirectory = await mkdtemp(path.join(tmpdir(), 'niki-relay-'));
    const dataFile = path.join(temporaryDirectory, 'relay-state.json');
    relay = await createRelayServer({ port: 0, dataFile });
    const registration = await fetch(`${relay.url}/v1/devices/register`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        protocolVersion: DEVICE_BRIDGE_PROTOCOL_VERSION,
        deviceId: 'persistent-device',
        deviceName: 'Persistent Mac',
        platform: 'darwin',
        publicKey: 'persistent-public-key',
      }),
    }).then((response) => response.json() as Promise<RelayRegisterDeviceResponse>);
    const claim = await fetch(`${relay.url}/v1/pair/claim`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ code: registration.pairCode }),
    }).then((response) => response.json() as Promise<RelayClaimPairingResponse>);

    await relay.close();
    relay = null;

    const persisted = await readFile(dataFile, 'utf8');
    expect(persisted).not.toContain(registration.deviceToken);
    expect(persisted).not.toContain(claim.browserToken);

    relay = await createRelayServer({ port: 0, dataFile });
    const sessionResponse = await fetch(`${relay.url}/v1/session`, {
      headers: { authorization: `Bearer ${claim.browserToken}` },
    });
    expect(sessionResponse.status).toBe(200);
    await expect(sessionResponse.json()).resolves.toMatchObject({
      device: { id: 'persistent-device', state: 'offline' },
    });

    const deviceUrl = new URL(relay.url);
    deviceUrl.protocol = 'ws:';
    deviceUrl.pathname = '/v1/device';
    deviceUrl.searchParams.set('deviceId', 'persistent-device');
    deviceUrl.searchParams.set('token', registration.deviceToken);
    const device = new WebSocket(deviceUrl);
    await waitForMessage(device, 'relay.ready');

    const browserUrl = new URL(relay.url);
    browserUrl.protocol = 'ws:';
    browserUrl.pathname = '/v1/browser';
    browserUrl.searchParams.set('token', claim.browserToken);
    const browser = new WebSocket(browserUrl);
    const browserReady = waitForMessage(browser, 'relay.ready');
    const browserStatus = waitForMessage<{ device: { state: string } }>(
      browser,
      'relay.status',
    );
    await browserReady;
    await expect(browserStatus).resolves.toMatchObject({
      device: { state: 'online' },
    });

    browser.close();
    device.close();
  });

  it('uses the configured public URL for websocket responses', async () => {
    relay = await createRelayServer({
      port: 0,
      publicUrl: 'https://relay.niki.example',
    });
    const registration = await fetch(`${relay.url}/v1/devices/register`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        protocolVersion: DEVICE_BRIDGE_PROTOCOL_VERSION,
        deviceId: 'device-public-url',
        deviceName: 'Public URL Mac',
        platform: 'darwin',
        publicKey: 'test-public-key',
      }),
    }).then((response) => response.json() as Promise<RelayRegisterDeviceResponse>);

    expect(registration.websocketUrl).toMatch(
      /^wss:\/\/relay\.niki\.example\/v1\/device\?/,
    );
  });
});
