import { Sparkles } from 'lucide-react';
import { useEffect, useState } from 'react';
import { iconProps } from '@/src/components/icon';
import { resumeForAi } from '@/src/lib/ai/redact';
import { runSkill } from '@/src/lib/ai/run';
import { aiSettingsItem, endpointOf } from '@/src/lib/ai/settings';
import { fieldMatchSkill } from '@/src/lib/ai/skills/fieldMatch';
import { pageQuestionsSkill } from '@/src/lib/ai/skills/pageQuestions';
import { widgetPlanSkill } from '@/src/lib/ai/skills/widgetPlan';
import { aiAutoRunItem } from '@/src/lib/fill/reportStore';
import type { AiApplyResult, AiFieldsResult, AiQuestionsResult, AiWidgetsResult, Request } from '@/src/lib/messages';
import { activeProfile, loadStore } from '@/src/lib/profile/store';

// 「AI 帮我填完」：规则填完之后剩下的，用户点一下才交给 AI，分三步：
// 1. 没认出的字段：只发字段名、分区和选项，AI 认是档案里的哪一项（计划书 L2）
// 2. 规则没能操作的控件（各家写法不同的日期面板）：只发面板上的按钮文字，AI 给操作步骤，值在本地代入
// 3. 档案里没有的问题：发题目、选项和去掉个人信息的简历，AI 写回答
// 不截图、不发页面上已经填好的内容。AI 填的一律标黄。

const send = <T,>(msg: Request) => browser.runtime.sendMessage<Request, T>(msg);

export function AiGuess({ count }: { count: number }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [notice, setNotice] = useState<{ text: string; settings?: boolean } | null>(null);

  async function run() {
    setBusy('正在准备…');
    setNotice(null);
    try {
      const ep = endpointOf(await aiSettingsItem.getValue());
      if ('error' in ep) { setNotice({ text: `${ep.error}。`, settings: true }); return; }
      const parts: string[] = [];
      let filled = 0;

      // 1. 认字段
      setBusy('AI 正在认字段…');
      const r = await send<AiFieldsResult>({ type: 'ai-fields-active-tab' });
      if (!r.ok) { setNotice({ text: r.reason }); return; }
      if (r.fields.length) {
        const guesses = await runSkill(fieldMatchSkill, { fields: r.fields, custom: r.custom });
        if (guesses.length) {
          const a = await send<AiApplyResult>({ type: 'ai-apply-active-tab', guesses });
          if (a.ok && a.filled) { filled += a.filled; parts.push(`认出 ${a.filled} 个字段`); }
        }
      }

      // 2. 日期面板等
      setBusy('AI 正在看日期面板…');
      const w = await send<AiWidgetsResult>({ type: 'ai-widgets-active-tab' });
      if (w.ok && w.views.length) {
        const plans = await runSkill(widgetPlanSkill, { fields: w.views });
        if (plans.length) {
          setBusy('正在按 AI 的步骤点选…');
          const a = await send<AiApplyResult>({ type: 'ai-widgets-apply-active-tab', plans });
          if (a.ok && a.filled) { filled += a.filled; parts.push(`点选了 ${a.filled} 个日期/面板`); }
        }
      }

      // 3. 档案里没有的问题
      setBusy('AI 正在回答问题…');
      const q = await send<AiQuestionsResult>({ type: 'ai-questions-active-tab' });
      const profile = activeProfile(await loadStore());
      if (q.ok && q.questions.length && profile) {
        const answers = await runSkill(pageQuestionsSkill, { questions: q.questions, company: q.company, resume: resumeForAi(profile) });
        if (answers.length) {
          const a = await send<AiApplyResult>({ type: 'ai-answers-apply-active-tab', answers });
          if (a.ok && a.filled) { filled += a.filled; parts.push(`回答了 ${a.filled} 个问题`); }
        }
      }

      setDone(true);
      setNotice({
        text: filled
          ? `AI ${parts.join('、')}，都已标黄，请逐个核对后再自己提交。剩下的没把握，原因见下面，可以点字段从候选里选或自己填。`
          : 'AI 看过了，剩下的字段它也没把握，原因见下面。可以点字段从候选里选，或者自己填。',
      });
    } catch (e) {
      setNotice({ text: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(null);
    }
  }

  // 弹窗里点了「AI 帮我填完」：侧边栏打开后自动开始
  useEffect(() => {
    aiAutoRunItem.getValue().then((at) => {
      if (at && Date.now() - at < 60_000 && count > 0) { aiAutoRunItem.setValue(null); run(); }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!count && !notice) return null;
  return (
    <section className="card stack" style={{ gap: 'var(--space-3)' }}>
      {count > 0 && !done && <>
      <p style={{ margin: 0 }}>还有 {count} 个字段没填上，可以让 AI 接着填：认字段、点日期面板、回答档案里没有的问题。</p>
      <p className="small muted" style={{ margin: 0 }}>只发字段名、选项、面板上的按钮文字和去掉姓名电话的简历，不截图、不发你已经填好的内容。AI 填的都会标黄，请核对。</p>
      <div><button className="btn btn-primary" onClick={run} disabled={!!busy}><Sparkles {...iconProps} /> {busy ?? 'AI 帮我填完'}</button></div>
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
