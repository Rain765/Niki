import type {
  StartDevicePairingRequest,
} from '@open-design/contracts';
import type { Express } from 'express';
import type { DeviceBridgeService } from './device-bridge.js';

export function registerDeviceBridgeRoutes(
  app: Express,
  bridge: DeviceBridgeService,
): void {
  app.get('/api/device-bridge/status', (_req, res) => {
    res.json(bridge.status());
  });

  app.post('/api/device-bridge/pair', async (req, res) => {
    const body = req.body as Partial<StartDevicePairingRequest>;
    if (typeof body.relayUrl !== 'string' || !body.relayUrl.trim()) {
      res.status(400).json({ error: 'relayUrl is required.' });
      return;
    }
    try {
      res.status(201).json(
        await bridge.pair({
          relayUrl: body.relayUrl,
          ...(typeof body.deviceName === 'string' ? { deviceName: body.deviceName } : {}),
        }),
      );
    } catch (error) {
      res.status(502).json({
        error: error instanceof Error ? error.message : String(error),
      });
    }
  });

  app.delete('/api/device-bridge/pair', async (_req, res) => {
    res.json(await bridge.disconnect());
  });
}
