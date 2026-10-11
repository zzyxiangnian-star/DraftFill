import { ListChecks, Sparkles, Undo2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Logo } from '@/src/components/Logo';
import { Counts, isMissingRequired, ItemRow, revealField, sortItems } from '@/src/components/Report';
import { iconProps } from '@/src/components/icon';
import type { FillResult, Request, UndoResult } from '@/src/lib/messages';
import type { FillItem, FillReport } from '@/src/lib/fill/fill';
import { lastReportItem, pageChangeItem, type PageChange } from '@/src/lib/fill/reportStore';
import { Board } from './Board';

type Tab = 'result' | 'board';

// 每一项只进第一个符合的分组
const GROUPS: { title: string; hint?: string; test: (i: FillItem) => boolean }[] = [
  { title: '必填还空着', hint: '页面标了必填，插件没能填上，提交前请补上。', test: isMissingRequired },
  { title: '需要你看一下', test: (i) => i.status === 'err' || i.status === 'warn' },
  { title: '要你自己上传的附件', hint: '浏览器不允许插件替你选文件。点一项定位到上传按钮。', test: (i) => !!i.attach },
  { title: '已填写', test: (i) => i.status === 'ok' },
  { title: '没有填写', hint: '点一项定位到字段，字段旁会列出档案里能填的内容，点一下就填上。', test: (i) => i.status === 'skip' },
];

function groupItems(items: FillItem[]) {
  const left = new Set(items);
  return GROUPS.map((g) => {
    const list = [...left].filter(g.test);
    list.forEach((i) => left.delete(i));
    return { ...g, list };
  });
}

function Result({ report }: { report: FillReport }) {
  const items = sortItems(report.items);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [change, setChange] = useState<PageChange | null>(null);
  const undone = !!report.undoneAt;

  useEffect(() => {
    pageChangeItem.getValue().then(setChange);
    return pageChangeItem.watch(setChange);
  }, []);
  const fresh = !undone && change && change.count > 0 && change.at > report.at ? change : null;

  async function fillAgain() {
    setBusy(true);
    try {
      const r = await browser.runtime.sendMessage<Request, FillResult>({ type: 'fill-active-tab' });
      setNotice(r.ok ? null : r.reason);
    } finally {
      setBusy(false);
    }
  }

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
      {fresh && (
        <section className="card stack enter" role="status">
          <p style={{ margin: 0 }}>页面上新出现了 {fresh.count} 个能填的字段，可能是到了下一步或展开了新的一段。</p>
          <div><button className="btn btn-primary" onClick={fillAgain} disabled={busy}><Sparkles {...iconProps} /> 填写新出现的字段</button></div>
          <p className="small muted" style={{ margin: 0 }}>已经有内容的字段不会被覆盖。</p>
        </section>
      )}
      {!!report.blockedFrames && !undone && (
        <p className="notice notice-warn small">页面里有 {report.blockedFrames} 个嵌入的页面来自别的网站，浏览器不允许插件读取，里面的内容请自己填写。</p>
      )}
      {notice && <p className="notice small enter" role="status">{notice}</p>}
      {groupItems(items).map(({ title, hint, list }) => {
        if (!list.length) return null;
        return (
          <section key={title} className="stack">
            <h3 className="group-title">{title} <span className="muted">{list.length}</span></h3>
            {hint && <p className="small muted group-hint">{hint}</p>}
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
