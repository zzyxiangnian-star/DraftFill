// PDF 文字块 → 按行拼好的文字。PDF 里每个字或词是一个带坐标的块，同一高度的块拼成一行。

export interface TextItem {
  str: string;
  /** pdf.js 的变换矩阵，[4] 是 x，[5] 是 y（越大越靠上） */
  transform: number[];
  width: number;
  height: number;
}

export function itemsToLines(items: TextItem[]): string[] {
  const rows: { y: number; h: number; items: TextItem[] }[] = [];
  for (const it of items) {
    if (!it.str.trim()) continue;
    const y = it.transform[5] ?? 0;
    const h = Math.abs(it.height || it.transform[3] || 10);
    const row = rows.find((r) => Math.abs(r.y - y) <= Math.max(2, Math.min(r.h, h) * 0.4));
    if (row) row.items.push(it); else rows.push({ y, h, items: [it] });
  }
  rows.sort((a, b) => b.y - a.y);
  return rows.map((r) => {
    const sorted = r.items.sort((a, b) => (a.transform[4] ?? 0) - (b.transform[4] ?? 0));
    let line = '';
    let lastEnd: number | null = null;
    for (const it of sorted) {
      const x = it.transform[4] ?? 0;
      // 两块之间空得多（超过一个字宽），说明是表格的另一栏，用两个空格隔开
      if (lastEnd !== null) {
        const gap = x - lastEnd;
        if (gap > r.h * 1.2) line += '  ';
        else if (gap > r.h * 0.2 && /[A-Za-z0-9]$/.test(line) && /^[A-Za-z0-9]/.test(it.str)) line += ' ';
      }
      line += it.str;
      lastEnd = x + it.width;
    }
    return line.trim();
  }).filter(Boolean);
}
