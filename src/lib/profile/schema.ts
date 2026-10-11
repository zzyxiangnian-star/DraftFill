// 档案数据结构。字段覆盖计划书第 3 节的国内网申常见项。
// 日期统一存字符串：年月 YYYY-MM，具体日期 YYYY-MM-DD；空字符串表示未填写。

export const SCHEMA_VERSION = 1;

export interface Basic {
  name: string;
  gender: string;
  birthDate: string;
  ethnicity: string;        // 民族
  politicalStatus: string;  // 政治面貌
  nativePlace: string;      // 籍贯
  hukou: string;            // 户口所在地
  sourceRegion: string;     // 生源地
  currentCity: string;      // 现居城市
  phone: string;
  email: string;
  idType: string;
  idNumber: string;
  address: string;
}

export interface Intention {
  positions: string;        // 意向岗位，可写多个，用顿号分隔
  cities: string;           // 期望城市
  salary: string;
  availableDate: string;    // 最早到岗时间 YYYY-MM-DD
  acceptAdjust: string;     // 是否服从调剂
  infoSource: string;       // 信息来源
  referralCode: string;     // 内推码
}

export interface Education {
  id: string;
  school: string;
  degree: string;           // 学历
  degreeType: string;       // 学位
  studyMode: string;        // 全日制 / 非全日制
  college: string;          // 院系
  major: string;
  start: string;
  end: string;
  gpa: string;
  gpaScale: string;
  rank: string;
  rankTotal: string;
  courses: string;
}

export interface Internship {
  id: string;
  company: string;
  title: string;
  department: string;
  city: string;
  start: string;
  end: string;
  description: string;
}

export interface Project {
  id: string;
  name: string;
  role: string;
  start: string;
  end: string;
  link: string;
  description: string;
}

export interface CampusRole {
  id: string;
  organization: string;
  role: string;
  start: string;
  end: string;
  description: string;
}

export interface Award {
  id: string;
  name: string;
  level: string;
  date: string;
  description: string;
}

export interface Language {
  id: string;
  language: string;
  level: string;            // 如 雅思 7.0 / 日语 N2
}

export interface Certificate {
  id: string;
  name: string;
  date: string;
}

export interface Skills {
  cet4: string;
  cet6: string;
  computerLevel: string;
  languages: Language[];
  certificates: Certificate[];
  summary: string;          // 专业技能自述
}

export interface FamilyMember {
  id: string;
  relation: string;
  name: string;
  employer: string;
  title: string;
  phone: string;
}

export interface EmergencyContact {
  name: string;
  relation: string;
  phone: string;
}

export interface CustomField {
  id: string;
  label: string;
  value: string;
}

/** 敏感信息：默认不自动填写，用户逐项开启（计划书第 7 节）。 */
export const SENSITIVE_KEYS = ['phone', 'email', 'idNumber', 'family', 'emergencyContact'] as const;
export type SensitiveKey = (typeof SENSITIVE_KEYS)[number];

export interface Profile {
  id: string;
  /** 档案名称，例如“主档案”“后端开发” */
  title: string;
  /** 从哪份档案复制而来 */
  basedOn: string;
  createdAt: number;
  updatedAt: number;
  basic: Basic;
  intention: Intention;
  education: Education[];
  internships: Internship[];
  projects: Project[];
  campus: CampusRole[];
  awards: Award[];
  skills: Skills;
  family: FamilyMember[];
  emergencyContact: EmergencyContact;
  custom: CustomField[];
  /** 是否允许自动填写各项敏感信息 */
  autofill: Record<SensitiveKey, boolean>;
}

export interface ProfileStore {
  schemaVersion: number;
  activeId: string;
  profiles: Profile[];
}

export function newId(): string {
  return crypto.randomUUID();
}

export const emptyEducation = (): Education => ({
  id: newId(), school: '', degree: '', degreeType: '', studyMode: '全日制', college: '', major: '',
  start: '', end: '', gpa: '', gpaScale: '', rank: '', rankTotal: '', courses: '',
});
export const emptyInternship = (): Internship => ({
  id: newId(), company: '', title: '', department: '', city: '', start: '', end: '', description: '',
});
export const emptyProject = (): Project => ({
  id: newId(), name: '', role: '', start: '', end: '', link: '', description: '',
});
export const emptyCampusRole = (): CampusRole => ({
  id: newId(), organization: '', role: '', start: '', end: '', description: '',
});
export const emptyAward = (): Award => ({ id: newId(), name: '', level: '', date: '', description: '' });
export const emptyLanguage = (): Language => ({ id: newId(), language: '', level: '' });
export const emptyCertificate = (): Certificate => ({ id: newId(), name: '', date: '' });
export const emptyFamilyMember = (): FamilyMember => ({
  id: newId(), relation: '', name: '', employer: '', title: '', phone: '',
});
export const emptyCustomField = (): CustomField => ({ id: newId(), label: '', value: '' });

export function emptyProfile(title = '主档案'): Profile {
  const now = Date.now();
  return {
    id: newId(),
    title,
    basedOn: '',
    createdAt: now,
    updatedAt: now,
    basic: {
      name: '', gender: '', birthDate: '', ethnicity: '', politicalStatus: '', nativePlace: '', hukou: '',
      sourceRegion: '', currentCity: '', phone: '', email: '', idType: '居民身份证', idNumber: '', address: '',
    },
    intention: { positions: '', cities: '', salary: '', availableDate: '', acceptAdjust: '', infoSource: '', referralCode: '' },
    education: [emptyEducation()],
    internships: [],
    projects: [],
    campus: [],
    awards: [],
    skills: { cet4: '', cet6: '', computerLevel: '', languages: [], certificates: [], summary: '' },
    family: [],
    emergencyContact: { name: '', relation: '', phone: '' },
    custom: [],
    autofill: { phone: false, email: false, idNumber: false, family: false, emergencyContact: false },
  };
}

/** 复制一份档案作为新的岗位方向档案：全部内容复制，id 重新生成。 */
export function deriveProfile(source: Profile, title: string): Profile {
  const copy = structuredClone(source);
  const now = Date.now();
  const reId = <T extends { id: string }>(list: T[]) => list.map((x) => ({ ...x, id: newId() }));
  return {
    ...copy,
    id: newId(),
    title,
    basedOn: source.id,
    createdAt: now,
    updatedAt: now,
    education: reId(copy.education),
    internships: reId(copy.internships),
    projects: reId(copy.projects),
    campus: reId(copy.campus),
    awards: reId(copy.awards),
    skills: { ...copy.skills, languages: reId(copy.skills.languages), certificates: reId(copy.skills.certificates) },
    family: reId(copy.family),
    custom: reId(copy.custom),
  };
}
