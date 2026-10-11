import { Download, Upload } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { iconProps } from '@/src/components/icon';
import { backupFileName, exportBackup, parseBackup } from '@/src/lib/profile/io';
import type { ProfileStore } from '@/src/lib/profile/schema';
import { appendProfiles } from '@/src/lib/profile/store';
import { applicationStoreItem, mergeApplications, type ApplicationStore } from '@/src/lib/tracker/applications';
import { ResumeImport } from './ResumeImport';

type Notice = { kind: 'ok' | 'err'; text: string } | null;

export function BackupPage({ store, commit, onCreated }: {
  store: ProfileStore;
  commit: (s: ProfileStore, immediate?: boolean) => void;
  onCreated: (id: string) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [notice, setNotice] = useState<Notice>(null);
  const [apps, setApps] = useState<ApplicationStore | null>(null);

  useEffect(() => {
    applicationStoreItem.getValue().then(setApps);
    return applicationStoreItem.watch(setApps);
  }, []);
  const appCount = apps?.items.length ?? 0;

  function download() {
    const blob = new Blob([exportBackup(store.profiles, apps?.items ?? [])], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = backupFileName();
    document.body.append(a);
    a.click();
    a.remove();
    // 立即回收会让部分浏览器丢掉文件名，稍后再回收
    setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
    setNotice({ kind: 'ok', text: `已导出 ${store.profiles.length} 份档案${appCount ? `和 ${appCount} 条投递记录` : ''}。备份文件含个人信息，请妥善保管，不要发到群里。` });
  }

  async function onFile(file: File | undefined) {
    if (!file) return;
    const r = parseBackup(await file.text(), store.profiles.map((p) => p.title));
    if (fileRef.current) fileRef.current.value = '';
    if (!r.ok) return setNotice({ kind: 'err', text: r.reason });
    if (r.profiles.length) commit(appendProfiles(store, r.profiles), true);
    let added = 0;
    if (r.applications.length) {
      const m = mergeApplications(await applicationStoreItem.getValue(), r.applications);
      await applicationStoreItem.setValue(m.store);
      added = m.added;
    }
    const parts = [
      r.profiles.length ? `${r.profiles.length} 份档案（${r.profiles.map((p) => p.title).join('、')}）` : '',
      added ? `${added} 条投递记录` : '',
    ].filter(Boolean);
    setNotice({ kind: 'ok', text: `已导入 ${parts.join('和')}。原有内容没有改动。` });
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
        <p className="small muted">把全部 {store.profiles.length} 份档案{appCount ? `和 ${appCount} 条投递记录` : ''}保存成一个 JSON 文件。</p>
        <div><button className="btn btn-primary" disabled={!store.profiles.length && !appCount} onClick={download}>
          <Download {...iconProps} /> 导出全部档案</button></div>
      </section>

      <section className="card stack" style={{ gap: 'var(--space-3)' }}>
        <h2>从备份导入</h2>
        <p className="small muted">导入的档案会作为新档案加进来，不会覆盖你现有的档案；名称重复的会自动加“（导入）”。投递记录按链接合并，不会重复。</p>
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
