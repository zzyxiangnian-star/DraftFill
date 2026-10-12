import type { Profile } from '../profile/schema';
import { ALIASES, type Alias } from './aliases';
import type { Control } from './detect';
import { UNKNOWN_REASON } from './reasons';
import { clean } from './text';

// Matcher：给每个字段打分，选出最可能的档案路径。
// 优先级（计划书第 5 节）：站点规则 → 内置别名 → 自定义字段 → 学习记录 → LLM。阶段 2 只有内置别名和自定义字段。

export type Confidence = 'high' | 'low';

export interface Match {
  /** 档案路径，多条经历用 [] 占位，如 education[].school；自定义字段为 custom:<id> */
  path: string;
  score: number;
  confidence: Confidence;
  /** 打分第二高的候选，便于解释“为什么没把握” */
  runnerUp?: string;
}

export type MatchResult = Match | { path: null; reason: string };

const EXACT = 1;
const CONTAINS = 0.75;
const PLACEHOLDER = 0.6;
const KEY = 0.55;
const HIGH = 0.75;
const LOW = 0.55;
const MARGIN = 0.15;

function scoreText(text: string, aliases: string[], base: number): number {
  let best = 0;
  for (const a of aliases) {
    const n = clean(a);
    if (!n || !text) continue;
    if (text === n) best = Math.max(best, base === CONTAINS ? EXACT : base + 0.1);
    else if (n.length >= 2 && text.includes(n)) best = Math.max(best, base + Math.min(n.length, 8) * 0.01);
  }
  return best;
}

// 只会是文本框的字段：页面上这个标签下的下拉框（如手机号前面的区号）不是它
const TEXT_ONLY = new Set(['basic.name', 'basic.phone', 'basic.email', 'basic.idNumber', 'basic.address']);
const YES_NO = /^(是否|有无|有没有)/;
const CHOICE_KINDS = new Set<Control['kind']>(['select', 'radio', 'div-radio', 'antd-select', 'el-select', 'moka-select', 'phoenix-select', 'cascader']);

function scoreAlias(c: Control, a: Alias): number {
  // 括号里是补充说明：“生源地（高考户籍地）”按“生源地”认，不能因为“户籍地”认成户口
  const full = clean(c.label);
  const label = full.replace(/\([^)]*\)/g, '') || full;
  const ph = clean(c.placeholder);
  const all = `${full}|${ph}`;
  if (a.exclude?.some((x) => all.includes(clean(x)))) return 0;
  if (TEXT_ONLY.has(a.path) && CHOICE_KINDS.has(c.kind)) return 0;

  // “是否……”“有无……”是是非题，只对得上同样是问句的字段（如“是否服从调剂”）
  if (YES_NO.test(label) && !a.strong.some((x) => YES_NO.test(clean(x)))) return 0;

  const known = c.section !== null;
  // 基本信息里的“毕业院校、专业、学历”指最高学历那段（档案第 1 段教育经历）
  const summary = c.section === 'basic' && a.path.startsWith('education[]');
  if (known && !a.home.includes(c.section!) && !summary) return 0;
  // 泛称只在字段的主分区里算数
  let aliases = known && c.section === a.home[0] ? [...a.strong, ...(a.ctx ?? [])] : a.strong;
  // “就读时间：年 月 - 年 月”这类合在一起的起止时间
  if (c.range && a.range && known && c.section === a.home[0]) aliases = [...aliases, ...a.range];
  if (c.part && !/\.(start|end|date)$|birthDate$/.test(a.path)) return 0;

  let s = Math.max(scoreText(label, aliases, CONTAINS), scoreText(ph, aliases, PLACEHOLDER));
  if (a.keys && c.keys.length) {
    const key = c.keys.join(' ');
    if (a.keys.some((k) => k.join(' ') === key)) s = Math.max(s, KEY);
  }
  if (s > 0 && known) s += 0.05;
  return s;
}

export function matchControl(c: Control, profile: Profile): MatchResult {
  const label = clean(c.label);
  const ph = clean(c.placeholder);

  // 自定义字段：名称完全一致才算
  const custom = profile.custom.find((f) => f.label && (clean(f.label) === label || clean(f.label) === ph));
  if (custom) return { path: `custom:${custom.id}`, score: EXACT, confidence: 'high' };

  const scored = ALIASES.map((a) => ({ path: a.path, score: scoreAlias(c, a) }))
    .filter((x) => x.score > 0)
    .sort((x, y) => y.score - x.score);
  const [best, second] = scored;
  if (!best || best.score < LOW) {
    return { path: null, reason: c.label || c.placeholder ? UNKNOWN_REASON : '这个字段没有标签，无法判断' };
  }
  const close = second && best.score - second.score < MARGIN;
  let path = c.range === 'end' ? best.path.replace(/\.start$/, '.end') : best.path;
  if (c.section === 'basic') path = path.replace(/^education\[\]/, 'education[0]');
  return {
    path,
    score: best.score,
    confidence: best.score >= HIGH && !close ? 'high' : 'low',
    runnerUp: close ? second.path : undefined,
  };
}
