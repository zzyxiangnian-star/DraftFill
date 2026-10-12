import { CalendarDays, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { addMonths, monthGrid, parseInput, splitValue, today, ym, type DateMode } from './dates';

// 日期选择器：浏览器自带的日历面板改不了样式，这里自己画一个。
// 面板盖在输入框上，顶部还是输入框（可以直接打字），下面是日历；点年份、月份可以快速跳转。

type View = 'day' | 'month' | 'year';
const WEEK = ['一', '二', '三', '四', '五', '六', '日'];
const MONTHS = Array.from({ length: 12 }, (_, i) => i + 1);

export function DatePicker({ id, value, onChange, mode = 'date', invalid, placeholder }: {
  id?: string; value: string; onChange: (v: string) => void; mode?: DateMode; invalid?: boolean; placeholder?: string;
}) {
  const now = today();
  const cur = splitValue(value);
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<View>(mode === 'month' ? 'month' : 'day');
  const [page, setPage] = useState({ y: cur?.y ?? now.y, m: cur?.m ?? now.m });
  const [draft, setDraft] = useState(value);
  const [flip, setFlip] = useState({ right: false, up: false });
  const wrap = useRef<HTMLDivElement>(null);
  const panelInput = useRef<HTMLInputElement>(null);
  const hint = placeholder ?? (mode === 'month' ? '年-月，如 2024-09' : '年-月-日，如 2004-02-07');

  useEffect(() => { if (!open) setDraft(value); }, [value, open]);

  function show() {
    const c = splitValue(value);
    setPage({ y: c?.y ?? now.y, m: c?.m ?? now.m });
    setView(mode === 'month' ? 'month' : 'day');
    setDraft(value);
    const r = wrap.current!.getBoundingClientRect();
    setFlip({ right: r.left + 300 > window.innerWidth - 8 && r.right > 300, up: r.top + 390 > window.innerHeight && r.bottom > 400 });
    setOpen(true);
  }
  const close = (focusField = true) => {
    setOpen(false);
    if (focusField) wrap.current?.querySelector<HTMLInputElement>('.date-field')?.focus();
  };
  const pick = (v: string) => { onChange(v); close(); };

  useLayoutEffect(() => { if (open) panelInput.current?.focus(); }, [open]);
  useEffect(() => {
    if (!open) return;
    const down = (e: MouseEvent) => { if (!wrap.current?.contains(e.target as Node)) close(false); };
    document.addEventListener('mousedown', down);
    return () => document.removeEventListener('mousedown', down);
  }, [open]);

  function typed(text: string) {
    setDraft(text);
    if (!text.trim()) return;
    const v = parseInput(text, mode);
    if (v) {
      const c = splitValue(v)!;
      setPage({ y: c.y, m: c.m });
      onChange(v);
    }
  }
  function onKey(e: React.KeyboardEvent) {
    if (e.key === 'Escape') { e.preventDefault(); close(); }
    if (e.key === 'Enter') {
      e.preventDefault();
      if (!draft.trim()) pick('');
      else { const v = parseInput(draft, mode); if (v) pick(v); }
    }
  }

  const decade = Math.floor(page.y / 12) * 12;
  const step = (n: number) => setPage((p) => addMonths(p.y, p.m, n));
  const title = view === 'year' ? `${decade}–${decade + 11}` : null;

  return (
    <div className={`date-picker${open ? ' is-open' : ''}`} ref={wrap}>
      <input id={id} className={`input date-field${invalid ? ' input-invalid' : ''}`} value={value} readOnly placeholder={hint}
        aria-invalid={invalid} aria-haspopup="dialog" aria-expanded={open}
        onClick={() => (open ? close(false) : show())}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown') { e.preventDefault(); show(); } }} />
      <CalendarDays className="date-icon" size={16} strokeWidth={1.5} aria-hidden />
      {open && (
        <div className={`date-panel${flip.right ? ' to-left' : ''}${flip.up ? ' to-up' : ''}`} role="dialog" aria-label={mode === 'month' ? '选择年月' : '选择日期'} onKeyDown={onKey}>
          <input ref={panelInput} className="input date-panel-input" value={draft} placeholder={hint} inputMode="numeric"
            aria-label={mode === 'month' ? '输入年月' : '输入日期'} onChange={(e) => typed(e.target.value)}
            aria-invalid={!!draft.trim() && !parseInput(draft, mode)} />
          <div className="date-head">
            {view === 'day' ? (
              <>
                <button type="button" className="date-nav" aria-label="上一年" onClick={() => step(-12)}><ChevronsLeft size={16} strokeWidth={1.5} /></button>
                <button type="button" className="date-nav" aria-label="上个月" onClick={() => step(-1)}><ChevronLeft size={16} strokeWidth={1.5} /></button>
                <span className="date-title">
                  <button type="button" onClick={() => setView('year')}>{page.y}年</button>
                  <button type="button" onClick={() => setView('month')}>{page.m}月</button>
                </span>
                <button type="button" className="date-nav" aria-label="下个月" onClick={() => step(1)}><ChevronRight size={16} strokeWidth={1.5} /></button>
                <button type="button" className="date-nav" aria-label="下一年" onClick={() => step(12)}><ChevronsRight size={16} strokeWidth={1.5} /></button>
              </>
            ) : (
              <>
                <button type="button" className="date-nav" aria-label={view === 'year' ? '前 12 年' : '上一年'}
                  onClick={() => setPage((p) => ({ ...p, y: p.y - (view === 'year' ? 12 : 1) }))}><ChevronsLeft size={16} strokeWidth={1.5} /></button>
                <span className="date-title">
                  {title ?? <button type="button" onClick={() => setView('year')}>{page.y}年</button>}
                </span>
                <button type="button" className="date-nav" aria-label={view === 'year' ? '后 12 年' : '下一年'}
                  onClick={() => setPage((p) => ({ ...p, y: p.y + (view === 'year' ? 12 : 1) }))}><ChevronsRight size={16} strokeWidth={1.5} /></button>
              </>
            )}
          </div>

          {view === 'day' && (
            <div className="date-grid date-days" role="grid">
              {WEEK.map((w) => <span key={w} className="date-week" role="columnheader">{w}</span>)}
              {monthGrid(page.y, page.m).map((c) => (
                <button key={c.value} type="button" role="gridcell"
                  className={`date-cell${c.outside ? ' is-outside' : ''}${c.value === value ? ' is-selected' : ''}${c.y === now.y && c.m === now.m && c.d === now.d ? ' is-today' : ''}`}
                  aria-selected={c.value === value} aria-label={`${c.y}年${c.m}月${c.d}日`} onClick={() => pick(c.value)}>{c.d}</button>
              ))}
            </div>
          )}
          {view === 'month' && (
            <div className="date-grid date-months">
              {MONTHS.map((m) => {
                const v = ym(page.y, m);
                const selected = mode === 'month' ? v === value : !!cur && cur.y === page.y && cur.m === m;
                return (
                  <button key={m} type="button" className={`date-cell${selected ? ' is-selected' : ''}${page.y === now.y && m === now.m ? ' is-today' : ''}`}
                    aria-label={`${page.y}年${m}月`} onClick={() => (mode === 'month' ? pick(v) : (setPage({ y: page.y, m }), setView('day')))}>{m}月</button>
                );
              })}
            </div>
          )}
          {view === 'year' && (
            <div className="date-grid date-months">
              {Array.from({ length: 12 }, (_, i) => decade + i).map((y) => (
                <button key={y} type="button" className={`date-cell${cur?.y === y ? ' is-selected' : ''}${y === now.y ? ' is-today' : ''}`}
                  onClick={() => { setPage((p) => ({ ...p, y })); setView(mode === 'month' ? 'month' : 'day'); }}>{y}</button>
              ))}
            </div>
          )}

          <div className="date-foot">
            {value && <button type="button" className="date-link date-clear" onClick={() => pick('')}>清除</button>}
            <button type="button" className="date-link" onClick={() => pick(mode === 'month' ? ym(now.y, now.m) : `${ym(now.y, now.m)}-${String(now.d).padStart(2, '0')}`)}>
              {mode === 'month' ? '本月' : '今天'}</button>
          </div>
        </div>
      )}
    </div>
  );
}
