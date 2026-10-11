import { ClipboardList, ListChecks } from 'lucide-react';
import { useState } from 'react';
import { Logo } from '@/src/components/Logo';

type Tab = 'result' | 'board';

export function App() {
  const [tab, setTab] = useState<Tab>('result');

  return (
    <div className="side">
      <header className="row"><Logo /></header>

      <div className="tabs" role="tablist">
        <button className="tab" role="tab" aria-selected={tab === 'result'} onClick={() => setTab('result')}>填写结果</button>
        <button className="tab" role="tab" aria-selected={tab === 'board'} onClick={() => setTab('board')}>投递看板</button>
      </div>

      {tab === 'result' ? (
        <section className="card-plain empty enter" key="result">
          <ListChecks size={28} strokeWidth={1.5} />
          <h2>还没有填写记录</h2>
          <p className="small">填写后，这里逐项列出已填、需确认、不一致和未填的字段，以及每个空白字段的原因。</p>
        </section>
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
