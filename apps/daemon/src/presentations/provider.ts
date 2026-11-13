import { EnvHttpProxyAgent, fetch } from 'undici';
import type {
  PresentationOptions,
  PresentationUsage,
} from '@open-design/contracts';
import { resolveProviderConfig } from '../media-config.js';
import { PresentationError } from './content.js';
import { presentationUsage } from './generate.js';
import sharp from 'sharp';

const dispatcher = new EnvHttpProxyAgent({
  connectTimeout: 30_000,
  headersTimeout: 300_000,
  bodyTimeout: 300_000,
});
export async function presentationModels(
  projectRoot: string,
): Promise<{ models: string[]; verified: boolean; message?: string }> {
  const provider = await resolveProviderConfig(projectRoot, 'openai');
  if (!provider.apiKey)
    return {
      models: [],
      verified: false,
      message: '请先在设置中配置模型 API。',
    };
  try {
    const r = await fetch(
      `${(provider.baseUrl || 'https://api.openai.com/v1').replace(/\/+$/, '')}/models`,
      {
        dispatcher,
        headers: { authorization: `Bearer ${provider.apiKey}` },
        signal: AbortSignal.timeout(15_000),
      },
    );
    if (!r.ok) {
      await r.body?.cancel();
      return {
        models: [],
        verified: false,
        message: `API 未提供模型列表（HTTP ${r.status}）；可手动填写模型 ID。`,
      };
    }
    const data = (await r.json()) as { data?: { id: string }[] };
    const models = (data.data ?? [])
      .map((m) => m.id)
      .filter(
        (id) =>
          /^(gpt-|o[134]-|claude-|gemini-)/.test(id) &&
          !/image|audio|realtime|tts|transcribe|embedding|search/.test(id),
      )
      .sort()
      .reverse();
    return {
      models,
      verified: true,
      message: '模型列表来自当前 API；列出不代表已验证结构化输出与视觉能力。',
    };
  } catch {
    return {
      models: [],
      verified: false,
      message: '暂时无法读取模型列表，可填写现有模型 ID。',
    };
  }
}

export const schemaObject = (properties: Record<string, unknown>) => ({
  type: 'object',
  properties,
  required: Object.keys(properties),
  additionalProperties: false,
});
export function createPresentationProvider(
  projectRoot: string,
  options: PresentationOptions,
  onUsage: (u: PresentationUsage) => Promise<void>,
) {
  const request = async <T>(
    instructions: string,
    content: unknown[],
    schema: unknown,
    name: string,
  ): Promise<T> => {
    const provider = await resolveProviderConfig(projectRoot, 'openai');
    if (!provider.apiKey)
      throw new PresentationError('请先配置模型 API。', 503);
    const endpoint = `${(provider.baseUrl || 'https://api.openai.com/v1').replace(/\/+$/, '')}/responses`;
    const selected = options.model || 'gpt-5.6-terra';
    const models = [
      selected,
      selected,
      ...(options.fallbackModel && options.fallbackModel !== selected
        ? [options.fallbackModel]
        : []),
    ];
    for (const [attempt, model] of models.entries()) {
      let r;
      try {
        r = await fetch(endpoint, {
          dispatcher,
          method: 'POST',
          headers: {
            authorization: `Bearer ${provider.apiKey}`,
            'content-type': 'application/json',
          },
          body: JSON.stringify({
            model,
            store: false,
            max_output_tokens: 16000,
            instructions,
            input: [{ role: 'user', content }],
            text: {
              format: { type: 'json_schema', name, strict: true, schema },
            },
            ...(/^gpt-[5-9]|^o[134]/.test(model)
              ? { reasoning: { effort: 'medium' } }
              : {}),
          }),
          signal: AbortSignal.timeout(300_000),
        });
      } catch {
        if (attempt + 1 < models.length) continue;
        throw new PresentationError('模型连接超时，已保存当前进度。', 502);
      }
      if (!r.ok) {
        const status = r.status;
        await r.body?.cancel();
        if (
          attempt + 1 < models.length &&
          [400, 404, 408, 429, 500, 502, 503, 504].includes(status)
        )
          continue;
        throw new PresentationError(
          `模型 ${model} 调用失败（HTTP ${status}），请核对 API 权限和额度。`,
          502,
        );
      }
      const data = (await r.json()) as {
        status?: string;
        usage?: {
          input_tokens?: number;
          output_tokens?: number;
          input_tokens_details?: { cached_tokens?: number };
          output_tokens_details?: { reasoning_tokens?: number };
        };
        output?: {
          type?: string;
          content?: { type?: string; text?: string }[];
        }[];
      };
      if (data.usage) {
        const u = data.usage;
        const usage: PresentationUsage = {
          model,
          inputTokens: u.input_tokens ?? 0,
          outputTokens: u.output_tokens ?? 0,
          cachedInputTokens: u.input_tokens_details?.cached_tokens ?? 0,
          reasoningTokens: u.output_tokens_details?.reasoning_tokens ?? 0,
          estimatedUsd: null,
          pricingDate: '',
        };
        // Retain the existing dated tariff only for its exact model on the official endpoint.
        if (
          model === 'gpt-5.6-terra' &&
          new URL(endpoint).origin === 'https://api.openai.com'
        ) {
          const priced = presentationUsage({ usage: u });
          usage.estimatedUsd = priced?.estimatedUsd ?? null;
          usage.pricingDate = priced?.pricingDate ?? '';
        }
        await onUsage(usage);
      }
      if (data.status !== 'completed')
        throw new PresentationError(
          '模型响应未完成；当前已完成页面仍保留，可重试该阶段。',
          502,
        );
      const text = data.output
        ?.filter((o) => o.type === 'message')
        .flatMap((o) => o.content ?? [])
        .filter((c) => c.type === 'output_text')
        .map((c) => c.text ?? '')
        .join('');
      try {
        return JSON.parse(text || '') as T;
      } catch {
        throw new PresentationError('模型未返回有效的结构化内容。', 502);
      }
    }
    throw new PresentationError('没有可用模型。', 503);
  };
  return {
    request,
    text: async <T>(
      instructions: string,
      value: unknown,
      schema: unknown,
      name: string,
      images: { id: string; data: string }[] = [],
    ) => {
      const visual: unknown[] = [];
      for (const image of images) {
        const png = await sharp(
          Buffer.from(image.data.split(',')[1] ?? '', 'base64'),
        )
          .resize({
            width: 768,
            height: 768,
            fit: 'inside',
            withoutEnlargement: true,
          })
          .png()
          .toBuffer();
        visual.push(
          { type: 'input_text', text: `Original document image ${image.id}` },
          {
            type: 'input_image',
            image_url: `data:image/png;base64,${png.toString('base64')}`,
          },
        );
      }
      return request<T>(
        instructions,
        [{ type: 'input_text', text: JSON.stringify(value) }, ...visual],
        schema,
        name,
      );
    },
  };
}
