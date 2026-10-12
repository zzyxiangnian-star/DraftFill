import { storage } from 'wxt/utils/storage';
import { newId } from '../profile/schema';

// 计划书 L4：常用回答库。用户写过的好回答存在本机，遇到相似的题直接复用，或者让 AI 按新题改写。
// 相似度在本地算（字的重合度 + 题型），不用 AI，也不发送任何内容。

export interface Answer {
  id: string;
  question: string;
  text: string;
  /** 写给哪家公司的（可空），复用时提醒把公司名换掉 */
  company: string;
  /** 被复用过几次，排序用 */
  uses: number;
  createdAt: number;
  updatedAt: number;
}

export interface AnswerStore { version: 1; items: Answer[] }

export const MAX_ANSWERS = 300;
const TEXT_LIMIT = 5000;

export const answerStoreItem = storage.defineItem<AnswerStore>('local:answers', { fallback: { version: 1, items: [] } });

export function normalizeAnswer(raw: unknown): Answer | null {
  const r = (typeof raw === 'object' && raw ? raw : {}) as Partial<Record<keyof Answer, unknown>>;
  const s = (k: keyof Answer, n: number) => (typeof r[k] === 'string' ? (r[k] as string).trim().slice(0, n) : '');
  const text = s('text', TEXT_LIMIT);
  const question = s('question', 300);
  if (!text || !question) return null;
  const now = Date.now();
  return {
    id: s('id', 40) || newId(), question, text, company: s('company', 60),
    uses: typeof r.uses === 'number' && r.uses >= 0 ? Math.floor(r.uses) : 0,
    createdAt: typeof r.createdAt === 'number' ? r.createdAt : now,
    updatedAt: typeof r.updatedAt === 'number' ? r.updatedAt : now,
  };
}

export function addAnswer(store: AnswerStore, a: { question: string; text: string; company?: string }, now = Date.now()): AnswerStore {
  const item = normalizeAnswer({ ...a, id: newId(), createdAt: now, updatedAt: now });
  if (!item) return store;
  // 同一道题、同样的回答不重复存
  const dup = store.items.find((x) => norm(x.question) === norm(item.question) && norm(x.text) === norm(item.text));
  if (dup) return store;
  return { version: 1, items: [item, ...store.items].slice(0, MAX_ANSWERS) };
}

export function updateAnswer(store: AnswerStore, id: string, patch: Partial<Pick<Answer, 'question' | 'text' | 'company'>>, now = Date.now()): AnswerStore {
  return {
    version: 1,
    items: store.items.map((x) => (x.id === id ? normalizeAnswer({ ...x, ...patch, updatedAt: now }) ?? x : x)),
  };
}

export const removeAnswer = (store: AnswerStore, id: string): AnswerStore => ({ version: 1, items: store.items.filter((x) => x.id !== id) });

export const markUsed = (store: AnswerStore, id: string): AnswerStore =>
  ({ version: 1, items: store.items.map((x) => (x.id === id ? { ...x, uses: x.uses + 1 } : x)) });

/** 导入备份：按题目和内容去重后追加 */
export function mergeAnswers(store: AnswerStore, incoming: unknown[]): { store: AnswerStore; added: number } {
  let s = store;
  let added = 0;
  for (const raw of incoming) {
    const a = normalizeAnswer(raw);
    if (!a) continue;
    const next = addAnswer(s, a, a.createdAt);
    if (next !== s) added++;
    s = next;
  }
  return { store: s, added };
}

// —— 相似题 ——

/** 题型：同一类题的回答最能复用 */
const TYPES: [string, RegExp][] = [
  ['求职动机', /为什么|为何|选择|加入|吸引|动机|理由|了解.*(公司|我们)|看好/],
  ['成就经历', /成就|自豪|骄傲|满意|得意|最.*(成功|有意义)/],
  ['挫折失败', /失败|挫折|困难|挑战|压力|逆境|难题|遗憾/],
  ['团队合作', /团队|合作|协作|领导|带领|冲突|分歧|组织/],
  ['职业规划', /规划|未来|几年|发展|职业|目标|计划/],
  ['自我评价', /自我|优点|缺点|优势|劣势|特点|性格|爱好|评价自己/],
  ['创新思考', /创新|创意|想法|改进|新颖/],
];

/** 题目去掉字数要求、标点和常见客套，只留实在的字 */
export function norm(s: string): string {
  return s
    .replace(/[（(\[【]?(请)?(在|用|以)?\s*\d+\s*(字|个字)(以内|以下|左右|之内)?[）)\]】]?/g, '')
    .replace(/(字数|限|不超过|不少于)\s*\d+\s*字?/g, '')
    .replace(/请(你|您)?|简要|简单|具体|描述|谈谈|说说|一下|举例|说明|阐述/g, '')
    .replace(/[\s\p{P}\p{S}\d]/gu, '')
    .toLowerCase();
}

export function questionType(q: string): string | null {
  return TYPES.find(([, re]) => re.test(q))?.[0] ?? null;
}

function bigrams(s: string): Map<string, number> {
  const m = new Map<string, number>();
  const chars = [...s];
  if (chars.length === 1) m.set(s, 1);
  for (let i = 0; i < chars.length - 1; i++) {
    const g = chars[i]! + chars[i + 1]!;
    m.set(g, (m.get(g) ?? 0) + 1);
  }
  return m;
}

/** 两道题有多像：0–1。字的重合度（Dice）占七成，题型相同加三成 */
export function similarity(a: string, b: string): number {
  const x = bigrams(norm(a)), y = bigrams(norm(b));
  let total = 0, common = 0;
  for (const v of x.values()) total += v;
  for (const v of y.values()) total += v;
  for (const [g, v] of x) common += Math.min(v, y.get(g) ?? 0);
  const dice = total ? (2 * common) / total : 0;
  const ta = questionType(a);
  return dice * 0.7 + (ta && ta === questionType(b) ? 0.3 : 0);
}

export const SIMILAR_MIN = 0.35;

export interface SimilarAnswer { answer: Answer; score: number }

/** 回答库里和这道题相似的回答，最像的在前；一样像的，用得多的在前 */
export function similarAnswers(question: string, items: Answer[], limit = 5, min = SIMILAR_MIN): SimilarAnswer[] {
  if (norm(question).length < 2) return [];
  return items
    .map((answer) => ({ answer, score: similarity(question, answer.question) }))
    .filter((x) => x.score >= min)
    .sort((a, b) => b.score - a.score || b.answer.uses - a.answer.uses)
    .slice(0, limit);
}

/** 搜索框：题目、回答、公司里包含关键词 */
export function searchAnswers(items: Answer[], q: string): Answer[] {
  const k = q.trim().toLowerCase();
  return k ? items.filter((x) => `${x.question}\n${x.text}\n${x.company}`.toLowerCase().includes(k)) : items;
}
