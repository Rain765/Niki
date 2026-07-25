export const DEVICE_BRIDGE_PROTOCOL_VERSION = 1 as const;

export const DEVICE_BRIDGE_DEVICE_MESSAGE_TYPES = [
  'device.hello',
  'device.heartbeat',
  'device.pong',
] as const;

export const DEVICE_BRIDGE_BROWSER_MESSAGE_TYPES = [
  'browser.hello',
  'browser.ping',
] as const;

export const DEVICE_BRIDGE_RELAY_MESSAGE_TYPES = [
  'relay.ready',
  'relay.status',
  'relay.ping',
  'relay.pong',
  'relay.error',
] as const;

export type DeviceBridgeState =
  | 'unpaired'
  | 'connecting'
  | 'online'
  | 'offline'
  | 'error';

export interface DeviceBridgeDevice {
  id: string;
  name: string;
  platform: string;
  state: 'online' | 'offline';
  lastSeenAt: number | null;
}

export interface DeviceBridgeStatusResponse {
  protocolVersion: typeof DEVICE_BRIDGE_PROTOCOL_VERSION;
  state: DeviceBridgeState;
  relayUrl: string | null;
  device: DeviceBridgeDevice | null;
  pairCode: string | null;
  pairCodeExpiresAt: number | null;
  error: string | null;
}

export interface StartDevicePairingRequest {
  relayUrl: string;
  deviceName?: string;
}

export interface StartDevicePairingResponse extends DeviceBridgeStatusResponse {
  pairCode: string;
  pairCodeExpiresAt: number;
}

export interface RelayRegisterDeviceRequest {
  protocolVersion: typeof DEVICE_BRIDGE_PROTOCOL_VERSION;
  deviceId: string;
  deviceName: string;
  platform: string;
  publicKey: string;
}

export interface RelayRegisterDeviceResponse {
  protocolVersion: typeof DEVICE_BRIDGE_PROTOCOL_VERSION;
  deviceToken: string;
  pairCode: string;
  pairCodeExpiresAt: number;
  websocketUrl: string;
}

export interface RelayClaimPairingRequest {
  code: string;
}

export interface RelayClaimPairingResponse {
  protocolVersion: typeof DEVICE_BRIDGE_PROTOCOL_VERSION;
  browserToken: string;
  websocketUrl: string;
  device: DeviceBridgeDevice;
}

export type DeviceBridgeDeviceMessage =
  | {
      type: 'device.hello';
      protocolVersion: typeof DEVICE_BRIDGE_PROTOCOL_VERSION;
      deviceId: string;
    }
  | {
      type: 'device.heartbeat';
      sentAt: number;
    }
  | {
      type: 'device.pong';
      requestId: string;
      sentAt: number;
      receivedAt: number;
    };

export type DeviceBridgeBrowserMessage =
  | {
      type: 'browser.hello';
      protocolVersion: typeof DEVICE_BRIDGE_PROTOCOL_VERSION;
    }
  | {
      type: 'browser.ping';
      requestId: string;
      sentAt: number;
    };

export type DeviceBridgeRelayMessage =
  | {
      type: 'relay.ready';
      protocolVersion: typeof DEVICE_BRIDGE_PROTOCOL_VERSION;
    }
  | {
      type: 'relay.status';
      device: DeviceBridgeDevice;
    }
  | {
      type: 'relay.ping';
      requestId: string;
      sentAt: number;
    }
  | {
      type: 'relay.pong';
      requestId: string;
      sentAt: number;
      deviceReceivedAt: number;
      relayReceivedAt: number;
    }
  | {
      type: 'relay.error';
      code: 'invalid_message' | 'device_offline' | 'unauthorized' | 'timeout';
      message: string;
      requestId?: string;
    };
