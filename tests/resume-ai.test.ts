import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { mergeAiResume, normalizeYm, resumeStructureSkill, resumeTextForAi } from '../src/lib/ai/skills/resumeStructure';
import { parseResume } from '../src/lib/resume/parse';

// 计划书 L1：AI 整理简历。发出去的正文不含个人信息；AI 只替换经历类内容；原文里找不到的名称提示核对。

const raw = readFileSync(`${import.meta.dirname}/fixtures/resumes/a-classic.txt`, 'utf8');

describe('AI 整理简历', () => {
  it('发给 AI 的正文去掉了姓名、电话、邮箱和个人信息行，经历保留', () => {
    const local = parseResume(raw).profile;
    const text = resumeTextForAi(raw + '\n出生日期：2001.05.20\n籍贯：湖南长沙\n家庭住址：北京市海淀区某路 1 号\n经历里顺手写了 13800138000', local);
    for (const x of ['王小明', '138 0013 8000', '13800138000', 'wangxm@example.com', '2001.05.20', '湖南长沙', '海淀区']) expect(text).not.toContain(x);
    for (const x of ['北京理工大学', '字节跳动科技有限公司', '国家奖学金', 'Go、Java']) expect(text).toContain(x);
    expect(resumeStructureSkill.build({ text }).map((m) => m.content).join('\n')).not.toContain('王小明');
  });

  it('整理模型返回：日期统一成年-月，学历只认固定写法，空条目丢掉', () => {
    expect(normalizeYm('2024.9')).toBe('2024-09');
    expect(normalizeYm('2024年09月')).toBe('2024-09');
    expect(normalizeYm('至今')).toBe('');
    const r = resumeStructureSkill.parse({
      education: [{ school: '北京理工大学', major: '计算机科学与技术', degree: '硕士研究生', degreeType: '硕士', start: '2024.09', end: '2027.6' },
        { school: '', major: '' }, { school: '华中科技大学', degree: '大学本科' }],
      internships: [{ company: '字节跳动科技有限公司', title: '后端开发实习生', start: '2025-06', end: '至今', description: '负责订单服务接口开发' }, { title: '没有公司' }],
      awards: [{ name: '国家奖学金', date: '2022.10' }],
      skills: { cet6: '520', certificates: [{ name: '' }] },
    }, { text: '' });
    expect(r.education.map((e) => [e.school, e.degree, e.start, e.end])).toEqual([
      ['北京理工大学', '硕士研究生', '2024-09', '2027-06'], ['华中科技大学', '', '', ''],
    ]);
    expect(r.internships).toHaveLength(1);
    expect(r.internships[0]).toMatchObject({ end: '', description: '负责订单服务接口开发' });
    expect(r.awards[0]).toMatchObject({ name: '国家奖学金', date: '2022-10' });
    expect(r.skills.certificates).toEqual([]);
  });

  it('合并：基本信息以本地为准；AI 认出的分区替换；原文里找不到的名称提示核对', () => {
    const local = parseResume(raw).profile;
    const ai = resumeStructureSkill.parse({
      positions: '不该覆盖',
      education: [{ school: '北京理工大学', major: '计算机科学与技术', degree: '硕士研究生' }],
      internships: [{ company: '字节跳动', title: '后端开发实习生' }, { company: '某某咨询公司' }],
    }, { text: '' });
    const { profile, notes } = mergeAiResume(local, ai, raw);
    expect(profile.basic).toEqual(local.basic);
    expect(profile.intention.positions).toBe(local.intention.positions);
    expect(profile.education).toHaveLength(1);
    expect(profile.internships.map((i) => i.company)).toEqual(['字节跳动', '某某咨询公司']);
    expect(profile.projects).toEqual(local.projects); // AI 没给的分区保留本地结果
    expect(notes.join('')).toContain('某某咨询公司');
    expect(notes.join('')).not.toContain('字节跳动、'); // 原文里有“字节跳动”
  });
});
