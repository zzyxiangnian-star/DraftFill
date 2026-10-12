// 表单可能不在主文档里：同源 iframe（老系统常见）、open shadow DOM（Web Components）。
// 跨域 iframe 浏览器不允许读，只计数，在结果里告诉用户。

export type FormRoot = Document | ShadowRoot;

export interface Roots {
  roots: FormRoot[];
  /** 读不到的内嵌页面（跨域 iframe）数量 */
  blockedFrames: number;
}

export function collectRoots(doc: Document, maxDepth = 3): Roots {
  const roots: FormRoot[] = [];
  let blockedFrames = 0;
  const visit = (root: FormRoot, depth: number) => {
    roots.push(root);
    if (depth >= maxDepth) return;
    for (const el of root.querySelectorAll('*')) {
      // 插件自己的候选卡、悬浮按钮不算
      if (el.shadowRoot && !el.id.startsWith('wangshen-')) visit(el.shadowRoot, depth + 1);
      if (el.tagName === 'IFRAME' || el.tagName === 'FRAME') {
        let inner: Document | null = null;
        try { inner = (el as HTMLIFrameElement).contentDocument; } catch { /* 跨域 */ }
        if (inner?.body) visit(inner, depth + 1);
        else if (isRealFrame(el as HTMLIFrameElement)) blockedFrames++;
      }
    }
  };
  visit(doc, 0);
  return { roots, blockedFrames };
}

/** 广告、统计用的 1px 框、空白框不算 */
function isRealFrame(f: HTMLIFrameElement): boolean {
  const src = f.getAttribute('src') ?? '';
  if (!src || /^(about:|javascript:)/.test(src)) return false;
  const r = f.getBoundingClientRect();
  const w = r.width || Number(f.getAttribute('width')) || 0;
  const h = r.height || Number(f.getAttribute('height')) || 0;
  return w >= 200 && h >= 100;
}

/** 在控件所在的文档或 shadow root 里查找（label[for]、同名单选按钮都不跨根） */
export function rootOf(el: Element): FormRoot {
  const r = el.getRootNode();
  return r.nodeType === 11 || r.nodeType === 9 ? (r as FormRoot) : el.ownerDocument;
}
