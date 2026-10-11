import { BASE_RULES, countChars, objs, str, type Skill } from './index';

// 技能：网申开放题。先判断题型，再按题型的结构写，严格控制字数。

export interface OpenQInput { question: string; limit: number; company: string; jd: string; resume: string }
export interface OpenQVersion { angle: string; text: string; chars: number; over: boolean }
export interface OpenQResult { type: string; plan: string; versions: OpenQVersion[] }

const METHOD = `你是校招网申文书专家。先判断题型，再按对应结构写：
- 求职动机（为什么选择我们/这个岗位）：公司或业务的具体吸引点 → 自己的相关经历和能力 → 能带来的价值，避免空泛夸公司。
- 成就经历（最有成就感/最自豪的事）：STAR，突出个人行动和可量化结果。
- 挫折失败（遇到的困难/失败）：真实的困难 → 分析原因 → 采取的行动 → 反思和成长，结尾落到成长。
- 团队合作/领导力：具体情境、自己的角色、如何协调分歧、结果。
- 职业规划：短期（1–2 年）学什么、做到什么；中长期方向，和公司发展结合。
- 自我介绍/优缺点：用经历支撑每个特点；缺点要真实且说明在改进。
- 其他题型：先正面回答问题，再用一段经历支撑。
写作要求：第一人称，具体，有细节；只用简历里的经历；不写套话（如“我对贵公司仰慕已久”）；每个版本必须在字数上限以内（按去掉空格后的字数计算），尽量用到上限的 80%–95%。`;

const FORMAT = `输出 JSON：
{"type": "题型", "plan": "一句话说明怎么答",
 "versions": [{"angle": "这个版本的切入角度（选用哪段经历）", "text": "正文"}]}
给 3 个版本，分别选用不同的经历或角度。`;

export const openQuestionSkill: Skill<OpenQInput, OpenQResult> = {
  id: 'open-question',
  name: '开放题写作',
  temperature: 0.8,
  build: (i) => [
    { role: 'system', content: `${BASE_RULES}\n\n${METHOD}\n\n${FORMAT}` },
    {
      role: 'user',
      content: [
        `题目：${i.question}`,
        `字数上限：${i.limit > 0 ? `${i.limit} 字` : '没有限制，控制在 300 字左右'}`,
        i.company && `公司/岗位：${i.company}`,
        i.jd && `岗位描述：\n${i.jd}`,
        `候选人简历：\n${i.resume}`,
      ].filter(Boolean).join('\n\n'),
    },
  ],
  parse: (raw, input) => {
    const r = (raw ?? {}) as Record<string, unknown>;
    const versions = objs(r.versions, 3).map((v) => {
      const text = str(v.text, 5000);
      const chars = countChars(text);
      return { angle: str(v.angle, 60), text, chars, over: input.limit > 0 && chars > input.limit };
    }).filter((v) => v.text);
    if (!versions.length) throw new Error('AI 没有写出答案，请再试一次。');
    return { type: str(r.type, 20), plan: str(r.plan, 200), versions };
  },
};
