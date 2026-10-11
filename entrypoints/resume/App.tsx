import { Copy, Printer } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Logo } from '@/src/components/Logo';
import { iconProps } from '@/src/components/icon';
import { Toggle } from '@/src/components/form';
import { useProfileStore } from '@/src/lib/profile/useProfileStore';
import { buildResume, DEFAULT_SECTIONS, RESUME_SECTIONS, resumeText, type SectionId } from '@/src/lib/resume/export';

// 导出简历：左边选导出哪些内容，右边是 A4 预览。用浏览器的“打印 → 另存为 PDF”保存。

const SECTIONS_KEY = 'wangshen-resume-sections';

function loadSections(): SectionId[] {
  try {
    const v = JSON.parse(localStorage.getItem(SECTIONS_KEY) ?? 'null');
    if (Array.isArray(v)) return v.filter((x) => RESUME_SECTIONS.some((s) => s.id === x));
  } catch { /* 用默认 */ }
  return DEFAULT_SECTIONS;
}

export function App() {
  const { store } = useProfileStore();
  const [profileId, setProfileId] = useState(() => new URLSearchParams(location.search).get('profile') ?? '');
  const [sections, setSections] = useState<SectionId[]>(loadSections);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    try { localStorage.setItem(SECTIONS_KEY, JSON.stringify(sections)); } catch { /* 无痕模式 */ }
  }, [sections]);

  const profile = store?.profiles.find((p) => p.id === profileId) ?? store?.profiles.find((p) => p.id === store.activeId) ?? store?.profiles[0];
  const doc = useMemo(() => (profile ? buildResume(profile, sections, new Date()) : null), [profile, sections]);
  useEffect(() => { if (doc) document.title = `${doc.name}的简历`; }, [doc?.name]);

  const toggle = (id: SectionId, on: boolean) =>
    setSections((s) => (on ? RESUME_SECTIONS.map((x) => x.id).filter((x) => x === id || s.includes(x)) : s.filter((x) => x !== id)));

  async function copy() {
    if (!doc) return;
    await navigator.clipboard.writeText(resumeText(doc));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  if (!store) return null;
  if (!profile || !doc) {
    return <div className="rs-empty"><Logo /><p className="muted">还没有档案，先到设置页建一份。</p></div>;
  }

  return (
    <div className="rs">
      <aside className="rs-side">
        <Logo />
        <div className="stack">
          <h1 className="rs-title">导出简历</h1>
          <p className="small muted">只导出简历上该有的内容。身份证号、籍贯、户口、家庭成员这些网申专用信息不会出现在简历里。</p>
        </div>
        {store.profiles.length > 1 && (
          <label className="field">
            <span className="field-label">用哪份档案</span>
            <select className="input select" value={profile.id} onChange={(e) => setProfileId(e.target.value)}>
              {store.profiles.map((p) => <option key={p.id} value={p.id}>{p.title || '未命名档案'}</option>)}
            </select>
          </label>
        )}
        <div className="stack rs-toggles">
          <div className="label">导出哪些内容</div>
          {RESUME_SECTIONS.map((s) => (
            <Toggle key={s.id} checked={sections.includes(s.id)} onChange={(on) => toggle(s.id, on)}>
              {s.label}{'hint' in s && <span className="muted small">（{s.hint}）</span>}
            </Toggle>
          ))}
        </div>
        <div className="stack">
          <button className="btn btn-primary" onClick={() => window.print()}><Printer {...iconProps} /> 打印 / 存为 PDF</button>
          <p className="small muted">在打印窗口里把「目标打印机」选成「另存为 PDF」。</p>
          <button className="btn btn-secondary" onClick={copy}><Copy {...iconProps} /> {copied ? '已复制' : '复制为纯文字'}</button>
        </div>
      </aside>

      <main className="rs-paper" aria-label="简历预览">
        <header className="rs-head">
          <h1>{doc.name}</h1>
          {doc.lines.map((l) => <p key={l}>{l}</p>)}
        </header>
        {doc.blocks.map((b) => (
          <section key={b.id} className="rs-block">
            <h2>{b.heading}</h2>
            {b.entries.map((e, i) => (
              <div key={i} className="rs-entry">
                {(e.title || e.subtitle || e.period) && (
                  <div className="rs-entry-head">
                    <strong>{e.title}</strong>
                    {e.subtitle && <span>{e.subtitle}</span>}
                    <span className="rs-period">{e.period}</span>
                  </div>
                )}
                {e.points.length > 0 && <ul>{e.points.map((p, j) => <li key={j}>{p}</li>)}</ul>}
              </div>
            ))}
          </section>
        ))}
        {!doc.blocks.length && <p className="muted">勾选左边的内容后，这里会出现简历。</p>}
      </main>
    </div>
  );
}
