import { AlarmClock, ClipboardList, Download, ExternalLink, Pencil, Plus, Sparkles, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { iconProps } from '@/src/components/icon';
import { Text } from '@/src/components/form';
import type { FillReport } from '@/src/lib/fill/fill';
import {
  addApplication, applicationStoreItem, csvFileName, daysLeft, dueSoon, isRecorded, removeApplication, SOON_DAYS, STATUSES, toCsv, updateApplication,
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
function RecordCard({ report, saved, onAdd }: { report: FillReport; saved?: Application; onAdd: (company: string, position: string) => void }) {
  const [company, setCompany] = useState(saved?.company || report.job?.company || '');
  const [position, setPosition] = useState(saved?.position || report.job?.position || '');
  useEffect(() => { setCompany(saved?.company || report.job?.company || ''); setPosition(saved?.position || report.job?.position || ''); }, [report.at]);
  return (
    <section className="card stack enter" style={{ gap: 'var(--space-3)' }}>
      <div className="label">刚填写的页面</div>
      <p className="small muted" style={{ margin: 0 }}>{saved
        ? '这个岗位之前收藏过。自己提交以后，点下面把它改成“已投递”。'
        : '自己提交以后，在这里记一条，方便之后跟进笔试、面试。'}</p>
      <div className="grid board-grid">
        <Text label="公司" value={company} onChange={setCompany} placeholder="如：转转" />
        <Text label="岗位" value={position} onChange={setPosition} placeholder="如：产品运营" />
      </div>
      <div><button className="btn btn-primary" disabled={!company.trim()} onClick={() => onAdd(company.trim(), position.trim())}>
        <Plus {...iconProps} /> {saved ? '改为已投递' : '记到看板'}</button></div>
    </section>
  );
}

/** 截止提示：已收藏的才提醒，投了以后只显示日期 */
function Deadline({ a }: { a: Application }) {
  const n = daysLeft(a.deadline);
  if (n === null) return null;
  if (a.status !== '已收藏') return <span>截止 {a.deadline.slice(5)}</span>;
  if (n < 0) return <span className="deadline deadline-past">已截止</span>;
  const text = n === 0 ? '今天截止' : `还剩 ${n} 天截止`;
  return <span className={`deadline${n <= SOON_DAYS ? ' deadline-soon' : ''}`}><AlarmClock size={12} strokeWidth={1.5} /> {text}</span>;
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
        <span>{a.status === '已收藏' ? `收藏于 ${a.date}` : a.date}</span>
        <Deadline a={a} />
        {a.profileTitle && <span>用「{a.profileTitle}」</span>}
        {a.note && !editing && <span className="app-note">{a.note}</span>}
      </div>
      {editing && (
        <div className="grid board-grid enter">
          <Text label="公司" value={a.company} onChange={(company) => set({ company })} />
          <Text label="岗位" value={a.position} onChange={(position) => set({ position })} />
          <Text label="投递日期" type="date" value={a.date} onChange={(date) => set({ date })} />
          <Text label="备注" value={a.note} onChange={(note) => set({ note })} placeholder="如：10 月 20 日笔试" />
          <Text label="网申截止日期" type="date" value={a.deadline} onChange={(deadline) => set({ deadline })} />
          {a.jd && (
            <details className="jd field-wide">
              <summary className="small">岗位描述（{a.jd.length} 字）</summary>
              <p className="small pre">{a.jd}</p>
            </details>
          )}
        </div>
      )}
      <div className="app-actions">
        {a.url && (
          <button className="btn btn-text" onClick={() => browser.tabs.create({ url: a.url })} title={a.url}>
            <ExternalLink {...iconProps} /> 打开网申页</button>
        )}
        {a.jd && (
          <button className="btn btn-text" title="在 AI 助手里对照你的档案分析这个岗位"
            onClick={() => browser.tabs.create({ url: `${browser.runtime.getURL('/options.html')}?jd=${a.id}#ai` })}>
            <Sparkles {...iconProps} /> 分析匹配度</button>
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
  const showRecord = report && !report.undoneAt && report.url && (!recorded || recorded.status === '已收藏');
  const soon = dueSoon(store.items);
  const counts = new Map(STATUSES.map((s) => [s, store.items.filter((a) => a.status === s).length]));
  const list = filter === 'all' ? store.items : store.items.filter((a) => a.status === filter);
  // 只看收藏时按截止日期排，快到期的在前，没写截止日期的放最后
  if (filter === '已收藏') list.sort((x, y) => (x.deadline || '9999').localeCompare(y.deadline || '9999'));

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
        <RecordCard report={report} saved={recorded} onAdd={(company, position) =>
          save(addApplication(store, { company, position, url: report.url, profileTitle: report.profileTitle }))} />
      )}
      {soon.length > 0 && (
        <p className="notice notice-warn small" role="status">
          <strong>{soon.length} 个收藏的岗位 {SOON_DAYS} 天内截止：</strong>{soon.map((a) => `${a.company || a.position}（${daysLeft(a.deadline) === 0 ? '今天' : a.deadline.slice(5)}）`).join('、')}
        </p>
      )}
      {recorded && recorded.status !== '已收藏' && report && !report.undoneAt && (
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
