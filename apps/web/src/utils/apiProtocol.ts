import type { ApiProtocol, ConnectionTestProtocol } from '../types';

const API_PROTOCOL_LABELS: Record<ApiProtocol, string> = {
  anthropic: 'Anthropic API',
  openai: 'OpenAI API',
  azure: 'Azure OpenAI',
  google: 'Google Gemini',
  kimi: 'Kimi API',
  deepseek: 'DeepSeek API',
  ollama: 'Ollama Cloud API',
  senseaudio: 'SenseAudio API',
};

const API_PROTOCOL_AGENT_IDS: Record<ApiProtocol, string> = {
  anthropic: 'anthropic-api',
  openai: 'openai-api',
  azure: 'azure-openai-api',
  google: 'google-gemini-api',
  kimi: 'kimi-api',
  deepseek: 'deepseek-api',
  ollama: 'ollama-cloud-api',
  senseaudio: 'senseaudio-api',
};

export function apiProtocolLabel(protocol: ApiProtocol | undefined): string {
  return API_PROTOCOL_LABELS[protocol ?? 'anthropic'];
}

export function apiProtocolModelLabel(
  protocol: ApiProtocol | undefined,
  model: string,
): string {
  const label = apiProtocolLabel(protocol);
  const trimmed = model.trim();
  return trimmed ? `${label} · ${trimmed}` : label;
}

export function apiProtocolAgentId(protocol: ApiProtocol | undefined): string {
  return API_PROTOCOL_AGENT_IDS[protocol ?? 'anthropic'];
}

export function apiProtocolWireProtocol(
  protocol: ApiProtocol | undefined,
): ConnectionTestProtocol {
  if (protocol === 'kimi' || protocol === 'deepseek') return 'openai';
  return protocol ?? 'anthropic';
}
