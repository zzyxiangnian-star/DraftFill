import { storage } from 'wxt/utils/storage';
import { providerById } from './providers';

// AI 设置只存在本机，备份文件不含 API Key。

export interface AiSettings {
  provider: string;
  apiKey: string;
  /** 留空用服务商的默认模型 */
  model: string;
  /** 只有“其他”需要 */
  baseUrl: string;
}

export const aiSettingsItem = storage.defineItem<AiSettings>('local:aiSettings', {
  fallback: { provider: 'deepseek', apiKey: '', model: '', baseUrl: '' },
});

export interface Endpoint {
  baseUrl: string; model: string; apiKey: string; name: string;
  /** false：服务商不支持 response_format，只靠提示词要 JSON */
  jsonMode?: boolean;
}

export function endpointOf(s: AiSettings): Endpoint | { error: string } {
  const p = providerById(s.provider);
  if (!p) return { error: '请先选择 AI 服务商' };
  if (!s.apiKey.trim()) return { error: '请先在 AI 设置里填写 API Key' };
  const baseUrl = (p.id === 'custom' ? s.baseUrl : p.baseUrl).trim().replace(/\/+$/, '').replace(/\/chat\/completions$/, '');
  const model = (s.model || p.model).trim();
  if (!baseUrl) return { error: '请填写接口地址' };
  if (!model) return { error: '请填写模型名' };
  return { baseUrl, model, apiKey: s.apiKey.trim(), name: p.id === 'custom' ? '你填写的服务商' : p.name, jsonMode: !p.noJsonMode };
}
