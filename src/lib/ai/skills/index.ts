import type { ChatMessage } from '../client';

// AI 技能：每个功能一套专门的提示词、评判标准和输出格式（JSON），界面按格式展示。
// 新功能 = 新增一个技能文件。

export interface Skill<I, O> {
  id: string;
  name: string;
  /** 构造发给模型的对话 */
  build(input: I): ChatMessage[];
  /** 校验并整理模型返回的 JSON，格式不对时抛错 */
  parse(raw: unknown, input: I): O;
  temperature: number;
}

/** 所有技能共用的底线 */
// 真实性规则参考了 coinluu/resume-jd-optimizer-cn（MIT）的做法：贡献动词按证据分级、不把团队成果算到个人头上。
export const BASE_RULES = `你是帮中国大学生做校园招聘网申的求职助手。必须遵守：
1. 只依据用户提供的经历，不编造公司、项目、职责、工具、证书、数字、奖项。需要数字而原文没有时，用【待补充：说明】标出，让用户自己填。
2. 贡献动词按证据分级，从弱到强：协助/支持 < 参与 < 负责 < 推动 < 主导。只能用原文支持的那一级，不能把“参与”升级成“主导”，不能把团队成果全部算成个人成果。
3. 不堆砌关键词，不写“我对贵公司仰慕已久”这类套话，避免一眼看出是 AI 写的腔调。
4. 用简体中文，面向国内校招 HR 的表达习惯。
5. 只输出一个 JSON 对象，不要输出 JSON 以外的任何文字，不要用 Markdown 代码块包裹。`;

/** 从模型回复里取出 JSON（有的模型会包一层 ```json） */
export function extractJson(text: string): unknown {
  const t = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  try { return JSON.parse(t); } catch { /* 往下找 */ }
  const start = t.indexOf('{');
  const end = t.lastIndexOf('}');
  if (start >= 0 && end > start) {
    try { return JSON.parse(t.slice(start, end + 1)); } catch { /* 格式坏了 */ }
  }
  throw new Error('AI 返回的格式不对，请再试一次。');
}

// —— 校验工具 ——
export const str = (v: unknown, max = 2000) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
export const strs = (v: unknown, n = 20, max = 400) => (Array.isArray(v) ? v.map((x) => str(x, max)).filter(Boolean).slice(0, n) : []);
export const objs = (v: unknown, n = 20): Record<string, unknown>[] =>
  (Array.isArray(v) ? v.filter((x): x is Record<string, unknown> => !!x && typeof x === 'object').slice(0, n) : []);
export const num = (v: unknown, min = 0, max = 100) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, Math.round(n))) : null;
};
export function oneOf<T extends string>(v: unknown, xs: readonly T[], fallback: T): T {
  return xs.includes(v as T) ? (v as T) : fallback;
}

/** 中文网申的“字数”：去掉空白后按字符数算 */
export const countChars = (s: string) => [...s.replace(/\s/g, '')].length;
