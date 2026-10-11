import { describe, expect, it } from 'vitest';
import { endpointOf } from '../src/lib/ai/settings';
import { resumeForAi, scrub } from '../src/lib/ai/redact';
import { diagnoseSkill } from '../src/lib/ai/skills/diagnose';
import { countChars, extractJson } from '../src/lib/ai/skills/index';
import { jdMatchSkill } from '../src/lib/ai/skills/jdMatch';
import { openQuestionSkill } from '../src/lib/ai/skills/openQuestion';
import { polishSkill } from '../src/lib/ai/skills/polish';
import { sampleProfile } from './fixtures/profile';

describe('发给 AI 的内容', () => {
  it('不含姓名、电话、邮箱、身份证号、家庭成员、籍贯户口', () => {
    const p = sampleProfile();
    p.internships[0]!.description += '\n有问题联系 13812345678 或 wang@example.com';
    const text = resumeForAi(p);
    for (const x of [p.basic.name, p.basic.phone, p.basic.email, p.basic.idNumber, p.basic.nativePlace, p.basic.hukou, '王大明', '李秀英', '13812345678', 'wang@example.com']) {
      if (x) expect(text).not.toContain(x);
    }
    expect(text).toContain('北京大学');
    expect(text).toContain('示例科技');
    expect(text).toContain('[手机号]');
  });

  it('身份证号、邮箱抹掉', () => {
    expect(scrub('身份证 11010120010520123X，邮箱 a.b@c.com.cn')).toBe('身份证 [证件号]，邮箱 [邮箱]');
  });
});

describe('AI 设置', () => {
  it('选服务商后只需要 Key', () => {
    expect(endpointOf({ provider: 'deepseek', apiKey: ' sk-1 ', model: '', baseUrl: '' }))
      .toEqual({ baseUrl: 'https://api.deepseek.com', model: 'deepseek-v4-flash', apiKey: 'sk-1', name: 'DeepSeek' });
    expect(endpointOf({ provider: 'deepseek', apiKey: '', model: '', baseUrl: '' })).toHaveProperty('error');
    expect(endpointOf({ provider: 'custom', apiKey: 'k', model: 'm', baseUrl: 'https://x.com/v1/chat/completions' }))
      .toMatchObject({ baseUrl: 'https://x.com/v1', model: 'm' });
  });
});

describe('技能输出解析', () => {
  it('能从代码块里取出 JSON，格式坏了报错', () => {
    expect(extractJson('```json\n{"a":1}\n```')).toEqual({ a: 1 });
    expect(extractJson('好的：{"a":2} 以上')).toEqual({ a: 2 });
    expect(() => extractJson('没有 JSON')).toThrow('格式不对');
  });

  it('诊断：分数夹在 0–100，等级不认识的归为中', () => {
    const r = diagnoseSkill.parse({ score: 130, issues: [{ level: '严重', problem: '没有量化', fix: '补数字' }, { level: '高' }], followUps: ['QPS 怎么测的'] }, { resume: '', target: '' });
    expect(r.score).toBe(100);
    expect(r.issues).toEqual([{ level: '中', where: '', problem: '没有量化', fix: '补数字' }]);
    expect(r.followUps).toEqual(['QPS 怎么测的']);
  });

  it('岗位分析：状态只能是三种之一', () => {
    const r = jdMatchSkill.parse({ requirements: [{ item: '熟悉 Go', status: '符合' }, { item: '本科', kind: '硬性', status: '已覆盖' }] }, { jd: '', resume: '' });
    expect(r.requirements.map((x) => x.status)).toEqual(['未覆盖', '已覆盖']);
  });

  it('开放题：按去掉空格后的字数检查是否超限', () => {
    expect(countChars('我 是\n谁')).toBe(3);
    const r = openQuestionSkill.parse({ versions: [{ angle: 'A', text: '一二三四五' }, { angle: 'B', text: '一二三' }] },
      { question: '', limit: 4, company: '', jd: '', resume: '' });
    expect(r.versions.map((v) => [v.chars, v.over])).toEqual([[5, true], [3, false]]);
  });

  it('润色：没有版本时报错；提示词里带着真实性规则', () => {
    expect(() => polishSkill.parse({ versions: [] }, {} as never)).toThrow();
    const msgs = polishSkill.build({ kind: '实习', title: '示例科技', role: '后端', description: '写接口', target: '' });
    expect(msgs[0]!.content).toContain('不能把“参与”升级成“主导”');
    expect(msgs[1]!.content).toContain('写接口');
  });
});
