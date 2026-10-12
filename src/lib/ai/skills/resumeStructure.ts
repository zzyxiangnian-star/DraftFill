import {
  emptyAward, emptyCampusRole, emptyCertificate, emptyEducation, emptyInternship, emptyLanguage, emptyProject,
  type Award, type CampusRole, type Certificate, type Education, type Internship, type Language, type Profile, type Project,
} from '../../profile/schema';
import { scrub } from '../redact';
import { BASE_RULES, objs, str, type Skill } from './index';

// 计划书 L1：本地规则先认一遍简历（姓名、电话这些只在本机认），再把去掉个人信息的正文交给 AI，
// 让它把教育、实习、项目、校园、获奖、技能整理成档案格式。AI 的结果只用来替换经历类内容，
// 基本信息一律以本地识别为准；预览确认后才存。

/** 这些行整行不发：出生日期、籍贯户口、地址、证件、联系方式、婚育、政治面貌、民族 */
const PERSONAL_LINE = /出生|生日|年龄|籍贯|户口|户籍|住址|地址|身份证|证件|民族|政治面貌|婚|电话|手机|邮箱|微信|QQ|e-?mail|tel|phone/i;

/** 发给 AI 的简历正文：去掉个人信息所在的行，再抹掉散落在经历里的手机号、邮箱、证件号和姓名 */
export function resumeTextForAi(raw: string, local: Profile): string {
  const lines = raw.replace(/\r/g, '').split('\n').map((l) => l.trim()).filter(Boolean);
  const name = local.basic.name.trim();
  const kept = lines.filter((l) => !PERSONAL_LINE.test(l) && l.replace(/\s/g, '') !== name);
  return scrub(kept.join('\n'), local).slice(0, 12000);
}

export interface ResumeAiResult {
  positions: string;
  cities: string;
  education: Education[];
  internships: Internship[];
  projects: Project[];
  campus: CampusRole[];
  awards: Award[];
  skills: { cet4: string; cet6: string; computerLevel: string; summary: string; languages: Language[]; certificates: Certificate[] };
}

const FORMAT = `任务：把下面这份简历正文整理成档案。正文已经去掉了姓名、电话等个人信息，不用管这些。
规则：
1. 只摘录原文写了的内容，原文没写的字段给空字符串，不要推测、不要补全、不要改写措辞。描述类字段（description、summary）保留原文要点，每点一行。
2. 日期统一写成 YYYY-MM（如 2024-09）；“至今”的结束时间给空字符串；获奖、证书只写到月份。
3. 学历只能是“博士研究生、硕士研究生、本科、大专”之一；学位只能是“博士、硕士、学士”之一或空。教育经历按学历从高到低排。
4. 英语四六级只写分数（如 580），只写了“通过”就写“已通过”。
输出 JSON：
{"positions": "意向岗位", "cities": "期望城市",
 "education": [{"school": "", "college": "院系", "major": "", "degree": "", "degreeType": "", "start": "", "end": "", "gpa": "", "gpaScale": "", "rank": "", "rankTotal": "", "courses": "主修课程"}],
 "internships": [{"company": "", "title": "职位", "department": "", "city": "", "start": "", "end": "", "description": ""}],
 "projects": [{"name": "", "role": "", "start": "", "end": "", "link": "", "description": ""}],
 "campus": [{"organization": "", "role": "职务", "start": "", "end": "", "description": ""}],
 "awards": [{"name": "", "level": "国家级/省级/校级等，原文没写给空", "date": ""}],
 "skills": {"cet4": "", "cet6": "", "computerLevel": "", "summary": "技能描述", "languages": [{"language": "", "level": ""}], "certificates": [{"name": "", "date": ""}]}}`;

const DEGREES = ['博士研究生', '硕士研究生', '本科', '大专'];
const DEGREE_TYPES = ['博士', '硕士', '学士'];

/** 2024.9、2024年9月、2024-09 → 2024-09；认不出给空 */
export function normalizeYm(v: unknown): string {
  const m = /(\d{4})\s*[.\-/年]\s*(\d{1,2})/.exec(str(v, 20));
  if (!m) return /^\d{4}$/.test(str(v, 20)) ? str(v, 20) : '';
  const month = Number(m[2]);
  return month >= 1 && month <= 12 ? `${m[1]}-${String(month).padStart(2, '0')}` : '';
}

const pick = <T extends object>(base: T, raw: Record<string, unknown>, keys: (keyof T & string)[], dates: (keyof T & string)[] = []): T => {
  const out = { ...base } as Record<string, unknown>;
  for (const k of keys) out[k] = str(raw[k], k === 'description' || k === 'summary' || k === 'courses' ? 2000 : 120);
  for (const k of dates) out[k] = normalizeYm(raw[k]);
  return out as T;
};

export const resumeStructureSkill: Skill<{ text: string }, ResumeAiResult> = {
  id: 'resume-structure',
  name: '简历整理',
  temperature: 0,
  build: ({ text }) => [
    { role: 'system', content: `${BASE_RULES}\n\n${FORMAT}` },
    { role: 'user', content: `简历正文：\n${text}` },
  ],
  parse: (raw) => {
    const r = (raw ?? {}) as Record<string, unknown>;
    const sk = (r.skills ?? {}) as Record<string, unknown>;
    const education = objs(r.education, 6).map((e) => {
      const ed = pick(emptyEducation(), e, ['school', 'college', 'major', 'gpa', 'gpaScale', 'rank', 'rankTotal', 'courses'], ['start', 'end']);
      ed.degree = DEGREES.includes(str(e.degree)) ? str(e.degree) : '';
      ed.degreeType = DEGREE_TYPES.includes(str(e.degreeType)) ? str(e.degreeType) : '';
      return ed;
    }).filter((e) => e.school || e.major);
    return {
      positions: str(r.positions, 120),
      cities: str(r.cities, 60),
      education,
      internships: objs(r.internships, 10).map((e) => pick(emptyInternship(), e, ['company', 'title', 'department', 'city', 'description'], ['start', 'end'])).filter((e) => e.company),
      projects: objs(r.projects, 10).map((e) => pick(emptyProject(), e, ['name', 'role', 'link', 'description'], ['start', 'end'])).filter((e) => e.name),
      campus: objs(r.campus, 10).map((e) => pick(emptyCampusRole(), e, ['organization', 'role', 'description'], ['start', 'end'])).filter((e) => e.organization),
      awards: objs(r.awards, 20).map((e) => pick(emptyAward(), e, ['name', 'level'], ['date'])).filter((e) => e.name),
      skills: {
        cet4: str(sk.cet4, 20), cet6: str(sk.cet6, 20), computerLevel: str(sk.computerLevel, 40), summary: str(sk.summary, 2000),
        languages: objs(sk.languages, 6).map((e) => pick(emptyLanguage(), e, ['language', 'level'])).filter((e) => e.language),
        certificates: objs(sk.certificates, 20).map((e) => pick(emptyCertificate(), e, ['name'], ['date'])).filter((e) => e.name),
      },
    };
  },
};

const norm = (s: string) => s.replace(/[\s()（）·•,，.。:：;；\-–—/]/g, '').toLowerCase();

/**
 * 把 AI 的结果并进本地识别的档案：基本信息不动；AI 认出了内容的分区替换掉本地结果，没认出的保留本地的。
 * 学校、公司、项目、组织、奖项的名称在原文里找不到的，列进提示让用户核对（AI 可能改了写法，也可能编了）。
 */
export function mergeAiResume(local: Profile, ai: ResumeAiResult, sourceText: string): { profile: Profile; notes: string[] } {
  const p: Profile = structuredClone(local);
  if (!p.intention.positions && ai.positions) p.intention.positions = ai.positions;
  if (!p.intention.cities && ai.cities) p.intention.cities = ai.cities;
  if (ai.education.length) p.education = ai.education;
  if (ai.internships.length) p.internships = ai.internships;
  if (ai.projects.length) p.projects = ai.projects;
  if (ai.campus.length) p.campus = ai.campus;
  if (ai.awards.length) p.awards = ai.awards;
  const s = ai.skills;
  p.skills = {
    cet4: s.cet4 || p.skills.cet4, cet6: s.cet6 || p.skills.cet6, computerLevel: s.computerLevel || p.skills.computerLevel,
    summary: s.summary || p.skills.summary,
    languages: s.languages.length ? s.languages : p.skills.languages,
    certificates: s.certificates.length ? s.certificates : p.skills.certificates,
  };

  const src = norm(sourceText);
  const names = [
    ...ai.education.map((e) => e.school), ...ai.internships.map((e) => e.company), ...ai.projects.map((e) => e.name),
    ...ai.campus.map((e) => e.organization), ...ai.awards.map((e) => e.name),
  ].filter(Boolean);
  const missing = [...new Set(names.filter((n) => !src.includes(norm(n))))];
  const notes = missing.length ? [`这些名称在简历原文里找不到原样的写法，可能是 AI 改了说法，请核对：${missing.join('、')}。`] : [];
  return { profile: p, notes };
}
