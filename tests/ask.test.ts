import { describe, expect, it } from 'vitest';
import { fillGaps, findGaps, gapsLeft } from '../src/lib/ai/gaps';
import { ASK_NOTE, fillFromUser, missingFields, saveAnswer } from '../src/lib/fill/ask';
import { runFill } from '../src/lib/fill/fill';
import { sampleProfile } from './fixtures/profile';

// 计划书 L6：缺信息暂停询问。必填项档案里没有就问用户，不猜不编。

const PAGE = `
  <form>
    <label>姓名 <input name="n" required></label>
    <label>政治面貌 <select name="ps" required><option value="">请选择</option><option>中共党员</option><option>共青团员</option><option>群众</option></select></label>
    <label>宿舍楼号 <input name="dorm" required></label>
    <label>兴趣爱好 <input name="hobby"></label>
    <label>登录密码 <input type="password" name="pwd" required></label>
  </form>`;

describe('缺信息询问：网申页面', () => {
  it('只问必填、还空着、能写入的；不问选填和密码框', async () => {
    document.body.innerHTML = PAGE;
    const p = sampleProfile();
    p.basic.politicalStatus = '';
    const { entries } = await runFill(document, p);
    const asks = missingFields(entries);
    expect(asks.map((f) => [f.label, f.kind])).toEqual([['政治面貌', 'choice'], ['宿舍楼号', 'text']]);
    expect(asks[0]!.options).toEqual(['中共党员', '共青团员', '群众']);
    expect(document.querySelector<HTMLSelectElement>('[name=ps]')!.value).toBe(''); // 档案里没有，不猜
  });

  it('用户答了才写进页面，标绿；之后不再问', async () => {
    document.body.innerHTML = PAGE;
    const p = sampleProfile();
    p.basic.politicalStatus = '';
    const { entries } = await runFill(document, p);
    const [ps, dorm] = missingFields(entries);
    expect(await fillFromUser(entries[ps!.index]!, '共青团员')).toMatchObject({ status: 'ok', value: '共青团员', note: ASK_NOTE });
    expect(await fillFromUser(entries[dorm!.index]!, ' 12 号楼 ')).toMatchObject({ status: 'ok', value: '12 号楼' });
    expect(document.querySelector<HTMLInputElement>('[name=dorm]')!.value).toBe('12 号楼');
    expect(missingFields(entries)).toEqual([]);
  });

  it('选项里没有的回答不硬填', async () => {
    document.body.innerHTML = PAGE;
    const p = sampleProfile();
    p.basic.politicalStatus = '';
    const { entries } = await runFill(document, p);
    const [ps] = missingFields(entries);
    expect((await fillFromUser(entries[ps!.index]!, '无党派人士')).status).toBe('skip');
    expect(document.querySelector<HTMLSelectElement>('[name=ps]')!.value).toBe('');
  });
});

describe('缺信息询问：存进档案', () => {
  it('认出了档案项、档案里又是空的，就存到那一项', () => {
    const p = sampleProfile();
    p.basic.politicalStatus = '';
    const r = saveAnswer(p, { label: '政治面貌', path: 'basic.politicalStatus' }, undefined, '共青团员')!;
    expect(r.where).toBe('profile');
    expect(r.profile.basic.politicalStatus).toBe('共青团员');
    expect(p.basic.politicalStatus).toBe(''); // 不改原对象
  });

  it('多段经历存到对应那一条；档案里有值的不覆盖', () => {
    const p = sampleProfile();
    p.education[1]!.gpa = '';
    expect(saveAnswer(p, { label: '绩点（第 2 条）', path: 'education[].gpa' }, 1, '3.6')!.profile.education[1]!.gpa).toBe('3.6');
    expect(saveAnswer(p, { label: '学校', path: 'education[].school' }, 0, '别的大学')).toBeNull();
    expect(saveAnswer(p, { label: '学校', path: 'education[].school' }, 5, '别的大学')).toBeNull(); // 没有这一条
  });

  it('没认出的字段存成“其他信息”，同名的更新', () => {
    const p = sampleProfile();
    const a = saveAnswer(p, { label: '宿舍楼号', path: null }, undefined, '12 号楼')!;
    expect(a.where).toBe('custom');
    expect(a.profile.custom.at(-1)).toMatchObject({ label: '宿舍楼号', value: '12 号楼' });
    const b = saveAnswer(a.profile, { label: '宿舍楼号：', path: null }, undefined, '13 号楼')!;
    expect(b.profile.custom.filter((f) => f.label === '宿舍楼号')).toEqual([expect.objectContaining({ value: '13 号楼' })]);
    expect(saveAnswer(p, { label: '宿舍楼号', path: null }, undefined, '  ')).toBeNull();
  });

  it('存成“其他信息”后，下次同名字段直接填', async () => {
    document.body.innerHTML = PAGE;
    const p = saveAnswer(sampleProfile(), { label: '宿舍楼号', path: null }, undefined, '12 号楼')!.profile;
    const { report } = await runFill(document, p);
    expect(report.items.find((i) => i.label === '宿舍楼号')).toMatchObject({ status: 'ok', value: '12 号楼' });
  });
});

describe('缺信息询问：AI 结果里的【待补充】', () => {
  const text = '负责订单服务，接口延迟降低了【待补充：降低了多少】。\n参与压测【待补充】，覆盖【待补充：几个服务】。';

  it('找出每一处，带上前面的几个字', () => {
    const gaps = findGaps(text);
    expect(gaps.map((g) => g.hint)).toEqual(['降低了多少', '', '几个服务']);
    expect(gaps[0]!.before).toBe('负责订单服务，接口延迟降低了');
    expect(gaps[2]!.before).toBe('参与压测…，覆盖');
  });

  it('补上或删掉之后才算处理完', () => {
    expect(gapsLeft(text, {})).toBe(3);
    const answers = { 0: '30%', 1: false as const, 2: ' ' };
    expect(fillGaps(text, answers)).toBe('负责订单服务，接口延迟降低了30%。\n参与压测，覆盖【待补充：几个服务】。');
    expect(gapsLeft(text, answers)).toBe(1);
    expect(gapsLeft(text, { ...answers, 2: '3 个' })).toBe(0);
    expect(findGaps('没有缺的')).toEqual([]);
  });
});
