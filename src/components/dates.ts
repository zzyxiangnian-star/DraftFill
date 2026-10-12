// 日期选择器用的纯函数：解析用户输入、生成日历格子。和界面无关，方便测试。

export type DateMode = 'date' | 'month';

const pad = (n: number) => String(n).padStart(2, '0');

export const ymd = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`;
export const ym = (y: number, m: number) => `${y}-${pad(m)}`;

const valid = (y: number, m: number, d = 1) => {
  const t = new Date(y, m - 1, d);
  return y >= 1900 && y <= 2100 && t.getFullYear() === y && t.getMonth() === m - 1 && t.getDate() === d;
};

/**
 * 用户手打的日期：2004-02-07、2004/2/7、2004.2.7、2004年2月7日、20040207 都认。
 * 月份模式只要年月：2024-09、2024.9、2024年9月、202409。认不出给 null。
 */
export function parseInput(text: string, mode: DateMode): string | null {
  const t = text.trim().replace(/\s+/g, '');
  if (mode === 'month') {
    const m = /^(\d{4})(?:[-/.年](\d{1,2})月?|(\d{2}))$/.exec(t);
    if (!m) return null;
    const [y, mo] = [Number(m[1]), Number(m[2] ?? m[3])];
    return valid(y, mo) ? ym(y, mo) : null;
  }
  const m = /^(\d{4})(?:[-/.年](\d{1,2})[-/.月](\d{1,2})日?|(\d{2})(\d{2}))$/.exec(t);
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2] ?? m[4]), Number(m[3] ?? m[5])];
  return valid(y, mo, d) ? ymd(y, mo, d) : null;
}

/** 已存的值（YYYY-MM-DD 或 YYYY-MM）拆成年月日；不合法给 null */
export function splitValue(v: string): { y: number; m: number; d: number } | null {
  const r = /^(\d{4})-(\d{2})(?:-(\d{2}))?$/.exec(v);
  if (!r) return null;
  const [y, m, d] = [Number(r[1]), Number(r[2]), Number(r[3] ?? 1)];
  return valid(y, m, d) ? { y, m, d } : null;
}

export interface DayCell { y: number; m: number; d: number; value: string; outside: boolean }

/** 某个月的日历：周一开头，固定 6 行 42 格，前后补上邻月的日子 */
export function monthGrid(y: number, m: number): DayCell[] {
  const first = new Date(y, m - 1, 1);
  const lead = (first.getDay() + 6) % 7; // 周一 = 0
  const cells: DayCell[] = [];
  for (let i = 0; i < 42; i++) {
    const t = new Date(y, m - 1, 1 - lead + i);
    const [cy, cm, cd] = [t.getFullYear(), t.getMonth() + 1, t.getDate()];
    cells.push({ y: cy, m: cm, d: cd, value: ymd(cy, cm, cd), outside: cm !== m });
  }
  return cells;
}

/** 往前或往后挪几个月 */
export function addMonths(y: number, m: number, n: number): { y: number; m: number } {
  const t = y * 12 + (m - 1) + n;
  return { y: Math.floor(t / 12), m: (t % 12) + 1 };
}

export function today(now = new Date()): { y: number; m: number; d: number } {
  return { y: now.getFullYear(), m: now.getMonth() + 1, d: now.getDate() };
}
