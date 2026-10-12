import { Check, CircleHelp } from 'lucide-react';
import { useEffect, useState } from 'react';
import { iconProps } from '@/src/components/icon';
import type { AskField } from '@/src/lib/fill/ask';
import type { AskAnswerResult, AskFieldsResult, Request } from '@/src/lib/messages';

// 计划书 L6：缺信息暂停询问。页面标了必填、档案里又没有的字段，插件不猜不编，在这里逐个问你。

const SAVED_TEXT = { profile: '已填上，也存进了档案', custom: '已填上，也存进了档案的「其他信息」，下次同名字段直接填', none: '已填上' };

function AskOne({ f, onDone }: { f: AskField; onDone: (text: string) => void }) {
  const [value, setValue] = useState('');
  const [save, setSave] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const id = `ask-${f.index}`;

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const r = await browser.runtime.sendMessage<Request, AskAnswerResult>({ type: 'ask-answer-active-tab', index: f.index, value, save });
      if (!r.ok) setError(r.reason);
      else if (r.item.status !== 'ok') setError(r.item.note || '没能填进去，请在页面上自己填写');
      else onDone(SAVED_TEXT[r.saved ?? 'none'] + (save && !r.saved ? '（档案里已有这一项或没有对应的这一条，没存）' : ''));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="ask-one stack">
      <label className="field-label" htmlFor={id}>{f.label}</label>
      {f.kind === 'choice' && f.options.length ? (
        <select id={id} className="input select" value={value} onChange={(e) => setValue(e.target.value)}>
          <option value="">请选择</option>
          {f.options.map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
      ) : f.kind === 'textarea' ? (
        <textarea id={id} className="input textarea" rows={3} value={value} onChange={(e) => setValue(e.target.value)} />
      ) : (
        <input id={id} className="input" value={value} onChange={(e) => setValue(e.target.value)}
          placeholder={f.kind === 'choice' ? '照页面上选项的写法填' : ''} />
      )}
      <div className="row" style={{ flexWrap: 'wrap' }}>
        <label className="small muted row" style={{ gap: 6 }}>
          <input type="checkbox" checked={save} onChange={(e) => setSave(e.target.checked)} /> 存进档案，下次自动填
        </label>
        <span className="spacer" />
        <button className="btn btn-secondary" onClick={submit} disabled={busy || !value.trim()}>{busy ? '正在填…' : '填上'}</button>
      </div>
      {error && <p className="notice notice-err small enter" role="alert">{error}</p>}
    </div>
  );
}

export function AskMissing() {
  const [fields, setFields] = useState<AskField[] | null>(null);
  const [done, setDone] = useState<Record<number, string>>({});

  useEffect(() => {
    browser.runtime.sendMessage<Request, AskFieldsResult>({ type: 'ask-fields-active-tab' })
      .then((r) => setFields(r.ok ? r.fields : []), () => setFields([]));
  }, []);

  if (!fields?.length) return null;
  const left = fields.filter((f) => !done[f.index]).length;
  return (
    <section className="card stack enter" style={{ gap: 'var(--space-3)' }}>
      <div className="row" style={{ gap: 8 }}>
        <CircleHelp {...iconProps} aria-hidden />
        <strong>{left ? `有 ${left} 个必填项要问你` : '必填项都补上了'}</strong>
      </div>
      {left > 0 && <p className="small muted" style={{ margin: 0 }}>档案里没有这些信息，插件不会替你猜或编。在这里填上就写进页面，不会提交。</p>}
      {fields.map((f) => done[f.index]
        ? <p key={f.index} className="small row ask-done" style={{ margin: 0 }}><Check {...iconProps} aria-hidden /> {f.label}：{done[f.index]}</p>
        : <AskOne key={f.index} f={f} onDone={(text) => setDone((d) => ({ ...d, [f.index]: text }))} />)}
    </section>
  );
}
