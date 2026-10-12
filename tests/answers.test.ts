import { describe, expect, it } from 'vitest';
import { answerAdaptSkill } from '../src/lib/ai/skills/answerAdapt';
import {
  addAnswer, markUsed, mergeAnswers, norm, questionType, removeAnswer, searchAnswers, similarAnswers, similarity, updateAnswer,
  type AnswerStore,
} from '../src/lib/answers/library';
import { answerCandidates, cardEntry } from '../src/lib/fill/card';
import { ANSWER_NOTE, fillFromCandidate, runFill } from '../src/lib/fill/fill';
import { exportBackup, parseBackup } from '../src/lib/profile/io';
import { sampleProfile } from './fixtures/profile';

// 计划书 L4：常用回答库。相似题在本地算，不发送；AI 改写只发这一条旧回答。

const EMPTY: AnswerStore = { version: 1, items: [] };
const lib = (...qs: [string, string, string?][]) => qs.reduce((s, [question, text, company]) => addAnswer(s, { question, text, company }), EMPTY);

describe('回答库：存取', () => {
  it('新的在前；同题同答案不重复存；空的不存', () => {
    let s = lib(['为什么选择我们', '因为……']);
    s = addAnswer(s, { question: '为什么选择我们？', text: '因为…… ' });
    s = addAnswer(s, { question: '', text: 'x' });
    expect(s.items).toHaveLength(1);
    s = addAnswer(s, { question: '最有成就感的事', text: '那次比赛……' });
    expect(s.items.map((a) => a.question)).toEqual(['最有成就感的事', '为什么选择我们']);
  });

  it('编辑、删除、记用过几次、搜索', () => {
    let s = lib(['为什么选择我们', '看好新能源', '华润电力'], ['最有成就感的事', '那次比赛']);
    const id = s.items[0]!.id;
    s = updateAnswer(s, id, { text: '那次数学建模比赛' });
    s = markUsed(markUsed(s, id), id);
    expect(s.items[0]).toMatchObject({ text: '那次数学建模比赛', uses: 2 });
    expect(searchAnswers(s.items, '华润').map((a) => a.question)).toEqual(['为什么选择我们']);
    expect(removeAnswer(s, id).items).toHaveLength(1);
  });

  it('导入备份按内容去重，坏数据跳过；旧备份没有回答库也能导入', () => {
    const s = lib(['为什么选择我们', '看好新能源']);
    const m = mergeAnswers(s, [{ question: '为什么选择我们', text: '看好新能源' }, { question: '职业规划', text: '先……' }, { text: '没有题目' }, 42]);
    expect(m.added).toBe(1);
    expect(m.store.items).toHaveLength(2);

    const file = exportBackup([sampleProfile()], [], m.store.items);
    const r = parseBackup(file);
    expect(r.ok && r.answers).toHaveLength(2);
    const old = parseBackup(JSON.stringify({ app: 'wangshen-helper', schemaVersion: 1, profiles: [sampleProfile()] }));
    expect(old.ok && old.answers).toEqual([]);
  });
});

describe('回答库：相似题', () => {
  it('题目去掉字数要求和客套话', () => {
    expect(norm('请简要描述你为什么选择我们公司？（500字以内）')).toBe('你为什么选择我们公司');
    expect(questionType('你最有成就感的一件事')).toBe('成就经历');
    expect(questionType('请描述一次失败的经历')).toBe('挫折失败');
    expect(questionType('你的职业规划是什么')).toBe('职业规划');
  });

  it('同类题能找出来，最像的在前；不相关的不列', () => {
    const s = lib(
      ['你为什么选择加入华润电力？', '看好新能源……'],
      ['描述一次你遇到困难并最终解决的经历', '那次项目……'],
      ['你的职业规划', '先……'],
      ['你的兴趣爱好', '跑步'],
    );
    const hit = (q: string) => similarAnswers(q, s.items).map((x) => x.answer.question);
    expect(hit('为什么选择我们公司（300字）')[0]).toBe('你为什么选择加入华润电力？');
    expect(hit('请分享一段你克服挫折的经历')[0]).toBe('描述一次你遇到困难并最终解决的经历');
    expect(hit('未来三到五年的职业发展规划')[0]).toBe('你的职业规划');
    expect(hit('期望薪资')).toEqual([]);
    expect(hit('')).toEqual([]);
    expect(similarity('为什么选择我们', '为什么选择我们')).toBeCloseTo(1);
  });
});

describe('回答库：AI 改写', () => {
  it('只发新题和这一条旧回答，不发档案', () => {
    const p = sampleProfile();
    const msgs = answerAdaptSkill.build({
      question: '为什么选择我们', limit: 300, company: '转转', oldQuestion: '为什么选择华润', oldText: '看好新能源', oldCompany: '华润电力',
    });
    const text = msgs.map((m) => m.content).join('\n');
    expect(text).toContain('看好新能源');
    expect(text).toContain('旧回答写给：华润电力');
    expect(text).toContain('300 字');
    for (const secret of [p.basic.name, p.basic.phone, p.education[0]!.school]) expect(text).not.toContain(secret);
  });

  it('按字数核对，没写出答案就报错', () => {
    const input = { question: 'q', limit: 5, company: '', oldQuestion: 'q', oldText: 't', oldCompany: '' };
    expect(answerAdaptSkill.parse({ text: '一二三 四五六', changes: ['换了公司名'] }, input)).toMatchObject({ chars: 6, over: true, changes: ['换了公司名'] });
    expect(() => answerAdaptSkill.parse({ text: '' }, input)).toThrow();
  });
});

describe('回答库：网申页面上的候选卡', () => {
  const PAGE = `
    <form>
      <label>姓名 <input name="n"></label>
      <label>请简述你为什么选择我们公司（500字以内） <textarea name="why"></textarea></label>
      <label>宿舍楼号 <input name="dorm"></label>
    </form>`;

  it('问答题里列出相似题的旧回答，排在档案值前面；单行文本框不列', async () => {
    document.body.innerHTML = PAGE;
    const p = sampleProfile();
    const s = lib(['你为什么选择加入华润电力？', '看好新能源……', '华润电力'], ['你的兴趣爱好', '跑步']);
    const { entries } = await runFill(document, p);
    const why = document.querySelector('[name=why]')!;
    const hit = cardEntry(entries, why, p, s.items)!;
    expect(hit.list[0]).toMatchObject({ path: `answer:${s.items[1]!.id}`, value: '看好新能源……' });
    expect(hit.list[0]!.label).toContain('写给华润电力');
    expect(hit.list.some((c) => c.value === '跑步')).toBe(false);
    const dorm = entries.find((e) => e.control.el === document.querySelector('[name=dorm]'))!;
    expect(answerCandidates(dorm, s.items)).toEqual([]);
  });

  it('填进去的旧回答标黄，提醒按这家公司改', async () => {
    document.body.innerHTML = PAGE;
    const p = sampleProfile();
    const { entries } = await runFill(document, p);
    const e = entries.find((x) => x.control.el === document.querySelector('[name=why]'))!;
    const item = await fillFromCandidate(e, 'answer:a1', '看好新能源……');
    expect(item).toMatchObject({ status: 'warn', note: ANSWER_NOTE, value: '看好新能源……' });
    expect(document.querySelector<HTMLTextAreaElement>('[name=why]')!.value).toBe('看好新能源……');
  });
});
