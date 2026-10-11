import { chat } from './client';
import { aiSettingsItem, endpointOf } from './settings';
import { extractJson, type Skill } from './skills/index';

/** 用当前 AI 设置运行一个技能 */
export async function runSkill<I, O>(skill: Skill<I, O>, input: I, signal?: AbortSignal): Promise<O> {
  const ep = endpointOf(await aiSettingsItem.getValue());
  if ('error' in ep) throw new Error(ep.error);
  const text = await chat(ep, skill.build(input), { temperature: skill.temperature, signal, json: true });
  return skill.parse(extractJson(text), input);
}
