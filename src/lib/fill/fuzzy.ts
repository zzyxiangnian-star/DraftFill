import { chooseOption, type ChoiceResult } from './choice';
import { clean } from './text';

// 计划书 V2：学校、专业的模糊匹配。页面选项和档案写法常有出入：
// “北大” / “北京大学(Peking University)” / “计算机技术(085404)”。
// 原则不变：宁可不填，不填错。只有唯一、足够接近的选项才选，而且一律标黄请用户核对。

/** 常见高校简称。有歧义的简称（交大、南大、中大、华师、农大……）故意不收。 */
const SCHOOL_ABBR: Record<string, string> = {
  北大: '北京大学', 清华: '清华大学', 人大: '中国人民大学', 复旦: '复旦大学', 上交: '上海交通大学', 上海交大: '上海交通大学',
  浙大: '浙江大学', 中科大: '中国科学技术大学', 科大: '中国科学技术大学', 国科大: '中国科学院大学', 哈工大: '哈尔滨工业大学',
  西交: '西安交通大学', 西安交大: '西安交通大学', 华科: '华中科技大学', 华中大: '华中科技大学', 武大: '武汉大学',
  北航: '北京航空航天大学', 北理: '北京理工大学', 北理工: '北京理工大学', 北师大: '北京师范大学', 华东师大: '华东师范大学',
  华师大: '华东师范大学', 华南理工: '华南理工大学', 华工: '华南理工大学', 同济: '同济大学', 厦大: '厦门大学', 川大: '四川大学',
  山大: '山东大学', 吉大: '吉林大学', 东大: '东南大学', 天大: '天津大学', 南开: '南开大学', 重大: '重庆大学',
  电子科大: '电子科技大学', 成电: '电子科技大学', 西电: '西安电子科技大学', 北邮: '北京邮电大学', 上财: '上海财经大学',
  央财: '中央财经大学', 贸大: '对外经济贸易大学', 对外经贸: '对外经济贸易大学', 中南财大: '中南财经政法大学',
  西南财大: '西南财经大学', 西财: '西南财经大学', 湖大: '湖南大学', 大工: '大连理工大学', 兰大: '兰州大学', 苏大: '苏州大学',
  南航: '南京航空航天大学', 南理工: '南京理工大学', 哈工程: '哈尔滨工程大学', 北交: '北京交通大学', 北交大: '北京交通大学',
  北科: '北京科技大学', 北科大: '北京科技大学', 上大: '上海大学', 深大: '深圳大学', 港大: '香港大学', 港中文: '香港中文大学',
  港科大: '香港科技大学', 港理工: '香港理工大学', 城大: '香港城市大学', 中国科大: '中国科学技术大学', 西工大: '西北工业大学',
  西农: '西北农林科技大学', 中海洋: '中国海洋大学', 中农: '中国农业大学', 北林: '北京林业大学', 华中师大: '华中师范大学',
  华南师大: '华南师范大学', 东华: '东华大学', 北外: '北京外国语大学', 上外: '上海外国语大学', 广外: '广东外语外贸大学',
  中传: '中国传媒大学', 北语: '北京语言大学', 中财: '中央财经大学', 法大: '中国政法大学', 华政: '华东政法大学',
  西政: '西南政法大学', 南师大: '南京师范大学', 杭电: '杭州电子科技大学', 南邮: '南京邮电大学', 重邮: '重庆邮电大学',
};

export type FuzzyKind = 'school' | 'major';

/** 档案里写的是简称时，换成全称（用于在可搜索的下拉框里搜） */
export function expandSchool(value: string): string {
  return SCHOOL_ABBR[clean(value)] ?? value;
}

/** 去掉不带中文的括号内容（英文名、专业代码）、多余符号；带中文的括号（校区、医学部）保留 */
export function coreName(s: string): string {
  return clean(s)
    .replace(/[(\[（【][^()\[\]（）【】一-龥]*[)\]）】]/g, '')
    .replace(/\b\d{4,6}\b|^\d{4,6}|\d{4,6}$/g, '')
    .replace(/[-—_·•,，.。/、\s]/g, '')
    .replace(/[a-zA-Z]+$/g, '')
    .toLowerCase();
}

function bigrams(s: string): string[] {
  const out: string[] = [];
  for (let i = 0; i < s.length - 1; i++) out.push(s.slice(i, i + 2));
  return out.length ? out : [s];
}

/** Dice 相似度（0–1） */
export function similarity(a: string, b: string): number {
  if (!a || !b) return 0;
  if (a === b) return 1;
  const x = bigrams(a), y = bigrams(b);
  const pool = [...y];
  let hit = 0;
  for (const g of x) { const i = pool.indexOf(g); if (i >= 0) { hit++; pool.splice(i, 1); } }
  return (2 * hit) / (x.length + y.length);
}

const THRESHOLD: Record<FuzzyKind, number> = { school: 0.8, major: 0.75 };

/** 学校、专业的选项匹配：精确 → 去掉英文名/代码后相同 → 简称 → 足够相似且唯一 */
export function chooseFuzzy(value: string, options: string[], kind: FuzzyKind): ChoiceResult {
  const direct = chooseOption(value, options);
  if (direct.ok) return direct;

  const wants = [...new Set([value, kind === 'school' ? expandSchool(value) : value].map(coreName))].filter(Boolean);
  if (!wants.length) return direct;
  const cores = options.map(coreName);

  const same = cores.map((c, i) => (wants.includes(c) ? i : -1)).filter((i) => i >= 0);
  if (same.length === 1) return { ok: true, index: same[0]!, sure: false };
  if (same.length > 1) return { ok: false, reason: '有多个相近的选项，请自己选' };

  const scored = cores.map((c, i) => ({ i, s: Math.max(...wants.map((w) => similarity(w, c))) })).sort((a, b) => b.s - a.s);
  const [best, second] = scored;
  if (best && best.s >= THRESHOLD[kind] && (!second || best.s - second.s >= 0.15)) return { ok: true, index: best.i, sure: false };
  return direct;
}

/** 这个档案路径要不要用模糊匹配 */
export function fuzzyKindOf(path: string): FuzzyKind | null {
  if (/^education\[\d*\]\.school$/.test(path)) return 'school';
  if (/^education\[\d*\]\.major$/.test(path)) return 'major';
  return null;
}
