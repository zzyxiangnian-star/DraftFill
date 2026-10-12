import type { Profile } from '../profile/schema';
import { newId } from '../profile/schema';
import { clean } from './text';
import { fillFromCandidate, isEmpty, pickable, type FillEntry, type FillItem } from './fill';
import { parsePath } from './values';

// 计划书 L6：缺信息暂停询问。页面标了必填、档案里又没有依据的字段，插件不猜、不编，
// 在侧边栏逐个问用户；用户答了才写进页面，愿意的话顺手存进档案，下次直接填。

export interface AskField {
  index: number;
  label: string;
  /** 为什么没填（档案里没有、没认出……） */
  note: string;
  kind: 'text' | 'choice' | 'textarea';
  /** 页面上能读到的选项；自定义下拉框点开前读不到，就是空的 */
  options: string[];
}

export const ASK_NOTE = '你在侧边栏补的';

/** 必填、还空着、插件能写入、但没填上的字段 */
export function missingFields(entries: FillEntry[]): AskField[] {
  const out: AskField[] = [];
  entries.forEach((e, index) => {
    const c = e.control;
    if (!e.item.required || e.item.attach || e.item.status !== 'skip') return;
    if (!pickable(c) || !c.el.isConnected || !isEmpty(c)) return;
    const kind = c.kind === 'textarea' ? 'textarea' : c.kind === 'text' || c.kind === 'date' || c.kind === 'month' ? 'text' : 'choice';
    out.push({ index, label: e.item.label, note: e.item.note, kind, options: c.options.slice(0, 50) });
  });
  return out;
}

/** 把用户的回答写进字段：和从候选里选的一样，用户亲自给的不用再确认 */
export async function fillFromUser(e: FillEntry, value: string): Promise<FillItem> {
  const item = await fillFromCandidate(e, e.item.path ?? 'ask:', value.trim());
  if (item.status === 'ok') e.item = { ...item, note: ASK_NOTE };
  return e.item;
}

type Obj = Record<string, unknown>;
const at = (o: unknown, keys: string[]): unknown => keys.reduce<unknown>((x, k) => (x as Obj | undefined)?.[k], o);

/**
 * 把回答存进档案：认出了对应档案项、而且档案里这一项是空的，就写到那一项；
 * 没认出的字段，按字段名存成“其他信息”，下次同名字段直接填。返回存到了哪里，存不了给 null。
 */
export function saveAnswer(profile: Profile, item: Pick<FillItem, 'label' | 'path'>, pathIndex: number | undefined, value: string): { profile: Profile; where: 'profile' | 'custom' } | null {
  const v = value.trim();
  if (!v) return null;
  const p: Profile = structuredClone(profile);
  const path = item.path;
  if (path && !path.startsWith('custom:')) {
    const arr = parsePath(path);
    const target = arr
      ? (at(p, arr.list.split('.')) as Obj[] | undefined)?.[arr.index ?? pathIndex ?? 0]
      : at(p, path.split('.').slice(0, -1));
    const key = arr ? arr.field : path.split('.').at(-1)!;
    if (target && typeof target === 'object' && typeof (target as Obj)[key] === 'string') {
      if ((target as Obj)[key]) return null; // 档案里有值（比如敏感信息没开启自动填写），不覆盖
      (target as Obj)[key] = v;
      return { profile: p, where: 'profile' };
    }
    return null;
  }
  const label = item.label.replace(/（[^）]*）$/, '').trim();
  if (!clean(label)) return null;
  const same = p.custom.find((f) => clean(f.label) === clean(label));
  if (same) same.value = v;
  else p.custom.push({ id: newId(), label, value: v });
  return { profile: p, where: 'custom' };
}
