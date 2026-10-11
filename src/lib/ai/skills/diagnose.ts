import { BASE_RULES, num, objs, oneOf, str, strs, type Skill } from './index';

// 技能：简历诊断。按国内校招 HR 初筛的标准逐条检查。

export interface DiagnoseInput { resume: string; target: string }
export interface DiagnoseIssue { level: '高' | '中' | '低'; where: string; problem: string; fix: string }
export interface DiagnoseResult {
  score: number | null;
  /** 分项分：HR 10 秒印象、可信度、数据深度、面试准备度 */
  scores: { name: string; score: number | null }[];
  summary: string;
  strengths: string[];
  issues: DiagnoseIssue[];
  missing: string[];
  /** 面试官看了这份简历最可能追问的问题 */
  followUps: string[];
}

const RUBRIC = `你是有 10 年经验的校招 HR 和简历顾问。按以下标准诊断简历：
- 相关性：经历和目标岗位是否相关，最相关的是否放在前面。
- 结果导向：每段经历有没有写清做了什么、怎么做、结果如何（STAR），有没有可量化的结果。
- 表达：是否用“负责、主导、搭建、优化”等有力动词开头；有没有“参与了一些、协助完成”这类空泛表述；有没有错别字、口语化。
- 完整性：教育信息（学校、专业、学历、时间、GPA/排名）、技能证书是否齐全；校招常看的实习、项目、学生工作、获奖是否有。
- 证据可信度：数字和成果有没有来源，个人贡献和团队成果是否分得清，会不会被面试官一问就露怯。
- 成果层级：写的是“做了事”还是“带来了结果”。
- 篇幅：一页以内，要点是否过长或过短。`;

const FORMAT = `输出 JSON：
{"score": 0到100的整数（HR 初筛通过的可能性）,
 "scores": [{"name": "HR 10 秒印象", "score": 0到100}, {"name": "可信度", "score": 0到100}, {"name": "数据深度", "score": 0到100}, {"name": "面试准备度", "score": 0到100}],
 "summary": "一两句话的总体评价",
 "strengths": ["亮点，最多 4 条"],
 "issues": [{"level": "高|中|低", "where": "哪段经历或哪一部分", "problem": "具体问题", "fix": "具体怎么改，能给出改写示例就给"}],
 "missing": ["建议补充的内容，最多 4 条"],
 "followUps": ["面试官看到这份简历最可能追问的问题（追问数字怎么来的、个人具体做了什么、方法细节），最多 5 条"]}
issues 按严重程度从高到低，最多 8 条，只写真正影响筛选的问题。`;

export const diagnoseSkill: Skill<DiagnoseInput, DiagnoseResult> = {
  id: 'diagnose',
  name: '简历诊断',
  temperature: 0.3,
  build: ({ resume, target }) => [
    { role: 'system', content: `${BASE_RULES}\n\n${RUBRIC}\n\n${FORMAT}` },
    { role: 'user', content: `目标岗位：${target || '（没有指定，按简历里的求职意向判断）'}\n\n简历：\n${resume}` },
  ],
  parse: (raw) => {
    const r = (raw ?? {}) as Record<string, unknown>;
    return {
      score: num(r.score),
      scores: objs(r.scores, 4).map((x) => ({ name: str(x.name, 20), score: num(x.score) })).filter((x) => x.name),
      summary: str(r.summary, 300),
      strengths: strs(r.strengths, 4),
      issues: objs(r.issues, 8).map((x) => ({
        level: oneOf(x.level, ['高', '中', '低'] as const, '中'),
        where: str(x.where, 60), problem: str(x.problem, 300), fix: str(x.fix, 600),
      })).filter((x) => x.problem),
      missing: strs(r.missing, 4),
      followUps: strs(r.followUps, 5),
    };
  },
};
