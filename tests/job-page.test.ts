import { describe, expect, it } from 'vitest';
import { daysLeft, dueSoon, normalizeApplication } from '../src/lib/tracker/applications';
import { extractJob, findDeadline } from '../src/lib/tracker/jobPage';

const NOW = new Date(2026, 9, 12); // 2026-10-12

describe('截止日期', () => {
  it.each([
    ['网申截止时间：2026年10月31日 23:59', '2026-10-31'],
    ['投递截止日期 2026-11-05', '2026-11-05'],
    ['网申时间：2026.09.01 - 2026.10.20（截止）', '2026-10-20'],
    ['简历投递将于 11月15日 截止', '2026-11-15'],
    ['报名截止：3月1日', '2027-03-01'],
    ['发布时间：2026-09-01，岗位职责……', ''],
  ])('%s', (text, want) => expect(findDeadline(text, NOW)).toBe(want));
});

describe('收藏与提醒', () => {
  it('还剩几天、3 天内截止的收藏', () => {
    expect(daysLeft('2026-10-12', NOW)).toBe(0);
    expect(daysLeft('2026-10-15', NOW)).toBe(3);
    expect(daysLeft('', NOW)).toBeNull();
    const items = [
      normalizeApplication({ id: 'a', status: '已收藏', deadline: '2026-10-14' }),
      normalizeApplication({ id: 'b', status: '已收藏', deadline: '2026-10-20' }),
      normalizeApplication({ id: 'c', status: '已投递', deadline: '2026-10-13' }),
      normalizeApplication({ id: 'd', status: '已收藏', deadline: '2026-10-10' }),
      normalizeApplication({ id: 'e', status: '已收藏', deadline: '2026-10-12' }),
    ];
    expect(dueSoon(items, NOW).map((a) => a.id)).toEqual(['e', 'a']);
  });

  it('从招聘页摘出岗位、截止日期和岗位描述', () => {
    document.title = '后端开发工程师 - 示例科技校园招聘';
    document.body.innerHTML = `
      <header><h2>示例科技招聘</h2></header>
      <main>
        <h1>后端开发工程师</h1>
        <p>工作地点：北京　网申截止：2026年10月30日</p>
        <div class="desc">
          <h3>岗位职责</h3><ul><li>负责订单系统的设计与开发</li><li>参与高并发服务的性能优化</li></ul>
          <h3>任职要求</h3><ul><li>2027 届本科及以上，计算机相关专业</li><li>熟悉 Go 或 Java</li></ul>
        </div>
        <div>相关推荐：前端开发工程师、测试开发工程师</div>
      </main>`;
    const j = extractJob(document, NOW);
    expect(j).toMatchObject({ company: '示例科技', position: '后端开发工程师', deadline: '2026-10-30' });
    expect(j.jd).toContain('负责订单系统');
    expect(j.jd).toContain('熟悉 Go');
    expect(j.jd).not.toContain('相关推荐');
  });
});
