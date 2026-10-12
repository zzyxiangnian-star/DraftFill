import type { NoticeEvent } from '../ai/skills/notice';

// 计划书 L7：把通知里的日程存成日历文件（.ics），手机和电脑的日历都能导入。
// 用不带时区的本地时间（“浮动时间”），按导入设备的时区显示，国内同学不会差 8 小时。

const esc = (s: string) => s.replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/[,;]/g, (c) => `\\${c}`);
const compact = (dt: string) => dt.replace(/[-:]/g, '').replace(' ', 'T');

/** 结束时间：没写的按 1 小时算；截止时间是一个点，也记 1 小时，方便在日历里看到 */
function endOf(e: NoticeEvent): string {
  if (e.end && e.end.length === e.start.length && e.end > e.start) return e.end;
  if (e.start.length === 10) {
    const d = new Date(`${e.start}T00:00:00`);
    d.setDate(d.getDate() + 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }
  const d = new Date(e.start.replace(' ', 'T'));
  d.setHours(d.getHours() + 1);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** 折行：每行不超过 75 个字节（日历格式要求），中文按 UTF-8 算 */
function fold(line: string): string {
  const out: string[] = [];
  let cur = '';
  let bytes = 0;
  for (const ch of line) {
    const b = new TextEncoder().encode(ch).length;
    if (bytes + b > (out.length ? 74 : 75)) { out.push(cur); cur = ''; bytes = 0; }
    cur += ch;
    bytes += b;
  }
  out.push(cur);
  return out.join('\r\n ');
}

export function toIcs(events: NoticeEvent[], opts: { prefix?: string; extra?: string; now?: Date } = {}): string {
  const stamp = (opts.now ?? new Date()).toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//DraftFill//网申助手//ZH', 'CALSCALE:GREGORIAN'];
  events.forEach((e, i) => {
    const allDay = e.start.length === 10;
    const summary = `${opts.prefix ? `${opts.prefix} ` : ''}${e.title}${e.deadline ? '（截止）' : ''}`;
    const desc = [e.link && `链接：${e.link}`, opts.extra].filter(Boolean).join('\n');
    lines.push('BEGIN:VEVENT', `UID:${stamp}-${i}@draftfill`, `DTSTAMP:${stamp}`,
      allDay ? `DTSTART;VALUE=DATE:${compact(e.start)}` : `DTSTART:${compact(e.start)}00`,
      allDay ? `DTEND;VALUE=DATE:${compact(endOf(e))}` : `DTEND:${compact(endOf(e))}00`,
      `SUMMARY:${esc(summary)}`);
    if (e.place) lines.push(`LOCATION:${esc(e.place)}`);
    if (e.link) lines.push(`URL:${e.link}`);
    if (desc) lines.push(`DESCRIPTION:${esc(desc)}`);
    // 提前一天和提前一小时各提醒一次（全天事项只提前一天）
    for (const trigger of allDay ? ['-P1D'] : ['-P1D', '-PT1H']) {
      lines.push('BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${esc(summary)}`, `TRIGGER:${trigger}`, 'END:VALARM');
    }
    lines.push('END:VEVENT');
  });
  lines.push('END:VCALENDAR');
  return lines.map(fold).join('\r\n') + '\r\n';
}
