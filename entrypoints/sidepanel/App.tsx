import { ListChecks, Undo2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Logo } from '@/src/components/Logo';
import { Counts, ItemRow, revealField, sortItems } from '@/src/components/Report';
import { iconProps } from '@/src/components/icon';
import type { Request, UndoResult } from '@/src/lib/messages';
import type { FillReport, FillStatus } from '@/src/lib/fill/fill';
import { lastReportItem } from '@/src/lib/fill/reportStore';
import { Board } from './Board';

type Tab = 'result' | 'board';

const GROUPS: { title: string; statuses: FillStatus[] }[] = [
  { title: '需要你看一下', statuses: ['err', 'warn'] },
  { title: '已填写', statuses: ['ok'] },
  { title: '没有填写', statuses: ['skip'] },
];

function Result({ report }: { report: FillReport }) {
  const items = sortItems(report.items);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const undone = !!report.undoneAt;

  async function undo() {
    setBusy(true);
    try {
      const r = await browser.runtime.sendMessage<Request, UndoResult>({ type: 'undo-active-tab' });
      setNotice(!r.ok ? r.reason : r.failed.length
        ? `已恢复 ${r.restored} 项。${r.failed.join('、')} 没能自动清空，请手动处理。`
        : `已恢复 ${r.restored} 项，页面回到了填写前的样子。`);
    } finally {
      setBusy(false);
    }
  }

  async function reveal(index: number) {
    const err = await revealField(index);
    setNotice(err);
  }

  const time = new Date(report.at).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  return (
    <div className="stack" style={{ gap: 'var(--space-4)' }}>
      <section className="card stack">
        <div className="label">{time} · 用「{report.profileTitle}」填写</div>
        <h2>{report.title || '网申页面'}</h2>
        <Counts items={report.items} />
        {undone ? (
          <p className="small muted">这次填写已经撤销，下面的结果只作记录。</p>
        ) : (
          <>
            <p className="small muted">插件没有提交。点下面任意一项可以在页面上定位，检查无误后请自己提交。提交后可以到「投递看板」记一条。</p>
            <div><button className="btn btn-secondary" onClick={undo} disabled={busy}><Undo2 {...iconProps} /> 撤销本次填写</button></div>
          </>
        )}
      </section>
      {notice && <p className="notice small enter" role="status">{notice}</p>}
      {GROUPS.map(({ title, statuses }) => {
        const list = items.filter((i) => statuses.includes(i.status));
        if (!list.length) return null;
        return (
          <section key={title} className="stack">
            <h3 className="group-title">{title} <span className="muted">{list.length}</span></h3>
            <ul className="report-list">{list.map((item) => <ItemRow key={item.index} item={item} onReveal={undone ? undefined : reveal} />)}</ul>
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
        <Board report={report} />
      )}
    </div>
  );
}
