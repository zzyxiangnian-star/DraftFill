import { collectHeadings, sectionOf, type Section } from './sections';
import { collectRoots, rootOf, type FormRoot } from './roots';
import { clean, isEl, isTag, textOf, tokens } from './text';

// FieldDetector：找出页面上的表单字段，并为每个字段提取多种信号（标签、占位符、name/id、分区）。

export type ControlKind =
  | 'text' | 'textarea' | 'select' | 'radio' | 'checkbox' | 'date' | 'month'
  | 'antd-select' | 'el-select' | 'antd-picker' | 'el-picker' | 'cascader'
  | 'moka-select' | 'phoenix-select' | 'div-radio' | 'readonly'
  | 'file' | 'password' | 'captcha';

export interface Control {
  kind: ControlKind;
  /** 主元素：原生控件本身，或自定义组件的根节点 */
  el: HTMLElement;
  /** 单选组里的所有单选按钮 */
  radios?: HTMLInputElement[];
  /** 没有原生 input 的单选组（如北森）：每个选项的元素 */
  items?: HTMLElement[];
  /** 年、月分开选的日期：这个框是年还是月 */
  part?: 'year' | 'month';
  /** 起止时间放在同一个标签下时：这个框属于开始还是结束 */
  range?: 'start' | 'end';
  /** 同一个标签下并排的几个下拉框（如“现居住地：省 ▾ 市 ▾”）：这是第几级，以及上一级 */
  level?: number;
  prevLevel?: Control;
  label: string;
  placeholder: string;
  keys: string[];
  section: Section | null;
  options: string[];
  required: boolean;
}

// [class*="-select-enabled"]：改了类名前缀的 Ant Design 3（飞书招聘是 atsx-select）
const CUSTOM_SELECT = '.ant-select, .el-select, .el-select-v2, [class*="-select-enabled"]';
const EL_SELECT = '.el-select, .el-select-v2';
const CASCADER = '.ant-cascader, .el-cascader';
const PICKER = '.ant-picker, .el-date-editor';
// 站点组件（以真实页面快照为准，见 tests/fixtures/forms/real）
const MOKA_SELECT = 'label[class*="sd-Select-container"]';
const PHOENIX_SELECT = '.phoenix-select';
const DIV_RADIO = '.phoenix-radio-group';
/** 飞书招聘的“年-月 至 年-月”面板，只能点开选 */
const PERIOD_PICKER = '.atsx-date-picker';
/** 飞书招聘新版（UD 组件库，小鹏）：起止时间是两个框的日期面板，下拉框只能点选 */
const UD_DATE_RANGE = '.throne-biz-date-range-picker-wrapper';
const UD_SELECT = '.ud__select';
const FORM_ITEM = '.ant-form-item, .el-form-item, .form-item, .form-group, [class*="form-item"], .ud-formily-item, [class*="formItem"], [class*="FormItem"], [class*="field-item"], [class*="apply-field"], .field, dl, tr, li';
/** 只读输入框里像“要点开面板选”的：日期、省市区等 */
const PICKER_HINT = /选择|日期|时间|年|月|省|市|区|地/;
const LABELISH = '.ant-form-item-label, .el-form-item__label, label, [class*="label"], [class*="Label"], th, dt, [class*="title"]';
const CAPTCHA = /验证码|校验码|captcha|verify|动态码/i;
/** 必填标记：北森 form-item__required、Moka required-asterisk、AntD / Element 的 required 类 */
const REQUIRED_MARK = '[class*="required" i], [class*="asterisk" i]';
const MAX_LABEL = 30;

export function isVisible(el: Element): boolean {
  const anyEl = el as HTMLElement & { checkVisibility?: (o?: object) => boolean };
  if (typeof anyEl.checkVisibility === 'function' && el.ownerDocument.defaultView?.navigator.userAgent.includes('Chrome')) {
    return anyEl.checkVisibility({ visibilityProperty: true });
  }
  for (let n: Element | null = el; n; n = n.parentElement) {
    if ((n as HTMLElement).hidden) return false;
    const s = n.ownerDocument.defaultView?.getComputedStyle(n);
    if (s && (s.display === 'none' || s.visibility === 'hidden')) return false;
  }
  return true;
}

function short(s: string): string {
  const t = s.replace(/\s+/g, ' ').trim();
  return t.length > MAX_LABEL ? '' : t;
}

function hasOtherControls(container: Element, self: Element): boolean {
  return [...container.querySelectorAll('input:not([type=hidden]), textarea, select')].some((c) => c !== self && !self.contains(c));
}

/** 在一个“表单项”容器里找标签元素 */
function labelInContainer(container: Element, anchor: Element, skipOptionLabels: boolean): string {
  for (const l of container.querySelectorAll(LABELISH)) {
    if (l.contains(anchor) || anchor.contains(l)) continue;
    if (skipOptionLabels && l.querySelector('input[type=radio], input[type=checkbox]')) continue;
    if (l.querySelector('input:not([type=hidden]), textarea, select')) continue;
    // 标签区里还有说明文字时（飞书“起止时间 / 无准确的毕业时间可填写预计毕业时间”），只取 <label>
    const t = short(textOf(l.querySelector('label') ?? l, MAX_LABEL + 5));
    if (t) return t;
  }
  return '';
}

function labelOf(anchor: HTMLElement, input: HTMLElement | null, isGroup: boolean): string {
  const doc = rootOf(anchor);
  const target = input ?? anchor;

  // 1. <label for>（单选组里 label for 指向的是选项文字，跳过）
  if (target.id && !isGroup) {
    const l = doc.querySelector(`label[for="${CSS.escape(target.id)}"]`);
    const t = l && short(textOf(l, MAX_LABEL + 5));
    if (t) return t;
  }
  // 2. aria-labelledby
  for (const node of [target, anchor]) {
    const ids = node.getAttribute('aria-labelledby');
    if (ids) {
      const t = short(ids.split(/\s+/).map((id) => textOf(doc.getElementById(id))).join(''));
      if (t) return t;
    }
  }
  // 单选组：组容器里、第一个选项之前的文字（如“性别：○男 ○女”）
  if (isGroup) {
    let lead = '';
    for (const child of anchor.childNodes) {
      if (isEl(child) && child.querySelector('input')) break;
      if (isEl(child) && child.matches('input')) break;
      lead += isEl(child) ? textOf(child) : child.textContent ?? '';
    }
    const t = short(lead);
    if (t) return t;
  }
  // 腾讯校招：info_box 里的 subtitle 是字段名（前面可能还有“证件信息”这种小标题）
  const sub = anchor.closest('.info_box')?.querySelector(':scope > .subtitle');
  if (sub && !sub.contains(target)) {
    const t = short(textOf(sub, MAX_LABEL + 5));
    if (t) return t;
  }
  // 飞书招聘新版：字段容器上直接写着字段名
  const named = target.closest('[data-form-field-i18n-name]')?.getAttribute('data-form-field-i18n-name');
  if (named && short(named)) return short(named);
  // 3. 表格：左边的单元格
  const cell = anchor.closest('td');
  if (cell) {
    const prev = cell.previousElementSibling;
    const t = prev && short(textOf(prev, MAX_LABEL + 5));
    if (t) return t;
  }
  // 4. 外层表单项容器里的标签（Ant Design、Element、常见自研表单）
  let n: Element | null = anchor.parentElement;
  for (let depth = 0; n && depth < 8; n = n.parentElement, depth++) {
    if (n.matches('form, body')) break;
    if (n.matches(FORM_ITEM)) {
      const t = labelInContainer(n, anchor, isGroup);
      if (t) return t;
    }
  }
  // 5. 包住控件的 <label>（单选组里的 label 是选项文字，不算）
  if (!isGroup) {
    const wrap = target.closest('label');
    if (wrap && !hasOtherControls(wrap, target)) {
      const t = short(textOf(wrap, MAX_LABEL + 5));
      if (t) return t;
    }
  }
  // 6. aria-label、title
  for (const node of [target, anchor]) {
    const t = short(node.getAttribute('aria-label') ?? node.getAttribute('title') ?? '');
    if (t) return t;
  }
  // 7. 前面的兄弟节点文字
  n = anchor;
  for (let depth = 0; n && depth < 3 && !n.matches('form, body'); n = n.parentElement, depth++) {
    let sib: Node | null = n.previousSibling;
    for (let i = 0; sib && i < 3; sib = sib.previousSibling, i++) {
      if (isEl(sib) && sib.querySelector('input, textarea, select')) break;
      const t = short(isEl(sib) ? textOf(sib, MAX_LABEL + 5) : (sib.textContent ?? ''));
      if (t) return t;
    }
  }
  return '';
}

function optionLabel(radio: HTMLInputElement): string {
  const doc = rootOf(radio);
  if (radio.id) {
    const l = doc.querySelector(`label[for="${CSS.escape(radio.id)}"]`);
    if (l) return textOf(l);
  }
  const wrap = radio.closest('label');
  if (wrap) return textOf(wrap);
  const next = radio.nextSibling;
  return (next?.textContent ?? radio.value).trim();
}

function keysOf(...els: (Element | null)[]): string[] {
  const out: string[] = [];
  for (const el of els) {
    if (!el) continue;
    out.push(...tokens(el.getAttribute('name')), ...tokens(el.id), ...tokens(el.getAttribute('data-field')));
  }
  return out;
}

/** Moka 的“年”“月”分开选：同一个字段里有 4 个框时，前两个是开始、后两个是结束 */
function datePart(root: HTMLElement, input: HTMLInputElement | null): Partial<Control> {
  const ph = (input?.getAttribute('placeholder') ?? '').trim();
  if (ph !== '年' && ph !== '月') return {};
  const extra: Partial<Control> = { part: ph === '年' ? 'year' : 'month' };
  const field = root.closest(FORM_ITEM);
  if (field) {
    const parts = [...field.querySelectorAll<HTMLInputElement>(`${MOKA_SELECT} input`)]
      .filter((i) => /^[年月]$/.test((i.getAttribute('placeholder') ?? '').trim()));
    const i = input ? parts.indexOf(input) : -1;
    if (parts.length === 4 && i >= 0) extra.range = i < 2 ? 'start' : 'end';
  }
  return extra;
}

/** 必填：原生 required、标签里的星号，或同一个表单项里的必填标记（不越过别的字段） */
function isRequired(el: HTMLElement, input: HTMLElement | null, label: string, part?: Control['part']): boolean {
  if (input?.hasAttribute('required') || input?.getAttribute('aria-required') === 'true') return true;
  if (/^\s*[*＊]|[*＊]\s*[:：]?\s*$/.test(label)) return true;
  // Ant Design 式表单项：标签上带必填类（如飞书手机号，框前面还有区号下拉，下面的逐层查找会提前停下）
  if (labelRequired(el)) return true;
  // 年、月分开选的几个框同属一个字段，直接看外层表单项
  let n: Element | null = part ? el.closest(FORM_ITEM) : el.parentElement;
  for (let depth = 0; n && depth < 8 && !n.matches('form, body'); n = n.parentElement, depth++) {
    if (!part && hasOtherControls(n, el)) break;
    if ([...n.querySelectorAll(REQUIRED_MARK)].some((m) => !el.contains(m) || m === el)) return true;
    if (hasCssStar(n, el)) return true;
    if (part) break;
  }
  return false;
}

/** 往上找到“标签 + 控件”结构的表单项，看它的标签是否标了必填 */
function labelRequired(el: HTMLElement): boolean {
  let n: Element | null = el.parentElement;
  for (let depth = 0; n && depth < 8 && !n.matches('form, body'); n = n.parentElement, depth++) {
    const head = [...n.children].find((c) => /(^|\s)[\w-]*form(ily)?-item-label(\s|$)/.test(c.className));
    if (head) return !!head.querySelector('[class*="required" i]') || /(^|\s)[\w-]*required/i.test(head.className);
  }
  return false;
}

/** 用 CSS ::before 画出来的星号（Element 的 is-required 等），文字里读不到 */
function hasCssStar(container: Element, self: Element): boolean {
  const view = container.ownerDocument.defaultView;
  if (!view) return false;
  const cands = [...container.querySelectorAll(`${LABELISH}, span, i, em`)].filter((x) => !self.contains(x)).slice(0, 6);
  return cands.some((x) => ['::before', '::after'].some((p) => /[*＊]/.test(view.getComputedStyle(x, p).content || '')));
}

function nativeKind(el: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement): ControlKind | null {
  if (isTag(el, 'textarea')) return 'textarea';
  if (isTag(el, 'select')) return 'select';
  switch ((el as HTMLInputElement).type) {
    case 'hidden': case 'submit': case 'button': case 'reset': case 'image': case 'range': case 'color': case 'search':
      return null;
    case 'password': return 'password';
    case 'file': return 'file';
    case 'radio': return 'radio';
    case 'checkbox': return 'checkbox';
    case 'date': case 'datetime-local': return 'date';
    case 'month': return 'month';
    default: return 'text';
  }
}

export function detectControls(doc: Document): Control[] {
  return collectRoots(doc).roots.flatMap(detectIn);
}

function detectIn(doc: FormRoot): Control[] {
  const headings = collectHeadings(doc);
  const out: Control[] = [];
  const seenRadio = new Set<string | Element>();
  const consumed = new Set<Element>();

  const push = (kind: ControlKind, el: HTMLElement, input: HTMLElement | null, extra: Partial<Control> = {}) => {
    const isGroup = kind === 'radio';
    const label = labelOf(el, input, isGroup);
    const placeholder = (input?.getAttribute('placeholder') ?? el.querySelector('[class*="placeholder"]')?.textContent ?? '').trim();
    const hint = `${label} ${placeholder} ${keysOf(input, el).join(' ')}`;
    const finalKind: ControlKind = kind === 'text' && CAPTCHA.test(hint) ? 'captcha' : kind;
    out.push({
      kind: finalKind, el, label, placeholder,
      keys: keysOf(input, el),
      section: sectionOf(el, headings),
      options: [],
      required: isRequired(el, input, label, extra.part),
      ...extra,
    });
  };

  // 自定义组件：先认出根节点，它们内部的原生 input 不再单独算
  const roots = `${CASCADER}, ${CUSTOM_SELECT}, ${PICKER}, ${MOKA_SELECT}, ${PHOENIX_SELECT}, ${DIV_RADIO}, ${PERIOD_PICKER}, ${UD_DATE_RANGE}, ${UD_SELECT}`;
  for (const root of doc.querySelectorAll<HTMLElement>(roots)) {
    if (!isVisible(root) || [...consumed].some((c) => c.contains(root))) continue;
    const input = root.querySelector<HTMLInputElement>('input');
    if (root.matches(DIV_RADIO)) {
      // 有原生单选按钮的交给下面的通用逻辑
      if (root.querySelector('input[type=radio]')) continue;
      const items = [...root.querySelectorAll<HTMLElement>('.phoenix-radio')];
      if (!items.length) continue;
      consumed.add(root);
      push('div-radio', root, null, { items, options: items.map((i) => textOf(i.querySelector('.phoenix-radio__radio-text') ?? i)) });
      continue;
    }
    // UD 下拉里能打字的（学校名称）当普通输入框填；只能点选的列出来让用户选
    if (root.matches(UD_SELECT) && input && !input.readOnly) continue;
    consumed.add(root);
    if (root.matches(`${PERIOD_PICKER}, ${UD_DATE_RANGE}, ${UD_SELECT}`)) push('readonly', root, null);
    else if (root.matches(CASCADER)) push('cascader', root, input);
    else if (root.matches('.ant-picker')) push('antd-picker', root, input);
    else if (root.matches('.el-date-editor')) push('el-picker', root, input);
    else if (root.matches(MOKA_SELECT)) push('moka-select', root, input, datePart(root, input));
    else if (root.matches(PHOENIX_SELECT)) push('phoenix-select', root, input);
    else if (root.matches(EL_SELECT)) push('el-select', root, input);
    else push('antd-select', root, input);
  }

  for (const el of doc.querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>('input, textarea, select')) {
    if ([...consumed].some((c) => c.contains(el))) continue;
    const kind = nativeKind(el);
    if (!kind || el.disabled) continue;
    if (/hidden-input/.test(el.className)) continue; // 组件自己藏起来的辅助输入框
    if (kind !== 'radio' && kind !== 'checkbox' && kind !== 'file' && !isVisible(el)) continue;
    if (isTag(el, 'input') && el.readOnly && kind === 'text') {
      // 只读框一般是点开面板选的（日期、省市区），列出来告诉用户要自己选
      const ph = el.getAttribute('placeholder') ?? '';
      if (isVisible(el) && PICKER_HINT.test(ph)) push('readonly', el, el);
      continue;
    }

    if (kind === 'radio') {
      const r = el as HTMLInputElement;
      const group = r.closest<HTMLElement>('[role=radiogroup], .ant-radio-group, .el-radio-group, .ud__radio-group, [class*="-radio-group"]');
      const key: string | Element = group ?? (r.name ? `name:${r.name}` : r);
      if (seenRadio.has(key)) continue;
      seenRadio.add(key);
      const radios = group
        ? [...group.querySelectorAll<HTMLInputElement>('input[type=radio]')]
        : r.name ? [...doc.querySelectorAll<HTMLInputElement>(`input[type=radio][name="${CSS.escape(r.name)}"]`)] : [r];
      // 没有分组容器时，用所有单选按钮的最近公共祖先作为锚点
      let anchor: HTMLElement = group ?? r.parentElement ?? r;
      while (!group && anchor.parentElement && !radios.every((x) => anchor.contains(x))) anchor = anchor.parentElement;
      if (!radios.some(isVisible) && !radios.some((x) => isVisible(x.closest('label') ?? x))) continue;
      push('radio', anchor, radios[0] ?? null, { radios, options: radios.map(optionLabel), keys: keysOf(r, group) });
      continue;
    }
    const extra: Partial<Control> = {};
    if (isTag(el, 'select')) {
      extra.options = [...el.options].map((o) => o.text.trim()).filter((t) => t && !/^(请选择|--|—)/.test(t));
    }
    push(kind, el, el, extra);
  }

  // 按文档顺序排列
  out.sort((a, b) => (a.el.compareDocumentPosition(b.el) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1));
  markLevels(out);
  markRanges(out);
  return out;
}

const DATE_KINDS = new Set<ControlKind>(['el-picker', 'antd-picker']);

/** 一个字段里并排的两个日期框（腾讯“起止时间”：开始 — 结束）：前一个是开始，后一个是结束 */
function markRanges(controls: Control[]) {
  const groups = new Map<Element, Control[]>();
  for (const c of controls) {
    if (!DATE_KINDS.has(c.kind) || c.range) continue;
    const box = c.el.closest('.info_box') ?? c.el.parentElement?.closest(FORM_ITEM);
    if (box) groups.set(box, [...(groups.get(box) ?? []), c]);
  }
  for (const g of groups.values()) {
    if (g.length !== 2 || describe(g[0]!) !== describe(g[1]!)) continue;
    g[0]!.range = 'start';
    g[1]!.range = 'end';
  }
}

const LEVEL_KINDS = new Set<ControlKind>(['antd-select', 'el-select', 'moka-select', 'phoenix-select', 'select']);

/** 同一个表单项里并排的几个下拉框（省 ▾ 市 ▾）：按顺序标上第几级 */
function markLevels(controls: Control[]) {
  const groups = new Map<Element, Control[]>();
  for (const c of controls) {
    if (!LEVEL_KINDS.has(c.kind) || c.part) continue;
    const item = fieldItem(c.el);
    if (!item) continue;
    const g = groups.get(item) ?? [];
    g.push(c);
    groups.set(item, g);
  }
  for (const g of groups.values()) {
    if (g.length < 2) continue;
    g.forEach((c, i) => { c.level = i; if (i) c.prevLevel = g[i - 1]; });
  }
}

/** 控件所在的表单项：往上第一个带标签区的容器（Ant Design 的 form-item-label、Element 的 el-form-item__label） */
function fieldItem(el: HTMLElement): Element | null {
  let n: Element | null = el.parentElement;
  for (let depth = 0; n && depth < 8 && !n.matches('form, body'); n = n.parentElement, depth++) {
    if ([...n.children].some((c) => /(^|\s)[\w-]*(form-item-label|formily-item-label|form-item__label)(\s|$)/.test(c.className))) return n;
  }
  return null;
}

/** 结果面板里显示的字段名：去掉星号、冒号和“请输入”之类的提示词 */
export function describe(c: Control): string {
  const tidy = (t: string) => t.replace(/[*＊]/g, '').replace(/[:：]\s*$/, '').replace(/^(请输入|请填写|请选择)/, '').trim();
  return tidy(c.label) || tidy(c.placeholder) || c.keys.join('_') || '未命名字段';
}

export const cleanLabel = (c: Control) => clean(c.label);
