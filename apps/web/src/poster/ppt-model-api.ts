import type { PptModelSettings } from '@open-design/contracts';
export async function pptModelRequest(path = '', method = 'GET', body?: unknown): Promise<PptModelSettings> {
  const response = await fetch(`/api/ppt-models${path}`, { method, credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  const result = await response.json();
  if (!response.ok) throw new Error(typeof result.error === 'string' ? result.error : '无法更新模型设置');
  return result as PptModelSettings;
}
