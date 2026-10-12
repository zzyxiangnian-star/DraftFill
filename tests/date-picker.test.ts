import { describe, expect, it } from 'vitest';
import { addMonths, monthGrid, parseInput, splitValue } from '../src/components/dates';

describe('日期选择器', () => {
  it('手打的日期各种写法都认，不合法的不认', () => {
    for (const t of ['2004-02-07', '2004/2/7', '2004.2.7', '2004年2月7日', '20040207', ' 2004 - 2 - 7 ']) expect(parseInput(t, 'date')).toBe('2004-02-07');
    for (const t of ['2004-02-30', '2004-13-01', '04-02-07', '2004-02', 'abc', '']) expect(parseInput(t, 'date')).toBeNull();
    for (const t of ['2024-09', '2024.9', '2024年9月', '202409', '2024/9']) expect(parseInput(t, 'month')).toBe('2024-09');
    for (const t of ['2024-13', '2024', '24-09']) expect(parseInput(t, 'month')).toBeNull();
  });

  it('日历周一开头，6 行 42 格，邻月的日子标出来', () => {
    const g = monthGrid(2004, 2); // 2004 年 2 月 1 日是周日
    expect(g).toHaveLength(42);
    expect(g[0]).toMatchObject({ value: '2004-01-26', outside: true });
    expect(g[6]).toMatchObject({ value: '2004-02-01', outside: false });
    expect(g.filter((c) => !c.outside)).toHaveLength(29); // 闰年
    expect(g.at(-1)).toMatchObject({ value: '2004-03-07', outside: true });
  });

  it('翻月跨年；已存的值拆开', () => {
    expect(addMonths(2024, 1, -1)).toEqual({ y: 2023, m: 12 });
    expect(addMonths(2024, 12, 1)).toEqual({ y: 2025, m: 1 });
    expect(addMonths(2024, 5, -12)).toEqual({ y: 2023, m: 5 });
    expect(splitValue('2024-09')).toEqual({ y: 2024, m: 9, d: 1 });
    expect(splitValue('2004-02-07')).toEqual({ y: 2004, m: 2, d: 7 });
    expect(splitValue('2024.09')).toBeNull();
  });
});
