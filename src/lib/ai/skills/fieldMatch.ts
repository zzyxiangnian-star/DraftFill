import { ALIASES } from '../../fill/aliases';
import type { Section } from '../../fill/sections';
import { objs, str, type Skill } from './index';

// 计划书 L2：规则和字段记忆都没认出的字段，让 AI 看字段名猜对应档案里的哪一项。
// 只发页面上的字段名、提示文字、所在分区和选项，不发任何档案内容。AI 只能从给定的路径里选，
// 返回的结果在本地再核对一遍（路径必须存在、分区对得上、下拉框不填姓名电话这类）。

export interface UnknownField {
  /** 本次填写里的序号 */
  id: number;
  label: string;
  placeholder: string;
  section: Section | null;
  /** 控件大类：文本、下拉、单选、多行文本 */
  kind: 'text' | 'choice' | 'textarea';
  /** 页面上能读到的选项（自定义下拉框点开前读不到，就是空的） */
  options: string[];
}

export interface FieldMatchInput {
  fields: UnknownField[];
  /** 档案里“其他信息”自定义的字段名（只有名称，没有值） */
  custom: { id: string; label: string }[];
}

export interface FieldGuess { id: number; path: string }

const SECTION_NAMES: Record<Section, string> = {
  basic: '基本信息', intention: '求职意向', education: '教育经历', internship: '实习经历', project: '项目经历', campus: '校园经历',
  award: '获奖', language: '语言能力', certificate: '证书', skill: '技能', family: '家庭成员', emergency: '紧急联系人',
};

/** 每个档案路径的中文说明，如 education[].school：教育经历·学校 */
export const PATH_CATALOG: { path: string; name: string; home: Section[] }[] = (() => {
  const seen = new Set<string>();
  const out: { path: string; name: string; home: Section[] }[] = [];
  for (const a of ALIASES) {
    if (seen.has(a.path)) continue;
    seen.add(a.path);
    const word = a.strong[0] ?? a.ctx?.[0] ?? a.path;
    out.push({ path: a.path, name: `${SECTION_NAMES[a.home[0]!]}·${word}`, home: a.home });
  }
  return out;
})();

/** 只会是文本框的字段：下拉框、单选不可能是它们（同 match.ts） */
const TEXT_ONLY = new Set(['basic.name', 'basic.phone', 'basic.email', 'basic.idNumber', 'basic.address']);

const METHOD = `任务：网申页面上有一些字段，填表插件没认出来。请判断每个字段对应候选人档案里的哪一项。
规则：
1. 只能从“可选的档案项”里选路径，原样输出；不确定、或者档案里没有对应的项，就输出 null。宁可 null，不要猜错。
2. 看字段所在的分区：家庭成员、紧急联系人分区里的“姓名”“电话”不是候选人本人的。
3. “是否……”“有无……”这类是非题，只有档案里也有对应的是非项（如是否服从调剂）才选。
4. 下拉框、单选框不会是姓名、手机号、邮箱、证件号码、地址。
5. 开放问答题（为什么选择我们、自我评价、职业规划等）一律 null。
只输出 JSON：{"fields": [{"id": 字段序号, "path": "档案路径或 null"}]}，不要输出别的文字。`;

const KIND_NAMES = { text: '文本框', choice: '下拉/单选', textarea: '多行文本' } as const;

function describeField(f: UnknownField): string {
  const parts = [`${f.id}. 字段名“${f.label || '（无）'}”`];
  if (f.placeholder && f.placeholder !== f.label) parts.push(`提示“${f.placeholder}”`);
  parts.push(`分区：${f.section ? SECTION_NAMES[f.section] : '未知'}`, KIND_NAMES[f.kind]);
  if (f.options.length) parts.push(`选项：${f.options.slice(0, 20).join(' / ')}`);
  return parts.join('，');
}

export const fieldMatchSkill: Skill<FieldMatchInput, FieldGuess[]> = {
  id: 'field-match',
  name: '认字段',
  temperature: 0,
  build: ({ fields, custom }) => {
    const catalog = [
      ...PATH_CATALOG.map((p) => `${p.path}：${p.name}`),
      ...custom.map((c) => `custom:${c.id}：其他信息·${c.label}`),
    ].join('\n');
    return [
      { role: 'system', content: METHOD },
      { role: 'user', content: `可选的档案项：\n${catalog}\n\n页面上没认出的字段：\n${fields.map(describeField).join('\n')}` },
    ];
  },
  parse: (raw, { fields, custom }) => {
    const r = (raw ?? {}) as Record<string, unknown>;
    const byId = new Map(fields.map((f) => [f.id, f]));
    const out: FieldGuess[] = [];
    const used = new Set<number>();
    for (const g of objs(r.fields, 200)) {
      const f = byId.get(Number(g.id));
      const path = str(g.path, 80);
      if (!f || used.has(f.id) || !path || path === 'null') continue;
      if (!plausible(f, path, custom)) continue;
      used.add(f.id);
      out.push({ id: f.id, path });
    }
    return out;
  },
};

/** 本地核对 AI 给的路径：路径存在、分区对得上、控件类型合理 */
export function plausible(f: UnknownField, path: string, custom: { id: string }[]): boolean {
  if (path.startsWith('custom:')) return custom.some((c) => `custom:${c.id}` === path);
  const p = PATH_CATALOG.find((x) => x.path === path);
  if (!p) return false;
  // 基本信息里的“毕业院校”等指第 1 段教育经历（同 match.ts）
  const summary = f.section === 'basic' && path.startsWith('education[');
  if (f.section && !p.home.includes(f.section) && !summary) return false;
  if (f.kind === 'choice' && TEXT_ONLY.has(path)) return false;
  return true;
}
