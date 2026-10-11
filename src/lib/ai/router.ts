import { chat, type ChatMessage } from './client';
import { CHAT_SKILLS, skillById, type ChatSkill } from './chatSkills';
import type { Endpoint } from './settings';
import { extractJson } from './skills/index';

// 自动选技能：先按关键词选（不花钱、不发送任何内容），选不出或有多个时再让模型判断。
// 让模型判断时只发用户的问题，不发档案。

export interface Route { skill: ChatSkill; by: 'keyword' | 'ai' | 'keep' | 'fallback' }

/** skills：可用的技能（用户在技能设置里关掉的不算） */
export function routeByKeywords(question: string, skills: ChatSkill[] = CHAT_SKILLS): ChatSkill[] {
  return skills.filter((s) => s.id !== 'general' && s.keywords.test(question));
}

const routerPrompt = (skills: ChatSkill[]) => `你是一个分类器。根据大学生的求职问题，从下面的技能里选一个最合适的，只输出 JSON：{"skill": "技能 id"}。
${skills.map((s) => `- ${s.id}：${s.desc}`).join('\n')}`;

export async function routeQuestion(ep: Endpoint, question: string, previous?: string, signal?: AbortSignal,
  skills: ChatSkill[] = CHAT_SKILLS): Promise<Route> {
  const pick = (id: string) => skills.find((s) => s.id === id);
  const hits = routeByKeywords(question, skills);
  if (hits.length === 1) return { skill: hits[0]!, by: 'keyword' };
  // 追问（很短、没有命中关键词）沿用上一轮的技能
  const prev = previous ? pick(previous) : undefined;
  if (!hits.length && prev && question.length <= 30) return { skill: prev, by: 'keep' };
  try {
    const msgs: ChatMessage[] = [
      { role: 'system', content: routerPrompt(skills) },
      { role: 'user', content: `${prev ? `（上一轮用的技能：${prev.id}）\n` : ''}${question.slice(0, 1500)}` },
    ];
    const raw = extractJson(await chat(ep, msgs, { temperature: 0, signal, json: true })) as { skill?: string };
    const s = pick(raw?.skill ?? '');
    if (s) return { skill: s, by: 'ai' };
  } catch (e) {
    if (signal?.aborted) throw e;
  }
  return { skill: hits[0] ?? prev ?? skillById('general')!, by: 'fallback' };
}
