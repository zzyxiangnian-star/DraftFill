import { FileText, Loader2 } from 'lucide-react';
import { useRef, useState } from 'react';
import { iconProps } from '@/src/components/icon';
import type { ProfileStore } from '@/src/lib/profile/schema';
import { appendProfiles } from '@/src/lib/profile/store';
import { extractText } from '@/src/lib/resume/extract';
import { parseResume, type ParsedResume } from '@/src/lib/resume/parse';

// 从简历导入：读文字 → 本地识别 → 预览 → 另存为新档案。全程不联网。

type State =
  | { step: 'idle' }
  | { step: 'reading'; name: string }
  | { step: 'preview'; name: string; result: ParsedResume }
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
    setState({ step: 'preview', name: file.name, result: parseResume(r.text) });
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
    <section className="card stack" style={{ gap: 'var(--space-3)' }}>
      <h2>从简历导入</h2>
      <p className="small muted">选一份 PDF 或 Word 简历，自动认出姓名、学校、实习经历等，存成一份新档案。只在这台电脑上识别，不会上传。</p>
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
