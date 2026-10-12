// 计划书 L6：AI 写的东西里缺信息时，提示词要求它用【待补充：说明】标出来，不许编。
// 这里把这些标记找出来逐个问用户；用户补上或决定删掉之前，结果不能写回档案或存进回答库。

const GAP = /【待补充(?:[:：]\s*([^】]*))?】/g;

export interface Gap {
  /** 第几处（从 0 开始） */
  n: number;
  /** AI 写的说明，如“提升了多少” */
  hint: string;
  /** 前面的几个字，让用户知道是哪里 */
  before: string;
}

/** 用户的回答：字符串是补上的内容，false 是删掉这一处，没有就是还没答 */
export type GapAnswers = Record<number, string | false>;

export function findGaps(text: string): Gap[] {
  const out: Gap[] = [];
  let n = 0;
  for (const m of text.matchAll(GAP)) {
    const start = m.index ?? 0;
    const before = text.slice(Math.max(0, start - 14), start).split('\n').at(-1)!.replace(GAP, '…');
    out.push({ n: n++, hint: (m[1] ?? '').trim(), before });
  }
  return out;
}

export function fillGaps(text: string, answers: GapAnswers): string {
  let n = 0;
  return text.replace(GAP, (raw) => {
    const a = answers[n++];
    if (a === false) return '';
    return a && a.trim() ? a.trim() : raw;
  });
}

/** 还有几处没答 */
export const gapsLeft = (text: string, answers: GapAnswers) =>
  findGaps(text).filter((g) => answers[g.n] === undefined || (answers[g.n] !== false && !String(answers[g.n]).trim())).length;
