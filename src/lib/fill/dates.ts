/** 年、月分开选时取出其中一段：2024-09 → 年 2024，月 9 */
export function datePartValue(value: string, part: 'year' | 'month'): string | null {
  const m = /^(\d{4})-(\d{2})/.exec(value);
  if (!m) return null;
  return part === 'year' ? m[1]! : String(Number(m[2]));
}
