import { ArrowRight, PanelRight, Settings, Sparkles, Undo2, UserRound } from 'lucide-react';
import { useState } from 'react';
import { Logo } from '@/src/components/Logo';
import { Counts, ReportList, revealField } from '@/src/components/Report';
import { StatusRow } from '@/src/components/StatusRow';
import { iconProps } from '@/src/components/icon';
import type { FillResult, Request, UndoResult } from '@/src/lib/messages';
import { activeProfile, setActive } from '@/src/lib/profile/store';
import { useProfileStore } from '@/src/lib/profile/useProfileStore';

const PREVIEW = 5;

export function App() {
  const [result, setResult] = useState<FillResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const { store, commit } = useProfileStore();
  const active = store && activeProfile(store);

  async function undo() {
    setBusy(true);
    try {
      const r = await browser.runtime.sendMessage<Request, UndoResult>({ type: 'undo-active-tab' });
      if (!r.ok) return setNotice(r.reason);
      setResult(null);
      setNotice(r.failed.length
        ? `已恢复 ${r.restored} 项。${r.failed.join('、')} 没能自动清空，请手动处理。`
        : `已恢复 ${r.restored} 项，页面回到了填写前的样子。`);
    } finally {
      setBusy(false);
    }
  }

  async function reveal(index: number) {
    const err = await revealField(index);
    if (err) setNotice(err);
  }

  async function fill() {
    setNotice(null);
    setBusy(true);
    try {
      setResult(await browser.runtime.sendMessage<Request, FillResult>({ type: 'fill-active-tab' }));
    } catch (e) {
      setResult({ ok: false, reason: String(e) });
    } finally {
      setBusy(false);
    }
  }

  async function openSidePanel() {
    const win = await browser.windows.getCurrent();
    if (win.id != null) await browser.sidePanel.open({ windowId: win.id });
    window.close();
  }

  const openOptions = () => browser.runtime.openOptionsPage();

  return (
    <div className="popup">
      <header className="popup-head">
        <Logo />
        <span className="spacer" />
        <button className="btn btn-icon" title="打开侧边栏" aria-label="打开侧边栏" onClick={openSidePanel}>
          <PanelRight {...iconProps} />
        </button>
        <button className="btn btn-icon" title="档案与设置" aria-label="档案与设置" onClick={openOptions}>
          <Settings {...iconProps} />
        </button>
      </header>

      <section className="card enter" aria-live="polite">
        {result?.ok ? (
          <div className="stack">
            <div className="label">已用「{result.report.profileTitle}」填写</div>
            <h2 className="clamp" title={result.report.title}>{result.report.title || '当前页面'}</h2>
            <Counts items={result.report.items} />
          </div>
        ) : result ? (
          <ul className="report-list"><StatusRow status="err" name="没有填写" value={result.reason} tag="失败" /></ul>
        ) : !store ? null : !active ? (
          <div className="stack">
            <div className="label">开始之前</div>
            <h2>先建一份档案</h2>
            <p className="small muted">填一次个人信息，之后每家网申都从这里取。</p>
          </div>
        ) : (
          <div className="stack">
            <div className="label">当前页面</div>
            <h2>准备好了</h2>
            <p className="small muted">会用「{active.title}」填写这一页。插件不会提交，填完请你检查后自己提交。</p>
          </div>
        )}
      </section>

      {result?.ok && (
        <div className="stack">
          <ReportList report={result.report} limit={PREVIEW} onReveal={reveal} />
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <button className="btn btn-text small" onClick={openSidePanel}>查看全部 {result.report.items.length} 项</button>
            <button className="btn btn-text small" onClick={undo} disabled={busy}><Undo2 {...iconProps} /> 撤销本次填写</button>
          </div>
        </div>
      )}

      {notice && <p className="notice small enter" role="status">{notice}</p>}

      {store && !active ? (
        <button className="btn btn-primary btn-block" onClick={openOptions}>
          <UserRound {...iconProps} /> 创建档案 <ArrowRight {...iconProps} className="arrow" />
        </button>
      ) : (
        <button className="btn btn-primary btn-block" onClick={fill} disabled={busy || !active}>
          <Sparkles {...iconProps} />
          {busy ? '正在填写…' : result?.ok ? '再填一次' : '一键填充'}
          <ArrowRight {...iconProps} className="arrow" />
        </button>
      )}

      {active && store && (
        <div className="foot">
          <label className="profile small">
            <UserRound {...iconProps} aria-hidden />
            <span className="sr-only">填写时使用的档案</span>
            {store.profiles.length > 1 ? (
              <select className="profile-select" value={active.id} onChange={(e) => commit(setActive(store, e.target.value), true)}>
                {store.profiles.map((p) => <option key={p.id} value={p.id}>{p.title || '未命名档案'}</option>)}
              </select>
            ) : <span>{active.title}</span>}
          </label>
          <button className="btn btn-text small" onClick={openOptions}>编辑档案</button>
        </div>
      )}
    </div>
  );
}
