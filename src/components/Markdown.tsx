import type { ReactNode } from 'react';

// AI 回答的简易 Markdown 渲染：标题、列表、加粗、行内代码、段落。只生成 React 元素，不用 innerHTML。

function inline(text: string): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /\*\*([^*]+)\*\*|`([^`]+)`/g;
  let last = 0;
  for (let m = re.exec(text); m; m = re.exec(text)) {
    if (m.index > last) out.push(text.slice(last, m.index));
    out.push(m[1] !== undefined ? <strong key={m.index}>{m[1]}</strong> : <code key={m.index}>{m[2]}</code>);
    last = re.lastIndex;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

export function Markdown({ text }: { text: string }) {
  const blocks: ReactNode[] = [];
  const lines = text.replace(/\r/g, '').split('\n');
  let list: { ordered: boolean; items: string[] } | null = null;
  let para: string[] = [];
  const flushPara = () => { if (para.length) blocks.push(<p key={blocks.length}>{inline(para.join(' '))}</p>); para = []; };
  const flushList = () => {
    if (!list) return;
    const items = list.items.map((x, i) => <li key={i}>{inline(x)}</li>);
    blocks.push(list.ordered ? <ol key={blocks.length}>{items}</ol> : <ul key={blocks.length}>{items}</ul>);
    list = null;
  };
  for (const raw of lines) {
    const line = raw.trimEnd();
    const h = /^#{1,4}\s+(.*)$/.exec(line);
    const ul = /^\s*[-*•]\s+(.*)$/.exec(line);
    const ol = /^\s*\d{1,2}[.、)]\s+(.*)$/.exec(line);
    if (h) { flushPara(); flushList(); blocks.push(<h4 key={blocks.length}>{inline(h[1]!.replace(/\*\*/g, ''))}</h4>); }
    else if (ul || ol) {
      flushPara();
      const ordered = !!ol;
      if (list && list.ordered !== ordered) flushList();
      list ??= { ordered, items: [] };
      list.items.push((ul ?? ol)![1]!);
    } else if (!line.trim()) { flushPara(); flushList(); }
    else if (list && /^\s{2,}/.test(raw)) list.items[list.items.length - 1] += ` ${line.trim()}`;
    else { flushList(); para.push(line.trim()); }
  }
  flushPara();
  flushList();
  return <div className="md">{blocks}</div>;
}
