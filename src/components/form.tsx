import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react';
import { useId, type ReactNode } from 'react';
import { iconProps } from './icon';
import { DatePicker } from './DatePicker';

export function Field({ label, hint, error, wide, children }: {
  label: string; hint?: ReactNode; error?: string | null; wide?: boolean; children: (id: string) => ReactNode;
}) {
  const id = useId();
  return (
    <div className={`field${wide ? ' field-wide' : ''}`}>
      <label className="field-label" htmlFor={id}>{label}</label>
      {children(id)}
      {error ? <div className="field-msg field-err" role="alert">{error}</div> : hint ? <div className="field-msg">{hint}</div> : null}
    </div>
  );
}

type Bind = { value: string; onChange: (v: string) => void };

export function Text({ label, hint, error, wide, placeholder, type = 'text', inputMode, ...bind }: Bind & {
  label: string; hint?: ReactNode; error?: string | null; wide?: boolean; placeholder?: string;
  type?: 'text' | 'month' | 'date' | 'email' | 'tel' | 'url'; inputMode?: 'numeric' | 'decimal' | 'tel' | 'email';
}) {
  return (
    <Field label={label} hint={hint} error={error} wide={wide}>
      {(id) => type === 'date' || type === 'month' ? (
        <DatePicker id={id} mode={type} value={bind.value} onChange={bind.onChange} invalid={!!error} placeholder={placeholder} />
      ) : (
        <input id={id} className={`input${error ? ' input-invalid' : ''}`} type={type} inputMode={inputMode}
          placeholder={placeholder} value={bind.value} aria-invalid={!!error} onChange={(e) => bind.onChange(e.target.value)} />
      )}
    </Field>
  );
}

export function Choice({ label, hint, wide, options, ...bind }: Bind & {
  label: string; hint?: ReactNode; wide?: boolean; options: string[];
}) {
  // 旧数据或导入数据里的值不在选项中时也显示出来，避免被静默清掉
  const all = bind.value && !options.includes(bind.value) ? [bind.value, ...options] : options;
  return (
    <Field label={label} hint={hint} wide={wide}>
      {(id) => (
        <select id={id} className="input select" value={bind.value} onChange={(e) => bind.onChange(e.target.value)}>
          <option value="">请选择</option>
          {all.map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
      )}
    </Field>
  );
}

export function LongText({ label, hint, placeholder, rows = 4, ...bind }: Bind & {
  label: string; hint?: ReactNode; placeholder?: string; rows?: number;
}) {
  return (
    <Field label={label} wide hint={hint ?? (bind.value ? `${bind.value.length} 字` : undefined)}>
      {(id) => (
        <textarea id={id} className="input textarea" rows={rows} placeholder={placeholder} value={bind.value}
          onChange={(e) => bind.onChange(e.target.value)} />
      )}
    </Field>
  );
}

export function Toggle({ checked, onChange, children }: { checked: boolean; onChange: (v: boolean) => void; children: ReactNode }) {
  return (
    <label className="toggle">
      <input type="checkbox" role="switch" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span className="toggle-track" aria-hidden><span className="toggle-thumb" /></span>
      <span>{children}</span>
    </label>
  );
}

export function Section({ id, title, hint, meta, actions, children }: {
  id: string; title: string; hint?: ReactNode; meta?: ReactNode; actions?: ReactNode; children: ReactNode;
}) {
  return (
    <section id={id} className="section">
      <header className="section-head">
        <div className="stack" style={{ gap: 2 }}>
          <div className="row"><h2>{title}</h2>{meta && <span className="section-meta">{meta}</span>}</div>
          {hint && <p className="small muted">{hint}</p>}
        </div>
        {actions && <div className="row">{actions}</div>}
      </header>
      {children}
    </section>
  );
}

export function Grid({ children }: { children: ReactNode }) {
  return <div className="grid">{children}</div>;
}

/** 可增删、可调整顺序的多条经历 */
export function RepeatList<T extends { id: string }>({ items, onChange, create, title, addLabel, empty, children }: {
  items: T[];
  onChange: (items: T[]) => void;
  create: () => T;
  title: (item: T, index: number) => string;
  addLabel: string;
  empty: string;
  children: (item: T, set: (patch: Partial<T>) => void) => ReactNode;
}) {
  const move = (i: number, d: -1 | 1) => {
    const next = [...items];
    [next[i], next[i + d]] = [next[i + d]!, next[i]!];
    onChange(next);
  };
  return (
    <div className="repeat">
      {items.length === 0 && <p className="small muted repeat-empty">{empty}</p>}
      {items.map((item, i) => (
        <div key={item.id} className="repeat-item enter">
          <div className="repeat-head">
            <span className="repeat-title">{title(item, i)}</span>
            <span className="spacer" />
            <button className="btn btn-icon" title="上移" aria-label="上移" disabled={i === 0} onClick={() => move(i, -1)}><ArrowUp {...iconProps} /></button>
            <button className="btn btn-icon" title="下移" aria-label="下移" disabled={i === items.length - 1} onClick={() => move(i, 1)}><ArrowDown {...iconProps} /></button>
            <button className="btn btn-icon btn-danger" title="删除这一条" aria-label="删除这一条"
              onClick={() => onChange(items.filter((x) => x.id !== item.id))}><Trash2 {...iconProps} /></button>
          </div>
          {children(item, (patch) => onChange(items.map((x) => (x.id === item.id ? { ...x, ...patch } : x))))}
        </div>
      ))}
      <button className="btn btn-secondary repeat-add" onClick={() => onChange([...items, create()])}>
        <Plus {...iconProps} /> {addLabel}
      </button>
    </div>
  );
}
