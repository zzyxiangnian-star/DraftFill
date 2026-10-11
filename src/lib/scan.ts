import type { FieldKind, ScanSummary } from './messages';

// 阶段 0 的扫描只统计控件，验证 popup → background → content 链路是通的。
// 真正的字段识别（FieldDetector）在阶段 2 实现。

const SENSITIVE_NAME = /captcha|verify|验证码|校验码|password|passwd|pwd/i;

function isVisible(el: HTMLElement): boolean {
  if (el.hidden) return false;
  const style = el.ownerDocument.defaultView?.getComputedStyle(el);
  return !style || (style.display !== 'none' && style.visibility !== 'hidden');
}

function isSensitive(el: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement): boolean {
  if (el instanceof HTMLInputElement && (el.type === 'password' || el.type === 'file')) return true;
  const hints = [el.name, el.id, el.getAttribute('placeholder'), el.getAttribute('aria-label')].join(' ');
  return SENSITIVE_NAME.test(hints);
}

function kindOf(el: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement): FieldKind | null {
  if (el instanceof HTMLTextAreaElement) return 'textarea';
  if (el instanceof HTMLSelectElement) return 'select';
  switch (el.type) {
    case 'hidden': case 'submit': case 'button': case 'reset': case 'image':
      return null;
    case 'radio': return 'radio';
    case 'checkbox': return 'checkbox';
    case 'date': case 'month': case 'datetime-local': return 'date';
    default: return 'text';
  }
}

export function scanDocument(doc: Document): ScanSummary {
  const byKind: Record<FieldKind, number> = { text: 0, textarea: 0, select: 0, radio: 0, checkbox: 0, date: 0 };
  const radioGroups = new Set<string>();
  let fillable = 0;
  let skipped = 0;

  for (const el of doc.querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>('input, textarea, select')) {
    if (el.disabled || !isVisible(el)) continue;
    if (isSensitive(el)) { skipped++; continue; }
    const kind = kindOf(el);
    if (!kind) continue;
    // 一组单选按钮算一个字段
    if (kind === 'radio') {
      const key = el.name || el.id;
      if (key && radioGroups.has(key)) continue;
      if (key) radioGroups.add(key);
    }
    byKind[kind]++;
    fillable++;
  }

  return {
    url: doc.location?.href ?? '',
    title: doc.title,
    fillable,
    byKind,
    skipped,
    frames: doc.querySelectorAll('iframe').length,
  };
}
