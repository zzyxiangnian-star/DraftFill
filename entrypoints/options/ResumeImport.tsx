import { FileText, Loader2, Sparkles } from 'lucide-react';
import { useRef, useState } from 'react';
import { iconProps } from '@/src/components/icon';
import type { ProfileStore } from '@/src/lib/profile/schema';
import { appendProfiles } from '@/src/lib/profile/store';
import { extractText } from '@/src/lib/resume/extract';
import { describeProfile, parseResume, type ParsedResume } from '@/src/lib/resume/parse';
import { runSkill } from '@/src/lib/ai/run';
import { aiSettingsItem, endpointOf } from '@/src/lib/ai/settings';
import { mergeAiResume, resumeStructureSkill, resumeTextForAi } from '@/src/lib/ai/skills/resumeStructure';

// 从简历导入：读文字 → 本地识别 → 预览 → 另存为新档案。默认不联网；
// 用户点「用 AI 整理经历」时（计划书 L1），才把去掉个人信息的正文发给选好的 AI 服务商。

type State =
  | { step: 'idle' }
  | { step: 'reading'; name: string }
  | { step: 'preview'; name: string; text: string; result: ParsedResume; ai?: boolean }
  | { step: 'error'; reason: string };

export function ResumeImport({ store, commit, onCreated }: {
  store: ProfileStore;
  commit: (s: ProfileStore, immediate?: boolean) => void;
  onCreated: (id: string) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [state, setState] = useState<State>({ step: 'idle' });

  async function onFile(file: File | undefined) {
    if (fileRef.current) fileRef.current.value = '';
    if (!file) return;
    setState({ step: 'reading', name: file.name });
    const r = await extractText(file);
    if (!r.ok) return setState({ step: 'error', reason: r.reason });
    setState({ step: 'preview', name: file.name, text: r.text, result: parseResume(r.text) });
    setAiNote(null);
  }

  const [aiBusy, setAiBusy] = useState(false);
  const [aiNote, setAiNote] = useState<{ text: string; settings?: boolean } | null>(null);

  async function tidyWithAi() {
    if (state.step !== 'preview') return;
    setAiBusy(true);
    setAiNote(null);
    try {
      const ep = endpointOf(await aiSettingsItem.getValue());
      if ('error' in ep) { setAiNote({ text: `${ep.error}。`, settings: true }); return; }
      const sent = resumeTextForAi(state.text, state.result.profile);
      const ai = await runSkill(resumeStructureSkill, { text: sent });
      const { profile, notes } = mergeAiResume(state.result.profile, ai, state.text);
      setState({ ...state, ai: true, result: { profile, found: describeProfile(profile), notes } });
    } catch (e) {
      setAiNote({ text: e instanceof Error ? e.message : String(e) });
    } finally {
      setAiBusy(false);
    }
  }

  function save(result: ParsedResume) {
    const titles = new Set(store.profiles.map((p) => p.title));
    let title = result.profile.title;
    for (let i = 2; titles.has(title); i++) title = `${result.profile.title} ${i}`;
    const profile = { ...result.profile, title, createdAt: Date.now(), updatedAt: Date.now() };
    commit(appendProfiles(store, [profile]), true);
    setState({ step: 'idle' });
    onCreated(profile.id);
  }

  const groups = state.step === 'preview'
    ? [...new Set(state.result.found.map((f) => f.group))].map((g) => [g, state.result.found.filter((f) => f.group === g)] as const)
    : [];

  return (
    <section className="card stack" style={{ gap: 'var(--space-3)' }} data-tour="resume-import">
      <h2>从简历导入</h2>
      <p className="small muted">选一份 PDF 或 Word 简历，自动认出姓名、学校、实习经历等，存成一份新档案。在这台电脑上识别，不会上传；只有你点「用 AI 整理经历」时，才把去掉个人信息的正文发给 AI。</p>
      <input ref={fileRef} type="file" accept=".pdf,.docx,.txt,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain"
        hidden onChange={(e) => onFile(e.target.files?.[0])} />

      {state.step === 'reading' ? (
        <p className="small muted row"><Loader2 {...iconProps} className="spin" /> 正在读取 {state.name}…</p>
      ) : state.step !== 'preview' ? (
        <div><button className="btn btn-secondary" onClick={() => fileRef.current?.click()}><FileText {...iconProps} /> 选择简历文件</button></div>
      ) : null}

      {state.step === 'error' && <div className="notice notice-err enter" role="alert">{state.reason}</div>}

      {state.step === 'preview' && (
        <div className="stack enter" style={{ gap: 'var(--space-3)' }}>
          <p className="small">从 {state.name} 里认出了 {state.result.found.length} 项。请看一眼，没问题就存成新档案，之后还能在档案页修改。</p>
          {state.result.notes.length > 0 && (
            <div className="notice notice-warn" role="status">{state.result.notes.join(' ')}</div>
          )}
          <div className="resume-preview">
            {groups.map(([g, items]) => (
              <div key={g} className="resume-group">
                <div className="label">{g}</div>
                <dl>
                  {items.map((f, i) => (
                    <div key={i} className="resume-row"><dt>{f.label}</dt><dd>{f.value}</dd></div>
                  ))}
                </dl>
              </div>
            ))}
          </div>
          {!state.ai ? (
            <div className="card-plain stack" style={{ gap: 'var(--space-2)' }}>
              <p className="small" style={{ margin: 0 }}>经历没认全？可以让 AI 再整理一遍教育、实习、项目、校园经历、获奖和技能。</p>
              <p className="small muted" style={{ margin: 0 }}>会发给你在 AI 助手里选的服务商：去掉姓名、电话、邮箱、证件号、出生日期、籍贯户口、地址之后的简历正文。基本信息仍以这台电脑上认出的为准。</p>
              <div><button className="btn btn-secondary" onClick={tidyWithAi} disabled={aiBusy}>
                {aiBusy ? <Loader2 {...iconProps} className="spin" /> : <Sparkles {...iconProps} />} {aiBusy ? 'AI 正在整理…' : '用 AI 整理经历'}
              </button></div>
              {aiNote && (
                <p className="notice small enter" role="status" style={{ margin: 0 }}>
                  {aiNote.text}
                  {aiNote.settings && <> <button className="btn btn-text small" onClick={() => { location.hash = 'ai'; }}>去设置</button></>}
                </p>
              )}
            </div>
          ) : (
            <p className="notice small enter" role="status">经历部分是 AI 按简历原文整理的，基本信息是这台电脑上认出的。存之前请再看一眼。</p>
          )}
          <p className="small muted">没认出来或认错的，存好后在档案页改就行。手机号、邮箱默认不会自动填到网申里，需要的话在档案的基本信息里打开开关。</p>
          <div className="row">
            <button className="btn btn-primary" onClick={() => save(state.result)}>存为新档案</button>
            <button className="btn btn-secondary" onClick={() => fileRef.current?.click()}>换一份简历</button>
            <button className="btn btn-text" onClick={() => setState({ step: 'idle' })}>取消</button>
          </div>
        </div>
      )}
    </section>
  );
}
