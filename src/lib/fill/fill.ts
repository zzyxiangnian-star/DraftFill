import type { Profile } from '../profile/schema';
import { chooseNumber, chooseOption, type ChoiceResult } from './choice';
import { describe, detectControls, isVisible, type Control } from './detect';
import { matchControl } from './match';
import { safeClick, safeMouseDown, SafetyError } from './safety';
import { clean, isTag, textOf } from './text';
import { parsePath, pathIndexLabel, resolveValue } from './values';
import { guessJob } from '../tracker/guess';
import { collectRoots } from './roots';
import { datePartValue } from './dates';
import { generalPath, hostOf, recall, signature, type FieldMemory } from './memory';
import { ALIASES } from './aliases';
import { UNKNOWN_REASON } from './reasons';
import type { UnknownField } from '../ai/skills/fieldMatch';
import { chooseFuzzy, expandSchool, fuzzyKindOf } from './fuzzy';
import { chooseRegion, chooseRepeat, shortRegion } from './region';
import { addMissingEntries } from './addEntries';

// Filler：按控件类型分派写入，写入后回读页面实际显示的值。只填不交。

export type FillStatus = 'ok' | 'warn' | 'err' | 'skip';

export interface FillItem {
  /** 在本次填写里的序号，用于在页面上定位字段 */
  index: number;
  label: string;
  path: string | null;
  status: FillStatus;
  /** 写入的值，或页面回读到的值 */
  value: string;
  note: string;
  /** 页面标了必填 */
  required?: boolean;
  /** 附件上传框（简历、成绩单等），需要用户自己选文件 */
  attach?: boolean;
}

export interface FillReport {
  url: string;
  title: string;
  at: number;
  profileTitle: string;
  items: FillItem[];
  /** 撤销时间；撤销后结果只作记录 */
  undoneAt?: number;
  /** 从页面猜出的公司和岗位，用于记到投递看板 */
  job?: { company: string; position: string };
  /** 来自别的网站的内嵌页面数，浏览器不允许读取 */
  blockedFrames?: number;
  /** 计划书 V1：自动点“添加”加出来的段落 */
  added?: { name: string; count: number }[];
  /** 经历没能加够的原因 */
  addNotes?: string[];
}

type Chooser = (options: string[]) => ChoiceResult;

const SKIP_KIND: Partial<Record<Control['kind'], string>> = {
  password: '密码框，按规则不填',
  captcha: '验证码，按规则不填',
  file: '附件需要你自己上传',
  checkbox: '复选框需要你自己勾选',
  readonly: '这一项要在弹出的面板里点选，请自己选一下',
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
  // 用控件自己所在 window 的原型（同源 iframe 里的控件来自另一个 window）
  const win = (el.ownerDocument.defaultView ?? window) as typeof window;
  const proto = isTag(el, 'textarea') ? win.HTMLTextAreaElement.prototype
    : isTag(el, 'select') ? win.HTMLSelectElement.prototype : win.HTMLInputElement.prototype;
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

const PLACEHOLDER_OPTION = /^(请选择|请选择.*|--.*|—.*|选择.*|)$/;

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

async function fillNativeSelect(c: Control, value: string, sure: boolean, choose: Chooser = (o) => chooseOption(value, o)): Promise<Outcome> {
  const el = c.el as HTMLSelectElement;
  const opts = [...el.options].filter((o) => !PLACEHOLDER_OPTION.test(o.text.trim()) && o.value !== '');
  const r = choose(opts.map((o) => o.text));
  if (!r.ok) return skip(r.reason);
  const opt = opts[r.index]!;
  setNativeValue(el, opt.value);
  blur(el);
  const now = el.selectedOptions[0]?.text.trim() ?? '';
  return now === opt.text.trim() ? ok(now, sure && r.sure) : fail(now, '选择后页面没有变化');
}

async function fillRadio(c: Control, value: string, sure: boolean, choose: Chooser = (o) => chooseOption(value, o)): Promise<Outcome> {
  const radios = c.radios ?? [];
  const r = choose(c.options);
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
  // Ant Design 3 把 aria-controls 放在 role=combobox 的 div 上
  const combo = root.querySelector('[role=combobox][aria-controls]');
  const ids = [input?.getAttribute('aria-controls'), combo?.getAttribute('aria-controls'), input?.id ? `${input.id}_list` : null].filter(Boolean) as string[];
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

/** Ant Design 的类名前缀：默认 ant，飞书招聘改成了 atsx */
export function antPrefix(root: Element): string {
  const cls = [...root.classList].find((c) => /^[a-z][\w]*-select$/.test(c));
  return cls ? cls.slice(0, -'-select'.length) : 'ant';
}

/**
 * Ant Design 下拉。新版（4/5）用 select-selector、select-item-option；
 * 3.x（Wecruit、飞书招聘的快照）用 select-selection、select-dropdown-menu-item，选中值在 select-selection-selected-value。
 */
function antdAdapter(p: string): DropdownAdapter {
  return {
    trigger: (root) => root.querySelector<HTMLElement>(`.${p}-select-selector, .${p}-select-content, .${p}-select-selection`) ?? root,
    panel: (root) => {
      const own = ownPanel(root, `.${p}-select-dropdown`);
      return own !== undefined ? own : visiblePanel(root.ownerDocument, `.${p}-select-dropdown`, `${p}-select-dropdown-hidden`);
    },
    options: (panel) => [...panel.querySelectorAll<HTMLElement>(
      `.${p}-select-item-option, .${p}-select-dropdown-menu-item:not(.${p}-select-dropdown-menu-item-disabled)`)],
    scroller: (panel) => panel.querySelector<HTMLElement>(`.rc-virtual-list-holder, .${p}-select-dropdown-list-holder, .${p}-select-dropdown-menu`),
    selected: (root) => {
      const item = root.querySelector(`.${p}-select-selection-item, .${p}-select-content-has-value, .${p}-select-selection-selected-value`);
      if (item) return (item.getAttribute('title') || textOf(item)).trim();
      // 3.x 的输入联想（飞书的学校名称）：值就在输入框里
      return root.matches(`.${p}-select-combobox`) ? (root.querySelector('input')?.value ?? '').trim() : '';
    },
    close: pressEscape,
  };
}
const ANTD = antdAdapter('ant');
const antdFor = (root: Element) => { const p = antPrefix(root); return p === 'ant' ? ANTD : antdAdapter(p); };

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

// —— Moka（sd- 组件库）与北森（phoenix 组件库）——
// 字段结构来自真实页面快照；下拉弹层的类名来自两家页面自带的样式表，快照里弹层没有展开，
// 所以这两个弹层的写法还没在真页面上验证过。写入后一律回读，对不上就标红，不会悄悄填错。

/** 只保留最里层的匹配元素（点击事件会冒泡到外层） */
function innermost(els: HTMLElement[]): HTMLElement[] {
  return els.filter((e) => !els.some((o) => o !== e && e.contains(o)));
}

function lastVisible(doc: Document, selector: string, exclude: Element): HTMLElement | null {
  return [...doc.querySelectorAll<HTMLElement>(selector)].filter((p) => !exclude.contains(p) && isVisible(p)).at(-1) ?? null;
}

function closeByOutsideClick(root: HTMLElement) {
  pressEscape(root);
  root.ownerDocument.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
  root.ownerDocument.body.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
}

const MOKA_PANEL = '[class*="sd-Dropdown-dropdown"], [class*="sd-Select-menu-"], [class*="sd-Select-select-"]';
const MOKA: DropdownAdapter = {
  trigger: (root) => root.querySelector<HTMLElement>('input') ?? root,
  panel: (root) => {
    const box = root.closest('[class*="sd-Dropdown-container"]');
    const own = box && [...box.querySelectorAll<HTMLElement>(MOKA_PANEL)].find((p) => !root.contains(p) && isVisible(p));
    return own ?? lastVisible(root.ownerDocument, MOKA_PANEL, root);
  },
  options: (panel) => innermost([...panel.querySelectorAll<HTMLElement>('[class*="sd-Select-item-"], [class*="sd-Select-menu-item"], [class*="sd-Menu-content-item"], [role="option"]')]),
  scroller: (panel) => panel.querySelector<HTMLElement>('[class*="sd-Select-scrollable"], [class*="ScrollView"]') ?? panel,
  selected: (root) => (textOf(root.querySelector('[class*="sd-Input-display-value"]')) || root.querySelector('input')?.value || '').trim(),
  close: closeByOutsideClick,
};

const PHOENIX: DropdownAdapter = {
  trigger: (root) => root,
  panel: (root) => lastVisible(root.ownerDocument, '.phoenix-selectList', root),
  options: (panel) => [...panel.querySelectorAll<HTMLElement>('.phoenix-selectList__listItem:not(.phoenix-selectList__listItem--disabled)')],
  scroller: (panel) => panel.querySelector<HTMLElement>('[class*="virtualList-holder"], .phoenix-selectList__contentWraper, .phoenix-selectList__list'),
  selected: (root) => (root.querySelector('.phoenix-select__placeHolder--show') ? ''
    : textOf(root.querySelector('.phoenix-select__content')) || root.querySelector('input')?.value || '').trim(),
  close: closeByOutsideClick,
};

const optionText = (o: HTMLElement) => (o.getAttribute('title') || textOf(o, 60)).trim();

async function fillCustomSelect(
  c: Control, value: string, sure: boolean, ad: DropdownAdapter,
  choose: Chooser = (o) => chooseOption(value, o),
  /** 可搜索的下拉里输入的关键字（学校简称换成全称） */
  query = value,
): Promise<Outcome> {
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
    const r = choose(opts.map(optionText));
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
    setNativeValue(search, query);
    await sleep(300);
    const p2 = ad.panel(root) ?? panel;
    const opts = await waitFor(() => { const o = ad.options(p2); return o.length ? o : null; }, 1500) ?? [];
    const r = choose(opts.map(optionText));
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

// —— 级联选择（省市区，计划书 V2）——
interface CascaderAdapter {
  trigger(root: HTMLElement): HTMLElement;
  panel(root: HTMLElement): HTMLElement | null;
  menus(panel: HTMLElement): HTMLElement[];
  items(menu: HTMLElement): HTMLElement[];
  label(item: HTMLElement): string;
  selected(root: HTMLElement): string;
}

const ANTD_CASCADER: CascaderAdapter = {
  trigger: ANTD.trigger,
  panel: (root) => visiblePanel(root.ownerDocument, '.ant-cascader-dropdown', 'ant-select-dropdown-hidden'),
  menus: (panel) => [...panel.querySelectorAll<HTMLElement>('.ant-cascader-menu')],
  items: (menu) => [...menu.querySelectorAll<HTMLElement>('.ant-cascader-menu-item')],
  label: (item) => (item.getAttribute('title') || textOf(item.querySelector('.ant-cascader-menu-item-content') ?? item)).trim(),
  selected: ANTD.selected,
};

const ELEMENT_CASCADER: CascaderAdapter = {
  trigger: (root) => root.querySelector<HTMLElement>('.el-input__wrapper, .el-input') ?? root,
  panel: (root) => visiblePanel(root.ownerDocument, '.el-cascader__dropdown', '__never__'),
  menus: (panel) => [...panel.querySelectorAll<HTMLElement>('.el-cascader-menu')],
  items: (menu) => [...menu.querySelectorAll<HTMLElement>('.el-cascader-node')],
  label: (item) => textOf(item.querySelector('.el-cascader-node__label') ?? item).trim(),
  selected: (root) => root.querySelector('input')?.value.trim() ?? '',
};

/** 一级一级点：湖南省 → 长沙市。点到最后一级时组件自己收起。 */
async function fillCascader(c: Control, value: string, sure: boolean): Promise<Outcome> {
  const ad = c.el.matches('.el-cascader') ? ELEMENT_CASCADER : ANTD_CASCADER;
  const trigger = ad.trigger(c.el);
  safeMouseDown(trigger);
  safeClick(trigger);
  const panel = await waitFor(() => ad.panel(c.el));
  if (!panel) return fail('', '级联选择框没有打开');
  const close = async () => { if (isVisible(panel)) pressEscape(c.el); await waitFor(() => !isVisible(panel), 600); };

  let rest = clean(value);
  let prev = '';
  let exact = true;
  const picked: string[] = [];
  for (let level = 0; level < 5; level++) {
    const menu = await waitFor(() => ad.menus(panel)[level] ?? null, 800);
    if (!menu) break; // 上一级已经是最后一级
    const items = ad.items(menu);
    const labels = items.map(ad.label);
    const r = chooseRegion(rest, labels);
    let index: number | null = r?.index ?? null;
    if (r) rest = rest.slice(r.consumed);
    else {
      // 档案里没写这一级（如“北京海淀”的第二级“北京市”），只有一个合理选项时才选
      index = picked.length ? chooseRepeat(prev, labels) : null;
      if (index === null) {
        await close();
        return skip(picked.length ? `档案里的“${value}”只对得上“${picked.join(' / ')}”，下一级请自己选` : `选项里没有“${value}”`);
      }
      exact = false;
    }
    const item = items[index!]!;
    prev = labels[index!]!;
    picked.push(prev);
    safeClick(item);
    await sleep(80);
    if (!isVisible(panel)) break; // 点到最后一级，已选中并收起
  }
  await sleep(50);
  if (isVisible(panel)) {
    await close();
    return skip(`档案里的“${value}”只写到“${picked.join(' / ')}”，页面要求选到下一级，请自己选`);
  }
  const now = ad.selected(c.el);
  const ok_ = picked.every((p) => now.includes(p));
  // 档案还有没用上的部分（写到了区县，页面只到市）也标黄
  return ok_ ? ok(now, sure && exact && !rest) : fail(now, now ? `回读为“${now}”，和档案不一致` : '选择后页面没有变化');
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

/** 年、月分开选：从 YYYY-MM 里取出年或月 */

/** 北森的日期也是 phoenix-select 外壳，点开后是日历面板；能输入就输入，不能就留给用户 */
async function fillPhoenixDate(c: Control, value: string, sure: boolean): Promise<Outcome> {
  const root = c.el;
  safeMouseDown(root);
  safeClick(root);
  const panel = await waitFor(() => lastVisible(root.ownerDocument, '.phoenix-calendar, .phoenix-date-picker__wrap, .phoenix-selectList', root));
  if (!panel) return fail('', '日期面板没有打开');
  if (panel.matches('.phoenix-selectList')) {
    closeByOutsideClick(root);
    return fillCustomSelect(c, value, sure, PHOENIX);
  }
  const input = panel.querySelector<HTMLInputElement>('input.phoenix-calendar-input, .phoenix-calendar-input input, .phoenix-calendar-date-input-wrap input');
  if (!input || input.readOnly) {
    closeByOutsideClick(root);
    return skip('日期要在面板里点选，请自己选一下');
  }
  const f = formatDate(value, input.getAttribute('placeholder') ?? '', 'auto');
  setNativeValue(input, f.text);
  input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', bubbles: true }));
  await sleep(100);
  const now = PHOENIX.selected(root);
  if (isVisible(panel)) closeByOutsideClick(root);
  return sameValue(now, f.text) ? ok(now, sure && !f.padded) : fail(now, now ? `回读为“${now}”，和档案不一致` : '日期没有写进去');
}

const divRadioChecked = (item: HTMLElement) => !!item.querySelector('.phoenix-radio__dot--checked, .phoenix-radio__circle--checked');

async function fillDivRadio(c: Control, value: string, sure: boolean, choose: Chooser = (o) => chooseOption(value, o)): Promise<Outcome> {
  const items = c.items ?? [];
  const r = choose(c.options);
  if (!r.ok) return skip(r.reason);
  const item = items[r.index]!;
  const target = item.querySelector<HTMLElement>('.phoenix-radio__wrapper') ?? item;
  safeMouseDown(target);
  safeClick(target);
  await waitFor(() => divRadioChecked(item), 500);
  return divRadioChecked(item) ? ok(c.options[r.index]!, sure && r.sure) : fail('', '点击后没有选中');
}

function currentValue(c: Control): string {
  switch (c.kind) {
    case 'text': case 'textarea': case 'date': case 'month': return (c.el as HTMLInputElement).value;
    case 'select': {
      // “请选择”这类占位选项算空
      const sel = c.el as HTMLSelectElement;
      const opt = sel.selectedOptions[0];
      return !opt || !opt.value || PLACEHOLDER_OPTION.test(opt.text.trim()) ? '' : opt.text;
    }
    case 'radio': return c.radios?.some((r) => r.checked) ? 'checked' : '';
    case 'antd-select': return antdFor(c.el).selected(c.el);
    case 'el-select': return ELEMENT.selected(c.el);
    case 'antd-picker': case 'el-picker': return c.el.querySelector('input')?.value ?? '';
    case 'moka-select': return MOKA.selected(c.el);
    case 'phoenix-select': return PHOENIX.selected(c.el);
    case 'div-radio': return c.items?.some(divRadioChecked) ? 'checked' : '';
    default: return '';
  }
}

// 省市区一类的字段：页面上可能拆成“省 ▾ 市 ▾”几个并排的下拉框
const REGION_PATH = /^basic\.(nativePlace|hukou|sourceRegion|currentCity)$|^intention\.cities$|^internships\[\d*\]\.city$/;

/** 并排的省、市下拉框：第 1 个按档案开头选省，后面的去掉上一级已选的部分再选 */
function regionLevelChooser(c: Control, value: string): Chooser | string {
  let rest = clean(value);
  let prev = '';
  if (c.level && c.prevLevel) {
    prev = currentValue(c.prevLevel).trim();
    if (!prev) return '上一级还没选，请先选上一级';
    const full = clean(prev);
    const short = shortRegion(prev);
    if (rest.startsWith(full)) rest = rest.slice(full.length);
    else if (rest.startsWith(short)) rest = rest.slice(short.length);
    else return `上一级选的是“${prev}”，和档案里的“${value}”对不上`;
  }
  return (options) => {
    const r = chooseRegion(rest, options);
    if (r) return { ok: true, index: r.index, sure: true };
    // “北京”这类直辖市：省一级选了北京，市一级是“北京市”
    const i = prev && !rest ? chooseRepeat(prev, options) : null;
    if (i !== null) return { ok: true, index: i, sure: true };
    return { ok: false, reason: rest ? `选项里没有“${rest}”` : `档案里的“${value}”没写到这一级，请自己选` };
  };
}

async function write(c: Control, path: string, value: string, sure: boolean): Promise<Outcome> {
  const isDate = DATE_PATH.test(path);
  // 学校、专业：选项写法常和档案不同，用模糊匹配（计划书 V2）
  const fk = fuzzyKindOf(path);
  let choose: Chooser = fk ? (o) => chooseFuzzy(value, o, fk) : (o) => chooseOption(value, o);
  if (c.level !== undefined && REGION_PATH.test(path)) {
    const r = regionLevelChooser(c, value);
    if (typeof r === 'string') return skip(r);
    choose = r;
  }
  const query = fk === 'school' ? expandSchool(value) : value;
  switch (c.kind) {
    case 'text': case 'textarea': case 'date': case 'month': return fillText(c, value, sure, isDate);
    case 'select': return fillNativeSelect(c, value, sure, choose);
    case 'radio': return fillRadio(c, value, sure, choose);
    case 'antd-select': return fillCustomSelect(c, value, sure, antdFor(c.el), choose, query);
    case 'el-select': return fillCustomSelect(c, value, sure, ELEMENT, choose, query);
    case 'antd-picker': case 'el-picker': return fillPicker(c, value, sure);
    case 'cascader': return fillCascader(c, value, sure);
    case 'div-radio': return fillDivRadio(c, value, sure, choose);
    case 'phoenix-select': return isDate ? fillPhoenixDate(c, value, sure) : fillCustomSelect(c, value, sure, PHOENIX, choose, query);
    case 'moka-select': {
      if (!c.part) return fillCustomSelect(c, value, sure, MOKA, choose, query);
      const v = datePartValue(value, c.part);
      if (!v) return skip(`档案里的日期“${value}”格式不对`);
      return fillCustomSelect(c, v, sure, MOKA, (o) => chooseNumber(v, o));
    }
    default: return skip(SKIP_KIND[c.kind] ?? '暂不支持这种控件');
  }
}

export interface PlannedField {
  control: Control;
  path: string | null;
  index: number;
  sure: boolean;
  reason: string;
  /** 按字段记忆认出的（用户之前在候选卡里选过） */
  remembered?: boolean;
  /** 字段记忆里的这一条是 AI 认的，不是用户选的 */
  aiGuess?: boolean;
}

const KNOWN_PATHS = new Set(ALIASES.map((a) => a.path));

/** 记住的路径还有效：内置字段，或档案里还在的自定义字段 */
function validRemembered(path: string, profile: Profile): boolean {
  if (path.startsWith('custom:')) return profile.custom.some((f) => `custom:${f.id}` === path);
  return KNOWN_PATHS.has(generalPath(path));
}

/** 识别并匹配，不写入。多条经历按出现顺序编号：第一个“学校”对应第 1 段教育经历。 */
export function planFill(doc: Document, profile: Profile, memory?: FieldMemory | null): PlannedField[] {
  const counters = new Map<string, number>();
  const host = hostOf(doc.location?.href ?? '');
  const controls = detectControls(doc);
  const sigs = controls.map((c) => (memory ? signature(c, host) : null));
  const repeats = new Map<string, number>();
  for (const s of sigs) if (s) repeats.set(s, (repeats.get(s) ?? 0) + 1);
  return controls.map((control, i) => {
    if (SKIP_KIND[control.kind]) return { control, path: null, index: 0, sure: false, reason: SKIP_KIND[control.kind]! };
    // 用户亲自选过的优先于词典。同名字段在页面上重复出现（每段经历一组）时，不认死第几条，按出现顺序填
    const r = recall(memory, sigs[i]!);
    const remembered = !!r && validRemembered(r.path, profile);
    const rpath = remembered ? ((repeats.get(sigs[i]!) ?? 0) > 1 ? generalPath(r.path) : r.path) : '';
    const m = remembered ? { path: rpath, confidence: 'high' as const } : matchControl(control, profile);
    if (m.path === null) return { control, path: null, index: 0, sure: false, reason: m.reason };
    const arr = parsePath(m.path);
    let index = 0;
    if (arr && arr.index === null) {
      const n = counters.get(m.path) ?? 0;
      // 年、月分开的两个框属于同一条经历：“月”跟着前面的“年”
      if (control.part === 'month' && n > 0) index = n - 1;
      else { index = n; counters.set(m.path, n + 1); }
    }
    const aiGuess = remembered && r!.source === 'ai';
    return { control, path: m.path, index, sure: m.confidence === 'high' && !aiGuess, reason: '', ...(remembered && { remembered }), ...(aiGuess && { aiGuess }) };
  });
}

// 高风险字段：填错后果大、各站写法差异大，填上也标黄请用户核对（计划书 M8）
const HIGH_RISK = /^basic\.(nativePlace|hukou|idNumber|birthDate)$|^education\[\d*\]\.degree$/;

export interface FillEntry {
  control: Control;
  item: FillItem;
  /** 多条经历里的第几条（item.path 是 education[].school 这类通用路径时） */
  pathIndex?: number;
  /** 写入前的原值，撤销时恢复 */
  original: string;
  written: boolean;
}

export interface FillRun {
  report: FillReport;
  entries: FillEntry[];
}

function originalValue(c: Control): string {
  if (c.kind === 'select') return (c.el as HTMLSelectElement).value;
  if (c.kind === 'radio') return String(c.radios?.findIndex((r) => r.checked) ?? -1);
  return currentValue(c);
}

export async function runFill(doc: Document, profile: Profile, memory?: FieldMemory | null, opts: { addEntries?: boolean } = {}): Promise<FillRun> {
  const adding = opts.addEntries ? await addMissingEntries(doc, profile, memory) : null;
  const entries: FillEntry[] = [];
  for (const f of planFill(doc, profile, memory)) {
    const index = entries.length;
    const label = describe(f.control) + (f.path ? (pathIndexLabel(f.path, f.index) ? `（${pathIndexLabel(f.path, f.index)}）` : '') : '');
    const flags = { ...(f.control.required && { required: true }), ...(f.control.kind === 'file' && { attach: true }) };
    const add = (item: Omit<FillItem, 'index' | 'label'>, written = false, original = '') =>
      entries.push({ control: f.control, item: { index, label, ...item, ...flags }, original, written, pathIndex: f.index });

    if (!f.path) { add({ path: null, status: 'skip', value: '', note: f.reason }); continue; }
    const v = resolveValue(profile, f.path, f.index);
    if (v.value === null) { add({ path: f.path, status: 'skip', value: '', note: v.reason }); continue; }
    if (currentValue(f.control).trim()) { add({ path: f.path, status: 'skip', value: '', note: '页面上已经有内容，没有覆盖' }); continue; }
    const original = originalValue(f.control);
    // 下拉框一次只选一个城市：取档案里的第一个
    let value = v.value;
    if (f.path === 'intention.cities' && !['text', 'textarea'].includes(f.control.kind)) value = value.split(/[、,，/;；\s]+/)[0] ?? value;
    try {
      let o = await write(f.control, f.path, value, f.sure);
      if (f.aiGuess && (o.status === 'ok' || o.status === 'warn')) o = { ...o, status: 'warn', note: AI_NOTE };
      else if (o.status === 'ok' && HIGH_RISK.test(f.path)) o = { ...o, status: 'warn', note: '重要信息，请核对' };
      else if (o.status === 'ok' && f.remembered) o = { ...o, note: '按你之前的选择' };
      add({ path: f.path, ...o }, o.status !== 'skip', original);
    } catch (e) {
      add({ path: f.path, status: 'err', value: '', note: e instanceof SafetyError ? e.message : `填写出错：${String(e)}` }, true, original);
    }
  }
  const report: FillReport = {
    url: doc.location?.href ?? '', title: doc.title, at: Date.now(), profileTitle: profile.title,
    items: entries.map((e) => e.item), job: guessJob(doc),
  };
  const { blockedFrames } = collectRoots(doc);
  if (blockedFrames) report.blockedFrames = blockedFrames;
  if (adding?.added.length) report.added = adding.added;
  if (adding?.notes.length) report.addNotes = adding.notes;
  return { report, entries };
}

/** 多步表单：上次填写之后新出现的、认得出且还空着的字段数。只统计，不填。 */
export function countNewFillable(doc: Document, profile: Profile, seen: WeakSet<Element>, memory?: FieldMemory | null): number {
  return planFill(doc, profile, memory).filter((f) => f.path && !seen.has(f.control.el) && !currentValue(f.control).trim()).length;
}

/** 这种控件能从候选卡里选值写入（密码、验证码、附件、复选框等不行） */
export const pickable = (c: Control) => !SKIP_KIND[c.kind];

/** 字段现在还空着（候选卡只给空字段弹出） */
export const isEmpty = (c: Control) => !currentValue(c).trim();

/** 候选卡（计划书 V5）：用户从档案里亲手选了一项，写进这个字段并回读 */
export async function fillFromCandidate(e: FillEntry, path: string, value: string): Promise<FillItem> {
  if (!e.written) e.original = originalValue(e.control);
  let o: Outcome;
  try {
    o = await write(e.control, path, value, true);
  } catch (err) {
    o = fail('', err instanceof SafetyError ? err.message : `填写出错：${String(err)}`);
  }
  if (o.status === 'warn') o = { ...o, status: 'ok', note: '' }; // 用户亲自选的，不用再确认
  e.item = { ...e.item, path, status: o.status, value: o.value, note: o.status === 'ok' ? '你从候选里选的' : o.note };
  e.written ||= o.status !== 'skip';
  return e.item;
}

// —— AI 认字段（计划书 L2）——

export { UNKNOWN_REASON };
const AI_NOTE = 'AI 按字段名认的，请核对';

/** 本次填写里没认出、还空着、能写入的字段，交给 AI 看字段名。不含任何档案内容。 */
export function unknownFields(entries: FillEntry[]): UnknownField[] {
  const out: UnknownField[] = [];
  entries.forEach((e, id) => {
    const c = e.control;
    if (e.item.path !== null || e.item.note !== UNKNOWN_REASON || !pickable(c) || !c.el.isConnected || !isEmpty(c)) return;
    if (!c.label && !c.placeholder) return;
    const kind = c.kind === 'textarea' ? 'textarea' : c.kind === 'text' || c.kind === 'date' || c.kind === 'month' ? 'text' : 'choice';
    out.push({ id, label: describe(c), placeholder: c.placeholder.slice(0, 40), section: c.section, kind, options: c.options.slice(0, 20) });
  });
  return out;
}

/**
 * AI 给的通用路径落到第几条：和它挨着的、已认出的同一类经历字段属于同一段
 * （第 2 段教育经历里的“主修方向”跟着前面的“学校”算第 2 条）。
 */
export function guessPath(entries: FillEntry[], id: number, path: string): string {
  const c = entries[id]!.control;
  if (c.section === 'basic' && path.startsWith('education[]')) return path.replace('[]', '[0]');
  const arr = parsePath(path);
  if (!arr || arr.index !== null) return path;
  const indexOf = (e: FillEntry) => {
    const a = e.item.path ? parsePath(e.item.path) : null;
    return a && a.list === arr.list ? a.index ?? e.pathIndex ?? 0 : null;
  };
  const before = entries.slice(0, id).reverse().map(indexOf).find((x) => x !== null);
  const after = entries.slice(id + 1).map(indexOf).find((x) => x !== null);
  return path.replace('[]', `[${before ?? after ?? 0}]`);
}

/** 写入 AI 认出的字段：一律标黄请用户核对 */
export async function fillFromGuess(e: FillEntry, path: string, profile: Profile): Promise<FillItem> {
  const v = resolveValue(profile, path);
  const name = path.startsWith('custom:') ? profile.custom.find((f) => `custom:${f.id}` === path)?.label ?? '其他信息' : pathName(path);
  if (v.value === null) {
    e.item = { ...e.item, path, status: 'skip', value: '', note: `AI 认为是“${name}”，但${v.reason}` };
    return e.item;
  }
  if (!e.written) e.original = originalValue(e.control);
  let o: Outcome;
  try {
    o = await write(e.control, path, v.value, false);
  } catch (err) {
    o = fail('', err instanceof SafetyError ? err.message : `填写出错：${String(err)}`);
  }
  if (o.status === 'ok') o = { ...o, status: 'warn' };
  e.item = { ...e.item, path, status: o.status, value: o.value, note: o.status === 'warn' ? `AI 认作“${name}”，请核对` : o.note };
  e.written ||= o.status !== 'skip';
  return e.item;
}

function pathName(path: string): string {
  const a = ALIASES.find((x) => x.path === generalPath(path) || x.path === path);
  return a?.strong[0] ?? a?.ctx?.[0] ?? path;
}

export async function fillDocument(doc: Document, profile: Profile): Promise<FillReport> {
  return (await runFill(doc, profile)).report;
}

// —— 撤销（计划书 M9）：把本次写过的字段恢复成填写前的样子 ——

function hover(el: Element) {
  for (const type of ['pointerenter', 'mouseenter', 'mouseover'] as const) {
    el.dispatchEvent(new MouseEvent(type, { bubbles: type === 'mouseover' }));
  }
}

async function clickClear(root: HTMLElement, selector: string): Promise<boolean> {
  hover(root);
  root.querySelectorAll('*').forEach((n) => n.matches('.el-select__wrapper, .el-input__wrapper, .ant-select-selector') && hover(n));
  await sleep(30);
  const btn = await waitFor(() => root.querySelector<HTMLElement>(selector), 300);
  if (!btn) return false;
  safeMouseDown(btn);
  btn.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
  safeClick(btn);
  await sleep(50);
  return true;
}

async function restore(e: FillEntry): Promise<boolean> {
  const c = e.control;
  switch (c.kind) {
    case 'text': case 'textarea': case 'date': case 'month': case 'select': {
      const el = c.el as HTMLInputElement;
      setNativeValue(el, e.original);
      blur(el);
      return el.value === e.original;
    }
    case 'radio': {
      const radios = c.radios ?? [];
      const was = Number(e.original);
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'checked')?.set;
      radios.forEach((r, i) => {
        setter?.call(r, i === was);
        r.dispatchEvent(new Event('click', { bubbles: true }));
        r.dispatchEvent(new Event('change', { bubbles: true }));
      });
      await sleep(0);
      return radios.every((r, i) => r.checked === (i === was));
    }
    case 'antd-select':
    {
      const p = antPrefix(c.el);
      return (await clickClear(c.el, `.${p}-select-clear, .${p}-select-selection__clear`)) && !antdFor(c.el).selected(c.el);
    }
    case 'el-select':
      return (await clickClear(c.el, '.el-select__clear')) && !ELEMENT.selected(c.el);
    case 'antd-picker':
      return (await clickClear(c.el, '.ant-picker-clear')) && !c.el.querySelector('input')?.value;
    case 'el-picker':
      return (await clickClear(c.el, '.el-input__clear, .el-range__close-icon, .clear-icon')) && !c.el.querySelector('input')?.value;
    case 'cascader':
      return c.el.matches('.el-cascader')
        ? (await clickClear(c.el, '.el-input__clear, .el-cascader__clear, .icon-circle-close')) && !ELEMENT_CASCADER.selected(c.el)
        : (await clickClear(c.el, '.ant-select-clear')) && !ANTD_CASCADER.selected(c.el);
    case 'phoenix-select':
      return (await clickClear(c.el, '.phoenix-select__clearIcon--show, .phoenix-select__clearIcon')) && !PHOENIX.selected(c.el);
    default:
      return false;
  }
}

export async function undoFill(entries: FillEntry[]): Promise<{ restored: number; failed: string[] }> {
  let restored = 0;
  const failed: string[] = [];
  for (const e of entries) {
    if (!e.written) continue;
    try {
      if (await restore(e)) restored++; else failed.push(e.item.label);
    } catch {
      failed.push(e.item.label);
    }
  }
  return { restored, failed };
}
