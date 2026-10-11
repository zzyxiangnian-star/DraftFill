import { Check, ExternalLink, Eye, EyeOff, Loader2, RefreshCw } from 'lucide-react';
import { useEffect, useState } from 'react';
import { iconProps } from '@/src/components/icon';
import { listModels, ping } from '@/src/lib/ai/client';
import { originOf, PROVIDERS, providerById } from '@/src/lib/ai/providers';
import { aiSettingsItem, endpointOf, type AiSettings } from '@/src/lib/ai/settings';

/** AI 服务商的网站要等用户点击时再申请访问权限（计划书第 2 节：最小权限） */
export function originFor(s: AiSettings): string | null {
  const p = providerById(s.provider);
  return p?.id === 'custom' ? originOf(s.baseUrl) : p?.origin ?? null;
}

/** 必须在点击事件里第一个 await 调用，否则浏览器会拒绝弹出授权 */
export async function ensureAccess(s: AiSettings): Promise<string | null> {
  const origin = originFor(s);
  if (!origin) return '接口地址不对，需要以 https:// 开头';
  const ok = await browser.permissions.request({ origins: [origin] }).catch(() => false);
  return ok ? null : '没有允许插件访问 AI 服务商的网站，无法调用';
}

export function useAiSettings() {
  const [s, setS] = useState<AiSettings | null>(null);
  useEffect(() => {
    aiSettingsItem.getValue().then(setS);
    return aiSettingsItem.watch(setS);
  }, []);
  return s;
}

const MANUAL = '__manual__';

type Status = { kind: 'ok' | 'err' | 'busy'; text: string } | null;

export function AiSettingsCard() {
  const saved = useAiSettings();
  const [draft, setDraft] = useState<AiSettings | null>(null);
  const [show, setShow] = useState(false);
  const [models, setModels] = useState<string[]>([]);
  const [status, setStatus] = useState<Status>(null);
  const [manualModel, setManualModel] = useState(false);
  useEffect(() => { if (saved && !draft) setDraft(saved); }, [saved, draft]);
  if (!draft) return null;

  const p = providerById(draft.provider) ?? PROVIDERS[0]!;
  const set = (patch: Partial<AiSettings>) => { setDraft({ ...draft, ...patch }); setStatus(null); };
  // 用已保存的模型（而不是正在输入的）补进下拉，免得手动输入时第一个字就把输入框换成下拉
  const savedModel = saved?.provider === draft.provider ? saved.model : '';
  const modelOptions = [...new Set([p.model, ...p.models, ...models, savedModel].filter(Boolean))];

  async function saveAndTest() {
    const denied = await ensureAccess(draft!);
    if (denied) return setStatus({ kind: 'err', text: denied });
    await aiSettingsItem.setValue(draft!);
    const ep = endpointOf(draft!);
    if ('error' in ep) return setStatus({ kind: 'err', text: ep.error });
    setStatus({ kind: 'busy', text: '正在测试连接…' });
    try {
      await ping(ep);
      setStatus({ kind: 'ok', text: `已保存，${ep.name} 连接正常（模型 ${ep.model}）。` });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      // 常见原因是模型名过时：能列模型的服务商，顺便查一下模型还在不在
      const list = p.noModelList ? [] : await listModels(ep).catch(() => [] as string[]);
      if (list.length && !list.includes(ep.model)) {
        setModels(list);
        setManualModel(false);
        return setStatus({ kind: 'err', text: `已保存，但 ${ep.name} 那边没有模型「${ep.model}」。已在高级设置里列出 ${list.length} 个可用模型，选一个再点保存。` });
      }
      setStatus({ kind: 'err', text: `已保存，但测试没通过：${msg}` });
    }
  }

  async function fetchModels() {
    const denied = await ensureAccess(draft!);
    if (denied) return setStatus({ kind: 'err', text: denied });
    const ep = endpointOf(draft!);
    if ('error' in ep) return setStatus({ kind: 'err', text: ep.error });
    setStatus({ kind: 'busy', text: '正在获取可用模型…' });
    try {
      const list = await listModels(ep);
      setModels(list);
      setStatus({ kind: 'ok', text: list.length ? `找到 ${list.length} 个模型，可以在下面选择。` : '服务商没有返回模型列表，可以直接手动填写模型名。' });
    } catch (e) {
      setStatus({ kind: 'err', text: e instanceof Error ? e.message : String(e) });
    }
  }

  return (
    <section className="card stack" style={{ gap: 'var(--space-4)' }}>
      <div className="stack">
        <h2>AI 服务商</h2>
        <p className="small muted">选一家，填上 API Key 就能用，接口地址和模型会自动带上。Key 只存在你的浏览器里，不会进备份文件。</p>
      </div>
      <div className="grid ai-grid">
        <label className="field">
          <span className="field-label">服务商</span>
          <select className="input select" value={draft.provider}
            onChange={(e) => { set({ provider: e.target.value, model: '', baseUrl: '' }); setModels([]); setManualModel(false); }}>
            {PROVIDERS.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
          </select>
          {p.note && <span className="field-msg">{p.note}</span>}
        </label>
        <label className="field">
          <span className="field-label">API Key</span>
          <span className="key-wrap">
            <input className="input" type={show ? 'text' : 'password'} autoComplete="off" spellCheck={false} placeholder="sk-…"
              value={draft.apiKey} onChange={(e) => set({ apiKey: e.target.value })} />
            <button type="button" className="btn btn-icon key-eye" aria-label={show ? '隐藏 Key' : '显示 Key'} onClick={() => setShow(!show)}>
              {show ? <EyeOff {...iconProps} /> : <Eye {...iconProps} />}</button>
          </span>
          {p.keyUrl && <a className="field-msg link" href={p.keyUrl} target="_blank" rel="noreferrer">去 {p.name} 申请 Key <ExternalLink size={12} strokeWidth={1.5} /></a>}
        </label>
      </div>

      <details className="advanced" open={p.id === 'custom' || models.length > 0}>
        <summary>高级设置（一般不用改）</summary>
        <div className="grid ai-grid" style={{ marginTop: 'var(--space-3)' }}>
          {p.id === 'custom' && (
            <label className="field field-wide">
              <span className="field-label">接口地址</span>
              <input className="input" placeholder="https://…/v1" value={draft.baseUrl} onChange={(e) => set({ baseUrl: e.target.value })} />
            </label>
          )}
          <label className="field">
            <span className="field-label">模型</span>
            {modelOptions.length > 0 && !manualModel && (
              <select className="input select" value={draft.model || p.model}
                onChange={(e) => (e.target.value === MANUAL ? setManualModel(true) : set({ model: e.target.value === p.model ? '' : e.target.value }))}>
                {modelOptions.map((m) => <option key={m} value={m}>{m}{m === p.model ? '（默认）' : ''}</option>)}
                <option value={MANUAL}>手动填写…</option>
              </select>
            )}
            {(manualModel || !modelOptions.length) && (
              <input className="input" placeholder={p.model ? `不填就用 ${p.model}` : '模型名'} value={draft.model} onChange={(e) => set({ model: e.target.value })}
                aria-label="模型名" />
            )}
            <span className="field-msg">{p.noModelList
              ? `服务商更新了模型时，到 ${p.name} 控制台查模型名，选「手动填写」填进来。`
              : '服务商更新了模型时，点「获取可用模型」拉最新列表，或者手动填。'}</span>
          </label>
          {!p.noModelList && (
            <div className="field" style={{ alignContent: 'end' }}>
              <div><button className="btn btn-secondary" onClick={fetchModels} disabled={!draft.apiKey.trim()}><RefreshCw {...iconProps} /> 获取可用模型</button></div>
            </div>
          )}
        </div>
      </details>

      <div className="row" style={{ flexWrap: 'wrap' }}>
        <button className="btn btn-primary" onClick={saveAndTest} disabled={!draft.apiKey.trim() || status?.kind === 'busy'}>
          {status?.kind === 'busy' ? <Loader2 {...iconProps} className="spin" /> : <Check {...iconProps} />} 保存并测试连接</button>
        {status && <span className={`small ${status.kind === 'err' ? 'text-err' : 'muted'}`} role="status">{status.text}</span>}
      </div>
    </section>
  );
}
