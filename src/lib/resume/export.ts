import type { Profile } from '../profile/schema';

// 把档案导出成一页简历。只导出简历上该有的内容：身份证号、籍贯、户口、家庭成员、紧急联系人、
// 薪资、内推码等只在网申表格里用，永远不进简历。

export const RESUME_SECTIONS = [
  { id: 'contact', label: '姓名和联系方式', hint: '电话、邮箱、所在城市', on: true },
  { id: 'personal', label: '个人信息', hint: '性别、出生年月、政治面貌', on: false },
  { id: 'intention', label: '求职意向', hint: '岗位、城市', on: true },
  { id: 'education', label: '教育经历', on: true },
  { id: 'internships', label: '实习经历', on: true },
  { id: 'projects', label: '项目经历', on: true },
  { id: 'campus', label: '校园经历', on: true },
  { id: 'awards', label: '获奖', on: true },
  { id: 'skills', label: '技能与证书', on: true },
] as const;

export type SectionId = (typeof RESUME_SECTIONS)[number]['id'];
export const DEFAULT_SECTIONS: SectionId[] = RESUME_SECTIONS.filter((s) => s.on).map((s) => s.id);

export interface ResumeEntry {
  title: string;
  subtitle: string;
  period: string;
  /** 描述按行拆开，一行一个要点 */
  points: string[];
}

export interface ResumeBlock {
  id: SectionId;
  heading: string;
  entries: ResumeEntry[];
}

export interface ResumeDoc {
  name: string;
  /** 名字下面的一行：电话 · 邮箱 · 城市，或个人信息 */
  lines: string[];
  blocks: ResumeBlock[];
}

const join = (sep: string, ...xs: (string | undefined)[]) => xs.map((x) => x?.trim()).filter(Boolean).join(sep);

/** 2023-09 → 2023.09。实习等经历的结束时间在将来时写“至今”；教育经历写预计毕业时间，不改。 */
export function period(start: string, end: string, today: Date | null = null): string {
  const fmt = (d: string) => d.replace(/^(\d{4})-(\d{2}).*$/, '$1.$2');
  const now = today && `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
  const e = now && end && end.slice(0, 7) > now ? '至今' : fmt(end);
  return join(' – ', fmt(start), e);
}

export const points = (text: string) =>
  text.split(/\n+/).map((l) => l.replace(/^\s*(?:[•·●\-–—*]|\d{1,2}[、.．)）](?!\d))\s*/, '').trim()).filter(Boolean);

export function buildResume(p: Profile, sections: SectionId[], today = new Date()): ResumeDoc {
  const on = (id: SectionId) => sections.includes(id);
  const b = p.basic;
  const lines: string[] = [];
  if (on('contact')) {
    const l = join('  ·  ', b.phone, b.email, b.currentCity);
    if (l) lines.push(l);
  }
  if (on('personal')) {
    const l = join('  ·  ', b.gender, b.birthDate && `${b.birthDate.slice(0, 7).replace('-', '.')} 出生`, b.politicalStatus);
    if (l) lines.push(l);
  }

  const blocks: ResumeBlock[] = [];
  const add = (id: SectionId, heading: string, entries: ResumeEntry[]) => {
    const real = entries.filter((e) => e.title || e.subtitle || e.points.length);
    if (on(id) && real.length) blocks.push({ id, heading, entries: real });
  };

  const it = p.intention;
  add('intention', '求职意向', [{ title: it.positions, subtitle: it.cities && `意向城市：${it.cities}`, period: '', points: [] }]);
  add('education', '教育经历', p.education.map((e) => ({
    title: e.school,
    subtitle: join(' · ', e.college, e.major, e.degree),
    period: period(e.start, e.end),
    points: [
      join('；', e.gpa && `GPA ${e.gpa}${e.gpaScale ? `/${e.gpaScale}` : ''}`, e.rank && `排名 ${e.rank}${e.rankTotal ? `/${e.rankTotal}` : ''}`),
      e.courses && `主修课程：${e.courses}`,
    ].filter(Boolean),
  })));
  add('internships', '实习经历', p.internships.map((x) => ({
    title: x.company, subtitle: join(' · ', x.department, x.title), period: period(x.start, x.end, today), points: points(x.description),
  })));
  add('projects', '项目经历', p.projects.map((x) => ({
    title: x.name, subtitle: join(' · ', x.role, x.link), period: period(x.start, x.end, today), points: points(x.description),
  })));
  add('campus', '校园经历', p.campus.map((x) => ({
    title: x.organization, subtitle: x.role, period: period(x.start, x.end, today), points: points(x.description),
  })));
  add('awards', '获奖', p.awards.map((x) => ({
    title: x.name, subtitle: x.level, period: x.date ? x.date.slice(0, 7).replace('-', '.') : '', points: points(x.description),
  })));

  const s = p.skills;
  const langs = join('；', s.cet4 && `CET-4 ${s.cet4}`, s.cet6 && `CET-6 ${s.cet6}`, ...s.languages.map((l) => join(' ', l.language, l.level)));
  const certs = join('、', s.computerLevel && s.computerLevel !== '无' ? `计算机${s.computerLevel}` : '', ...s.certificates.map((c) => c.name));
  add('skills', '技能与证书', [{
    title: '', subtitle: '', period: '',
    points: [langs && `语言：${langs}`, certs && `证书：${certs}`, ...points(s.summary)].filter(Boolean),
  }]);

  return { name: b.name || p.title, lines, blocks };
}

/** 纯文字版，方便粘到招聘网站的文本框里 */
export function resumeText(doc: ResumeDoc): string {
  const out = [doc.name, ...doc.lines, ''];
  for (const b of doc.blocks) {
    out.push(`【${b.heading}】`);
    for (const e of b.entries) {
      const head = join('  ', e.title, e.subtitle, e.period);
      if (head) out.push(head);
      out.push(...e.points.map((x) => `· ${x}`));
    }
    out.push('');
  }
  return out.join('\n').trim() + '\n';
}
