import type { Profile } from '../profile/schema';
import { buildResume, resumeText, type SectionId } from '../resume/export';

// 发给 AI 之前去掉个人身份信息（计划书第 9 节）：不发姓名、电话、邮箱、身份证号、籍贯、户口、
// 家庭成员、紧急联系人、地址、出生日期。只发经历本身。

const SENT: SectionId[] = ['intention', 'education', 'internships', 'projects', 'campus', 'awards', 'skills'];

/** 发送前展示给用户：会发什么、不会发什么 */
export const SENT_LABEL = '求职意向、教育、实习、项目、校园经历、获奖和技能';
export const NOT_SENT_LABEL = '姓名、电话、邮箱、身份证号、出生日期、籍贯户口、家庭成员';

const PATTERNS: [RegExp, string][] = [
  [/(?<!\d)1[3-9]\d{9}(?!\d)/g, '[手机号]'],
  [/[\w.+-]+@[\w-]+(\.[\w-]+)+/g, '[邮箱]'],
  [/(?<![\dXx])\d{17}[\dXx](?![\dXx])/g, '[证件号]'],
];

/** 经历描述里也可能顺手写了电话、邮箱，一并抹掉 */
export function scrub(text: string, profile?: Profile): string {
  let t = text;
  for (const [re, to] of PATTERNS) t = t.replace(re, to);
  const name = profile?.basic.name.trim();
  if (name && name.length >= 2) t = t.split(name).join('[本人]');
  return t;
}

/** 给 AI 看的简历正文 */
export function resumeForAi(profile: Profile): string {
  const doc = buildResume(profile, SENT);
  return scrub(resumeText({ ...doc, name: '候选人', lines: [] }), profile);
}
