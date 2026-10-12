import type { WidgetStep } from '../ai/skills/widgetPlan';
import type { Control } from './detect';
import { isVisible } from './detect';
import { safeClick, safeMouseDown } from './safety';
import { isTag, textOf } from './text';

// 「AI 帮我填完」：规则没能操作的控件（各家写法不同的日期面板等），点开看看面板长什么样，
// 交给 AI 出操作步骤，再在本地按步骤点。面板只读按钮文字，不读页面上的个人信息。
// 所有点击都走 safety.ts，只在点开后新出现的面板里点。

const POPUP = [
  '[class*="picker" i]', '[class*="calendar" i]', '[class*="date" i]', '[class*="popover" i]', '[class*="popper" i]',
  '[class*="dropdown" i]', '[class*="popup" i]', '[class*="panel" i]', '[class*="overlay" i]', '[class*="layer" i]',
  '[role=dialog]', '[role=listbox]', '[role=grid]', '[role=menu]',
].join(', ');
const NAV_HINT = /prev|next|left|right|up|down|arrow|super|forward|backward|last|before|after/i;
const MAX_PANEL = 150;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** 档案值换成占位符对应的值：2001-05-20 → {YYYY: 2001, MM: 05, M: 5, ...} */
export function widgetVars(value: string): Record<string, string> {
  const vars: Record<string, string> = { value };
  const m = /^(\d{4})[-./年](\d{1,2})(?:[-./月](\d{1,2}))?/.exec(value.trim());
  if (m) {
    vars.YYYY = m[1]!; vars.YY = m[1]!.slice(2);
    vars.MM = m[2]!.padStart(2, '0'); vars.M = String(Number(m[2]));
    if (m[3]) { vars.DD = m[3].padStart(2, '0'); vars.D = String(Number(m[3])); }
  }
  return vars;
}

/** 档案值的形状（不含具体值） */
export function valueShape(value: string): string {
  const v = widgetVars(value);
  if (v.DD) return 'YYYY-MM-DD';
  if (v.MM) return 'YYYY-MM';
  return '文字';
}

/** 把步骤里的占位符换成真实值；有用不上的占位符（档案没有日）就返回 null */
export function render(text: string, vars: Record<string, string>): string | null {
  let missing = false;
  const out = text.replace(/\{([A-Za-z]+)\}/g, (_, k: string) => vars[k] ?? ((missing = true), ''));
  return missing ? null : out;
}

const inputOf = (c: Control): HTMLInputElement | null =>
  isTag(c.el, 'input') ? c.el : c.el.querySelector<HTMLInputElement>('input:not([type=hidden])');

export const typable = (c: Control) => { const i = inputOf(c); return !!i && !i.readOnly && !i.disabled; };

/** 页面上现在看得见的弹层类元素 */
function popupCandidates(doc: Document): Set<Element> {
  return new Set([...doc.querySelectorAll(POPUP), ...doc.body.children].filter((e) => isVisible(e)));
}

/** 点开后新出现的弹层（取最外层），不含控件自己 */
function newPopups(c: Control, before: Set<Element>): HTMLElement[] {
  const doc = c.el.ownerDocument;
  const fresh = [...popupCandidates(doc)].filter((e) => !before.has(e) && !e.contains(c.el) && !c.el.contains(e)) as HTMLElement[];
  return fresh.filter((e) => !fresh.some((o) => o !== e && o.contains(e)));
}

function open(c: Control) {
  const t = inputOf(c) ?? c.el;
  safeMouseDown(t);
  safeClick(t);
  t.focus?.();
}

function close(c: Control) {
  const doc = c.el.ownerDocument;
  const t = inputOf(c) ?? c.el;
  t.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true }));
  t.blur?.();
  doc.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
  doc.body.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
  doc.body.dispatchEvent(new MouseEvent('click', { bubbles: true }));
}

/** 面板上的可点项：短文字的最里层元素；没有文字的图标按钮用类名片段表示 */
function panelTokens(roots: HTMLElement[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const add = (t: string) => { if (t && !seen.has(t) && out.length < MAX_PANEL) { seen.add(t); out.push(t); } };
  for (const root of roots) {
    for (const el of root.querySelectorAll<HTMLElement>('*')) {
      if (!isVisible(el)) continue;
      const own = el.children.length === 0 || [...el.children].every((ch) => !textOf(ch));
      const t = own ? textOf(el, 14) : '';
      if (t && t.length <= 12) add(t);
      else if (!t && (el.matches('button, a, [role=button], i, span') || el.onclick)) {
        const hint = [el.getAttribute('aria-label') ?? '', el.getAttribute('title') ?? '', ...el.classList].find((x) => NAV_HINT.test(x));
        if (hint) add(`<${hint.slice(0, 30)}>`);
      }
    }
  }
  return out;
}

/** 点开控件，记下面板上有什么，再关上 */
export async function viewWidget(c: Control): Promise<string[]> {
  const before = popupCandidates(c.el.ownerDocument);
  open(c);
  await sleep(400);
  const tokens = panelTokens(newPopups(c, before));
  close(c);
  await sleep(200);
  return tokens;
}

const norm = (s: string) => s.replace(/\s+/g, '');

/** 在弹层里找文字正好是 text 的最里层元素 */
function findText(roots: HTMLElement[], text: string): HTMLElement | null {
  const want = norm(text);
  const hits: HTMLElement[] = [];
  for (const root of roots) {
    for (const el of root.querySelectorAll<HTMLElement>('*')) {
      if (isVisible(el) && norm(textOf(el, 30)) === want) hits.push(el);
    }
  }
  // 最里层；跳过禁用的日期格
  const inner = hits.filter((e) => !hits.some((o) => o !== e && e.contains(o)));
  return inner.find((e) => !/disabled/i.test(`${e.className} ${e.parentElement?.className ?? ''}`) && e.getAttribute('aria-disabled') !== 'true') ?? null;
}

function findButton(roots: HTMLElement[], button: string): HTMLElement | null {
  const byText = findText(roots, button);
  if (byText) return byText;
  const b = button.replace(/^<|>$/g, '').toLowerCase();
  for (const root of roots) {
    for (const el of root.querySelectorAll<HTMLElement>('*')) {
      if (!isVisible(el)) continue;
      const hay = `${el.getAttribute('aria-label') ?? ''} ${el.getAttribute('title') ?? ''} ${el.className}`.toLowerCase();
      if (hay.includes(b)) return el;
    }
  }
  return null;
}

function click(el: HTMLElement) {
  el.scrollIntoView?.({ block: 'nearest' });
  safeMouseDown(el);
  el.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
  safeClick(el);
}

function setValue(input: HTMLInputElement, value: string) {
  const win = (input.ownerDocument.defaultView ?? window) as typeof window;
  const setter = Object.getOwnPropertyDescriptor(win.HTMLInputElement.prototype, 'value')?.set;
  input.focus();
  if (setter) setter.call(input, value); else input.value = value;
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new Event('change', { bubbles: true }));
}

/** 控件上现在显示的内容 */
export function shownValue(c: Control): string {
  const i = inputOf(c);
  return (i ? i.value : textOf(c.el, 40)).trim();
}

/** 回读：显示的内容里要有年、月（档案有日时还要有日） */
export function matchesDate(shown: string, vars: Record<string, string>): boolean {
  if (!vars.YYYY) return !!shown && norm(shown).includes(norm(vars.value!));
  const nums = (shown.match(/\d+/g) ?? []).map(Number);
  const year = nums.includes(Number(vars.YYYY)) || nums.includes(Number(vars.YY));
  const month = nums.includes(Number(vars.M));
  const day = !vars.D || nums.includes(Number(vars.D));
  return year && month && day;
}

/** 按 AI 给的步骤操作。返回失败原因，成功返回 null。 */
export async function runSteps(c: Control, steps: WidgetStep[], vars: Record<string, string>): Promise<string | null> {
  const before = popupCandidates(c.el.ownerDocument);
  const roots = () => newPopups(c, before);
  try {
    for (const s of steps) {
      if (s.do === 'open') { open(c); await sleep(350); continue; }
      const text = render(s.do === 'navigate' ? s.until : s.text, vars);
      if (text === null) return '档案里的值缺了一部分（比如没有具体到日）';
      if (s.do === 'type') {
        const i = inputOf(c);
        if (!i || i.readOnly) return '这个框不能直接打字';
        setValue(i, text);
        i.blur();
        i.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
        await sleep(150);
      } else if (s.do === 'click') {
        const el = findText(roots(), text);
        if (!el) return `面板上找不到“${text}”`;
        click(el);
        await sleep(300);
      } else {
        for (let n = 0; !findText(roots(), text); n++) {
          const btn = n < s.max ? findButton(roots(), s.button) : null;
          if (!btn) return `翻页后也没找到“${text}”`;
          click(btn);
          await sleep(150);
        }
      }
    }
  } finally {
    await sleep(100);
    if (roots().length) close(c);
    await sleep(150);
  }
  return null;
}
