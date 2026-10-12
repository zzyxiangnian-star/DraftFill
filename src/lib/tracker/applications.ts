import { storage } from 'wxt/utils/storage';
import { newId } from '../profile/schema';

// 投递看板（计划书 M11）：每条记录一次投递，只存在本机。
// “已收藏”是还没投、先存下来的岗位（计划书 V6），带截止日期，快到期时提醒。

export const STATUSES = ['已收藏', '已投递', '笔试/测评', '面试', 'offer', '未通过', '已放弃'] as const;
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
  /** 网申截止日期 YYYY-MM-DD，没有就留空 */
  deadline: string;
  /** 收藏时从招聘页摘下来的岗位描述 */
  jd: string;
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
    deadline: /^\d{4}-\d{2}-\d{2}$/.test(s('deadline')) ? s('deadline') : '',
    jd: s('jd').slice(0, JD_LIMIT),
    createdAt: typeof r.createdAt === 'number' ? r.createdAt : now,
    updatedAt: typeof r.updatedAt === 'number' ? r.updatedAt : now,
  };
}

// —— 纯函数操作 ——

export const JD_LIMIT = 6000;

export type Draft = Pick<Application, 'company' | 'position' | 'url' | 'profileTitle'> & Partial<Pick<Application, 'date' | 'status' | 'note' | 'deadline' | 'jd'>>;

/** 同一个链接只记一条：再记一次就更新原来那条 */
export function addApplication(s: ApplicationStore, d: Draft): ApplicationStore {
  const key = urlKey(d.url);
  const existing = key ? s.items.find((a) => urlKey(a.url) === key) : undefined;
  const now = Date.now();
  if (existing) {
    const advance = existing.status === '已收藏' && (d.status ?? '已投递') !== '已收藏';
    return updateApplication(s, {
      ...existing, company: d.company || existing.company, position: d.position || existing.position, profileTitle: d.profileTitle || existing.profileTitle,
      deadline: d.deadline || existing.deadline, jd: d.jd || existing.jd,
      // 收藏过的岗位投了以后记一条：状态往前走，不倒回“已收藏”
      status: advance ? (d.status ?? '已投递') : existing.status,
      date: advance ? (d.date ?? today()) : existing.date,
    });
  }
  const a: Application = {
    id: newId(), company: d.company, position: d.position, url: d.url, date: d.date ?? today(),
    profileTitle: d.profileTitle, status: d.status ?? '已投递', note: d.note ?? '',
    deadline: d.deadline ?? '', jd: (d.jd ?? '').slice(0, JD_LIMIT), createdAt: now, updatedAt: now,
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

// —— 截止提醒（计划书 V6）——

/** 距离截止还有几天（今天截止为 0，已过为负数）；没有截止日期返回 null */
export function daysLeft(deadline: string, now = new Date()): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(deadline)) return null;
  const [y, m, d] = deadline.split('-').map(Number) as [number, number, number];
  const end = Date.UTC(y, m - 1, d);
  const start = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((end - start) / 86_400_000);
}

export const SOON_DAYS = 3;

/** 还没投、3 天内（含今天）截止的收藏 */
export function dueSoon(items: Application[], now = new Date()): Application[] {
  return items
    .filter((a) => a.status === '已收藏')
    .filter((a) => { const n = daysLeft(a.deadline, now); return n !== null && n >= 0 && n <= SOON_DAYS; })
    .sort((a, b) => a.deadline.localeCompare(b.deadline));
}

// —— CSV 导出 ——

const COLUMNS: [keyof Application, string][] = [
  ['date', '投递日期'], ['company', '公司'], ['position', '岗位'], ['status', '状态'], ['deadline', '截止日期'],
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

// —— 计划书 L7：从笔试/面试通知更新看板 ——

const ORDER: Status[] = ['已收藏', '已投递', '笔试/测评', '面试', 'offer'];
const normCompany = (s: string) => s.replace(/\s|（.*?）|\(.*?\)|有限公司|股份|集团|科技|公司/g, '');

/** 按公司名找看板里的那条投递（互相包含即可，取最近更新的） */
export function findByCompany(items: Application[], company: string): Application | undefined {
  const c = normCompany(company);
  if (c.length < 2) return undefined;
  return items.filter((a) => { const x = normCompany(a.company); return x.length >= 2 && (x.includes(c) || c.includes(x)); })
    .sort((a, b) => b.updatedAt - a.updatedAt)[0];
}

export interface NoticeRecord {
  company: string;
  position: string;
  /** 笔试/测评、面试；其他通知不改状态 */
  status: Status | null;
  /** 记进备注的一行，如“10-15 14:00 一面（腾讯会议）” */
  line: string;
}

/** 有对应的投递就更新状态（只往前走，不倒退）并在备注里加一行；没有就新记一条 */
export function recordNotice(s: ApplicationStore, n: NoticeRecord): { store: ApplicationStore; updated: Application | null } {
  const hit = findByCompany(s.items, n.company);
  if (hit) {
    const forward = n.status && ORDER.indexOf(n.status) > ORDER.indexOf(hit.status) && ORDER.includes(hit.status);
    const note = hit.note.includes(n.line) ? hit.note : [hit.note, n.line].filter(Boolean).join('\n');
    const next = { ...hit, status: forward ? n.status! : hit.status, note, position: hit.position || n.position };
    return { store: updateApplication(s, next), updated: next };
  }
  return { store: addApplication(s, { company: n.company, position: n.position, url: '', profileTitle: '', status: n.status ?? '已投递', note: n.line }), updated: null };
}
