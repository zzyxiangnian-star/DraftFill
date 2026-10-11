import { ArrowRight, PanelRight, ScanSearch, Settings, UserRound } from 'lucide-react';
import { useState } from 'react';
import { Logo } from '@/src/components/Logo';
import { StatusRow } from '@/src/components/StatusRow';
import { iconProps } from '@/src/components/icon';
import type { FieldKind, Request, ScanResult } from '@/src/lib/messages';

const KIND_LABEL: Record<FieldKind, string> = {
  text: '文本框', textarea: '多行文本', select: '下拉框', radio: '单选', checkbox: '复选', date: '日期',
};

export function App() {
  const [result, setResult] = useState<ScanResult | null>(null);
  const [busy, setBusy] = useState(false);

  async function scan() {
    setBusy(true);
    try {
      setResult(await browser.runtime.sendMessage<Request, ScanResult>({ type: 'scan-active-tab' }));
    } finally {
      setBusy(false);
    }
  }

  async function openSidePanel() {
    const win = await browser.windows.getCurrent();
    if (win.id != null) await browser.sidePanel.open({ windowId: win.id });
    window.close();
  }

  return (
    <div className="popup">
      <header className="popup-head">
        <Logo />
        <span className="spacer" />
        <button className="btn btn-icon" title="打开侧边栏" aria-label="打开侧边栏" onClick={openSidePanel}>
          <PanelRight {...iconProps} />
        </button>
        <button className="btn btn-icon" title="档案与设置" aria-label="档案与设置" onClick={() => browser.runtime.openOptionsPage()}>
          <Settings {...iconProps} />
        </button>
      </header>

      <section className="card enter" aria-live="polite">
        {!result && (
          <>
            <div className="label">当前页面</div>
            <h2>还没有识别</h2>
            <p className="small muted">点下面的按钮，插件才会读取这一页的表单。</p>
          </>
        )}
        {result?.ok === false && (
          <ul className="stack" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
            <StatusRow status="err" name="无法识别" value={result.reason} tag="失败" />
          </ul>
        )}
        {result?.ok && (
          <>
            <div className="label">识别到表单控件</div>
            <h2 title={result.summary.title}>{result.summary.title || '未命名页面'}</h2>
            <p className="small muted">
              可填写 {result.summary.fillable} 个，按规则跳过 {result.summary.skipped} 个（密码、验证码、文件上传）
              {result.summary.frames > 0 && `，另有 ${result.summary.frames} 个内嵌框架暂未扫描`}
            </p>
            <div className="kinds">
              {(Object.keys(KIND_LABEL) as FieldKind[])
                .filter((k) => result.summary.byKind[k] > 0)
                .map((k) => <span key={k} className="pill">{KIND_LABEL[k]} {result.summary.byKind[k]}</span>)}
            </div>
          </>
        )}
      </section>

      <button className="btn btn-primary btn-block" onClick={scan} disabled={busy}>
        <ScanSearch {...iconProps} />
        {busy ? '正在识别…' : result ? '重新识别' : '识别当前页表单'}
        <ArrowRight {...iconProps} className="arrow" />
      </button>

      <div className="foot">
        <span className="profile small muted">
          <UserRound {...iconProps} /> 还没有档案
        </span>
        <button className="btn btn-text small" onClick={() => browser.runtime.openOptionsPage()}>创建档案</button>
      </div>
    </div>
  );
}
