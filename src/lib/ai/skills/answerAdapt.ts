import { BASE_RULES, countChars, str, strs, type Skill } from './index';

// 计划书 L4：回答库里的旧回答按新题改写。只发新题、字数上限、目标公司和这一条旧回答（发送前抹掉个人信息），
// 不发档案；只能用旧回答里写过的经历，原来写给别的公司的说法要换掉。

export interface AdaptInput {
  question: string;
  limit: number;
  /** 这次投的公司和岗位（可空） */
  company: string;
  oldQuestion: string;
  oldText: string;
  /** 旧回答写给的公司（可空） */
  oldCompany: string;
}

export interface AdaptResult { text: string; chars: number; over: boolean; changes: string[] }

const METHOD = `任务：用户以前为另一道网申题写过一篇回答，现在遇到一道相似的新题。把旧回答改写成新题的回答。
规则：
1. 只能使用旧回答里写过的经历和事实，不新增经历、数字、奖项。新题需要而旧回答没有的内容，用【待补充：说明】标出。
2. 先正面回答新题，再用旧回答里的经历支撑；和新题无关的段落删掉。
3. 旧回答里提到的原公司名、原岗位、对原公司的评价，换成新公司（没给新公司就改成不点名的说法），不要留下原公司的痕迹。
4. 必须在字数上限以内（按去掉空格后的字数计算），尽量用到上限的 80%–95%。
输出 JSON：{"text": "改写后的回答", "changes": ["改了哪些地方，最多 4 条，每条一句话"]}`;

export const answerAdaptSkill: Skill<AdaptInput, AdaptResult> = {
  id: 'answer-adapt',
  name: '回答改写',
  temperature: 0.5,
  build: (i) => [
    { role: 'system', content: `${BASE_RULES}\n\n${METHOD}` },
    {
      role: 'user',
      content: [
        `新题目：${i.question}`,
        `字数上限：${i.limit > 0 ? `${i.limit} 字` : '没有限制，和旧回答差不多长'}`,
        `这次投的公司和岗位：${i.company || '（未填，改成不点名的说法）'}`,
        `旧题目：${i.oldQuestion}`,
        i.oldCompany && `旧回答写给：${i.oldCompany}`,
        `旧回答：\n${i.oldText}`,
      ].filter(Boolean).join('\n\n'),
    },
  ],
  parse: (raw, input) => {
    const r = (raw ?? {}) as Record<string, unknown>;
    const text = str(r.text, 5000);
    if (!text) throw new Error('AI 没有写出答案，请再试一次。');
    const chars = countChars(text);
    return { text, chars, over: input.limit > 0 && chars > input.limit, changes: strs(r.changes, 4, 200) };
  },
};
