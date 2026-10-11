import type { Profile } from '../profile/schema';
import { ALIASES } from './aliases';
import { chooseNumber, chooseOption } from './choice';
import type { Control } from './detect';
import { datePartValue } from './dates';
import { chooseFuzzy, fuzzyKindOf } from './fuzzy';
import { parsePath, resolveValue } from './values';

// 候选卡（计划书 V5）：插件没认出的字段，把档案里能填的值列出来，让用户自己点选。

export interface Candidate {
  /** 具体的档案路径：education[1].school */
  path: string;
  /** 给人看的名字：学校（第 2 条） */
  label: string;
  value: string;
}

const LIST_NAMES: Record<string, string> = {
  education: '教育', internships: '实习', projects: '项目', campus: '校园经历', awards: '获奖',
  family: '家庭成员', 'skills.languages': '语言', 'skills.certificates': '证书',
};

const DATE = /(\.start|\.end|\.date|birthDate|availableDate)$/;

function listLength(profile: Profile, list: string): number {
  const v = list.split('.').reduce<unknown>((o, k) => (o as Record<string, unknown>)?.[k], profile);
  return Array.isArray(v) ? v.length : 0;
}

/** 档案里所有能填的值（敏感信息按档案里的开关挡住），按跟这个字段所在分区的相关程度排序 */
export function candidatesFor(c: Pick<Control, 'kind' | 'options' | 'section' | 'part'>, profile: Profile): Candidate[] {
  const out: (Candidate & { rank: number })[] = [];
  const seen = new Set<string>();
  for (const a of ALIASES) {
    if (seen.has(a.path)) continue;
    seen.add(a.path);
    if (c.part && !DATE.test(a.path)) continue;
    const rank = c.section && a.home.includes(c.section) ? 0 : a.home[0] === 'basic' ? 1 : 2;
    const name = a.strong[0] ?? a.path;
    const arr = parsePath(a.path);
    const n = arr ? listLength(profile, arr.list) : 1;
    for (let i = 0; i < n; i++) {
      const v = resolveValue(profile, a.path, i);
      if (v.value === null) continue;
      const path = arr ? a.path.replace('[]', `[${i}]`) : a.path;
      const label = arr && n > 1 ? `${name}（${LIST_NAMES[arr.list] ?? ''}第 ${i + 1} 条）` : name;
      out.push({ path, label, value: v.value, rank });
    }
  }
  for (const f of profile.custom) {
    if (f.label && f.value) out.push({ path: `custom:${f.id}`, label: f.label, value: f.value, rank: 1 });
  }
  return out
    .filter((x) => fits(x, c))
    .sort((x, y) => x.rank - y.rank)
    .map(({ rank: _, ...x }) => x);
}

/** 选项已经在页面上（原生下拉、单选）时，只留能对上某个选项的值 */
function fits(x: Candidate, c: Pick<Control, 'kind' | 'options' | 'part'>): boolean {
  if (!c.options.length) return true;
  if (c.part) {
    const v = datePartValue(x.value, c.part);
    return !!v && chooseNumber(v, c.options).ok;
  }
  const fk = fuzzyKindOf(x.path);
  return (fk ? chooseFuzzy(x.value, c.options, fk) : chooseOption(x.value, c.options)).ok;
}

/** 搜索框：字段名或值里包含关键词 */
export function filterCandidates(list: Candidate[], q: string): Candidate[] {
  const k = q.trim().toLowerCase();
  return k ? list.filter((x) => x.label.toLowerCase().includes(k) || x.value.toLowerCase().includes(k)) : list;
}
