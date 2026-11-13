import http from 'node:http';
import express from 'express';
import sharp from 'sharp';
import { describe, expect, it, vi } from 'vitest';
import { registerLogoRoutes } from '../src/logo-routes.js';

describe('logo finalization HTTP route', () => {
  it('faithfully vectorizes the selected source and returns a completed kit without an agent run', async () => {
    const sourcePng = await sharp(Buffer.from(`
      <svg xmlns="http://www.w3.org/2000/svg" width="192" height="192">
        <rect width="192" height="192" fill="#F4F1EA"/>
        <path fill="#10450C" d="M35 145 76 47h18l45 98h-25l-10-25H66l-9 25H35Zm39-45h22L85 72 74 100Z"/>
        <circle cx="151" cy="67" r="11" fill="#F5C93B"/>
      </svg>
    `)).png().toBuffer();
    const written = new Map<string, Buffer>();
    const insertConversation = vi.fn();
    const app = express();
    app.use(express.json());
    registerLogoRoutes(app, {
      db: {},
      paths: { PROJECTS_DIR: '/tmp/logo-route-test' },
      ids: {
        randomUUID: () => 'final-123',
        randomId: () => 'conversation-123',
      },
      projectStore: {
        getProject: () => ({
          id: 'logo-project-1',
          name: 'Northstar Logo',
          skillId: 'logo-generator',
          pendingPrompt: 'Northstar brief',
          metadata: {},
        }),
      },
      projectFiles: {
        readProjectFile: async () => ({ buffer: sourcePng }),
        writeProjectFile: async (_root: string, _projectId: string, name: string, body: Buffer | string) => {
          written.set(name, Buffer.isBuffer(body) ? body : Buffer.from(body));
          return {};
        },
      },
      conversations: {
        insertConversation,
      },
      http: {
        sendApiError: (res: express.Response, status: number, code: string, message: string) => (
          res.status(status).json({ error: { code, message } })
        ),
      },
    } as never);
    const server = http.createServer(app);
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('test server did not start');

    try {
      const response = await fetch(`http://127.0.0.1:${address.port}/api/logo/finalize`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          projectId: 'logo-project-1',
          direction: 2,
          mode: 'faithful',
        }),
      });
      const data = await response.json() as {
        finalization: {
          status: string;
          mode: string;
          outputFiles: string[];
          similarityScore: number;
        };
      };

      expect(response.status).toBe(201);
      expect(data.finalization).toMatchObject({ status: 'complete', mode: 'faithful' });
      expect(data.finalization.outputFiles).toHaveLength(7);
      expect(data.finalization.similarityScore).toBeGreaterThanOrEqual(0.94);
      expect(written.size).toBe(8);
      expect(written.get('logo/final/final-123/logo.svg')?.toString('utf8')).not.toMatch(
        /<image|data:image|base64/iu,
      );
      expect(written.has('logo/finalizations/final-123/manifest.json')).toBe(true);
      expect(insertConversation).toHaveBeenCalledOnce();
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });
});
