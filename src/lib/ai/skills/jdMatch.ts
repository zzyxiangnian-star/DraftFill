import { BASE_RULES, num, objs, oneOf, str, strs, type Skill } from './index';

// 技能：岗位分析。拆解 JD，再和简历逐条对照。

export interface JdInput { jd: string; resume: string }
export interface JdRequirement { item: string; kind: '硬性' | '职责' | '加分'; status: '已覆盖' | '弱覆盖' | '未覆盖'; evidence: string }
export interface JdResult {
  score: number | null;
  summary: string;
  position: string;
  /** 可能直接被筛掉的地方（学历、专业、到岗时间等硬门槛） */
  risks: string[];
  requirements: JdRequirement[];
  keywords: string[];
  missingKeywords: string[];
  highlight: { experience: string; why: string }[];
  suggestions: string[];
}

const METHOD = `你是资深招聘分析师。分两步：
第一步，拆解岗位描述（JD）：分成硬性要求（学历、专业、技能、证书、到岗时间、实习时长等）、核心职责、加分项，提取 HR 和简历筛选系统会搜的关键词，找出可能直接淘汰的硬门槛。
第二步，和候选人简历逐条对照：每条判断“已覆盖/弱覆盖/未覆盖”，并引用简历里的依据；没有依据就是未覆盖，不要替候选人脑补。弱覆盖指有相关经历但没写清楚，可以通过改写补强。
最后给出：最该突出的经历（为什么、怎么写），简历里缺的关键词（只列候选人从经历看可能具备的，不鼓励硬凑），以及具体可执行的修改建议。`;

const FORMAT = `输出 JSON：
{"score": 0到100的整数（匹配度）,
 "position": "岗位名称",
 "summary": "一两句话的结论",
 "risks": ["可能直接被筛掉的硬门槛，没有就给空数组"],
 "requirements": [{"item": "要求", "kind": "硬性|职责|加分", "status": "已覆盖|弱覆盖|未覆盖", "evidence": "简历里的依据或缺什么"}],
 "keywords": ["JD 关键词，最多 12 个"],
 "missingKeywords": ["简历里没有出现、但候选人可能具备、值得补上的关键词"],
 "highlight": [{"experience": "经历名称", "why": "为什么要突出、怎么写"}],
 "suggestions": ["具体修改建议，最多 5 条"]}`;

export const jdMatchSkill: Skill<JdInput, JdResult> = {
  id: 'jd-match',
  name: '岗位分析',
  temperature: 0.2,
  build: ({ jd, resume }) => [
    { role: 'system', content: `${BASE_RULES}\n\n${METHOD}\n\n${FORMAT}` },
    { role: 'user', content: `岗位描述：\n${jd}\n\n候选人简历：\n${resume}` },
  ],
  parse: (raw) => {
    const r = (raw ?? {}) as Record<string, unknown>;
    return {
      score: num(r.score),
      summary: str(r.summary, 300),
      position: str(r.position, 60),
      risks: strs(r.risks, 4),
      requirements: objs(r.requirements, 16).map((x) => ({
        item: str(x.item, 120),
        kind: oneOf(x.kind, ['硬性', '职责', '加分'] as const, '硬性'),
        status: oneOf(x.status, ['已覆盖', '弱覆盖', '未覆盖'] as const, '未覆盖'),
        evidence: str(x.evidence, 300),
      })).filter((x) => x.item),
      keywords: strs(r.keywords, 12, 30),
      missingKeywords: strs(r.missingKeywords, 10, 30),
      highlight: objs(r.highlight, 3).map((x) => ({ experience: str(x.experience, 60), why: str(x.why, 300) })).filter((x) => x.experience),
      suggestions: strs(r.suggestions, 5),
    };
  },
};
