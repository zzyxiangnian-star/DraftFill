import type { Profile } from '../profile/schema';
import { detectControls, isVisible } from './detect';
import { planFill } from './fill';
import type { FieldMemory } from './memory';
import { safeClick } from './safety';
import { collectHeadings, classifySection, sectionOf, type Section } from './sections';
import { clean, textOf } from './text';
import { parsePath } from './values';

// 计划书 V1：档案里的经历比页面上的多时，点页面上的“添加”按钮加出空白段落，再一起填写。
// 只点文字是“添加 / 新增 / 增加”的按钮（仍走 safety.ts 的检查）；点了之后如果弹出的是窗口而不是新段落，
// 就关掉窗口不再继续，交给用户自己添加（窗口里一般要点“保存”，插件不点）。

const LISTS: Partial<Record<Section, { list: string; name: string }>> = {
  education: { list: 'education', name: '教育经历' },
  internship: { list: 'internships', name: '实习经历' },
  project: { list: 'projects', name: '项目经历' },
  campus: { list: 'campus', name: '校园经历' },
  award: { list: 'awards', name: '获奖' },
  family: { list: 'family', name: '家庭成员' },
  language: { list: 'skills.languages', name: '语言能力' },
  certificate: { list: 'skills.certificates', name: '证书' },
};

const ADD = /^[+＋]?(添加|新增|增加|继续添加)(一?[段条个项组])?(.{0,8})$/;
const DIALOG = '[role="dialog"], [aria-modal="true"], .ant-modal, .el-dialog, .ant-drawer, .el-drawer, [class*="modal" i], [class*="dialog" i], [class*="drawer" i]';
const MAX_PER_LIST = 5;

export interface AddResult {
  /** 自动添加了几段 */
  added: { name: string; count: number }[];
  /** 没能加够的原因 */
  notes: string[];
}

interface AddButton { el: HTMLElement; section: Section }

/** 页面上看得见的“添加”按钮，以及它属于哪个分区 */
export function findAddButtons(doc: Document): AddButton[] {
  const headings = collectHeadings(doc);
  const hits: { el: HTMLElement; tail: string }[] = [];
  for (const n of doc.querySelectorAll<HTMLElement>('button, a, [role="button"], [class*="add" i], span, div')) {
    if (n.children.length > 3) continue;
    const m = ADD.exec(clean(textOf(n)));
    if (!m) continue;
    const el = n.closest<HTMLElement>('button, a, [role="button"]') ?? n;
    if (!hits.some((h) => h.el === el)) hits.push({ el, tail: m[3] ?? '' });
  }
  const out: AddButton[] = [];
  // 同一个按钮外面套了几层 div 时只留最里层（点击会冒泡到外层）
  for (const { el, tail } of hits.filter((h) => !hits.some((o) => o !== h && h.el.contains(o.el)))) {
    if (!isVisible(el) || el.closest(DIALOG)) continue;
    // “添加教育经历”这种按钮自己带分区名；只写“添加”的看它在哪个标题下面
    const section = classifySection(tail) ?? sectionOf(el, headings);
    if (section && LISTS[section]) out.push({ el, section });
  }
  return out;
}

function listLength(profile: Profile, list: string): number {
  const v = list.split('.').reduce<unknown>((o, k) => (o as Record<string, unknown>)?.[k], profile);
  return Array.isArray(v) ? v.length : 0;
}

/** 页面上每种经历现在有几段（按识别出的字段编号算） */
function pageCounts(doc: Document, profile: Profile, memory?: FieldMemory | null): Map<string, number> {
  const counts = new Map<string, number>();
  for (const f of planFill(doc, profile, memory)) {
    const arr = f.path ? parsePath(f.path) : null;
    if (!arr) continue;
    const i = arr.index ?? f.index;
    counts.set(arr.list, Math.max(counts.get(arr.list) ?? 0, i + 1));
  }
  return counts;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function pressEscape(doc: Document, at: Element) {
  for (const t of [at, doc.body]) t.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true }));
}

export async function addMissingEntries(doc: Document, profile: Profile, memory?: FieldMemory | null): Promise<AddResult> {
  const result: AddResult = { added: [], notes: [] };
  const blocked = new Set<Section>();
  for (let round = 0; round < 20; round++) {
    const counts = pageCounts(doc, profile, memory);
    const buttons = findAddButtons(doc).filter((b) => !blocked.has(b.section));
    const todo = buttons.find((b) => {
      const { list } = LISTS[b.section]!;
      const done = result.added.find((a) => a.name === LISTS[b.section]!.name)?.count ?? 0;
      return done < MAX_PER_LIST && listLength(profile, list) > (counts.get(list) ?? 0);
    });
    if (!todo) break;
    const { list, name } = LISTS[todo.section]!;
    const before = new Set(detectControls(doc).map((c) => c.el));
    try {
      safeClick(todo.el);
    } catch {
      blocked.add(todo.section);
      continue;
    }
    // 等新段落出现
    let fresh: Element[] = [];
    for (let t = 0; t < 30 && !fresh.length; t++) {
      await sleep(50);
      fresh = detectControls(doc).map((c) => c.el).filter((el) => !before.has(el));
    }
    blocked.add(todo.section); // 先假定不能再点，确认加出了新段落再放开
    if (!fresh.length) {
      result.notes.push(`点了「${clean(textOf(todo.el))}」没有出现新的${name}，剩下的请自己添加`);
      continue;
    }
    const dialog = fresh.map((el) => el.closest(DIALOG)).find(Boolean);
    if (dialog) {
      pressEscape(doc, dialog);
      const left = listLength(profile, list) - (counts.get(list) ?? 0);
      result.notes.push(`这个网站添加${name}要在弹出的窗口里填写并保存，插件不点保存，剩下 ${left} 段请自己添加`);
      continue;
    }
    if (pageCounts(doc, profile, memory).get(list) === (counts.get(list) ?? 0)) {
      result.notes.push(`点了「${clean(textOf(todo.el))}」后没认出新的${name}字段，剩下的请自己添加`);
      continue;
    }
    blocked.delete(todo.section);
    const a = result.added.find((x) => x.name === name);
    if (a) a.count++; else result.added.push({ name, count: 1 });
  }
  return result;
}
