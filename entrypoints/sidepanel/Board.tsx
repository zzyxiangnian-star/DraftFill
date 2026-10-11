import { ClipboardList, Download, ExternalLink, Pencil, Plus, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { iconProps } from '@/src/components/icon';
import { Text } from '@/src/components/form';
import type { FillReport } from '@/src/lib/fill/fill';
import {
  addApplication, applicationStoreItem, csvFileName, isRecorded, removeApplication, STATUSES, toCsv, updateApplication,
  type Application, type ApplicationStore, type Status,
} from '@/src/lib/tracker/applications';

// 投递看板（计划书 M11）：填完记一条，状态可改，可筛选，可导出 CSV。

function useApplications() {
  const [store, setStore] = useState<ApplicationStore | null>(null);
  useEffect(() => {
    applicationStoreItem.getValue().then(setStore);
    return applicationStoreItem.watch(setStore);
  }, []);
  const save = (next: ApplicationStore) => { setStore(next); void applicationStoreItem.setValue(next); };
  return { store, save };
}

/** 刚填过的页面：猜好公司和岗位，用户改一改就能记下 */
function RecordCard({ report, onAdd }: { report: FillReport; onAdd: (company: string, position: string) => void }) {
  const [company, setCompany] = useState(report.job?.company ?? '');
  const [position, setPosition] = useState(report.job?.position ?? '');
  useEffect(() => { setCompany(report.job?.company ?? ''); setPosition(report.job?.position ?? ''); }, [report.at]);
  return (
    <section className="card stack enter" style={{ gap: 'var(--space-3)' }}>
      <div className="label">刚填写的页面</div>
      <p className="small muted" style={{ margin: 0 }}>自己提交以后，在这里记一条，方便之后跟进笔试、面试。</p>
      <div className="grid board-grid">
        <Text label="公司" value={company} onChange={setCompany} placeholder="如：转转" />
        <Text label="岗位" value={position} onChange={setPosition} placeholder="如：产品运营" />
      </div>
      <div><button className="btn btn-primary" disabled={!company.trim()} onClick={() => onAdd(company.trim(), position.trim())}>
        <Plus {...iconProps} /> 记到看板</button></div>
    </section>
  );
}

function AppItem({ a, onChange, onRemove }: { a: Application; onChange: (a: Application) => void; onRemove: () => void }) {
  const [editing, setEditing] = useState(false);
  const [confirm, setConfirm] = useState(false);
  useEffect(() => {
    if (!confirm) return;
    const t = setTimeout(() => setConfirm(false), 4000);
    return () => clearTimeout(t);
  }, [confirm]);
  const set = (patch: Partial<Application>) => onChange({ ...a, ...patch });

  return (
    <li className="app-item">
      <div className="app-head">
        <div className="app-title">
          <strong>{a.company || '未填公司'}</strong>
          {a.position && <span className="muted"> · {a.position}</span>}
        </div>
        <select className={`input select status-select status-${STATUSES.indexOf(a.status)}`} aria-label="状态" value={a.status}
          onChange={(e) => set({ status: e.target.value as Status })}>
          {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>
      <div className="app-meta small muted">
        <span>{a.date}</span>
        {a.profileTitle && <span>用「{a.profileTitle}」</span>}
        {a.note && !editing && <span className="app-note">{a.note}</span>}
      </div>
      {editing && (
        <div className="grid board-grid enter">
          <Text label="公司" value={a.company} onChange={(company) => set({ company })} />
          <Text label="岗位" value={a.position} onChange={(position) => set({ position })} />
          <Text label="投递日期" type="date" value={a.date} onChange={(date) => set({ date })} />
          <Text label="备注" value={a.note} onChange={(note) => set({ note })} placeholder="如：10 月 20 日笔试" />
        </div>
      )}
      <div className="app-actions">
        {a.url && (
          <button className="btn btn-text" onClick={() => browser.tabs.create({ url: a.url })} title={a.url}>
            <ExternalLink {...iconProps} /> 打开网申页</button>
        )}
        <button className="btn btn-text" aria-pressed={editing} onClick={() => setEditing(!editing)}>
          <Pencil {...iconProps} /> {editing ? '收起' : '编辑'}</button>
        <span className="spacer" />
        <button className={`btn ${confirm ? 'btn-secondary btn-confirm-danger' : 'btn-icon btn-danger'}`} aria-label="删除这条记录"
          onClick={() => (confirm ? onRemove() : setConfirm(true))}>
          <Trash2 {...iconProps} />{confirm && '再点一次删除'}
        </button>
      </div>
    </li>
  );
}

export function Board({ report }: { report: FillReport | null }) {
  const { store, save } = useApplications();
  const [filter, setFilter] = useState<Status | 'all'>('all');
  if (!store) return null;

  const recorded = report ? isRecorded(store, report.url) : undefined;
  const showRecord = report && !report.undoneAt && report.url && !recorded;
  const counts = new Map(STATUSES.map((s) => [s, store.items.filter((a) => a.status === s).length]));
  const list = filter === 'all' ? store.items : store.items.filter((a) => a.status === filter);

  function exportCsv() {
    const blob = new Blob([toCsv(store!.items)], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = csvFileName();
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
  }

  return (
    <div className="stack" style={{ gap: 'var(--space-4)' }}>
      {showRecord && (
        <RecordCard report={report} onAdd={(company, position) =>
          save(addApplication(store, { company, position, url: report.url, profileTitle: report.profileTitle }))} />
      )}
      {recorded && report && !report.undoneAt && (
        <p className="notice small">刚填写的页面已经记过了，当前状态：{recorded.status}。</p>
      )}

      {store.items.length === 0 ? (
        !showRecord && (
          <section className="card-plain empty enter">
            <ClipboardList size={28} strokeWidth={1.5} />
            <h2>还没有投递记录</h2>
            <p className="small">在网申页面填写并自己提交以后，打开这里就能一键记下公司、岗位和链接，之后改状态跟进笔试、面试。</p>
          </section>
        )
      ) : (
        <>
          <div className="row board-bar">
            <div className="chips" role="group" aria-label="按状态筛选">
              <button className="chip" aria-pressed={filter === 'all'} onClick={() => setFilter('all')}>全部 {store.items.length}</button>
              {STATUSES.filter((s) => counts.get(s)).map((s) => (
                <button key={s} className="chip" aria-pressed={filter === s} onClick={() => setFilter(s)}>{s} {counts.get(s)}</button>
              ))}
            </div>
            <span className="spacer" />
            <button className="btn btn-text" onClick={exportCsv} title="用 Excel 或 WPS 打开"><Download {...iconProps} /> 导出表格</button>
          </div>
          <ul className="app-list">
            {list.map((a) => (
              <AppItem key={a.id} a={a} onChange={(next) => save(updateApplication(store, next))} onRemove={() => save(removeApplication(store, a.id))} />
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
