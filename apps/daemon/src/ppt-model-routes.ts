import { randomBytes } from 'node:crypto';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import type { Express, Request, Response } from 'express';
import { PPT_MODEL_PROVIDERS, type PptApiProvider, type PptModelBinding } from '@open-design/contracts';
import { currentNikiUser } from './niki-auth-context.js';
import { apiProvider, modelProvider, PptModelError, PptModels, providerFailure } from './ppt-models.js';

function failure(res: Response, error: unknown) {
  res.status(error instanceof PptModelError ? error.status : 500).json({ error: error instanceof PptModelError ? error.message : '模型设置暂不可用' });
}
export function registerPptModelRoutes(app: Express, models: PptModels, isLocal: (req: Request) => boolean) {
  app.use('/api/ppt-models', (req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    const user = currentNikiUser();
    if (user?.role === 'admin' || (!user && isLocal(req))) next();
    else res.status(403).json({ error: '仅管理员可以管理模型' });
  });
  app.get('/api/ppt-models', async (_req, res) => { try { res.json(await models.settings()); } catch (error) { failure(res, error); } });
  app.put('/api/ppt-models/default', async (req, res) => { try { await models.setDefault(modelProvider(req.body?.provider)); res.json(await models.settings()); } catch (error) { failure(res, error); } });
  app.put('/api/ppt-models/:provider', async (req, res) => { try { await models.save(apiProvider(req.params.provider), req.body?.apiKey); res.json(await models.settings()); } catch (error) { failure(res, error); } });
  app.delete('/api/ppt-models/:provider', async (req, res) => { try { await models.remove(apiProvider(req.params.provider)); res.json(await models.settings()); } catch (error) { failure(res, error); } });
  app.post('/api/ppt-models/:provider/test', async (req, res) => { try { await models.test(apiProvider(req.params.provider)); res.json(await models.settings()); } catch (error) { failure(res, error); } });
}

type Grant = { provider: PptApiProvider; model: string; key: string; alive: () => boolean; expires: number };
/** Only a short-lived run credential enters the child environment. Real keys never leave this service. */
export class PptModelGateway {
  private grants = new Map<string, Grant>();
  constructor(private models: PptModels, private request: typeof fetch = fetch) {}
  async launch(binding: PptModelBinding, daemonUrl: string, alive: () => boolean) {
    const provider = apiProvider(binding.provider);
    const model = PPT_MODEL_PROVIDERS[provider].model;
    if (binding.model !== model) throw new PptModelError('文稿的模型配置不匹配', 409);
    const key = await this.models.credential(provider);
    for (const [token, grant] of this.grants) if (!grant.alive() || grant.expires < Date.now()) this.grants.delete(token);
    const token = randomBytes(32).toString('hex');
    this.grants.set(token, { provider, model, key, alive, expires: Date.now() + 24 * 3600 * 1000 });
    const config = {
      enabled_providers: ['niki-ppt'], model: `niki-ppt/${model}`, small_model: `niki-ppt/${model}`, share: 'disabled', autoupdate: false,
      tools: { question: false },
      provider: { 'niki-ppt': { npm: '@ai-sdk/openai-compatible', name: 'Niki PPT', options: { baseURL: `${daemonUrl}/api/ppt-model-gateway/v1`, apiKey: token }, models: { [model]: { name: PPT_MODEL_PROVIDERS[provider].label, attachment: true, reasoning: true, tool_call: true, interleaved: { field: 'reasoning_content' }, modalities: { input: ['text', 'image'], output: ['text'] }, limit: { context: 1000000, output: 64000 } } } } },
    };
    return { env: { OPENCODE_CONFIG_CONTENT: JSON.stringify(config) }, release: () => { this.grants.delete(token); } };
  }
  register(app: Express) {
    app.post('/api/ppt-model-gateway/v1/chat/completions', async (req, res) => {
      const token = req.headers.authorization?.replace(/^Bearer /, '') ?? '';
      const grant = this.grants.get(token);
      if (!grant || !grant.alive() || grant.expires < Date.now()) { this.grants.delete(token); res.status(401).json({ error: { message: '生成会话已结束，请重新发起生成' } }); return; }
      if (!Array.isArray(req.body?.messages)) { res.status(400).json({ error: { message: 'Invalid messages' } }); return; }
      const abort = new AbortController();
      const disconnect = () => { if (!res.writableFinished) abort.abort(); };
      res.on('close', disconnect);
      try {
        const response = await this.request(`${PPT_MODEL_PROVIDERS[grant.provider].baseUrl}/chat/completions`, {
          method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${grant.key}` },
          body: JSON.stringify({ ...req.body, model: grant.model }), signal: abort.signal,
        });
        if (!response.ok || !response.body) { await response.body?.cancel(); res.status(response.status >= 400 ? response.status : 502).json({ error: { message: providerFailure(response.status) } }); return; }
        res.setHeader('Content-Type', response.headers.get('content-type') ?? 'application/json');
        res.setHeader('Cache-Control', 'no-store');
        await pipeline(Readable.fromWeb(response.body as import('node:stream/web').ReadableStream), res);
      } catch { if (!res.headersSent && !res.destroyed) res.status(502).json({ error: { message: '模型连接中断，请重试' } }); }
      finally { res.off('close', disconnect); }
    });
  }
}
