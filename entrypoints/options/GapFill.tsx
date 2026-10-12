import { CircleHelp, X } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { iconProps } from '@/src/components/icon';
import { fillGaps, findGaps, gapsLeft, type GapAnswers } from '@/src/lib/ai/gaps';

// 计划书 L6：AI 结果里的【待补充】逐个问你。补上或删掉之前，不能写回档案、存进回答库。

export function GapFill({ text, children }: { text: string; children: (filled: string, left: number) => ReactNode }) {
  const [answers, setAnswers] = useState<GapAnswers>({});
  const gaps = findGaps(text);
  const filled = fillGaps(text, answers);
  const left = gapsLeft(text, answers);
  const set = (n: number, v: string | false) => setAnswers((a) => ({ ...a, [n]: v }));
  return (
    <>
      {children(filled, left)}
      <p className="pre">{filled}</p>
      {gaps.length > 0 && (
        <div className="gaps stack" role="group" aria-label="AI 缺的信息">
          <p className="small row" style={{ margin: 0, gap: 6 }}><CircleHelp {...iconProps} aria-hidden />
            {left ? `AI 缺 ${left} 处信息，没有替你编。补上真实情况，没有就删掉：` : '缺的信息都处理好了。'}</p>
          {gaps.map((g) => answers[g.n] === false ? null : (
            <div key={g.n} className="gap row">
              <span className="small muted gap-before" title={g.before}>…{g.before}</span>
              <input className="input" aria-label={g.hint || '待补充'} placeholder={g.hint || '待补充'}
                value={typeof answers[g.n] === 'string' ? answers[g.n] as string : ''} onChange={(e) => set(g.n, e.target.value)} />
              <button className="btn btn-text small" onClick={() => set(g.n, false)} title="没有这项信息，删掉这一处"><X {...iconProps} /> 删掉</button>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

/** 有没答的【待补充】时，写回、存起来的按钮旁边的提示 */
export const GapBlock = ({ left }: { left: number }) =>
  left ? <span className="small text-err">先补上 {left} 处再存</span> : null;
