import { guessCompany, guessPosition } from './guess';
import { JD_LIMIT, today } from './applications';

// 计划书 V6：在招聘页上收藏岗位。从页面摘出岗位名、截止日期和岗位描述，用户确认后再存。
// 摘不准就留空让用户填，不硬猜。

export interface JobInfo {
  company: string;
  position: string;
  /** YYYY-MM-DD */
  deadline: string;
  jd: string;
  url: string;
}

const pad = (n: number) => String(n).padStart(2, '0');

function isoDate(y: number, m: number, d: number): string {
  if (m < 1 || m > 12 || d < 1 || d > 31) return '';
  return `${y}-${pad(m)}-${pad(d)}`;
}

const NEAR = /(截止|截至|结束|关闭|deadline)/i;
const FULL = /(20\d{2})\s*[-/.年]\s*(\d{1,2})\s*[-/.月]\s*(\d{1,2})/g;
const SHORT = /(?<![\d年/.-])(\d{1,2})\s*月\s*(\d{1,2})\s*日/g;

/**
 * 截止日期：只认“截止 / 截至 / 结束”附近（前后 30 个字内）的日期。
 * 写成“投递时间：2026-09-01 至 2026-10-31”的取后一个。只写月日的按今年算，已经过了就算明年。
 */
export function findDeadline(text: string, now = new Date()): string {
  const t = text.replace(/\s+/g, ' ');
  const found: { at: number; date: string }[] = [];
  for (const m of t.matchAll(FULL)) found.push({ at: m.index!, date: isoDate(+m[1]!, +m[2]!, +m[3]!) });
  for (const m of t.matchAll(SHORT)) {
    let date = isoDate(now.getFullYear(), +m[1]!, +m[2]!);
    if (date && date < today(now)) date = isoDate(now.getFullYear() + 1, +m[1]!, +m[2]!);
    found.push({ at: m.index!, date });
  }
  const near = found.filter((f) => f.date && NEAR.test(t.slice(Math.max(0, f.at - 30), f.at + 40)));
  if (!near.length) return '';
  // 同一处写了起止两个日期时取晚的那个
  const first = near.sort((a, b) => a.at - b.at)[0]!;
  const pair = near.filter((f) => f.at - first.at < 40);
  return pair.map((f) => f.date).sort().at(-1)!;
}

const JD_MARK = /(岗位职责|工作职责|职位描述|岗位描述|工作内容|任职要求|岗位要求|任职资格|职位要求|我们希望你|你将负责)/;

/** 岗位描述：包含“岗位职责 / 任职要求”等字样的最小的一块内容 */
export function findJd(doc: Document): string {
  const blocks = [...doc.body.querySelectorAll<HTMLElement>('section, article, div, main, ul, dl')]
    .filter((el) => !el.closest('nav, header, footer, script, style, [hidden]'));
  let best: HTMLElement | null = null;
  let bestLen = Infinity;
  for (const el of blocks) {
    const text = (el.innerText ?? el.textContent ?? '').trim();
    if (text.length < 40 || text.length > JD_LIMIT) continue;
    const marks = new Set(text.match(new RegExp(JD_MARK, 'g')) ?? []);
    // 职责和要求都在的那块最好；只有一种的也行
    const score = marks.size >= 2 ? 0 : marks.size === 1 ? 1 : 2;
    if (score === 2) continue;
    const len = text.length + score * 100_000;
    if (len < bestLen) { best = el; bestLen = len; }
  }
  return best ? (best.innerText ?? best.textContent ?? '').replace(/\n{3,}/g, '\n\n').trim() : '';
}

/** 岗位名：页面上明写的“投递职位”，否则页面主标题（h1），再否则标题栏第一段 */
export function findPosition(doc: Document): string {
  const hinted = guessPosition(doc);
  if (hinted) return hinted;
  const h = [...doc.querySelectorAll('h1, h2, [class*="job-name" i], [class*="jobName"], [class*="position-name" i], [class*="positionName"], [class*="title" i]')]
    .map((e) => (e.textContent ?? '').trim())
    .find((t) => t.length >= 2 && t.length <= 40 && !/招聘|欢迎|登录|首页/.test(t));
  return h ?? '';
}

/** 标题栏常写成“岗位 - 公司校园招聘”：跳过和岗位名相同的那段 */
function findCompany(title: string, position: string): string {
  const parts = title.split(/\s*[|｜\-–—_·]\s*/);
  for (let i = 0; i < parts.length; i++) {
    if (position && parts[i]!.trim() === position) continue;
    const c = guessCompany(parts.slice(i).join(' - '));
    if (c && c !== position) return c;
  }
  return '';
}

export function extractJob(doc: Document, now = new Date()): JobInfo {
  const text = doc.body?.innerText ?? doc.body?.textContent ?? '';
  const position = findPosition(doc);
  return {
    company: findCompany(doc.title, position),
    position,
    deadline: findDeadline(text, now),
    jd: findJd(doc).slice(0, JD_LIMIT),
    url: doc.location?.href ?? '',
  };
}
