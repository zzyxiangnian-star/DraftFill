import { Sparkles } from 'lucide-react';
import { useState } from 'react';
import { iconProps } from '@/src/components/icon';
import { runSkill } from '@/src/lib/ai/run';
import { aiSettingsItem, endpointOf } from '@/src/lib/ai/settings';
import { fieldMatchSkill } from '@/src/lib/ai/skills/fieldMatch';
import type { AiApplyResult, AiFieldsResult, Request } from '@/src/lib/messages';

// 计划书 L2：插件没认出的字段，用户点一下才让 AI 看字段名猜对应档案里的哪一项。
// 只发字段名、分区和选项，不发档案内容；AI 认出的一律标黄，按网站记住，下次直接认（仍标黄）。

export function AiGuess({ count }: { count: number }) {
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [notice, setNotice] = useState<{ text: string; settings?: boolean } | null>(null);

  async function run() {
    setBusy(true);
    setNotice(null);
    try {
      const ep = endpointOf(await aiSettingsItem.getValue());
      if ('error' in ep) { setNotice({ text: `${ep.error}。`, settings: true }); return; }
      const r = await browser.runtime.sendMessage<Request, AiFieldsResult>({ type: 'ai-fields-active-tab' });
      if (!r.ok) { setNotice({ text: r.reason }); return; }
      if (!r.fields.length) { setNotice({ text: '没认出的字段都没有字段名，或者已经填上了，AI 也帮不上。' }); return; }
      const guesses = await runSkill(fieldMatchSkill, { fields: r.fields, custom: r.custom });
      if (!guesses.length) { setDone(true); setNotice({ text: `AI 看了 ${r.fields.length} 个字段，也认不出对应档案里的哪一项。可以点下面的字段，从候选里自己选。` }); return; }
      const a = await browser.runtime.sendMessage<Request, AiApplyResult>({ type: 'ai-apply-active-tab', guesses });
      if (!a.ok) { setNotice({ text: a.reason }); return; }
      setDone(true);
      const rest = r.fields.length - a.filled;
      setNotice({
        text: `AI 认出并填上了 ${a.filled} 个字段，已标黄，请逐个核对。${rest ? `还有 ${rest} 个没填上，原因见下面。` : ''}`
          + (a.filled ? '同一个网站下次会直接按这次的结果填（仍会标黄）。' : ''),
      });
    } catch (e) {
      setNotice({ text: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(false);
    }
  }

  if (!count && !notice) return null;
  return (
    <section className="card stack" style={{ gap: 'var(--space-3)' }}>
      {count > 0 && !done && <>
      <p style={{ margin: 0 }}>有 {count} 个字段插件没认出来，可以让 AI 看看字段名。</p>
      <p className="small muted" style={{ margin: 0 }}>只发送页面上的字段名和选项，不发送你的档案内容。AI 认出的会标黄，请核对。</p>
      <div><button className="btn btn-secondary" onClick={run} disabled={busy}><Sparkles {...iconProps} /> {busy ? 'AI 正在看…' : '让 AI 认一认'}</button></div>
      </>}
      {notice && (
        <p className="notice small enter" role="status">
          {notice.text}
          {notice.settings && <> <button className="btn btn-text small" onClick={() => browser.tabs.create({ url: `${browser.runtime.getURL('/options.html')}#ai` })}>去设置</button></>}
        </p>
      )}
    </section>
  );
}
