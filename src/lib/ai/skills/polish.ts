import { BASE_RULES, objs, str, strs, type Skill } from './index';

// 技能：经历润色。按 STAR 改写一段经历描述，不改事实。

export interface PolishInput {
  kind: '实习' | '项目' | '校园经历';
  title: string;
  role: string;
  description: string;
  target: string;
}
export interface PolishVersion { style: string; text: string }
export interface PolishResult { versions: PolishVersion[]; tips: string[] }

const METHOD = `你是简历润色专家。把用户的一段经历改写成校招简历上的要点：
- 按 STAR：背景/任务一句带过，重点写“做了什么、怎么做（方法、工具）、结果”。
- 每条要点以有力的动词开头（负责、主导、设计、搭建、优化、推动、分析……），一条一行，用“1. 2. 3.”编号。
- 原文有数字就保留并放到显眼位置；原文没有的数字绝不能编，在需要数字的地方写【待补充：例如提升了多少】。
- 和目标岗位相关的技能、关键词优先写在前面。
- 不改变事实：公司、项目、职责、用到的技术都以原文为准。`;

const FORMAT = `输出 JSON：
{"versions": [
  {"style": "精炼版", "text": "3 条以内，每条不超过 40 字"},
  {"style": "详细版", "text": "4 到 5 条，每条不超过 60 字"}],
 "tips": ["还可以补充哪些信息让这段经历更有说服力，最多 3 条"]}`;

export const polishSkill: Skill<PolishInput, PolishResult> = {
  id: 'polish',
  name: '经历润色',
  temperature: 0.5,
  build: (i) => [
    { role: 'system', content: `${BASE_RULES}\n\n${METHOD}\n\n${FORMAT}` },
    { role: 'user', content: `目标岗位：${i.target || '（未指定）'}\n经历类型：${i.kind}\n名称：${i.title}\n角色/职位：${i.role || '（未写）'}\n原文描述：\n${i.description}` },
  ],
  parse: (raw) => {
    const r = (raw ?? {}) as Record<string, unknown>;
    const versions = objs(r.versions, 3).map((v) => ({ style: str(v.style, 20) || '改写', text: str(v.text, 1500) })).filter((v) => v.text);
    if (!versions.length) throw new Error('AI 没有给出改写结果，请再试一次。');
    return { versions, tips: strs(r.tips, 3) };
  },
};
