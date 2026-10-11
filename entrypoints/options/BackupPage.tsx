import { Download, Upload } from 'lucide-react';
import { useRef, useState } from 'react';
import { iconProps } from '@/src/components/icon';
import { backupFileName, exportBackup, parseBackup } from '@/src/lib/profile/io';
import type { ProfileStore } from '@/src/lib/profile/schema';
import { appendProfiles } from '@/src/lib/profile/store';
import { ResumeImport } from './ResumeImport';

type Notice = { kind: 'ok' | 'err'; text: string } | null;

export function BackupPage({ store, commit, onCreated }: {
  store: ProfileStore;
  commit: (s: ProfileStore, immediate?: boolean) => void;
  onCreated: (id: string) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [notice, setNotice] = useState<Notice>(null);

  function download() {
    const blob = new Blob([exportBackup(store.profiles)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = backupFileName();
    document.body.append(a);
    a.click();
    a.remove();
    // 立即回收会让部分浏览器丢掉文件名，稍后再回收
    setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
    setNotice({ kind: 'ok', text: `已导出 ${store.profiles.length} 份档案。备份文件含个人信息，请妥善保管，不要发到群里。` });
  }

  async function onFile(file: File | undefined) {
    if (!file) return;
    const r = parseBackup(await file.text(), store.profiles.map((p) => p.title));
    if (fileRef.current) fileRef.current.value = '';
    if (!r.ok) return setNotice({ kind: 'err', text: r.reason });
    commit(appendProfiles(store, r.profiles), true);
    setNotice({ kind: 'ok', text: `已导入 ${r.profiles.length} 份档案：${r.profiles.map((p) => p.title).join('、')}。原有档案没有改动。` });
  }

  return (
    <>
      <div className="stack">
        <h1>导入导出</h1>
        <p className="muted">换电脑、重装浏览器前先导出备份。备份文件不含 AI 的 API Key。</p>
      </div>

      <ResumeImport store={store} commit={commit} onCreated={onCreated} />

      <section className="card stack" style={{ gap: 'var(--space-3)' }}>
        <h2>导出备份</h2>
        <p className="small muted">把全部 {store.profiles.length} 份档案保存成一个 JSON 文件。</p>
        <div><button className="btn btn-primary" disabled={!store.profiles.length} onClick={download}>
          <Download {...iconProps} /> 导出全部档案</button></div>
      </section>

      <section className="card stack" style={{ gap: 'var(--space-3)' }}>
        <h2>从备份导入</h2>
        <p className="small muted">导入的档案会作为新档案加进来，不会覆盖你现有的档案；名称重复的会自动加“（导入）”。</p>
        <div>
          <input ref={fileRef} type="file" accept=".json,application/json" hidden onChange={(e) => onFile(e.target.files?.[0])} />
          <button className="btn btn-secondary" onClick={() => fileRef.current?.click()}><Upload {...iconProps} /> 选择备份文件</button>
        </div>
      </section>

      {notice && (
        <div className={`notice notice-${notice.kind} enter`} role={notice.kind === 'err' ? 'alert' : 'status'}>{notice.text}</div>
      )}
    </>
  );
}
