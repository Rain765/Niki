/** Public model configuration contains no credentials. */
export const PPT_MODEL_PROVIDERS = {
  qwen: { label: 'Qwen3.8-Max', model: 'qwen3.8-max', baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1' },
  kimi: { label: 'Kimi K3', model: 'kimi-k3', baseUrl: 'https://api.moonshot.cn/v1' },
  deepseek: { label: 'DeepSeek V4.1 Flash', model: 'deepseek-flash', baseUrl: 'https://api.deepseek.com/v1' },
} as const;
export type PptApiProvider = keyof typeof PPT_MODEL_PROVIDERS;
export type PptModelProvider = 'existing' | PptApiProvider;
export interface PptModelBinding { provider: PptModelProvider; model?: string }
export interface PptModelStatus {
  provider: PptApiProvider;
  configured: boolean;
  maskedKey: string;
  testedAt?: number | undefined;
}
export interface PptModelSettings {
  defaultProvider: PptModelProvider;
  providers: PptModelStatus[];
}
