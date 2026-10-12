import { Pencil, Plus, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { iconProps } from '@/src/components/icon';
import { countChars } from '@/src/lib/ai/skills/index';
import {
  addAnswer, answerStoreItem, MAX_ANSWERS, markUsed, removeAnswer, searchAnswers, updateAnswer, type Answer, type AnswerStore,
} from '@/src/lib/answers/library';
import { Copy } from './Copy';

// 计划书 L4：常用回答库。存在本机，不用 AI 也能用：网申页面上点进问答题时，相似题的旧回答会出现在候选卡里。

export function useAnswers(): [AnswerStore | null, (fn: (s: AnswerStore) => AnswerStore) => Promise<void>] {
  const [store, setStore] = useState<AnswerStore | null>(null);
  useEffect(() => {
    answerStoreItem.getValue().then(setStore);
    return answerStoreItem.watch((v) => setStore(v));
  }, []);
  // 每次都从存储里读最新的再改，避免和网申页面上的“用过几次”互相覆盖
  const change = async (fn: (s: AnswerStore) => AnswerStore) => {
    const next = fn(await answerStoreItem.getValue());
    setStore(next);
    await answerStoreItem.setValue(next);
  };
  return [store, change];
}

type Draft = { question: string; company: string; text: string };
const EMPTY: Draft = { question: '', company: '', text: '' };

function AnswerForm({ initial, onSave, onCancel }: { initial: Draft; onSave: (d: Draft) => void; onCancel: () => void }) {
  const [d, setD] = useState(initial);
  const ok = d.question.trim() && d.text.trim();
  return (
    <div className="polish-version stack enter" style={{ gap: 'var(--space-3)' }}>
      <label className="field">
        <span className="field-label">题目</span>
        <input className="input" value={d.question} onChange={(e) => setD({ ...d, question: e.target.value })} placeholder="如：你为什么选择我们公司" />
      </label>
      <label className="field">
        <span className="field-label">写给哪家公司（可不填，复用时提醒你换掉）</span>
        <input className="input" value={d.company} onChange={(e) => setD({ ...d, company: e.target.value })} placeholder="如：华润电力" />
      </label>
      <label className="field">
        <span className="field-label">回答 <span className="muted">{countChars(d.text)} 字</span></span>
        <textarea className="input textarea" rows={6} value={d.text} onChange={(e) => setD({ ...d, text: e.target.value })} />
      </label>
      <div className="row">
        <button className="btn btn-primary" disabled={!ok} onClick={() => onSave(d)}>保存</button>
        <button className="btn btn-text" onClick={onCancel}>取消</button>
      </div>
    </div>
  );
}

function AnswerItem({ a, change }: { a: Answer; change: ReturnType<typeof useAnswers>[1] }) {
  const [editing, setEditing] = useState(false);
  const [confirm, setConfirm] = useState(false);
  if (editing) {
    return <AnswerForm initial={{ question: a.question, company: a.company, text: a.text }} onCancel={() => setEditing(false)}
      onSave={(d) => { void change((s) => updateAnswer(s, a.id, d)); setEditing(false); }} />;
  }
  return (
    <div className="polish-version answer-item">
      <div className="row" style={{ flexWrap: 'wrap' }}>
        <strong className="answer-q">{a.question}</strong>
        {a.company && <span className="tag tag-plain">写给 {a.company}</span>}
        <span className="spacer" />
        <span className="small muted">{countChars(a.text)} 字{a.uses ? ` · 用过 ${a.uses} 次` : ''}</span>
      </div>
      <p className="pre answer-text">{a.text}</p>
      <div className="row" style={{ flexWrap: 'wrap', gap: 0 }}>
        <Copy text={a.text} onCopied={() => void change((s) => markUsed(s, a.id))} />
        <button className="btn btn-text small" onClick={() => setEditing(true)}><Pencil {...iconProps} /> 编辑</button>
        {confirm
          ? <><button className="btn btn-text small text-err" onClick={() => void change((s) => removeAnswer(s, a.id))}><Trash2 {...iconProps} /> 确定删除</button>
            <button className="btn btn-text small" onClick={() => setConfirm(false)}>不删了</button></>
          : <button className="btn btn-text small" onClick={() => setConfirm(true)}><Trash2 {...iconProps} /> 删除</button>}
      </div>
    </div>
  );
}

export function AnswerLibrary() {
  const [store, change] = useAnswers();
  const [adding, setAdding] = useState(false);
  const [q, setQ] = useState('');
  if (!store) return null;
  const list = searchAnswers(store.items, q);
  return (
    <div className="stack" style={{ gap: 'var(--space-4)' }}>
      <div className="row" style={{ flexWrap: 'wrap' }}>
        {!adding && <button className="btn btn-secondary" onClick={() => setAdding(true)}><Plus {...iconProps} /> 添加回答</button>}
        <span className="spacer" />
        {store.items.length > 3 && (
          <input className="input" style={{ maxWidth: 240 }} type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="搜索题目或回答" aria-label="搜索回答库" />
        )}
      </div>
      {adding && <AnswerForm initial={EMPTY} onCancel={() => setAdding(false)}
        onSave={(d) => { void change((s) => addAnswer(s, d)); setAdding(false); }} />}
      {!store.items.length && !adding && (
        <p className="muted">还没有存回答。在「开放题写作」里点「存进回答库」，或者在这里把你写过的好回答加进来。</p>
      )}
      {store.items.length > 0 && !list.length && <p className="muted">没有找到。</p>}
      {list.map((a) => <AnswerItem key={a.id} a={a} change={change} />)}
      {store.items.length > 0 && (
        <p className="small muted">共 {store.items.length} 条，最多存 {MAX_ANSWERS} 条，只存在这台电脑的浏览器里，导出备份时会一起导出。</p>
      )}
    </div>
  );
}
