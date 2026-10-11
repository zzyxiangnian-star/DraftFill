import { describe, expect, it } from 'vitest';
import { buildResume, DEFAULT_SECTIONS, period, points, resumeText } from '../src/lib/resume/export';
import { sampleProfile } from './fixtures/profile';

const TODAY = new Date(2026, 9, 11);

describe('导出简历', () => {
  it('默认不导出个人信息；身份证、籍贯、户口、家庭成员永远不导出', () => {
    const p = sampleProfile();
    p.autofill.phone = false; // 填写开关不影响简历
    const doc = buildResume(p, DEFAULT_SECTIONS, TODAY);
    const text = resumeText(doc);
    expect(doc.name).toBe('王小明');
    for (const x of [p.basic.idNumber, p.basic.nativePlace, p.basic.hukou, '王大明', '李秀英', p.basic.politicalStatus, p.basic.birthDate]) {
      if (x) expect(text).not.toContain(x);
    }
    expect(text).toContain(p.basic.phone);
    expect(doc.blocks.map((b) => b.heading)).toEqual(expect.arrayContaining(['教育经历', '实习经历', '项目经历', '获奖']));
  });

  it('只勾选的部分才导出，空的部分不出现', () => {
    const p = sampleProfile();
    p.campus = [];
    const doc = buildResume(p, ['contact', 'education', 'campus'], TODAY);
    expect(doc.blocks.map((b) => b.id)).toEqual(['education']);
    const withPersonal = buildResume(p, ['personal'], TODAY);
    expect(withPersonal.lines[0]).toContain('男');
    expect(withPersonal.lines[0]).toContain('2001.05 出生');
  });

  it('时间和要点', () => {
    expect(period('2023-09', '2027-06')).toBe('2023.09 – 2027.06');
    expect(period('2026-07', '2026-12', TODAY)).toBe('2026.07 – 至今');
    expect(period('2025-06', '2025-09', TODAY)).toBe('2025.06 – 2025.09');
    expect(points('1. 负责接口开发\n2. 压测 QPS 提升 30%\n\n• 写文档')).toEqual(['负责接口开发', '压测 QPS 提升 30%', '写文档']);
  });
});
