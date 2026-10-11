import { ClipboardList, ListChecks } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Logo } from '@/src/components/Logo';
import { Counts, ItemRow, sortItems } from '@/src/components/Report';
import type { FillReport, FillStatus } from '@/src/lib/fill/fill';
import { lastReportItem } from '@/src/lib/fill/reportStore';

type Tab = 'result' | 'board';

const GROUPS: { title: string; statuses: FillStatus[] }[] = [
  { title: '需要你看一下', statuses: ['err', 'warn'] },
  { title: '已填写', statuses: ['ok'] },
  { title: '没有填写', statuses: ['skip'] },
];

function Result({ report }: { report: FillReport }) {
  const items = sortItems(report.items);
  const time = new Date(report.at).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  return (
    <div className="stack" style={{ gap: 'var(--space-4)' }}>
      <section className="card stack">
        <div className="label">{time} · 用「{report.profileTitle}」填写</div>
        <h2>{report.title || '网申页面'}</h2>
        <Counts items={report.items} />
        <p className="small muted">插件没有提交。请对照下面的结果检查页面，确认无误后自己提交。</p>
      </section>
      {GROUPS.map(({ title, statuses }) => {
        const list = items.filter((i) => statuses.includes(i.status));
        if (!list.length) return null;
        return (
          <section key={title} className="stack">
            <h3 className="group-title">{title} <span className="muted">{list.length}</span></h3>
            <ul className="report-list">{list.map((item, i) => <ItemRow key={i} item={item} />)}</ul>
          </section>
        );
      })}
    </div>
  );
}

export function App() {
  const [tab, setTab] = useState<Tab>('result');
  const [report, setReport] = useState<FillReport | null>(null);

  useEffect(() => {
    lastReportItem.getValue().then(setReport);
    return lastReportItem.watch(setReport);
  }, []);

  return (
    <div className="side">
      <header className="row"><Logo /></header>

      <div className="tabs" role="tablist">
        <button className="tab" role="tab" aria-selected={tab === 'result'} onClick={() => setTab('result')}>填写结果</button>
        <button className="tab" role="tab" aria-selected={tab === 'board'} onClick={() => setTab('board')}>投递看板</button>
      </div>

      {tab === 'result' ? (
        report ? <Result report={report} /> : (
          <section className="card-plain empty enter" key="result">
            <ListChecks size={28} strokeWidth={1.5} />
            <h2>还没有填写记录</h2>
            <p className="small">在网申页面点工具栏的网申助手，再点「一键填充」。这里会逐项列出已填、需确认、不一致和未填的字段，以及没填的原因。</p>
          </section>
        )
      ) : (
        <section className="card-plain empty enter" key="board">
          <ClipboardList size={28} strokeWidth={1.5} />
          <h2>还没有投递记录</h2>
          <p className="small">每次填完可以记一条：公司、岗位、链接、所用档案和状态，支持导出 CSV。</p>
        </section>
      )}
    </div>
  );
}
