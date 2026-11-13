import { randomBytes } from 'node:crypto';
import { mkdir, readFile, rename, writeFile, chmod } from 'node:fs/promises';
import path from 'node:path';
import { PPT_MODEL_PROVIDERS, type PptApiProvider, type PptModelBinding, type PptModelProvider, type PptModelSettings } from '@open-design/contracts';

type Stored = { defaultProvider: PptModelProvider; keys: Partial<Record<PptApiProvider, { key: string; testedAt?: number }>> };
export class PptModelError extends Error { constructor(message: string, public status = 400) { super(message); } }
export function apiProvider(value: unknown): PptApiProvider {
  if (typeof value !== 'string' || !Object.hasOwn(PPT_MODEL_PROVIDERS, value)) throw new PptModelError('不支持的模型');
  return value as PptApiProvider;
}
export function modelProvider(value: unknown): PptModelProvider { return value === 'existing' ? value : apiProvider(value); }
export function validKey(value: unknown): string {
  if (typeof value !== 'string' || !/^[\x21-\x7e]{8,512}$/.test(value.trim())) throw new PptModelError('请输入有效的 API Key');
  return value.trim();
}
export function providerFailure(status: number): string {
  return status === 401 || status === 403 ? '密钥无效或没有该模型的权限' : status === 429 ? '模型额度不足或请求过于频繁' : status === 404 ? '该账号暂不可用此模型' : '模型服务暂不可用，请稍后重试';
}
/** One persistent server-owned store; serial writes prevent concurrent administrators losing updates. */
export class PptModels {
  private file: string;
  private queue: Promise<unknown> = Promise.resolve();
  constructor(root: string, private request: typeof fetch = fetch) { this.file = path.join(root, 'ppt-model-credentials.json'); }
  private async read(): Promise<Stored> {
    try { return JSON.parse(await readFile(this.file, 'utf8')) as Stored; }
    catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { defaultProvider: 'existing', keys: {} }; throw new PptModelError('模型配置读取失败', 503); }
  }
  private update(fn: (data: Stored) => void): Promise<void> {
    const result = this.queue.then(async () => {
      const data = await this.read(); fn(data);
      await mkdir(path.dirname(this.file), { recursive: true });
      const temp = `${this.file}.${randomBytes(8).toString('hex')}.tmp`;
      await writeFile(temp, JSON.stringify(data), { mode: 0o600 });
      await rename(temp, this.file); await chmod(this.file, 0o600);
    });
    this.queue = result.catch(() => {}); return result;
  }
  async settings(): Promise<PptModelSettings> {
    await this.queue; const data = await this.read();
    return { defaultProvider: data.defaultProvider, providers: (Object.keys(PPT_MODEL_PROVIDERS) as PptApiProvider[]).map(provider => ({ provider, configured: Boolean(data.keys[provider]), maskedKey: data.keys[provider] ? '••••' + data.keys[provider]!.key.slice(-4) : '', testedAt: data.keys[provider]?.testedAt })) };
  }
  save(provider: PptApiProvider, key: unknown) { const checked = validKey(key); return this.update(data => { data.keys[provider] = { key: checked }; }); }
  remove(provider: PptApiProvider) { return this.update(data => { if (data.defaultProvider === provider) throw new PptModelError('请先切换默认模型，再删除此密钥'); delete data.keys[provider]; }); }
  setDefault(provider: PptModelProvider) { return this.update(data => { if (provider !== 'existing' && !data.keys[provider]?.testedAt) throw new PptModelError('请先保存密钥并测试连接'); data.defaultProvider = provider; }); }
  async credential(provider: PptApiProvider) { await this.queue; const entry = (await this.read()).keys[provider]; if (!entry?.testedAt) throw new PptModelError('该模型尚未配置或未通过连接测试', 409); return entry.key; }
  async test(provider: PptApiProvider) {
    await this.queue; const key = (await this.read()).keys[provider]?.key;
    if (!key) throw new PptModelError('请先保存密钥');
    let response: Response;
    try { response = await this.request(`${PPT_MODEL_PROVIDERS[provider].baseUrl}/chat/completions`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` }, body: JSON.stringify({ model: PPT_MODEL_PROVIDERS[provider].model, messages: [{ role: 'user', content: 'Reply OK.' }], max_tokens: 1024, stream: false }), signal: AbortSignal.timeout(60000) }); }
    catch { throw new PptModelError('连接超时或网络不可用', 502); }
    if (!response.ok) { await response.body?.cancel(); throw new PptModelError(providerFailure(response.status), 502); }
    const result = await response.json().catch(() => null) as { choices?: unknown[] } | null;
    if (!result?.choices?.length) throw new PptModelError('模型返回的数据格式不兼容', 502);
    await this.update(data => { if (data.keys[provider]?.key !== key) throw new PptModelError('密钥已变更，请重新测试', 409); data.keys[provider]!.testedAt = Date.now(); });
  }
  async bind(requested: unknown, admin: boolean): Promise<PptModelBinding> {
    const settings = await this.settings();
    const provider = requested === undefined ? settings.defaultProvider : modelProvider(requested);
    if (!admin && requested !== undefined && provider !== settings.defaultProvider) throw new PptModelError('仅管理员可以切换生成模型', 403);
    if (provider === 'existing') return { provider };
    await this.credential(provider);
    return { provider, model: PPT_MODEL_PROVIDERS[provider].model };
  }
}
