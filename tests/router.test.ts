import { describe, expect, it } from 'vitest';
import { CHAT_SKILLS, systemPrompt } from '../src/lib/ai/chatSkills';
import { routeByKeywords, routeQuestion } from '../src/lib/ai/router';

describe('自动选技能', () => {
  it.each(CHAT_SKILLS.filter((s) => s.id !== 'general').flatMap((s) => s.examples.map((q) => [s.id, q] as const)))(
    '%s：%s', (id, q) => {
      const hits = routeByKeywords(q).map((s) => s.id);
      expect(hits).toContain(id);
    },
  );

  it('关键词只命中一个时不调用模型', async () => {
    const ep = { baseUrl: 'http://invalid', model: 'm', apiKey: 'k', name: 'x' };
    const r = await routeQuestion(ep, '帮我写一个 1 分钟面试自我介绍');
    expect(r).toMatchObject({ by: 'keyword', skill: { id: 'self-intro' } });
  });

  it('短追问沿用上一轮的技能；模型不可用时退回通用问答', async () => {
    const ep = { baseUrl: 'http://127.0.0.1:9', model: 'm', apiKey: 'k', name: 'x' };
    expect(await routeQuestion(ep, '再短一点', 'self-intro')).toMatchObject({ by: 'keep', skill: { id: 'self-intro' } });
    expect(await routeQuestion(ep, '今天天气不错我们聊聊人生规划以外的事情吧好不好呀朋友们大家好')).toMatchObject({ by: 'fallback', skill: { id: 'general' } });
  });

  it('需要经历的技能才带简历，且都带着通用原则', () => {
    const s = CHAT_SKILLS.find((x) => x.id === 'written-test')!;
    expect(s.needsResume).toBe(false);
    expect(systemPrompt(s, null)).toContain('不帮助作弊');
  });
});
