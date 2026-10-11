import type { FillItem, FillReport, FillStatus } from '@/src/lib/fill/fill';
import { StatusRow } from './StatusRow';

const ORDER: FillStatus[] = ['err', 'warn', 'ok', 'skip'];

export function countByStatus(items: FillItem[]): Record<FillStatus, number> {
  const c = { ok: 0, warn: 0, err: 0, skip: 0 };
  items.forEach((i) => c[i.status]++);
  return c;
}

export function sortItems(items: FillItem[]): FillItem[] {
  return [...items].sort((a, b) => ORDER.indexOf(a.status) - ORDER.indexOf(b.status));
}

export function Counts({ items }: { items: FillItem[] }) {
  const c = countByStatus(items);
  return (
    <div className="counts">
      <span className="count count-ok">已填 {c.ok}</span>
      {c.warn > 0 && <span className="count count-warn">需确认 {c.warn}</span>}
      {c.err > 0 && <span className="count count-err">不一致 {c.err}</span>}
      <span className="count count-skip">未填 {c.skip}</span>
    </div>
  );
}

export function ItemRow({ item }: { item: FillItem }) {
  const value = item.status === 'ok' ? item.value
    : item.status === 'warn' ? `${item.value}${item.note ? ` · ${item.note}` : ''}`
    : item.note;
  return <StatusRow status={item.status} name={item.label} value={<span title={value}>{value}</span>} />;
}

export function ReportList({ report, limit }: { report: FillReport; limit?: number }) {
  const items = sortItems(report.items);
  const shown = limit ? items.slice(0, limit) : items;
  return (
    <ul className="report-list">
      {shown.map((item, i) => <ItemRow key={i} item={item} />)}
    </ul>
  );
}
