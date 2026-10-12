import { describe, expect, it } from 'vitest';
import { fieldMatchSkill, PATH_CATALOG, type UnknownField } from '../src/lib/ai/skills/fieldMatch';
import { fillFromGuess, guessPath, planFill, runFill, unknownFields } from '../src/lib/fill/fill';
import { remember, signature } from '../src/lib/fill/memory';
import { sampleProfile } from './fixtures/profile';

// 计划书 L2：AI 认字段。只发字段名，AI 的回答在本地再核对一遍，写入一律标黄。

const field = (id: number, label: string, extra: Partial<UnknownField> = {}): UnknownField =>
  ({ id, label, placeholder: '', section: null, kind: 'text', options: [], ...extra });

describe('AI 认字段：发什么、收什么', () => {
  it('发给 AI 的只有字段名、分区、选项和档案项目录，没有任何档案内容', () => {
    const p = sampleProfile();
    p.custom = [{ id: 'c1', label: '英语口语', value: '流利' } as never];
    const msgs = fieldMatchSkill.build({
      fields: [field(0, '毕业学校全称'), field(1, '党团关系', { kind: 'choice', options: ['党员', '团员', '群众'] })],
      custom: [{ id: 'c1', label: '英语口语' }],
    });
    const text = msgs.map((m) => m.content).join('\n');
    expect(text).toContain('毕业学校全称');
    expect(text).toContain('党员 / 团员 / 群众');
    expect(text).toContain('custom:c1：其他信息·英语口语');
    expect(text).toContain('education[].school');
    for (const secret of [p.basic.name, p.basic.phone, p.basic.email, p.education[0]!.school, '流利']) expect(text).not.toContain(secret);
  });

  it('目录里每个档案项都有中文名', () => {
    expect(PATH_CATALOG.length).toBeGreaterThan(50);
    expect(PATH_CATALOG.find((p) => p.path === 'basic.politicalStatus')?.name).toBe('基本信息·政治面貌');
  });

  it('只收给定的路径；分区对不上、下拉框配姓名电话、重复、编造的都丢掉', () => {
    const fields = [
      field(0, '毕业学校全称', { section: 'education' }),
      field(1, '联系人手机', { section: 'family' }),
      field(2, '本人电话', { kind: 'choice' }),
      field(3, '口语'),
      field(4, '最高学历院校', { section: 'basic' }),
      field(5, '父亲姓名', { section: 'family' }),
    ];
    const raw = { fields: [
      { id: 0, path: 'education[].school' },
      { id: 0, path: 'education[].major' }, // 重复
      { id: 1, path: 'basic.phone' }, // 家庭分区里不是本人电话
      { id: 2, path: 'basic.phone' }, // 下拉框不会是手机号
      { id: 3, path: 'custom:c1' },
      { id: 4, path: 'education[].school' }, // 基本信息里的学校指第 1 段
      { id: 5, path: 'basic.secret' }, // 编造的路径
      { id: 9, path: 'basic.name' }, // 没有这个字段
      { id: 5, path: null },
    ] };
    const out = fieldMatchSkill.parse(raw, { fields, custom: [{ id: 'c1', label: '英语口语' }] });
    expect(out).toEqual([
      { id: 0, path: 'education[].school' },
      { id: 3, path: 'custom:c1' },
      { id: 4, path: 'education[].school' },
    ]);
  });
});

const PAGE = `
  <form>
    <h3>基本信息</h3>
    <label>姓名 <input name="n"></label>
    <label>党团关系 <select name="ps"><option value="">请选择</option><option>中共党员</option><option>共青团员</option><option>群众</option></select></label>
    <h3>教育经历</h3>
    <label>学校 <input name="s1"></label>
    <label>主修方向 <input name="m1"></label>
    <label>学校 <input name="s2"></label>
    <label>主修方向 <input name="m2"></label>
  </form>`;

describe('AI 认字段：在页面上写入', () => {
  it('列出没认出的字段，写入后标黄；第 2 段经历里的落到第 2 条', async () => {
    document.body.innerHTML = PAGE;
    const p = sampleProfile();
    const { entries } = await runFill(document, p);
    const unknown = unknownFields(entries);
    expect(unknown.map((f) => [f.label, f.section, f.kind])).toEqual([
      ['党团关系', 'basic', 'choice'], ['主修方向', 'education', 'text'], ['主修方向', 'education', 'text'],
    ]);
    expect(unknown[0]!.options).toEqual(['中共党员', '共青团员', '群众']);

    const [ps, b1, b2] = unknown;
    expect(guessPath(entries, b1!.id, 'education[].major')).toBe('education[0].major');
    expect(guessPath(entries, b2!.id, 'education[].major')).toBe('education[1].major');
    expect(guessPath(entries, ps!.id, 'basic.politicalStatus')).toBe('basic.politicalStatus');
    const i1 = await fillFromGuess(entries[ps!.id]!, 'basic.politicalStatus', p);
    expect(i1).toMatchObject({ status: 'warn', value: '共青团员', note: 'AI 认作“政治面貌”，请核对' });
    const i2 = await fillFromGuess(entries[b2!.id]!, guessPath(entries, b2!.id, 'education[].major'), p);
    expect(i2).toMatchObject({ status: 'warn', value: '软件工程' });
    // 档案里没有第 3 段：如实说明，不写
    const i3 = await fillFromGuess(entries[b1!.id]!, 'education[2].major', p);
    expect(i3).toMatchObject({ status: 'skip', note: expect.stringContaining('只有 2 条') });
    expect(document.querySelector<HTMLInputElement>('[name=m1]')!.value).toBe('');
  });

  it('按网站记住的 AI 结果，下次直接认出，但仍标黄', async () => {
    document.body.innerHTML = PAGE;
    const p = sampleProfile();
    const { entries } = await runFill(document, p);
    const e = entries.find((x) => x.item.label === '党团关系')!;
    const mem = remember({ version: 1, items: {} }, signature(e.control, 'localhost:3000')!,
      { path: 'basic.politicalStatus', label: '党团关系', host: 'localhost:3000', source: 'ai' });
    document.body.innerHTML = PAGE;
    const f = planFill(document, p, mem).find((x) => x.control.label.startsWith('党团关系'))!;
    expect(f).toMatchObject({ path: 'basic.politicalStatus', sure: false, aiGuess: true });
    const run = await runFill(document, p, mem);
    expect(run.report.items.find((i) => i.label === '党团关系')).toMatchObject({ status: 'warn', value: '共青团员' });
  });
});
