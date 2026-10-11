import { collectHeadings, sectionOf, type Section } from './sections';
import { clean, textOf, tokens } from './text';

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
  label: string;
  placeholder: string;
  keys: string[];
  section: Section | null;
  options: string[];
  required: boolean;
}

const CUSTOM_SELECT = '.ant-select, .el-select, .el-select-v2';
const CASCADER = '.ant-cascader, .el-cascader';
const PICKER = '.ant-picker, .el-date-editor';
// 站点组件（以真实页面快照为准，见 tests/fixtures/forms/real）
const MOKA_SELECT = 'label[class*="sd-Select-container"]';
const PHOENIX_SELECT = '.phoenix-select';
const DIV_RADIO = '.phoenix-radio-group';
const FORM_ITEM = '.ant-form-item, .el-form-item, .form-item, .form-group, [class*="form-item"], [class*="formItem"], [class*="FormItem"], [class*="field-item"], [class*="apply-field"], .field, dl, tr, li';
/** 只读输入框里像“要点开面板选”的：日期、省市区等 */
const PICKER_HINT = /选择|日期|时间|年|月|省|市|区|地/;
const LABELISH = '.ant-form-item-label, .el-form-item__label, label, [class*="label"], [class*="Label"], th, dt, [class*="title"]';
const CAPTCHA = /验证码|校验码|captcha|verify|动态码/i;
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
    const t = short(textOf(l, MAX_LABEL + 5));
    if (t) return t;
  }
  return '';
}

function labelOf(anchor: HTMLElement, input: HTMLElement | null, isGroup: boolean): string {
  const doc = anchor.ownerDocument;
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
      if (child instanceof Element && child.querySelector('input')) break;
      if (child instanceof Element && child.matches('input')) break;
      lead += child instanceof Element ? textOf(child) : child.textContent ?? '';
    }
    const t = short(lead);
    if (t) return t;
  }
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
      if (sib instanceof Element && sib.querySelector('input, textarea, select')) break;
      const t = short(sib instanceof Element ? textOf(sib, MAX_LABEL + 5) : (sib.textContent ?? ''));
      if (t) return t;
    }
  }
  return '';
}

function optionLabel(radio: HTMLInputElement): string {
  const doc = radio.ownerDocument;
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

function nativeKind(el: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement): ControlKind | null {
  if (el instanceof HTMLTextAreaElement) return 'textarea';
  if (el instanceof HTMLSelectElement) return 'select';
  switch (el.type) {
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
    const formItem = el.closest('.ant-form-item, .el-form-item');
    out.push({
      kind: finalKind, el, label, placeholder,
      keys: keysOf(input, el),
      section: sectionOf(el, headings),
      options: [],
      required: !!(input?.hasAttribute('required') || input?.getAttribute('aria-required') === 'true'
        || formItem?.querySelector('.ant-form-item-required, .is-required') || formItem?.classList.contains('is-required')),
      ...extra,
    });
  };

  // 自定义组件：先认出根节点，它们内部的原生 input 不再单独算
  const roots = `${CASCADER}, ${CUSTOM_SELECT}, ${PICKER}, ${MOKA_SELECT}, ${PHOENIX_SELECT}, ${DIV_RADIO}`;
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
    consumed.add(root);
    if (root.matches(CASCADER)) push('cascader', root, input);
    else if (root.matches('.ant-picker')) push('antd-picker', root, input);
    else if (root.matches('.el-date-editor')) push('el-picker', root, input);
    else if (root.matches('.ant-select')) push('antd-select', root, input);
    else if (root.matches(MOKA_SELECT)) push('moka-select', root, input, datePart(root, input));
    else if (root.matches(PHOENIX_SELECT)) push('phoenix-select', root, input);
    else push('el-select', root, input);
  }

  for (const el of doc.querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>('input, textarea, select')) {
    if ([...consumed].some((c) => c.contains(el))) continue;
    const kind = nativeKind(el);
    if (!kind || el.disabled) continue;
    if (kind !== 'radio' && kind !== 'checkbox' && kind !== 'file' && !isVisible(el)) continue;
    if (el instanceof HTMLInputElement && el.readOnly && kind === 'text') {
      // 只读框一般是点开面板选的（日期、省市区），列出来告诉用户要自己选
      const ph = el.getAttribute('placeholder') ?? '';
      if (isVisible(el) && PICKER_HINT.test(ph)) push('readonly', el, el);
      continue;
    }

    if (kind === 'radio') {
      const r = el as HTMLInputElement;
      const group = r.closest<HTMLElement>('[role=radiogroup], .ant-radio-group, .el-radio-group');
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
    if (el instanceof HTMLSelectElement) {
      extra.options = [...el.options].map((o) => o.text.trim()).filter((t) => t && !/^(请选择|--|—)/.test(t));
    }
    push(kind, el, el, extra);
  }

  // 按文档顺序排列
  return out.sort((a, b) => (a.el.compareDocumentPosition(b.el) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1));
}

/** 结果面板里显示的字段名：去掉星号、冒号和“请输入”之类的提示词 */
export function describe(c: Control): string {
  const tidy = (t: string) => t.replace(/[*＊]/g, '').replace(/[:：]\s*$/, '').replace(/^(请输入|请填写|请选择)/, '').trim();
  return tidy(c.label) || tidy(c.placeholder) || c.keys.join('_') || '未命名字段';
}

export const cleanLabel = (c: Control) => clean(c.label);
