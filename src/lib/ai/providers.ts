// 国内常用的大模型服务商（都兼容 OpenAI 接口）。用户只填 API Key，地址和模型自动带上。
// 模型名会随厂商更新变化：设置页可以“获取可用模型”从服务商拉最新列表，也可以在高级设置里手动改。
// 资料来源：各家开放平台文档，2026-10 核对。

export interface Provider {
  id: string;
  name: string;
  baseUrl: string;
  /** 默认模型：选便宜、快、够用的 */
  model: string;
  /** 常用模型，下拉里先列这些 */
  models: string[];
  /** 申请 API Key 的地方 */
  keyUrl: string;
  /** 插件需要访问的地址（按需申请权限） */
  origin: string;
  note?: string;
}

export const PROVIDERS: Provider[] = [
  {
    id: 'deepseek', name: 'DeepSeek', baseUrl: 'https://api.deepseek.com', model: 'deepseek-v4-flash',
    models: ['deepseek-v4-flash', 'deepseek-v4-pro'], keyUrl: 'https://platform.deepseek.com/api_keys', origin: 'https://api.deepseek.com/*',
    note: '价格低、中文写作好，推荐。',
  },
  {
    id: 'qwen', name: '通义千问（阿里云百炼）', baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1', model: 'qwen-plus',
    models: ['qwen-plus', 'qwen-turbo', 'qwen-max'], keyUrl: 'https://bailian.console.aliyun.com/', origin: 'https://dashscope.aliyuncs.com/*',
    note: '新用户有免费额度。',
  },
  {
    id: 'glm', name: '智谱 GLM', baseUrl: 'https://open.bigmodel.cn/api/paas/v4', model: 'glm-4.7-flash',
    models: ['glm-4.7-flash'], keyUrl: 'https://open.bigmodel.cn/usercenter/apikeys', origin: 'https://open.bigmodel.cn/*',
    note: 'glm-4.7-flash 免费，但同时只能处理一个请求。',
  },
  {
    id: 'kimi', name: 'Kimi（月之暗面）', baseUrl: 'https://api.moonshot.cn/v1', model: 'kimi-k2.6',
    models: ['kimi-k2.6'], keyUrl: 'https://platform.moonshot.cn/console/api-keys', origin: 'https://api.moonshot.cn/*',
  },
  {
    id: 'doubao', name: '豆包（火山方舟）', baseUrl: 'https://ark.cn-beijing.volces.com/api/v3', model: 'doubao-seed-1-6-flash-250828',
    models: ['doubao-seed-1-6-flash-250828'], keyUrl: 'https://console.volcengine.com/ark', origin: 'https://ark.cn-beijing.volces.com/*',
    note: '要先在火山方舟控制台“开通管理”里开通模型；提示模型不存在时，在高级设置里换成控制台显示的模型 ID。',
  },
  {
    id: 'siliconflow', name: '硅基流动', baseUrl: 'https://api.siliconflow.cn/v1', model: 'Qwen/Qwen3-8B',
    models: ['Qwen/Qwen3-8B', 'deepseek-ai/DeepSeek-V3'], keyUrl: 'https://cloud.siliconflow.cn/account/ak', origin: 'https://api.siliconflow.cn/*',
    note: '一个 Key 能用多家开源模型，部分小模型免费。',
  },
  {
    id: 'custom', name: '其他（兼容 OpenAI 接口）', baseUrl: '', model: '', models: [], keyUrl: '', origin: '',
    note: '填服务商提供的接口地址和模型名。',
  },
];

export const providerById = (id: string) => PROVIDERS.find((p) => p.id === id);

/** 自定义地址需要的权限：只申请这一个网站 */
export function originOf(baseUrl: string): string | null {
  try {
    const u = new URL(baseUrl);
    return u.protocol === 'https:' || u.hostname === 'localhost' || u.hostname === '127.0.0.1' ? `${u.protocol}//${u.host}/*` : null;
  } catch {
    return null;
  }
}
