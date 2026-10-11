// 文本归一化：去掉必填星号、冒号、空白、“请输入”等提示词，统一全角半角与大小写。

const PROMPTS = /^(请输入|请填写|请选择|请上传|输入|选择|填写)/;

export function clean(s: string | null | undefined): string {
  if (!s) return '';
  return s
    .replace(/[！-～]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0)) // 全角转半角
    .replace(/[*＊]/g, '')
    .replace(/[\s 　]+/g, '')
    .replace(/[:：]$/g, '')
    .replace(/[（(]?(必填|选填|可选)[）)]?/g, '')
    .replace(PROMPTS, '')
    .toLowerCase();
}

// 同源 iframe 里的节点来自另一个 window，instanceof 判断会失败，统一按 nodeType / tagName 判断
export const isEl = (n: Node | null | undefined): n is Element => n?.nodeType === 1;
export function isTag<K extends keyof HTMLElementTagNameMap>(n: Node | null | undefined, tag: K): n is HTMLElementTagNameMap[K] {
  return isEl(n) && n.tagName === tag.toUpperCase();
}

/** 元素的可见文字（不含表单控件和隐藏元素里的文字），截断以免把整块内容当成标签 */
export function textOf(el: Element | null | undefined, max = 40): string {
  if (!el) return '';
  let out = '';
  const walk = (n: Node) => {
    if (out.length > max) return;
    if (n.nodeType === Node.TEXT_NODE) { out += n.textContent ?? ''; return; }
    if (!isEl(n)) return;
    if (n.matches('input, textarea, select, option, script, style, [hidden], [aria-hidden="true"]')) return;
    for (const c of n.childNodes) walk(c);
  };
  walk(el);
  return out.trim();
}

/** 把 name / id 拆成小写词：schoolName、school_name → ["school", "name"] */
export function tokens(key: string | null | undefined): string[] {
  if (!key) return [];
  return key
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}
