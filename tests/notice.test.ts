import { describe, expect, it } from 'vitest';
import { normalizeDateTime, noticeSkill } from '../src/lib/ai/skills/notice';
import { addApplication, recordNotice, type ApplicationStore } from '../src/lib/tracker/applications';
import { toIcs } from '../src/lib/tracker/ics';

// 计划书 L7：通知 → 日程 → 日历文件、投递看板

const TEXT = `王同学你好，感谢投递示例科技后端开发工程师岗位。诚邀你参加一面：
时间：10月15日 14:00-15:00，形式：腾讯会议，会议链接 https://meeting.example.com/abc123
请提前测试摄像头和麦克风。另请于10月14日23:59前完成在线测评：https://test.example.com/t/9`;

describe('通知整理', () => {
  it('时间只收合法的日期时间；链接必须在原文里原样出现', () => {
    expect(normalizeDateTime('2026-10-15 14:00')).toBe('2026-10-15 14:00');
    expect(normalizeDateTime('2026/10/5 9:30:00')).toBe('2026-10-05 09:30');
    expect(normalizeDateTime('2026-02-30 10:00')).toBe('');
    expect(normalizeDateTime('2026-10-15 25:00')).toBe('2026-10-15');
    expect(normalizeDateTime('下周三')).toBe('');
    const r = noticeSkill.parse({
      company: '示例科技', position: '后端开发工程师', kind: '面试',
      events: [
        { title: '一面', start: '2026-10-15 14:00', end: '2026-10-15 15:00', place: '腾讯会议', link: 'https://meeting.example.com/abc123' },
        { title: '在线测评', start: '2026-10-14 23:59', deadline: true, link: 'https://evil.example.com/phish' },
        { title: '没有时间', start: '待定' },
      ],
      prepare: ['测试摄像头和麦克风'],
    }, { text: TEXT, today: '2026-10-12' });
    expect(r.events).toHaveLength(2);
    // 按时间排序；原文里没有的链接丢掉
    expect(r.events[0]).toMatchObject({ title: '在线测评', deadline: true, link: '' });
    expect(r.events[1]).toMatchObject({ link: 'https://meeting.example.com/abc123', place: '腾讯会议' });
    expect(noticeSkill.parse({ kind: '群面' }, { text: TEXT, today: '' }).kind).toBe('其他');
    expect(noticeSkill.build({ text: TEXT, today: '2026-10-12' })[1]!.content).toContain('今天是 2026-10-12');
  });

  it('日历文件：本地时间、默认 1 小时、提前一天和一小时提醒；全天事项按日期', () => {
    const ics = toIcs([
      { title: '一面', start: '2026-10-15 14:00', end: '', deadline: false, place: '腾讯会议', link: 'https://meeting.example.com/abc123' },
      { title: '测评', start: '2026-10-14', end: '', deadline: true, place: '', link: '' },
    ], { prefix: '示例科技 面试', now: new Date('2026-10-12T00:00:00Z') });
    expect(ics).toContain('DTSTART:20261015T140000\r\n');
    expect(ics).toContain('DTEND:20261015T150000\r\n');
    expect(ics).toContain('SUMMARY:示例科技 面试 一面');
    expect(ics).toContain('DTSTART;VALUE=DATE:20261014');
    expect(ics).toContain('DTEND;VALUE=DATE:20261015');
    expect(ics).toContain('SUMMARY:示例科技 面试 测评（截止）');
    expect(ics.match(/BEGIN:VALARM/g)).toHaveLength(3);
    expect(ics.split('\r\n').every((l) => new TextEncoder().encode(l).length <= 75)).toBe(true);
  });

  it('记到看板：同一家公司的投递往前推状态、备注加一行；没有就新记一条', () => {
    let s: ApplicationStore = { version: 1, items: [] };
    s = addApplication(s, { company: '示例科技有限公司', position: '后端开发', url: 'https://jobs.example.com/1', profileTitle: '主档案' });
    const r = recordNotice(s, { company: '示例科技', position: '', status: '面试', line: '10-15 14:00 一面' });
    expect(r.updated).toMatchObject({ status: '面试', note: '10-15 14:00 一面' });
    // 再收到一份测评通知：不倒退回笔试
    const r2 = recordNotice(r.store, { company: '示例科技', position: '', status: '笔试/测评', line: '10-14 测评截止' });
    expect(r2.updated).toMatchObject({ status: '面试', note: '10-15 14:00 一面\n10-14 测评截止' });
    const r3 = recordNotice(r2.store, { company: '另一家公司', position: '产品经理', status: '笔试/测评', line: '10-20 笔试' });
    expect(r3.updated).toBeNull();
    expect(r3.store.items[0]).toMatchObject({ company: '另一家公司', status: '笔试/测评', note: '10-20 笔试' });
  });
});
