import { storage } from 'wxt/utils/storage';
import type { Control } from './detect';
import { clean } from './text';

// 字段记忆（计划书 V4）：用户在候选卡里给某个字段选过档案里的哪一项，按“字段签名”记下来，
// 下次在同一个网站遇到同一个字段直接认出。只按网站记，不跨网站套用，避免认错。

export interface Remembered {
  /** 档案路径，记到第几条（education[1].school）。页面上同名字段重复出现（多段经历）时按顺序填，见 planFill */
  path: string;
  /** 字段名，设置页里展示用 */
  label: string;
  host: string;
  at: number;
  /** ai：AI 看字段名认出来的（计划书 L2），下次填写仍标黄请用户核对 */
  source?: 'ai';
}

export interface FieldMemory {
  version: 1;
  items: Record<string, Remembered>;
}

export const MEMORY_LIMIT = 2000;

export const fieldMemoryItem = storage.defineItem<FieldMemory>('local:fieldMemory', {
  fallback: { version: 1, items: {} },
});

const CHOICE = /select|radio|cascader/;

/** 网站 + 分区 + 控件大类 + 字段名。没有字段名的不记。 */
export function signature(c: Pick<Control, 'kind' | 'label' | 'placeholder' | 'section' | 'part' | 'range'>, host: string): string | null {
  const name = clean(c.label) || clean(c.placeholder);
  if (!name || !host) return null;
  const kind = CHOICE.test(c.kind) ? 'choice' : 'text';
  const part = [c.part, c.range].filter(Boolean).join('-');
  return [host, c.section ?? '', kind, name, part].join('|');
}

/** 把第几条去掉：education[1].school → education[].school */
export const generalPath = (path: string) => path.replace(/\[\d+\]/, '[]');

export function remember(m: FieldMemory, sig: string, r: Omit<Remembered, 'at'>, now = Date.now()): FieldMemory {
  const items = { ...m.items, [sig]: { ...r, at: now } };
  const keys = Object.keys(items);
  if (keys.length > MEMORY_LIMIT) {
    // 超过上限时丢掉最久没用过的
    keys.sort((a, b) => items[a]!.at - items[b]!.at).slice(0, keys.length - MEMORY_LIMIT).forEach((k) => delete items[k]);
  }
  return { ...m, items };
}

export function forget(m: FieldMemory, host?: string): FieldMemory {
  if (!host) return { ...m, items: {} };
  return { ...m, items: Object.fromEntries(Object.entries(m.items).filter(([, r]) => r.host !== host)) };
}

export function recall(m: FieldMemory | null | undefined, sig: string | null): Remembered | undefined {
  return sig && m ? m.items[sig] : undefined;
}

export function hostOf(url: string): string {
  try { return new URL(url).host; } catch { return ''; }
}
