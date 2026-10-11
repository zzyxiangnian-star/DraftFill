import type { Profile } from '../profile/schema';
import { chooseOption } from './choice';
import { describe, detectControls, isVisible, type Control } from './detect';
import { matchControl } from './match';
import { safeClick, safeMouseDown, SafetyError } from './safety';
import { clean, textOf } from './text';
import { parsePath, pathIndexLabel, resolveValue } from './values';

// Filler：按控件类型分派写入，写入后回读页面实际显示的值。只填不交。

export type FillStatus = 'ok' | 'warn' | 'err' | 'skip';

export interface FillItem {
  label: string;
  path: string | null;
  status: FillStatus;
  /** 写入的值，或页面回读到的值 */
  value: string;
  note: string;
}

export interface FillReport {
  url: string;
  title: string;
  at: number;
  profileTitle: string;
  items: FillItem[];
}

const SKIP_KIND: Partial<Record<Control['kind'], string>> = {
  password: '密码框，按规则不填',
  captcha: '验证码，按规则不填',
  file: '附件需要你自己上传',
  checkbox: '复选框需要你自己勾选',
  cascader: '级联选择（省市区等）第二版支持',
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function waitFor<T>(fn: () => T | null | undefined, timeout = 1500, step = 40): Promise<T | null> {
  const end = Date.now() + timeout;
  for (;;) {
    const v = fn();
    if (v) return v;
    if (Date.now() > end) return null;
    await sleep(step);
  }
}

function setNativeValue(el: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement, value: string) {
  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype
    : el instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
  el.focus();
  if (setter) setter.call(el, value); else el.value = value;
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
}

function blur(el: HTMLElement) {
  el.blur();
  el.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
}

const DATE_PATH = /(\.start|\.end|\.date|birthDate|availableDate)$/;

/** 按页面提示的格式输出日期。档案存 YYYY-MM 或 YYYY-MM-DD。 */
export function formatDate(value: string, hint: string, want: 'month' | 'day' | 'auto' = 'auto'): { text: string; padded: boolean } {
  const m = /^(\d{4})-(\d{2})(?:-(\d{2}))?$/.exec(value);
  if (!m) return { text: value, padded: false };
  const [, y, mo, d] = m;
  const h = hint.toLowerCase();
  const needDay = want === 'day' || (want === 'auto' && /dd|日期|生日|\d{4}[-/.年]\d{1,2}[-/.月]\d{1,2}|年月日/.test(h) && !/月份/.test(h));
  const day = d ?? (needDay ? '01' : undefined);
  const padded = needDay && !d;
  if (/年/.test(h)) return { text: `${y}年${mo}月${needDay ? `${day}日` : ''}`, padded };
  const sep = /yyyy([./-])|\d{4}([./-])/i.exec(hint);
  const s = sep?.[1] ?? sep?.[2] ?? '-';
  return { text: [y, mo, ...(needDay ? [day] : [])].join(s), padded };
}

function sameValue(a: string, b: string) {
  return clean(a) === clean(b) || clean(a).replace(/[-./年月日]/g, '') === clean(b).replace(/[-./年月日]/g, '');
}

interface Outcome { status: FillStatus; value: string; note: string }

const ok = (value: string, sure: boolean, note = ''): Outcome =>
  ({ status: sure ? 'ok' : 'warn', value, note: note || (sure ? '' : '把握不大，请确认') });
const fail = (value: string, note: string): Outcome => ({ status: 'err', value, note });
const skip = (note: string): Outcome => ({ status: 'skip', value: '', note });

async function fillText(c: Control, value: string, sure: boolean, isDate: boolean): Promise<Outcome> {
  const el = c.el as HTMLInputElement | HTMLTextAreaElement;
  let text = value;
  let note = '';
  if (isDate) {
    const want = c.kind === 'month' ? 'month' : c.kind === 'date' ? 'day' : 'auto';
    const f = formatDate(value, c.placeholder, want);
    text = f.text;
    if (f.padded) { sure = false; note = '档案只有年月，日期按 1 日填写'; }
  }
  const max = Number(el.getAttribute('maxlength'));
  if (max > 0 && text.length > max) return skip(`内容 ${text.length} 字，超过页面限制 ${max} 字`);
  setNativeValue(el, text);
  blur(el);
  await sleep(0);
  return sameValue(el.value, text) ? ok(text, sure, note) : fail(el.value, `回读为“${el.value}”，和档案不一致`);
}

async function fillNativeSelect(c: Control, value: string, sure: boolean): Promise<Outcome> {
  const el = c.el as HTMLSelectElement;
  const opts = [...el.options].filter((o) => !/^(请选择|--|—)/.test(o.text.trim()) && o.value !== '');
  const r = chooseOption(value, opts.map((o) => o.text));
  if (!r.ok) return skip(r.reason);
  const opt = opts[r.index]!;
  setNativeValue(el, opt.value);
  blur(el);
  const now = el.selectedOptions[0]?.text.trim() ?? '';
  return now === opt.text.trim() ? ok(now, sure && r.sure) : fail(now, '选择后页面没有变化');
}

async function fillRadio(c: Control, value: string, sure: boolean): Promise<Outcome> {
  const radios = c.radios ?? [];
  const r = chooseOption(value, c.options);
  if (!r.ok) return skip(r.reason);
  const radio = radios[r.index]!;
  safeClick(isVisible(radio) ? radio : (radio.closest('label') ?? radio));
  await sleep(0);
  return radio.checked ? ok(c.options[r.index]!, sure && r.sure) : fail('', '点击后没有选中');
}

// —— Ant Design / Element Plus 下拉 ——

interface DropdownAdapter {
  trigger(root: HTMLElement): HTMLElement;
  panel(root: HTMLElement): HTMLElement | null;
  options(panel: HTMLElement): HTMLElement[];
  scroller(panel: HTMLElement): HTMLElement | null;
  selected(root: HTMLElement): string;
  close(root: HTMLElement): void;
}

function visiblePanel(doc: Document, selector: string, hiddenClass: string): HTMLElement | null {
  const all = [...doc.querySelectorAll<HTMLElement>(selector)].filter((p) => !p.classList.contains(hiddenClass) && isVisible(p));
  return all.at(-1) ?? null;
}

/** 通过 aria-controls（或 AntD 的 “id_list” 约定）找到这个下拉框自己的弹层，避免拿到别的下拉框还没关完的弹层 */
function ownPanel(root: HTMLElement, popper: string): HTMLElement | null | undefined {
  const input = root.querySelector('input');
  const ids = [input?.getAttribute('aria-controls'), input?.id ? `${input.id}_list` : null].filter(Boolean) as string[];
  for (const id of ids) {
    const p = root.ownerDocument.getElementById(id)?.closest<HTMLElement>(popper);
    if (p) return isVisible(p) && !p.className.includes('-hidden') ? p : null;
  }
  return undefined; // 页面没有提供关联信息
}

function pressEscape(root: HTMLElement) {
  const input = root.querySelector('input');
  input?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true }));
  input?.blur();
}

const ANTD: DropdownAdapter = {
  trigger: (root) => root.querySelector<HTMLElement>('.ant-select-selector, .ant-select-content') ?? root,
  panel: (root) => {
    const own = ownPanel(root, '.ant-select-dropdown');
    return own !== undefined ? own : visiblePanel(root.ownerDocument, '.ant-select-dropdown', 'ant-select-dropdown-hidden');
  },
  options: (panel) => [...panel.querySelectorAll<HTMLElement>('.ant-select-item-option')],
  scroller: (panel) => panel.querySelector<HTMLElement>('.rc-virtual-list-holder, .ant-select-dropdown-list-holder'),
  selected: (root) => {
    const item = root.querySelector('.ant-select-selection-item, .ant-select-content-has-value');
    return (item?.getAttribute('title') || textOf(item)).trim();
  },
  close: pressEscape,
};

const ELEMENT: DropdownAdapter = {
  trigger: (root) => root.querySelector<HTMLElement>('.el-select__wrapper, .el-input__wrapper, .el-input') ?? root,
  panel: (root) => {
    const own = ownPanel(root, '.el-select__popper, .el-popper');
    return own !== undefined ? own : visiblePanel(root.ownerDocument, '.el-select__popper, .el-select-dropdown', '__never__');
  },
  options: (panel) => [...panel.querySelectorAll<HTMLElement>('.el-select-dropdown__item, .el-select-dropdown__option-item')],
  scroller: (panel) => panel.querySelector<HTMLElement>('.el-scrollbar__wrap, .el-select-dropdown__list'),
  selected: (root) => {
    const item = root.querySelector('.el-select__selected-item:not(.el-select__input-wrapper):not(.is-transparent), .el-select__placeholder:not(.is-transparent)');
    return (item ? textOf(item) : root.querySelector('input')?.value ?? '').trim();
  },
  close: pressEscape,
};

const optionText = (o: HTMLElement) => (o.getAttribute('title') || textOf(o, 60)).trim();

async function fillCustomSelect(c: Control, value: string, sure: boolean, ad: DropdownAdapter): Promise<Outcome> {
  const root = c.el;
  const trigger = ad.trigger(root);
  safeMouseDown(trigger);
  safeClick(trigger);
  const panel = await waitFor(() => ad.panel(root));
  if (!panel) return fail('', '下拉框没有打开');

  // 选项可能是虚拟列表：边滚动边找
  let found: HTMLElement | null = null;
  let chosenSure = false;
  let lastReason = '';
  const scroller = ad.scroller(panel);
  const seen = new Set<string>();
  for (let round = 0; round < 40 && !found; round++) {
    await waitFor(() => ad.options(panel).length > 0, 800);
    const opts = ad.options(panel);
    opts.forEach((o) => seen.add(optionText(o)));
    const r = chooseOption(value, opts.map(optionText));
    if (r.ok) { found = opts[r.index]!; chosenSure = r.sure; break; }
    lastReason = r.reason;
    if (!scroller || scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - 2) break;
    scroller.scrollTop += Math.max(scroller.clientHeight - 32, 32);
    scroller.dispatchEvent(new Event('scroll'));
    await sleep(60);
  }

  // 可搜索的下拉（如学校联想）：输入关键字再找
  const search = root.querySelector<HTMLInputElement>('input');
  if (!found && search && !search.readOnly) {
    setNativeValue(search, value);
    await sleep(300);
    const p2 = ad.panel(root) ?? panel;
    const opts = await waitFor(() => { const o = ad.options(p2); return o.length ? o : null; }, 1500) ?? [];
    const r = chooseOption(value, opts.map(optionText));
    if (r.ok) { found = opts[r.index]!; chosenSure = r.sure; } else lastReason = r.reason;
  }

  const closePanel = async () => {
    if (isVisible(panel)) ad.close(root);
    await waitFor(() => !isVisible(panel) || panel.className.includes('-hidden'), 800);
  };
  if (!found) {
    await closePanel();
    return skip(lastReason || `选项里没有“${value}”`);
  }
  const want = optionText(found);
  safeClick(found);
  await sleep(50);
  const now = await waitFor(() => (sameValue(ad.selected(root), want) ? ad.selected(root) : null), 800) ?? ad.selected(root);
  await closePanel();
  return sameValue(now, want) ? ok(now, sure && chosenSure) : fail(now, now ? `回读为“${now}”，和档案不一致` : '选择后页面没有变化');
}

async function fillPicker(c: Control, value: string, sure: boolean): Promise<Outcome> {
  const input = c.el.querySelector<HTMLInputElement>('input');
  if (!input) return skip('找不到日期输入框');
  const monthOnly = /月份|month/i.test(c.placeholder) || c.el.matches('.el-date-editor--month, .ant-picker-month');
  const f = formatDate(value, c.placeholder, monthOnly ? 'month' : 'day');
  if (input.readOnly) return skip('日期只能在面板里点选，阶段 3 支持');
  input.focus();
  safeClick(input);
  setNativeValue(input, f.text);
  // 合成的键盘事件不会触发表单提交，只用来让组件确认输入
  input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', bubbles: true }));
  await sleep(50);
  blur(input);
  input.ownerDocument.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
  await sleep(100);
  return sameValue(input.value, f.text)
    ? ok(input.value, sure && !f.padded, f.padded ? '档案只有年月，日期按 1 日填写' : '')
    : fail(input.value, input.value ? `回读为“${input.value}”，和档案不一致` : '日期没有写进去');
}

function currentValue(c: Control): string {
  switch (c.kind) {
    case 'text': case 'textarea': case 'date': case 'month': return (c.el as HTMLInputElement).value;
    case 'select': return (c.el as HTMLSelectElement).value;
    case 'radio': return c.radios?.some((r) => r.checked) ? 'checked' : '';
    case 'antd-select': return ANTD.selected(c.el);
    case 'el-select': return ELEMENT.selected(c.el);
    case 'antd-picker': case 'el-picker': return c.el.querySelector('input')?.value ?? '';
    default: return '';
  }
}

async function write(c: Control, path: string, value: string, sure: boolean): Promise<Outcome> {
  const isDate = DATE_PATH.test(path);
  switch (c.kind) {
    case 'text': case 'textarea': case 'date': case 'month': return fillText(c, value, sure, isDate);
    case 'select': return fillNativeSelect(c, value, sure);
    case 'radio': return fillRadio(c, value, sure);
    case 'antd-select': return fillCustomSelect(c, value, sure, ANTD);
    case 'el-select': return fillCustomSelect(c, value, sure, ELEMENT);
    case 'antd-picker': case 'el-picker': return fillPicker(c, value, sure);
    default: return skip(SKIP_KIND[c.kind] ?? '暂不支持这种控件');
  }
}

export interface PlannedField {
  control: Control;
  path: string | null;
  index: number;
  sure: boolean;
  reason: string;
}

/** 识别并匹配，不写入。多条经历按出现顺序编号：第一个“学校”对应第 1 段教育经历。 */
export function planFill(doc: Document, profile: Profile): PlannedField[] {
  const counters = new Map<string, number>();
  return detectControls(doc).map((control) => {
    if (SKIP_KIND[control.kind]) return { control, path: null, index: 0, sure: false, reason: SKIP_KIND[control.kind]! };
    const m = matchControl(control, profile);
    if (m.path === null) return { control, path: null, index: 0, sure: false, reason: m.reason };
    const arr = parsePath(m.path);
    let index = 0;
    if (arr && arr.index === null) {
      index = counters.get(m.path) ?? 0;
      counters.set(m.path, index + 1);
    }
    return { control, path: m.path, index, sure: m.confidence === 'high', reason: '' };
  });
}

export async function fillDocument(doc: Document, profile: Profile): Promise<FillReport> {
  const items: FillItem[] = [];
  for (const f of planFill(doc, profile)) {
    const label = describe(f.control) + (f.path ? (pathIndexLabel(f.path, f.index) ? `（${pathIndexLabel(f.path, f.index)}）` : '') : '');
    if (!f.path) { items.push({ label, path: null, status: 'skip', value: '', note: f.reason }); continue; }
    const v = resolveValue(profile, f.path, f.index);
    if (v.value === null) { items.push({ label, path: f.path, status: 'skip', value: '', note: v.reason }); continue; }
    if (currentValue(f.control).trim()) {
      items.push({ label, path: f.path, status: 'skip', value: '', note: '页面上已经有内容，没有覆盖' });
      continue;
    }
    try {
      const o = await write(f.control, f.path, v.value, f.sure);
      items.push({ label, path: f.path, ...o });
    } catch (e) {
      items.push({ label, path: f.path, status: 'err', value: '', note: e instanceof SafetyError ? e.message : `填写出错：${String(e)}` });
    }
  }
  return { url: doc.location?.href ?? '', title: doc.title, at: Date.now(), profileTitle: profile.title, items };
}
