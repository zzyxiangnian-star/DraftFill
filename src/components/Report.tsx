import type { FillItem, FillReport, FillStatus } from '@/src/lib/fill/fill';
import type { Request, RevealResult } from '@/src/lib/messages';
import { StatusRow } from './StatusRow';

const ORDER: FillStatus[] = ['err', 'warn', 'ok', 'skip'];

export function countByStatus(items: FillItem[]): Record<FillStatus, number> {
  const c = { ok: 0, warn: 0, err: 0, skip: 0 };
  items.forEach((i) => c[i.status]++);
  return c;
}

/** 必填但没填上的（附件另算） */
export const isMissingRequired = (i: FillItem) => !!i.required && !i.attach && i.status === 'skip';

export function sortItems(items: FillItem[]): FillItem[] {
  return [...items].sort((a, b) => ORDER.indexOf(a.status) - ORDER.indexOf(b.status));
}

export function Counts({ items }: { items: FillItem[] }) {
  const c = countByStatus(items);
  const need = items.filter(isMissingRequired).length;
  return (
    <div className="counts">
      <span className="count count-ok">已填 {c.ok}</span>
      {c.warn > 0 && <span className="count count-warn">需确认 {c.warn}</span>}
      {c.err > 0 && <span className="count count-err">不一致 {c.err}</span>}
      <span className="count count-skip">未填 {c.skip}</span>
      {need > 0 && <span className="count count-err">其中必填 {need}</span>}
    </div>
  );
}

export function ItemRow({ item, onReveal }: { item: FillItem; onReveal?: (index: number) => void }) {
  const value = item.status === 'ok' ? item.value
    : item.status === 'warn' ? `${item.value}${item.note ? ` · ${item.note}` : ''}`
    : item.note;
  return <StatusRow status={item.status} name={item.label} value={<span title={value}>{value}</span>}
    onClick={onReveal ? () => onReveal(item.index) : undefined} />;
}

export function ReportList({ report, limit, onReveal }: { report: FillReport; limit?: number; onReveal?: (index: number) => void }) {
  const items = sortItems(report.items);
  const shown = limit ? items.slice(0, limit) : items;
  return (
    <ul className="report-list">
      {shown.map((item) => <ItemRow key={item.index} item={item} onReveal={onReveal} />)}
    </ul>
  );
}

/** 让 background 在当前标签页里定位字段 */
export async function revealField(index: number): Promise<string | null> {
  const r = await browser.runtime.sendMessage<Request, RevealResult>({ type: 'reveal-active-tab', index });
  return r?.ok ? null : (r?.reason ?? '无法定位');
}
