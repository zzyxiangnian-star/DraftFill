import { isVisible } from './detect';
import type { FillEntry, FillStatus } from './fill';

// 在网申页面上直接标出每个字段的状态（计划书 M6、M7）。只加一个属性和一段样式，撤销或清除时去掉。

const ATTR = 'data-wangshen-mark';
const FLASH = 'data-wangshen-flash';
const STYLE_ID = 'wangshen-marks';

const CSS = `
[${ATTR}] { outline-offset: 2px !important; border-radius: 4px; transition: outline-color 150ms cubic-bezier(0.2, 0.8, 0.2, 1); }
[${ATTR}="ok"] { outline: 2px solid rgba(54, 69, 36, 0.45) !important; }
[${ATTR}="warn"] { outline: 2px solid #a86b12 !important; }
[${ATTR}="err"] { outline: 2px solid #b4432f !important; }
[${ATTR}="need"] { outline: 2px dashed #b4432f !important; }
[${FLASH}] { animation: wangshen-flash 600ms cubic-bezier(0.2, 0.8, 0.2, 1) 2; }
@keyframes wangshen-flash { 50% { box-shadow: 0 0 0 6px rgba(168, 107, 18, 0.35); } }
@media (prefers-reduced-motion: reduce) { [${FLASH}] { animation: none; outline-width: 3px !important; } }
`;

const MARKED: FillStatus[] = ['ok', 'warn', 'err'];

export function applyMarks(doc: Document, entries: FillEntry[]): void {
  clearMarks(doc);
  if (!doc.getElementById(STYLE_ID)) {
    const style = doc.createElement('style');
    style.id = STYLE_ID;
    style.textContent = CSS;
    (doc.head ?? doc.documentElement).append(style);
  }
  for (const e of entries) {
    if (MARKED.includes(e.item.status)) e.control.el.setAttribute(ATTR, e.item.status);
    // 必填还空着的、要上传的附件：虚线框出来
    else if (e.item.required || e.item.attach) visibleTarget(e.control.el)?.setAttribute(ATTR, 'need');
  }
}

export function clearMarks(doc: Document): void {
  doc.querySelectorAll(`[${ATTR}]`).forEach((el) => el.removeAttribute(ATTR));
  doc.getElementById(STYLE_ID)?.remove();
}

/** 隐藏的上传框等：找到用户看得见的外层 */
function visibleTarget(el: HTMLElement): HTMLElement | null {
  let n: HTMLElement | null = el;
  for (let depth = 0; n && depth < 6; n = n.parentElement, depth++) if (isVisible(n)) return n;
  return null;
}

/** 滚动到字段并闪烁提示 */
export function reveal(entry: FillEntry): void {
  const el = visibleTarget(entry.control.el) ?? entry.control.el;
  const reduce = el.ownerDocument.defaultView?.matchMedia('(prefers-reduced-motion: reduce)').matches;
  el.scrollIntoView({ block: 'center', behavior: reduce ? 'auto' : 'smooth' });
  const focusable = el.matches('input, textarea, select') ? el : el.querySelector<HTMLElement>('input:not([type=hidden]):not([type=file]), textarea, select');
  focusable?.focus({ preventScroll: true });
  el.removeAttribute(FLASH);
  void el.offsetWidth;
  el.setAttribute(FLASH, '');
  setTimeout(() => el.removeAttribute(FLASH), 1300);
}
