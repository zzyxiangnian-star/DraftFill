import {
  emptyAward, emptyCampusRole, emptyCertificate, emptyCustomField, emptyEducation, emptyFamilyMember, emptyInternship,
  emptyLanguage, emptyProfile, emptyProject, newId, type Profile,
} from './schema';

// 把任意来源（旧版本、手改过的备份文件）的数据整理成当前结构：
// 缺的字段补默认值，类型不对的丢弃，多余的字段忽略。

type Flat = Record<string, string | number | boolean>;

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function flat<T extends Flat>(template: T, raw: unknown): T {
  const out = { ...template };
  if (!isObject(raw)) return out;
  for (const key of Object.keys(template) as (keyof T)[]) {
    const v = raw[key as string];
    const t = typeof template[key];
    if (t === 'string' && (typeof v === 'string' || typeof v === 'number')) out[key] = String(v).trim() as T[keyof T];
    else if (typeof v === t) out[key] = v as T[keyof T];
  }
  return out;
}

function list<T extends { id: string }>(factory: () => T, raw: unknown, seen: Set<string>): T[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(isObject).map((item) => {
    const entry = flat(factory() as unknown as Flat, item) as unknown as T;
    // id 重复或缺失时重新生成，保证列表渲染和编辑不串
    if (!entry.id || seen.has(entry.id)) entry.id = newId();
    seen.add(entry.id);
    return entry;
  });
}

export function normalizeProfile(raw: unknown): Profile {
  const base = emptyProfile();
  if (!isObject(raw)) return base;
  const seen = new Set<string>();
  const skills = isObject(raw.skills) ? raw.skills : {};
  const education = list(emptyEducation, raw.education, seen);

  return {
    ...flat({ id: base.id, title: base.title, basedOn: '', createdAt: base.createdAt, updatedAt: base.updatedAt }, raw),
    basic: flat(base.basic as unknown as Flat, raw.basic) as unknown as Profile['basic'],
    intention: flat(base.intention as unknown as Flat, raw.intention) as unknown as Profile['intention'],
    education: Array.isArray(raw.education) ? education : base.education,
    internships: list(emptyInternship, raw.internships, seen),
    projects: list(emptyProject, raw.projects, seen),
    campus: list(emptyCampusRole, raw.campus, seen),
    awards: list(emptyAward, raw.awards, seen),
    skills: {
      ...flat({ cet4: '', cet6: '', computerLevel: '', summary: '' }, skills),
      languages: list(emptyLanguage, skills.languages, seen),
      certificates: list(emptyCertificate, skills.certificates, seen),
    },
    family: list(emptyFamilyMember, raw.family, seen),
    emergencyContact: flat(base.emergencyContact as unknown as Flat, raw.emergencyContact) as unknown as Profile['emergencyContact'],
    custom: list(emptyCustomField, raw.custom, seen),
    autofill: flat(base.autofill as unknown as Flat, raw.autofill) as unknown as Profile['autofill'],
  };
}
