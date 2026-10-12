import { ArrowUp, Loader2, RotateCcw, ShieldCheck, Sparkles, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Markdown } from '@/src/components/Markdown';
import { iconProps } from '@/src/components/icon';
import { skillById, systemPrompt } from '@/src/lib/ai/chatSkills';
import { chat, type ChatMessage } from '@/src/lib/ai/client';
import { providerById } from '@/src/lib/ai/providers';
import { NOT_SENT_LABEL, resumeForAi, scrub } from '@/src/lib/ai/redact';
import { routeQuestion } from '@/src/lib/ai/router';
import { aiSettingsItem, endpointOf } from '@/src/lib/ai/settings';
import type { Profile } from '@/src/lib/profile/schema';
import { ensureAccess, useAiSettings } from './AiSettingsCard';
import { enabledSkills, DEFAULT_SKILL_PREFS } from '@/src/lib/ai/skillPrefs';
import { useSkillPrefs } from './SkillSettings';
import { storage } from 'wxt/utils/storage';

// “问 AI”：像聊天一样提问，插件自动挑最合适的技能来回答（也可以手动指定）。

interface Turn { role: 'user' | 'assistant'; content: string; skill?: string; how?: string }

const HOW = { keyword: '自动选择', ai: '自动选择', keep: '接着上一个话题', fallback: '自动选择', manual: '你指定的' } as const;
const MAX_HISTORY = 10;
/** 每份档案各存一段对话，只存在本机；切换页面、换档案、关掉再打开都还在，点「新对话」才清空 */
const MAX_SAVED = 200;
const chatsItem = storage.defineItem<Record<string, Turn[]>>('local:aiChats', { fallback: {} });

function pick<T>(xs: T[], n: number): T[] {
  return [...xs].sort(() => Math.random() - 0.5).slice(0, n);
}

export function AskAi({ profile }: { profile: Profile }) {
  const settings = useAiSettings();
  const prefs = useSkillPrefs()[0] ?? DEFAULT_SKILL_PREFS;
  const skills = enabledSkills(prefs);
  const [turns, setTurnsState] = useState<Turn[]>([]);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    setLoaded(false);
    void chatsItem.getValue().then((all) => { setTurnsState(all[profile.id] ?? []); setLoaded(true); });
  }, [profile.id]);
  const setTurns = (next: Turn[]) => {
    setTurnsState(next);
    void chatsItem.getValue().then((all) => chatsItem.setValue({ ...all, [profile.id]: next.slice(-MAX_SAVED) }));
  };
  const [input, setInput] = useState('');
  const [manual, setManual] = useState('auto');
  const chosen = skills.some((s) => s.id === manual) ? manual : 'auto';
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ctl = useRef<AbortController | null>(null);
  const end = useRef<HTMLDivElement>(null);
  const suggestions = useMemo(() => pick(enabledSkills(prefs).filter((s) => s.id !== 'general').map((s) => s.examples[0]!), 6), [prefs]);
  const provider = providerById(settings?.provider ?? '')?.name ?? 'AI 服务商';
  const ready = !!settings?.apiKey.trim();

  useEffect(() => { end.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }, [turns.length, busy]);

  async function send(text = input) {
    const q = text.trim();
    if (!q || busy || !settings) return;
    const denied = await ensureAccess(settings);
    if (denied) return setError(denied);
    const ep = endpointOf(await aiSettingsItem.getValue());
    if ('error' in ep) return setError(ep.error);

    const history = [...turns, { role: 'user' as const, content: q }];
    setTurns(history);
    setInput('');
    setError(null);
    setBusy(true);
    ctl.current = new AbortController();
    const signal = ctl.current.signal;
    try {
      const previous = [...turns].reverse().find((t) => t.skill)?.skill;
      const route = chosen === 'auto'
        ? await routeQuestion(ep, scrub(q, profile), previous, signal, skills)
        : { skill: skillById(chosen)!, by: 'manual' as const };
      const msgs: ChatMessage[] = [
        { role: 'system', content: systemPrompt(route.skill, prefs.attachResume ? resumeForAi(profile) : null) },
        ...history.slice(-MAX_HISTORY).map((t) => ({ role: t.role, content: scrub(t.content, profile) })),
      ];
      const answer = await chat(ep, msgs, { temperature: 0.6, signal });
      setTurns([...history, { role: 'assistant', content: answer, skill: route.skill.id, how: HOW[route.by] }]);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="stack ask" style={{ gap: 'var(--space-4)' }}>
      {loaded && turns.length === 0 && (
        <div className="stack">
          <p className="small muted">想问什么直接问，比如：</p>
          <div className="chips">
            {suggestions.map((s) => <button key={s} className="chip" onClick={() => send(s)} disabled={!ready || busy}>{s}</button>)}
          </div>
        </div>
      )}

      {turns.length > 0 && (
        <div className="chat" aria-live="polite">
          {turns.map((t, i) => (
            <div key={i} className={`bubble bubble-${t.role} enter`}>
              {t.role === 'assistant' && t.skill && (
                <div className="skill-tag"><Sparkles size={12} strokeWidth={1.5} /> {skillById(t.skill)?.name} · {t.how}</div>
              )}
              {t.role === 'assistant' ? <Markdown text={t.content} /> : <p className="pre">{t.content}</p>}
            </div>
          ))}
          {busy && <div className="bubble bubble-assistant muted small"><Loader2 {...iconProps} className="spin" /> 正在想…</div>}
          <div ref={end} />
        </div>
      )}

      {error && <div className="notice notice-err enter" role="alert">{error}</div>}

      <div className="composer">
        <textarea className="input textarea" rows={3} value={input} placeholder={ready ? '输入问题，Ctrl + Enter 发送。可以直接粘贴岗位描述、面试通知、你写的回答' : '先点右上角「设置」填好 API Key'}
          disabled={!ready} onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); void send(); } }} />
        <div className="row" style={{ flexWrap: 'wrap' }}>
          <select className="input select skill-pick" aria-label="用哪个技能回答" value={chosen} onChange={(e) => setManual(e.target.value)}>
            <option value="auto">自动选择技能</option>
            {skills.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          <span className="spacer" />
          {turns.length > 0 && !busy && <button className="btn btn-text" onClick={() => { setTurns([]); setError(null); }}><RotateCcw {...iconProps} /> 新对话</button>}
          {busy ? <button className="btn btn-secondary" onClick={() => ctl.current?.abort()}><X {...iconProps} /> 停止</button>
            : <button className="btn btn-primary" onClick={() => send()} disabled={!ready || !input.trim()}><ArrowUp {...iconProps} /> 发送</button>}
        </div>
      </div>
      <p className="privacy small">
        <ShieldCheck {...iconProps} aria-hidden />
        <span>问题会发给 {provider}；{prefs.attachResume ? `会附上「${profile.title || '当前档案'}」里的经历，作为回答的依据。` : '不附上档案里的经历（可在设置 → 技能里打开）。'}不会发送{NOT_SENT_LABEL}。</span>
      </p>
    </div>
  );
}
