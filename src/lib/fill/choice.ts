import { clean } from './text';

// 选项归一化：档案里写“本科”，页面选项可能是“大学本科”“本科/学士”。

const GROUPS: string[][] = [
  ['本科', '大学本科', '本科生', '全日制本科', '统招本科'],
  ['硕士研究生', '硕士', '研究生', '硕士生', '全日制硕士', '研究生(硕士)'],
  ['博士研究生', '博士', '博士生', '研究生(博士)'],
  ['大专', '专科', '高职', '大学专科', '高职高专'],
  ['高中/中专', '高中', '中专', '中技'],
  ['学士', '学士学位'], ['硕士', '硕士学位'], ['博士', '博士学位'],
  ['男', '男性', 'male', 'm'], ['女', '女性', 'female', 'f'],
  ['中共党员', '党员', '中国共产党党员', '中国共产党员', '中共正式党员'],
  ['中共预备党员', '预备党员'],
  ['共青团员', '团员', '中国共产主义青年团团员', '共青团'],
  ['群众', '普通群众'],
  ['民主党派', '民主党派成员'],
  ['无党派人士', '无党派'],
  ['是', '服从', '接受', '愿意', 'yes', 'y'],
  ['否', '不服从', '不接受', '不愿意', 'no', 'n'],
  ['全日制', '统招全日制', '全日制统招', '统招'], ['非全日制', '在职'],
  ['居民身份证', '身份证', '中华人民共和国居民身份证', '二代身份证'],
  ['护照'], ['港澳居民来往内地通行证', '港澳通行证', '回乡证'], ['台湾居民来往大陆通行证', '台胞证'],
  ['父亲', '父'], ['母亲', '母'], ['配偶', '妻子', '丈夫', '爱人'],
  ['无', '无学位', '暂无', '没有'],
  // 计算机等级
  ...['一', '二', '三', '四'].map((n) => [`${n}级`, `计算机${n}级`, `全国计算机${n}级`, `全国计算机等级考试${n}级`, `ncre${n}级`, `计算机等级${n}级`]),
  // 获奖级别
  ['国际级', '国际级奖项', '国际'],
  ['国家级', '国家级奖项', '国家', '全国'],
  ['省部级', '省级', '省级奖项', '省市级', '省'],
  ['市级', '地市级', '市厅级', '市级奖项', '市'],
  ['校级', '学校级', '校级奖项', '校'],
  ['院级', '学院级', '系级', '院系级', '院'],
  // 外语语种
  ['英语', 'english', '英文'], ['日语', 'japanese', '日文'], ['韩语', '韩国语', '朝鲜语', 'korean'],
  ['法语', 'french'], ['德语', 'german'], ['俄语', 'russian'], ['西班牙语', 'spanish'],
];

function group(v: string): string[] | undefined {
  const n = clean(v);
  // 同一个写法只能出现在一组里，否则后面的组永远用不上
  return GROUPS.find((g) => g.some((x) => clean(x) === n));
}

export type ChoiceResult =
  | { ok: true; index: number; sure: boolean }
  | { ok: false; reason: string };

/** 在页面选项里找档案值对应的那一项 */
export function chooseOption(value: string, options: string[]): ChoiceResult {
  const v = clean(value);
  const opts = options.map(clean);
  if (!v) return { ok: false, reason: '档案里没有这一项' };

  const exact = opts.indexOf(v);
  if (exact >= 0) return { ok: true, index: exact, sure: true };

  // 民族可能写成“汉”“汉族”
  const g = group(value) ?? (v.endsWith('族') ? [v, v.slice(0, -1)] : [v, `${v}族`]);
  const syn = opts.map((o, i) => (g.some((x) => clean(x) === o) ? i : -1)).filter((i) => i >= 0);
  if (syn.length === 1) return { ok: true, index: syn[0]!, sure: true };

  const partial = opts.map((o, i) => (o && (o.includes(v) || (o.length >= 2 && v.includes(o))) ? i : -1)).filter((i) => i >= 0);
  if (partial.length === 1) return { ok: true, index: partial[0]!, sure: false };
  if (partial.length > 1 || syn.length > 1) return { ok: false, reason: '有多个相近的选项，请自己选' };
  return { ok: false, reason: `选项里没有“${value}”` };
}

/** 年、月这类数字选项：“9”“09”“9月”“2024年”都按数字比较 */
export function chooseNumber(value: string, options: string[]): ChoiceResult {
  const n = Number(value);
  if (!value || Number.isNaN(n)) return { ok: false, reason: '档案里没有这一项' };
  const hits = options.map((o, i) => (Number(/\d+/.exec(o)?.[0] ?? NaN) === n ? i : -1)).filter((i) => i >= 0);
  if (hits.length === 1) return { ok: true, index: hits[0]!, sure: true };
  return { ok: false, reason: hits.length ? '有多个相近的选项，请自己选' : `选项里没有“${value}”` };
}
