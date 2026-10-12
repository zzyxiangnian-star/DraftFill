import { BASE_RULES, countChars, objs, str, type Skill } from './index';

// 「AI 帮我填完」第三步：档案里没有对应项的问题（公司自己加的开放题、“从哪里了解到我们”这类选择题），
// 让 AI 依据去掉个人信息的简历回答。只发页面上的题目和选项，不截图、不发页面上已经填好的内容。
// 回答一律标黄；缺信息的地方 AI 用【待补充：说明】标出，不许编。

export interface PageQuestion {
  /** 本次填写里的序号 */
  id: number;
  question: string;
  kind: 'text' | 'textarea' | 'choice';
  options: string[];
  /** 字数上限，页面没写就是 0 */
  limit: number;
}

export interface PageQuestionsInput {
  questions: PageQuestion[];
  company: string;
  /** 已去掉姓名、电话、邮箱、证件号的简历正文 */
  resume: string;
}

export interface QuestionAnswer { id: number; answer: string }

/** 只有本人知道、或者不该交给 AI 的题：留给用户自己填 */
export const PERSONAL = /姓名|名字|电话|手机|邮箱|身份证|证件|护照|住址|地址|家庭|父亲|母亲|配偶|紧急联系|银行|账号|账户|密码|宿舍|学号|工号|微信|QQ|籍贯|户口|出生|年龄|身高|体重|血型|婚|健康|病|残疾|薪|工资|期望月薪|推荐人|内推码/;

const METHOD = `任务：网申页面上有一些问题，候选人的档案里没有现成答案。请依据候选人简历回答。
规则：
1. 文本题：正面回答，第一人称，简洁具体，只用简历里的经历。字数不超过上限（没写上限的短文本题 50 字内，多行文本题 200 字左右）。
2. 需要简历里没有的事实（具体数字、时间、个人情况）时，用【待补充：说明】标出，不要编。
3. 选择题：只能从给出的选项里原样选一个；看不出该选哪个就输出 null。
4. 涉及个人隐私或只有本人知道的问题（家庭、健康、薪资、证件、联系方式、是否有亲属在本公司等）一律输出 null。
只输出 JSON：{"answers":[{"id":序号,"answer":"回答或 null"}]}，不要输出别的文字。`;

const KIND_NAMES = { text: '短文本', textarea: '多行文本', choice: '选择题' } as const;

function describeQ(q: PageQuestion): string {
  const parts = [`${q.id}. ${q.question}（${KIND_NAMES[q.kind]}`];
  if (q.limit > 0) parts.push(`，不超过 ${q.limit} 字`);
  parts.push('）');
  if (q.options.length) parts.push(` 选项：${q.options.slice(0, 20).join(' / ')}`);
  return parts.join('');
}

export const pageQuestionsSkill: Skill<PageQuestionsInput, QuestionAnswer[]> = {
  id: 'page-questions',
  name: '回答网申页面上的问题',
  temperature: 0.4,
  build: ({ questions, company, resume }) => [
    { role: 'system', content: `${BASE_RULES}\n\n${METHOD}` },
    {
      role: 'user',
      content: [
        company && `公司/岗位：${company}`,
        `候选人简历：\n${resume}`,
        `问题：\n${questions.map(describeQ).join('\n')}`,
      ].filter(Boolean).join('\n\n'),
    },
  ],
  parse: (raw, { questions }) => {
    const r = (raw ?? {}) as Record<string, unknown>;
    const byId = new Map(questions.map((q) => [q.id, q]));
    const out: QuestionAnswer[] = [];
    for (const a of objs(r.answers, 100)) {
      const q = byId.get(Number(a.id));
      const answer = str(a.answer, 3000);
      if (!q || !answer || answer === 'null' || out.some((x) => x.id === q.id) || PERSONAL.test(q.question)) continue;
      if (q.kind === 'choice' && !q.options.includes(answer)) continue;
      if (q.limit > 0 && countChars(answer) > q.limit) continue;
      out.push({ id: q.id, answer });
    }
    return out;
  },
};
