import { ArrowLeft, BookmarkPlus, CalendarPlus, Check, KeyRound, ListPlus, Loader2, Settings, ShieldCheck, Sparkles, X } from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { iconProps } from '@/src/components/icon';
import { providerById } from '@/src/lib/ai/providers';
import { NOT_SENT_LABEL, resumeForAi, scrub, SENT_LABEL } from '@/src/lib/ai/redact';
import { runSkill } from '@/src/lib/ai/run';
import { countChars } from '@/src/lib/ai/skills/index';
import { diagnoseSkill, type DiagnoseResult } from '@/src/lib/ai/skills/diagnose';
import { jdMatchSkill, type JdResult } from '@/src/lib/ai/skills/jdMatch';
import { openQuestionSkill, type OpenQResult } from '@/src/lib/ai/skills/openQuestion';
import { polishSkill, type PolishResult } from '@/src/lib/ai/skills/polish';
import type { Profile, ProfileStore } from '@/src/lib/profile/schema';
import { updateProfile } from '@/src/lib/profile/store';
import { applicationStoreItem, recordNotice } from '@/src/lib/tracker/applications';
import { noticeSkill, type NoticeEvent, type NoticeResult } from '@/src/lib/ai/skills/notice';
import { toIcs } from '@/src/lib/tracker/ics';
import { AiSettingsCard, ensureAccess, useAiSettings } from './AiSettingsCard';
import { AskAi } from './AskAi';
import { AnswerLibrary, useAnswers } from './AnswerLibrary';
import { answerAdaptSkill, type AdaptResult } from '@/src/lib/ai/skills/answerAdapt';
import { addAnswer, markUsed, similarAnswers, type Answer } from '@/src/lib/answers/library';
import { Copy } from './Copy';
import { SkillSettings } from './SkillSettings';

type Tool = 'ask' | 'diagnose' | 'polish' | 'jd' | 'question' | 'answers' | 'notice';
const TOOLS: { id: Tool; label: string; desc: string }[] = [
  { id: 'ask', label: '问 AI', desc: '求职上的任何问题都可以问：简历、面试、网申问答题、笔试、offer、邮件……插件会自动挑最合适的技能来回答。' },
  { id: 'diagnose', label: '简历诊断', desc: '按 HR 初筛的标准逐条检查，告诉你最该改的地方，以及面试官可能追问什么。' },
  { id: 'polish', label: '经历润色', desc: '按 STAR 法则改写实习、项目、校园经历的描述。只改写法，不编造数字和经历，满意可以一键写回档案。' },
  { id: 'jd', label: '岗位分析', desc: '粘贴岗位描述，拆出硬性要求和关键词，逐条对照你的经历，看哪段该突出、缺什么。' },
  { id: 'question', label: '开放题写作', desc: '网申里的问答题（为什么选择我们、最有成就感的事……），按题型写 3 个版本，严格控制字数。' },
  { id: 'answers', label: '回答库', desc: '存你写过的好回答。网申页面上点进问答题时，相似题的回答会出现在候选卡里，点一下填入；写新题时也会列出来，可以让 AI 按新题改写。' },
  { id: 'notice', label: '通知整理', desc: '粘贴笔试、测评、面试通知，摘出时间、链接和要准备的东西，存成日历文件（手机、电脑日历都能导入），也能记到投递看板。' },
];

/** 运行一个技能：先申请访问权限（必须是点击后的第一个 await），再调用 */
function useRunner() {
  const settings = useAiSettings();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ctl = useRef<AbortController | null>(null);
  async function run<T>(fn: (signal: AbortSignal) => Promise<T>): Promise<T | null> {
    if (!settings) return null;
    const denied = await ensureAccess(settings);
    if (denied) { setError(denied); return null; }
    setBusy(true);
    setError(null);
    ctl.current = new AbortController();
    try {
      return await fn(ctl.current.signal);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      return null;
    } finally {
      setBusy(false);
    }
  }
  const ready = !!settings?.apiKey.trim();
  const provider = providerById(settings?.provider ?? '')?.name ?? 'AI 服务商';
  return { run, busy, error, ready, provider, cancel: () => ctl.current?.abort() };
}

function Privacy({ provider, extra }: { provider: string; extra?: string }) {
  return (
    <p className="privacy small">
      <ShieldCheck {...iconProps} aria-hidden />
      <span>会把你的{SENT_LABEL}{extra ? `，以及${extra}` : ''}发给 {provider}。不会发送{NOT_SENT_LABEL}。</span>
    </p>
  );
}

function RunButton({ r, label, onClick, disabled }: { r: ReturnType<typeof useRunner>; label: string; onClick: () => void; disabled?: boolean }) {
  return (
    <div className="row" style={{ flexWrap: 'wrap' }}>
      <button className="btn btn-primary" onClick={onClick} disabled={r.busy || !r.ready || disabled}>
        {r.busy ? <Loader2 {...iconProps} className="spin" /> : <Sparkles {...iconProps} />} {r.busy ? 'AI 正在写…' : label}</button>
      {r.busy && <button className="btn btn-text" onClick={r.cancel}><X {...iconProps} /> 取消</button>}
      {!r.ready && <span className="small muted">先点右上角「设置」填好 API Key。</span>}
    </div>
  );
}

const ErrorLine = ({ text }: { text: string | null }) => (text ? <div className="notice notice-err enter" role="alert">{text}</div> : null);

function Score({ value, label }: { value: number | null; label: string }) {
  if (value === null) return null;
  const tone = value >= 80 ? 'good' : value >= 60 ? 'mid' : 'low';
  return <div className={`score score-${tone}`}><strong>{value}</strong><span>{label}</span></div>;
}

function List({ title, items, children }: { title: string; items: unknown[]; children: ReactNode }) {
  if (!items.length) return null;
  return <div className="ai-list"><h3>{title}</h3>{children}</div>;
}

// —— 简历诊断 ——
function Diagnose({ profile }: { profile: Profile }) {
  const r = useRunner();
  const [target, setTarget] = useState(profile.intention.positions);
  const [res, setRes] = useState<DiagnoseResult | null>(null);
  const go = () => r.run((signal) => runSkill(diagnoseSkill, { resume: resumeForAi(profile), target: scrub(target) }, signal)).then((x) => x && setRes(x));
  return (
    <div className="stack" style={{ gap: 'var(--space-4)' }}>
      <label className="field">
        <span className="field-label">目标岗位（可不填）</span>
        <input className="input" value={target} onChange={(e) => setTarget(e.target.value)} placeholder="如：产品运营" />
      </label>
      <Privacy provider={r.provider} />
      <RunButton r={r} label="开始诊断" onClick={go} />
      <ErrorLine text={r.error} />
      {res && (
        <div className="ai-result enter">
          <div className="scores">
            <Score value={res.score} label="初筛通过可能性" />
            {res.scores.map((s) => <Score key={s.name} value={s.score} label={s.name} />)}
          </div>
          {res.summary && <p>{res.summary}</p>}
          <List title="亮点" items={res.strengths}><ul>{res.strengths.map((x) => <li key={x}>{x}</li>)}</ul></List>
          <List title="最该改的地方" items={res.issues}>
            <ul className="issues">
              {res.issues.map((x, i) => (
                <li key={i}>
                  <span className={`level level-${x.level}`}>{x.level}</span>
                  <div><strong>{x.where ? `${x.where}：` : ''}{x.problem}</strong><p className="muted">{x.fix}</p></div>
                </li>
              ))}
            </ul>
          </List>
          <List title="建议补充" items={res.missing}><ul>{res.missing.map((x) => <li key={x}>{x}</li>)}</ul></List>
          <List title="面试官可能会追问" items={res.followUps}><ul>{res.followUps.map((x) => <li key={x}>{x}</li>)}</ul></List>
        </div>
      )}
    </div>
  );
}

// —— 经历润色 ——
type Exp = { key: string; kind: '实习' | '项目' | '校园经历'; title: string; role: string; description: string; apply: (p: Profile, text: string) => Profile };

function experiencesOf(p: Profile): Exp[] {
  return [
    ...p.internships.map((x, i): Exp => ({ key: `i${x.id}`, kind: '实习', title: x.company || `实习 ${i + 1}`, role: x.title, description: x.description,
      apply: (q, text) => ({ ...q, internships: q.internships.map((y) => (y.id === x.id ? { ...y, description: text } : y)) }) })),
    ...p.projects.map((x, i): Exp => ({ key: `p${x.id}`, kind: '项目', title: x.name || `项目 ${i + 1}`, role: x.role, description: x.description,
      apply: (q, text) => ({ ...q, projects: q.projects.map((y) => (y.id === x.id ? { ...y, description: text } : y)) }) })),
    ...p.campus.map((x, i): Exp => ({ key: `c${x.id}`, kind: '校园经历', title: x.organization || `校园经历 ${i + 1}`, role: x.role, description: x.description,
      apply: (q, text) => ({ ...q, campus: q.campus.map((y) => (y.id === x.id ? { ...y, description: text } : y)) }) })),
  ];
}

function PolishOne({ exp, profile, onApply }: { exp: Exp; profile: Profile; onApply: (text: string) => void }) {
  const r = useRunner();
  const [res, setRes] = useState<PolishResult | null>(null);
  const [applied, setApplied] = useState<string | null>(null);
  const go = () => r.run((signal) => runSkill(polishSkill, {
    kind: exp.kind, title: scrub(exp.title, profile), role: scrub(exp.role, profile), description: scrub(exp.description, profile),
    target: scrub(profile.intention.positions, profile),
  }, signal)).then((x) => { if (x) { setRes(x); setApplied(null); } });
  return (
    <li className="polish-item">
      <div className="polish-head">
        <div><strong>{exp.title}</strong> <span className="muted small">{exp.kind}{exp.role ? ` · ${exp.role}` : ''}</span></div>
        <button className="btn btn-secondary" onClick={go} disabled={r.busy || !r.ready || !exp.description.trim()}>
          {r.busy ? <Loader2 {...iconProps} className="spin" /> : <Sparkles {...iconProps} />} {res ? '再润色一次' : '润色'}</button>
      </div>
      {!exp.description.trim() ? <p className="small muted">这段经历还没写描述，先在档案里写几句做了什么。</p>
        : <p className="small muted polish-orig">{exp.description}</p>}
      <ErrorLine text={r.error} />
      {res && (
        <div className="polish-versions enter">
          {res.versions.map((v) => (
            <div key={v.style} className="polish-version">
              <div className="row"><span className="label">{v.style}</span><span className="spacer" /><Copy text={v.text} />
                <button className="btn btn-text small" disabled={applied === v.text} onClick={() => { onApply(v.text); setApplied(v.text); }}>
                  <Check {...iconProps} /> {applied === v.text ? '已写回档案' : '写回档案'}</button></div>
              <p className="pre">{v.text}</p>
            </div>
          ))}
          {res.tips.length > 0 && <div className="ai-list"><h3>还可以补充</h3><ul>{res.tips.map((t) => <li key={t}>{t}</li>)}</ul></div>}
          <p className="small muted">【待补充】的地方请换成真实情况，没有就删掉，不要编。</p>
        </div>
      )}
    </li>
  );
}

function Polish({ profile, store, commit }: { profile: Profile; store: ProfileStore; commit: (s: ProfileStore, immediate?: boolean) => void }) {
  const exps = experiencesOf(profile);
  const r = useRunner();
  if (!exps.length) return <p className="muted">档案里还没有实习、项目或校园经历。</p>;
  return (
    <div className="stack" style={{ gap: 'var(--space-4)' }}>
      <Privacy provider={r.provider} extra="要润色的那一段描述" />
      <ul className="polish-list">
        {exps.map((e) => (
          <PolishOne key={e.key} exp={e} profile={profile} onApply={(text) => {
            const latest = store.profiles.find((p) => p.id === profile.id) ?? profile;
            commit(updateProfile(store, e.apply(latest, text)), true);
          }} />
        ))}
      </ul>
    </div>
  );
}

// —— 岗位分析 ——
const STATUS_TONE = { 已覆盖: 'good', 弱覆盖: 'mid', 未覆盖: 'low' } as const;

function JdMatch({ profile, initial = '' }: { profile: Profile; initial?: string }) {
  const r = useRunner();
  const [jd, setJd] = useState(initial);
  const [res, setRes] = useState<JdResult | null>(null);
  const go = () => r.run((signal) => runSkill(jdMatchSkill, { jd: scrub(jd, profile), resume: resumeForAi(profile) }, signal)).then((x) => x && setRes(x));
  return (
    <div className="stack" style={{ gap: 'var(--space-4)' }}>
      <label className="field">
        <span className="field-label">岗位描述（JD）</span>
        <textarea className="input textarea" rows={8} value={jd} onChange={(e) => setJd(e.target.value)}
          placeholder="把招聘页上的岗位职责、任职要求整段复制过来" />
      </label>
      <Privacy provider={r.provider} extra="这段岗位描述" />
      <RunButton r={r} label="开始分析" onClick={go} disabled={jd.trim().length < 20} />
      <ErrorLine text={r.error} />
      {res && (
        <div className="ai-result enter">
          <div className="scores"><Score value={res.score} label={res.position ? `与「${res.position}」的匹配度` : '匹配度'} /></div>
          {res.summary && <p>{res.summary}</p>}
          <List title="可能直接被筛掉的地方" items={res.risks}><ul className="risks">{res.risks.map((x) => <li key={x}>{x}</li>)}</ul></List>
          <List title="逐条对照" items={res.requirements}>
            <ul className="reqs">
              {res.requirements.map((x, i) => (
                <li key={i}>
                  <span className={`tag tag-${STATUS_TONE[x.status]}`}>{x.status}</span>
                  <div><strong>{x.item}</strong> <span className="muted small">{x.kind}</span><p className="muted small">{x.evidence}</p></div>
                </li>
              ))}
            </ul>
          </List>
          <List title="JD 关键词" items={res.keywords}><div className="chips">{res.keywords.map((k) => <span key={k} className="kw">{k}</span>)}</div></List>
          <List title="简历里缺的关键词" items={res.missingKeywords}><div className="chips">{res.missingKeywords.map((k) => <span key={k} className="kw kw-miss">{k}</span>)}</div></List>
          <List title="最该突出的经历" items={res.highlight}><ul>{res.highlight.map((h) => <li key={h.experience}><strong>{h.experience}</strong>：{h.why}</li>)}</ul></List>
          <List title="修改建议" items={res.suggestions}><ol>{res.suggestions.map((x) => <li key={x}>{x}</li>)}</ol></List>
        </div>
      )}
    </div>
  );
}

// —— 通知整理（计划书 L7）——
const pad2 = (n: number) => String(n).padStart(2, '0');
function todayStr(d = new Date()) { return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`; }
const WEEK = '日一二三四五六';
function when(e: NoticeEvent): string {
  const d = new Date(`${e.start.slice(0, 10)}T00:00:00`);
  const day = `${d.getMonth() + 1} 月 ${d.getDate()} 日（周${WEEK[d.getDay()]}）`;
  const time = e.start.slice(11);
  const end = e.end && e.end.slice(0, 10) === e.start.slice(0, 10) ? e.end.slice(11) : '';
  return `${day}${time ? ` ${time}` : ''}${end ? `–${end}` : ''}`;
}

function Notice({ profile }: { profile: Profile }) {
  const r = useRunner();
  const [text, setText] = useState('');
  const [res, setRes] = useState<NoticeResult | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const go = () => {
    setSaved(null);
    return r.run((signal) => runSkill(noticeSkill, { text: scrub(text, profile), today: todayStr() }, signal)).then((x) => x && setRes(x));
  };
  const prefix = res ? [res.company, res.kind !== '其他' ? res.kind.replace('/测评', '') : ''].filter(Boolean).join(' ') : '';

  function download() {
    if (!res) return;
    const ics = toIcs(res.events, { prefix, extra: res.prepare.length ? `要准备：${res.prepare.join('；')}` : '' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([ics], { type: 'text/calendar;charset=utf-8' }));
    // 文件名用英文：部分系统环境下中文文件名会被浏览器换成“download”
    a.download = `draftfill-schedule-${todayStr().replace(/-/g, '')}.ics`;
    document.body.append(a);
    a.click();
    a.remove();
    // 立即回收会让部分浏览器丢掉文件名，稍后再回收
    setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
  }

  async function toBoard() {
    if (!res) return;
    const first = res.events[0];
    const line = res.events.map((e) => `${e.start.slice(5)} ${e.title}${e.deadline ? '截止' : ''}${e.place ? `（${e.place}）` : ''}`).join('；') || '收到通知';
    const { store, updated } = recordNotice(await applicationStoreItem.getValue(), {
      company: res.company || '未知公司', position: res.position,
      status: res.kind === '其他' ? null : res.kind, line: first ? line : '收到通知',
    });
    await applicationStoreItem.setValue(store);
    setSaved(updated ? `已更新投递看板里「${updated.company}」这一条：状态 ${updated.status}，备注里加了时间。` : `看板里没有这家公司，已新记一条「${res.company || '未知公司'}」。`);
  }

  return (
    <div className="stack" style={{ gap: 'var(--space-4)' }}>
      <label className="field">
        <span className="field-label">通知原文</span>
        <textarea className="input textarea" rows={8} value={text} onChange={(e) => setText(e.target.value)}
          placeholder="把邮件或短信里的笔试、测评、面试通知整段复制过来" />
      </label>
      <p className="privacy small">
        <ShieldCheck {...iconProps} aria-hidden />
        <span>只把这段通知发给 {r.provider}，发送前抹掉其中的手机号、邮箱、证件号和你的名字。不发送档案。</span>
      </p>
      <RunButton r={r} label="整理通知" onClick={go} disabled={text.trim().length < 10} />
      <ErrorLine text={r.error} />
      {res && (
        <div className="ai-result enter">
          <p><strong>{[res.company, res.position].filter(Boolean).join(' · ') || '通知'}</strong> <span className="tag tag-plain">{res.kind}</span></p>
          {res.events.length ? (
            <List title="日程" items={res.events}>
              <ul className="events">
                {res.events.map((e, i) => (
                  <li key={i}>
                    <strong>{when(e)}</strong> {e.title}{e.deadline && <span className="tag tag-mid">截止</span>}
                    {e.place && <span className="muted small"> · {e.place}</span>}
                    {e.link && <div className="small"><a href={e.link} target="_blank" rel="noreferrer">{e.link}</a></div>}
                  </li>
                ))}
              </ul>
            </List>
          ) : <p className="muted">通知里没找到明确的日期时间。</p>}
          <p className="small muted">时间和链接是从原文里摘的（原文里没有的链接不会显示），加进日历前请和原文对一遍。</p>
          <List title="要准备的" items={res.prepare}><ul>{res.prepare.map((x) => <li key={x}>{x}</li>)}</ul></List>
          <List title="注意事项" items={res.notes}><ul>{res.notes.map((x) => <li key={x}>{x}</li>)}</ul></List>
          <div className="row" style={{ flexWrap: 'wrap' }}>
            <button className="btn btn-primary" onClick={download} disabled={!res.events.length}><CalendarPlus {...iconProps} /> 下载日历文件</button>
            <button className="btn btn-secondary" onClick={toBoard}><ListPlus {...iconProps} /> 记到投递看板</button>
          </div>
          {saved && <p className="notice small enter" role="status">{saved}</p>}
        </div>
      )}
    </div>
  );
}

// —— 开放题 ——
function SaveButton({ saved, onClick }: { saved: boolean; onClick: () => void }) {
  return (
    <button className="btn btn-text small" disabled={saved} onClick={onClick}>
      {saved ? <Check {...iconProps} /> : <BookmarkPlus {...iconProps} />} {saved ? '已存进回答库' : '存进回答库'}</button>
  );
}

/** 计划书 L4：回答库里的相似题。可以直接复制，或者让 AI 按这道题改写（只发这一条旧回答，抹掉个人信息） */
function SimilarAnswer({ answer, r, profile, question, limit, company, onUse, onSave, saved }: {
  answer: Answer; r: ReturnType<typeof useRunner>; profile: Profile; question: string; limit: number; company: string;
  onUse: () => void; onSave: (text: string) => void; saved: Set<string>;
}) {
  const [res, setRes] = useState<AdaptResult | null>(null);
  const go = () => r.run((signal) => runSkill(answerAdaptSkill, {
    question: scrub(question, profile), limit, company: scrub(company, profile),
    oldQuestion: scrub(answer.question, profile), oldText: scrub(answer.text, profile), oldCompany: answer.company,
  }, signal)).then((x) => { if (x) { setRes(x); onUse(); } });
  const chars = countChars(answer.text);
  return (
    <div className="polish-version answer-item">
      <div className="row" style={{ flexWrap: 'wrap' }}>
        <strong className="answer-q">{answer.question}</strong>
        {answer.company && <span className="tag tag-plain">写给 {answer.company}</span>}
        <span className="spacer" />
        <span className={`small ${limit && chars > limit ? 'text-err' : 'muted'}`}>{chars} 字{limit && chars > limit ? '，超出这道题的上限' : ''}</span>
      </div>
      <p className="pre answer-text">{answer.text}</p>
      <div className="row" style={{ flexWrap: 'wrap', gap: 0 }}>
        <Copy text={answer.text} onCopied={onUse} />
        <button className="btn btn-text small" onClick={go} disabled={r.busy || !r.ready || question.trim().length < 4}>
          {r.busy ? <Loader2 {...iconProps} className="spin" /> : <Sparkles {...iconProps} />} 让 AI 按这道题改写</button>
      </div>
      {res && (
        <div className="stack enter" style={{ gap: 'var(--space-2)' }}>
          <div className="row">
            <span className="label">改写后</span><span className="spacer" />
            <span className={`small ${res.over ? 'text-err' : 'muted'}`}>{res.chars}{limit ? ` / ${limit}` : ''} 字{res.over ? '，超出上限' : ''}</span>
            <Copy text={res.text} />
            <SaveButton saved={saved.has(res.text)} onClick={() => onSave(res.text)} />
          </div>
          <p className="pre">{res.text}</p>
          {res.changes.length > 0 && <ul className="small muted">{res.changes.map((c) => <li key={c}>{c}</li>)}</ul>}
        </div>
      )}
    </div>
  );
}

function OpenQuestion({ profile }: { profile: Profile }) {
  const r = useRunner();
  const [question, setQuestion] = useState('');
  const [limit, setLimit] = useState('500');
  const [company, setCompany] = useState('');
  const [jd, setJd] = useState('');
  const [res, setRes] = useState<OpenQResult | null>(null);
  // 题目里写了字数（“200 字以内”），字数上限跟着改
  const onQuestion = (q: string) => {
    setQuestion(q);
    const m = /(\d{2,4})\s*(?:个)?字/.exec(q);
    if (m) setLimit(m[1]!);
  };
  const [answers, changeAnswers] = useAnswers();
  const [saved, setSaved] = useState<Set<string>>(new Set());
  const similar = answers ? similarAnswers(question, answers.items, 3) : [];
  const save = (text: string) => {
    void changeAnswers((st) => addAnswer(st, { question, text, company: company.split(/[·\s]/)[0] ?? '' }));
    setSaved((x) => new Set(x).add(text));
  };
  const go = () => r.run((signal) => runSkill(openQuestionSkill, {
    question: scrub(question, profile), limit: Number(limit) || 0, company: scrub(company, profile), jd: scrub(jd, profile), resume: resumeForAi(profile),
  }, signal)).then((x) => x && setRes(x));
  return (
    <div className="stack" style={{ gap: 'var(--space-4)' }}>
      <label className="field">
        <span className="field-label">题目</span>
        <textarea className="input textarea" rows={3} value={question} onChange={(e) => onQuestion(e.target.value)}
          placeholder="如：请描述一次你遇到困难并最终解决的经历" />
      </label>
      {similar.length > 0 && (
        <div className="stack" style={{ gap: 'var(--space-2)' }}>
          <span className="label">回答库里有相似的题</span>
          <p className="small muted" style={{ margin: 0 }}>可以直接复制；让 AI 改写时，只发这条旧回答和题目（先抹掉手机号、邮箱、证件号和姓名），不发档案。</p>
          {similar.map(({ answer }) => <SimilarAnswer key={answer.id} answer={answer} r={r} profile={profile}
            question={question} limit={Number(limit) || 0} company={company} onUse={() => void changeAnswers((st) => markUsed(st, answer.id))} onSave={save} saved={saved} />)}
        </div>
      )}
      <div className="grid ai-grid">
        <label className="field">
          <span className="field-label">字数上限</span>
          <input className="input" inputMode="numeric" value={limit} onChange={(e) => setLimit(e.target.value.replace(/\D/g, ''))} placeholder="不限就留空" />
        </label>
        <label className="field">
          <span className="field-label">公司和岗位（可不填）</span>
          <input className="input" value={company} onChange={(e) => setCompany(e.target.value)} placeholder="如：转转 · 产品运营" />
        </label>
      </div>
      <label className="field">
        <span className="field-label">岗位描述（可不填，填了写得更贴合）</span>
        <textarea className="input textarea" rows={4} value={jd} onChange={(e) => setJd(e.target.value)} />
      </label>
      <Privacy provider={r.provider} extra="题目和岗位信息" />
      <RunButton r={r} label="写 3 个版本" onClick={go} disabled={question.trim().length < 4} />
      <ErrorLine text={r.error} />
      {res && (
        <div className="ai-result enter">
          {(res.type || res.plan) && <p><span className="tag tag-mid">{res.type || '题型'}</span> {res.plan}</p>}
          {res.versions.map((v, i) => (
            <div key={i} className="polish-version">
              <div className="row">
                <span className="label">版本 {i + 1}{v.angle ? ` · ${v.angle}` : ''}</span><span className="spacer" />
                <span className={`small ${v.over ? 'text-err' : 'muted'}`}>{v.chars}{Number(limit) ? ` / ${limit}` : ''} 字{v.over ? '，超出上限' : ''}</span>
                <Copy text={v.text} />
                <SaveButton saved={saved.has(v.text)} onClick={() => save(v.text)} />
              </div>
              <p className="pre">{v.text}</p>
            </div>
          ))}
          <p className="small muted">AI 写的是草稿：请对照真实经历修改，换成你自己的说法再提交。改好的版本可以存进回答库，下次遇到相似的题直接用。</p>
        </div>
      )}
    </div>
  );
}

type View = 'main' | 'api' | 'skills';

export function AiPage({ store, commit }: { store: ProfileStore; commit: (s: ProfileStore, immediate?: boolean) => void }) {
  const settings = useAiSettings();
  const [view, setView] = useState<View>('main');
  const [tool, setTool] = useState<Tool>('ask');
  // 从投递看板点“分析匹配度”进来：带上收藏时摘下的岗位描述
  const [jdFromBoard, setJdFromBoard] = useState('');
  useEffect(() => {
    const id = new URLSearchParams(location.search).get('jd');
    if (!id) return;
    applicationStoreItem.getValue().then(({ items }) => {
      const a = items.find((x) => x.id === id);
      if (a?.jd) { setJdFromBoard(`${a.company} ${a.position}\n${a.jd}`.trim()); setTool('jd'); }
    });
  }, []);
  const [profileId, setProfileId] = useState(store.activeId);
  const profile = store.profiles.find((p) => p.id === profileId) ?? store.profiles[0];
  const meta = TOOLS.find((t) => t.id === tool)!;

  if (view !== 'main') {
    return (
      <>
        <div className="ai-head">
          <div className="stack">
            <h1>AI 设置</h1>
            <p className="muted">选服务商、填 API Key；按需开关回答问题时用到的技能。</p>
          </div>
          <button className="btn btn-secondary" onClick={() => setView('main')}><ArrowLeft {...iconProps} /> 返回</button>
        </div>
        <div>
          <div className="seg" role="tablist" aria-label="设置项">
            <button role="tab" className="seg-item" aria-selected={view === 'api'} onClick={() => setView('api')}>API</button>
            <button role="tab" className="seg-item" aria-selected={view === 'skills'} onClick={() => setView('skills')}>技能</button>
          </div>
        </div>
        {view === 'api' ? <AiSettingsCard /> : <SkillSettings />}
      </>
    );
  }

  return (
    <>
      <div className="ai-head">
        <div className="stack">
          <h1>AI 助手</h1>
          <p className="muted">诊断和润色简历、分析岗位、写网申问答题。每个功能都配了专门的方法，只依据你档案里的真实经历，不编造。</p>
        </div>
        <button className="btn btn-secondary" onClick={() => setView('api')}><Settings {...iconProps} /> 设置</button>
      </div>
      {settings && !settings.apiKey.trim() && (
        <div className="notice row" style={{ flexWrap: 'wrap' }}>
          <KeyRound {...iconProps} aria-hidden />
          <span>还没有填写 API Key，先选一家 AI 服务商。</span>
          <span className="spacer" />
          <button className="btn btn-primary" onClick={() => setView('api')}>去设置</button>
        </div>
      )}
      {!profile ? <p className="muted">还没有档案，先建一份。</p> : (
        <section className="card-plain stack" style={{ gap: 'var(--space-4)' }}>
          <div className="row" style={{ flexWrap: 'wrap' }}>
            <div className="seg" role="tablist" aria-label="AI 功能">
              {TOOLS.map((t) => (
                <button key={t.id} role="tab" className="seg-item" aria-selected={tool === t.id} onClick={() => setTool(t.id)}>{t.label}</button>
              ))}
            </div>
            <span className="spacer" />
            {store.profiles.length > 1 && (
              <select className="input select profile-pick" aria-label="用哪份档案" value={profile.id} onChange={(e) => setProfileId(e.target.value)}>
                {store.profiles.map((p) => <option key={p.id} value={p.id}>{p.title || '未命名档案'}</option>)}
              </select>
            )}
          </div>
          <p className="small muted">{meta.desc}</p>
          <div key={`${tool}-${profile.id}-${jdFromBoard.length}`}>
            {tool === 'ask' ? <AskAi profile={profile} />
              : tool === 'diagnose' ? <Diagnose profile={profile} />
              : tool === 'polish' ? <Polish profile={profile} store={store} commit={commit} />
              : tool === 'jd' ? <JdMatch profile={profile} initial={jdFromBoard} />
              : tool === 'notice' ? <Notice profile={profile} />
              : tool === 'answers' ? <AnswerLibrary />
              : <OpenQuestion profile={profile} />}
          </div>
        </section>
      )}
    </>
  );
}
