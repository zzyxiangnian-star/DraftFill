import { Bookmark, Check, X } from 'lucide-react';
import { useState } from 'react';
import { Text } from '@/src/components/form';
import { iconProps } from '@/src/components/icon';
import type { JobResult, Request } from '@/src/lib/messages';
import { addApplication, applicationStoreItem, isRecorded } from '@/src/lib/tracker/applications';
import type { JobInfo } from '@/src/lib/tracker/jobPage';

// 计划书 V6：在招聘页收藏岗位。摘出的公司、岗位、截止日期给用户确认后再存进投递看板（状态“已收藏”）。

export function SaveJobButton({ onNotice, disabled }: { onNotice: (t: string) => void; disabled?: boolean }) {
  const [job, setJob] = useState<JobInfo | null>(null);
  const [busy, setBusy] = useState(false);

  async function start() {
    setBusy(true);
    try {
      const r = await browser.runtime.sendMessage<Request, JobResult>({ type: 'job-active-tab' });
      if (!r.ok) return onNotice(r.reason);
      const store = await applicationStoreItem.getValue();
      const had = isRecorded(store, r.job.url);
      if (had) return onNotice(`这个岗位已经在投递看板里了，当前状态：${had.status}。`);
      setJob(r.job);
    } finally {
      setBusy(false);
    }
  }

  async function save() {
    if (!job) return;
    const store = await applicationStoreItem.getValue();
    await applicationStoreItem.setValue(addApplication(store, {
      company: job.company.trim(), position: job.position.trim(), url: job.url, profileTitle: '',
      status: '已收藏', deadline: job.deadline, jd: job.jd,
    }));
    setJob(null);
    onNotice(job.deadline ? `已收藏。截止前 3 天起，工具栏图标会提醒你。` : '已收藏。没找到截止日期，可以在侧边栏「投递看板」里补上，快到期时会提醒。');
  }

  if (!job) {
    return (
      <button className="btn btn-secondary btn-block" onClick={start} disabled={busy || disabled}>
        <Bookmark {...iconProps} /> {busy ? '正在读取岗位…' : '收藏这个岗位'}
      </button>
    );
  }
  const set = (patch: Partial<JobInfo>) => setJob({ ...job, ...patch });
  return (
    <section className="card stack enter" style={{ gap: 'var(--space-3)' }} aria-label="收藏岗位">
      <div className="label">收藏岗位</div>
      <Text label="公司" value={job.company} onChange={(company) => set({ company })} placeholder="如：示例科技" />
      <Text label="岗位" value={job.position} onChange={(position) => set({ position })} />
      <Text label="网申截止日期" type="date" value={job.deadline} onChange={(deadline) => set({ deadline })}
        hint={job.deadline ? '从页面上读到的，请核对' : '页面上没找到，知道的话填一下'} />
      <p className="small muted" style={{ margin: 0 }}>
        {job.jd ? `已摘下岗位描述（${job.jd.length} 字），之后可以在 AI 助手里分析匹配度。` : '没找到岗位描述，不影响收藏。'}
      </p>
      <div className="row">
        <button className="btn btn-primary" onClick={save} disabled={!job.company.trim() && !job.position.trim()}><Check {...iconProps} /> 收藏</button>
        <button className="btn btn-text" onClick={() => setJob(null)}><X {...iconProps} /> 取消</button>
      </div>
    </section>
  );
}
