import { clean } from './text';

// 计划书 V2：省市区级联。档案里写“湖南长沙”“湖南省长沙市”，页面一级一级选“湖南省”→“长沙市”。

const SUFFIX = /(维吾尔自治区|壮族自治区|回族自治区|自治区|特别行政区|自治州|地区|省|市|区|县|盟|旗)$/;

/** 去掉“省”“市”“自治区”等后缀：湖南省 → 湖南，广西壮族自治区 → 广西 */
export const shortRegion = (s: string) => {
  const c = clean(s);
  const t = c.replace(SUFFIX, '');
  return t.length >= 2 ? t : c;
};

/**
 * 在这一级的选项里找档案值开头对应的那一项。
 * 返回选中的序号和吃掉了档案值的几个字；找不到或有多个就返回 null。
 */
export function chooseRegion(rest: string, options: string[]): { index: number; consumed: number } | null {
  const r = clean(rest);
  if (!r) return null;
  const hits = options.map((o, index) => {
    const full = clean(o);
    const short = shortRegion(o);
    const consumed = full && r.startsWith(full) ? full.length : short.length >= 2 && r.startsWith(short) ? short.length : 0;
    return { index, consumed };
  }).filter((h) => h.consumed > 0);
  if (!hits.length) return null;
  const best = Math.max(...hits.map((h) => h.consumed));
  const top = hits.filter((h) => h.consumed === best);
  return top.length === 1 ? top[0]! : null;
}

/**
 * 直辖市这类重复一级的写法：档案“北京海淀”，页面“北京市”→“北京市”→“海淀区”。
 * 档案剩下的部分对不上任何一项时，如果这一级只有一个选项、或有一个和上一级同名，就选它，不吃字。
 */
export function chooseRepeat(prev: string, options: string[]): number | null {
  if (options.length === 1) return 0;
  const p = shortRegion(prev);
  const same = options.map((o, i) => (shortRegion(o) === p || clean(o) === '市辖区' ? i : -1)).filter((i) => i >= 0);
  return same.length === 1 ? same[0]! : null;
}
