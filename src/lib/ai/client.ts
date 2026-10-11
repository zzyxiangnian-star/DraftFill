import type { Endpoint } from './settings';

// 调用兼容 OpenAI 的 /chat/completions。由设置页、侧边栏这些插件页面直接请求（已申请对应网站的权限）。

export interface ChatMessage { role: 'system' | 'user' | 'assistant'; content: string }

export class AiError extends Error {}

function friendly(status: number, body: string): string {
  if (status === 401 || status === 403) return 'API Key 不对或已失效，请到服务商后台重新复制。';
  if (status === 402 || /insufficient|余额|balance|quota|arrear/i.test(body)) return '账户余额不足或免费额度用完了，请到服务商后台充值。';
  if (status === 404 || /model.*(not|exist)|模型不存在|不存在该模型/i.test(body)) return '模型不存在或还没开通，请在高级设置里换一个模型，或到服务商后台开通。';
  if (status === 429) return '请求太频繁，被服务商限流了，稍等一会儿再试。';
  if (status >= 500) return '服务商那边出错了，稍后再试。';
  return `请求失败（${status}）${body ? `：${body.slice(0, 120)}` : ''}`;
}

async function request(ep: Endpoint, path: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  const outer = init.signal;
  outer?.addEventListener('abort', () => ctl.abort());
  try {
    const res = await fetch(`${ep.baseUrl}${path}`, {
      ...init,
      signal: ctl.signal,
      headers: { 'content-type': 'application/json', authorization: `Bearer ${ep.apiKey}`, ...init.headers },
    });
    if (!res.ok) throw new AiError(friendly(res.status, await res.text().catch(() => '')));
    return res;
  } catch (e) {
    if (e instanceof AiError) throw e;
    if (outer?.aborted) throw new AiError('已取消');
    if (ctl.signal.aborted) throw new AiError('等太久没有回应，请稍后再试，或换一个更快的模型。');
    throw new AiError('连不上服务商。请检查网络，或确认已允许插件访问这个网站。');
  } finally {
    clearTimeout(timer);
  }
}

export async function chat(ep: Endpoint, messages: ChatMessage[], opts: { temperature?: number; signal?: AbortSignal; json?: boolean } = {}): Promise<string> {
  const res = await request(ep, '/chat/completions', {
    method: 'POST',
    signal: opts.signal,
    body: JSON.stringify({
      model: ep.model, messages, temperature: opts.temperature ?? 0.7, stream: false,
      ...(opts.json && { response_format: { type: 'json_object' } }),
    }),
  }, 120_000);
  const data = await res.json().catch(() => null) as { choices?: { message?: { content?: string } }[] } | null;
  const text = data?.choices?.[0]?.message?.content;
  if (typeof text !== 'string' || !text.trim()) throw new AiError('服务商返回了空内容，请再试一次。');
  // 部分思考模型会把推理过程放在 <think> 里
  return text.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
}

/** 获取服务商当前可用的模型（同时验证 Key 是否有效） */
export async function listModels(ep: Endpoint): Promise<string[]> {
  const res = await request(ep, '/models', { method: 'GET' }, 20_000);
  const data = await res.json().catch(() => null) as { data?: { id?: string }[] } | null;
  return (data?.data ?? []).map((m) => m.id).filter((x): x is string => typeof x === 'string').sort();
}

/** 测试连接：发一句最短的话 */
export async function ping(ep: Endpoint): Promise<void> {
  await chat(ep, [{ role: 'user', content: '回复“好”' }], { temperature: 0 });
}
