import { storage } from 'wxt/utils/storage';
import { newId } from '../profile/schema';

// 投递看板（计划书 M11）：每条记录一次投递，只存在本机。

export const STATUSES = ['已投递', '笔试/测评', '面试', 'offer', '未通过', '已放弃'] as const;
export type Status = (typeof STATUSES)[number];

export interface Application {
  id: string;
  company: string;
  position: string;
  url: string;
  /** 投递日期 YYYY-MM-DD */
  date: string;
  profileTitle: string;
  status: Status;
  note: string;
  createdAt: number;
  updatedAt: number;
}

export interface ApplicationStore {
  version: 1;
  items: Application[];
}

export const applicationStoreItem = storage.defineItem<ApplicationStore>('local:applications', {
  fallback: { version: 1, items: [] },
});

export function today(d = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** 旧数据或导入数据缺字段时补齐，状态不认识的归为“已投递” */
export function normalizeApplication(raw: unknown): Application {
  const r = (typeof raw === 'object' && raw ? raw : {}) as Partial<Record<keyof Application, unknown>>;
  const s = (k: keyof Application) => (typeof r[k] === 'string' ? (r[k] as string) : '');
  const now = Date.now();
  return {
    id: s('id') || newId(),
    company: s('company'),
    position: s('position'),
    url: s('url'),
    date: s('date') || today(),
    profileTitle: s('profileTitle'),
    status: (STATUSES as readonly string[]).includes(s('status')) ? (s('status') as Status) : '已投递',
    note: s('note'),
    createdAt: typeof r.createdAt === 'number' ? r.createdAt : now,
    updatedAt: typeof r.updatedAt === 'number' ? r.updatedAt : now,
  };
}

// —— 纯函数操作 ——

export type Draft = Pick<Application, 'company' | 'position' | 'url' | 'profileTitle'> & Partial<Pick<Application, 'date' | 'status' | 'note'>>;

/** 同一个链接只记一条：再记一次就更新原来那条 */
export function addApplication(s: ApplicationStore, d: Draft): ApplicationStore {
  const key = urlKey(d.url);
  const existing = key ? s.items.find((a) => urlKey(a.url) === key) : undefined;
  const now = Date.now();
  if (existing) {
    return updateApplication(s, { ...existing, company: d.company || existing.company, position: d.position || existing.position, profileTitle: d.profileTitle || existing.profileTitle });
  }
  const a: Application = {
    id: newId(), company: d.company, position: d.position, url: d.url, date: d.date ?? today(),
    profileTitle: d.profileTitle, status: d.status ?? '已投递', note: d.note ?? '', createdAt: now, updatedAt: now,
  };
  return { ...s, items: [a, ...s.items] };
}

export function updateApplication(s: ApplicationStore, next: Application): ApplicationStore {
  return { ...s, items: s.items.map((a) => (a.id === next.id ? { ...next, updatedAt: Date.now() } : a)) };
}

export function removeApplication(s: ApplicationStore, id: string): ApplicationStore {
  return { ...s, items: s.items.filter((a) => a.id !== id) };
}

/** 导入备份时合并：id 或链接相同的保留较新的那条 */
export function mergeApplications(s: ApplicationStore, incoming: Application[]): { store: ApplicationStore; added: number } {
  const items = [...s.items];
  let added = 0;
  for (const a of incoming) {
    const i = items.findIndex((x) => x.id === a.id || (urlKey(a.url) && urlKey(x.url) === urlKey(a.url)));
    if (i < 0) { items.push(a); added++; } else if (a.updatedAt > items[i]!.updatedAt) items[i] = { ...a, id: items[i]!.id };
  }
  items.sort((x, y) => y.date.localeCompare(x.date) || y.createdAt - x.createdAt);
  return { store: { ...s, items }, added };
}

export function isRecorded(s: ApplicationStore, url: string): Application | undefined {
  const key = urlKey(url);
  return key ? s.items.find((a) => urlKey(a.url) === key) : undefined;
}

/** 比较链接时忽略跟踪参数和页内锚点，保留单页应用的 #/ 路由（Moka 的岗位在 # 后面） */
export function urlKey(url: string): string {
  try {
    const u = new URL(url);
    for (const k of [...u.searchParams.keys()]) if (/^(utm_|from|source|spm|share)/i.test(k)) u.searchParams.delete(k);
    return `${u.host}${u.pathname}${u.search}${u.hash.startsWith('#/') ? u.hash : ''}`;
  } catch {
    return url.trim();
  }
}

// —— CSV 导出 ——

const COLUMNS: [keyof Application, string][] = [
  ['date', '投递日期'], ['company', '公司'], ['position', '岗位'], ['status', '状态'],
  ['profileTitle', '所用档案'], ['url', '链接'], ['note', '备注'],
];

function cell(v: string): string {
  // 以 = + - @ 开头的内容在 Excel 里会被当成公式，前面加单引号
  const safe = /^[=+\-@]/.test(v) ? `'${v}` : v;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export function toCsv(items: Application[]): string {
  const rows = [COLUMNS.map(([, h]) => h), ...items.map((a) => COLUMNS.map(([k]) => String(a[k] ?? '')))];
  // 加 BOM，Excel 打开中文不乱码
  return `﻿${rows.map((r) => r.map(cell).join(',')).join('\r\n')}\r\n`;
}

export function csvFileName(d = new Date()): string {
  return `wangshen-applications-${today(d).replace(/-/g, '')}.csv`;
}
