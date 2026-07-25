import { describe, expect, it } from 'vitest';
import {
  DEVICE_BRIDGE_BROWSER_MESSAGE_TYPES,
  DEVICE_BRIDGE_DEVICE_MESSAGE_TYPES,
  DEVICE_BRIDGE_RELAY_MESSAGE_TYPES,
} from '../src/api/device-bridge.js';

describe('device bridge protocol', () => {
  it('exposes only presence and ping messages in the MVP', () => {
    const messageTypes = [
      ...DEVICE_BRIDGE_BROWSER_MESSAGE_TYPES,
      ...DEVICE_BRIDGE_DEVICE_MESSAGE_TYPES,
      ...DEVICE_BRIDGE_RELAY_MESSAGE_TYPES,
    ];

    expect(messageTypes).toEqual([
      'browser.hello',
      'browser.ping',
      'device.hello',
      'device.heartbeat',
      'device.pong',
      'relay.ready',
      'relay.status',
      'relay.ping',
      'relay.pong',
      'relay.error',
    ]);
    expect(messageTypes.some((type) => /command|run|exec|file/i.test(type))).toBe(false);
  });
});
