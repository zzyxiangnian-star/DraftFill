import { describe, expect, it } from 'vitest';
import { exportBackup, parseBackup } from '../src/lib/profile/io';
import { emptyProfile } from '../src/lib/profile/schema';
import {
  addApplication, isRecorded, mergeApplications, normalizeApplication, removeApplication, toCsv, updateApplication, urlKey,
  type ApplicationStore,
} from '../src/lib/tracker/applications';
import { guessCompany, guessPosition } from '../src/lib/tracker/guess';

const empty = (): ApplicationStore => ({ version: 1, items: [] });
const MOKA = 'https://app.mokahr.com/campus-recruitment/danone/170511?locale=zh-CN#/job/df1b/apply?applyFormId=200571';

describe('投递看板', () => {
  it('记一条：默认今天、已投递；新的排在最前', () => {
    let s = addApplication(empty(), { company: '达能', position: '管培生', url: MOKA, profileTitle: '主档案' });
    s = addApplication(s, { company: '转转', position: '运营', url: 'https://zhuanzhuan.zhiye.com/form?jobAdId=1', profileTitle: '主档案' });
    expect(s.items.map((a) => a.company)).toEqual(['转转', '达能']);
    expect(s.items[1]).toMatchObject({ status: '已投递', date: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/) });
  });

  it('同一个网申链接只记一条（忽略跟踪参数），Moka 的 # 路由不同算不同岗位', () => {
    let s = addApplication(empty(), { company: '达能', position: '', url: MOKA, profileTitle: 'A' });
    s = addApplication(s, { company: '达能', position: '管培生', url: MOKA.replace('?locale', '?utm_source=wx&locale'), profileTitle: 'A' });
    expect(s.items).toHaveLength(1);
    expect(s.items[0]!.position).toBe('管培生');
    expect(isRecorded(s, MOKA)).toBeTruthy();
    expect(urlKey(MOKA)).not.toBe(urlKey(MOKA.replace('df1b', 'aaaa')));
  });

  it('改状态、删除', () => {
    let s = addApplication(empty(), { company: '达能', position: '', url: MOKA, profileTitle: 'A' });
    s = updateApplication(s, { ...s.items[0]!, status: '面试' });
    expect(s.items[0]!.status).toBe('面试');
    expect(removeApplication(s, s.items[0]!.id).items).toEqual([]);
  });

  it('CSV：带 BOM、表头中文、逗号引号转义、防公式注入', () => {
    const s = addApplication(empty(), { company: '某"公司",上海', position: '=HYPERLINK("x")', url: MOKA, profileTitle: 'A' });
    const csv = toCsv(s.items);
    expect(csv.startsWith('﻿投递日期,公司,岗位,状态,截止日期,所用档案,链接,备注\r\n')).toBe(true);
    expect(csv).toContain('"某""公司"",上海"');
    expect(csv).toContain(`"'=HYPERLINK(""x"")"`);
  });

  it('旧数据缺字段、状态不认识时补齐', () => {
    expect(normalizeApplication({ company: '达能', status: '奇怪的状态' })).toMatchObject({ company: '达能', status: '已投递', note: '' });
  });

  it('备份带上投递记录；旧备份没有这一项也能导入；重复导入不重复记', () => {
    const s = addApplication(empty(), { company: '达能', position: '', url: MOKA, profileTitle: 'A' });
    const r = parseBackup(exportBackup([emptyProfile()], s.items));
    expect(r.ok && r.applications.length).toBe(1);
    const old = parseBackup(JSON.stringify({ app: 'wangshen-helper', schemaVersion: 1, profiles: [emptyProfile()] }));
    expect(old.ok && old.applications).toEqual([]);
    if (!r.ok) return;
    const m = mergeApplications(s, r.applications);
    expect(m.added).toBe(0);
    expect(m.store.items).toHaveLength(1);
  });

  it('从页面猜公司和岗位', () => {
    expect(guessCompany('达能招聘')).toBe('达能');
    expect(guessCompany('转转招聘')).toBe('转转');
    expect(guessCompany('校园招聘 | 美团')).toBe('美团');
    document.body.innerHTML = '<div>你正在投递职位: 体验运营岗（2027届校招-官网）(J15008)</div>';
    expect(guessPosition(document)).toBe('体验运营岗（2027届校招-官网）');
  });
});

describe('收藏的岗位', () => {
  it('收藏后再记投递：状态往前走、日期改成投递当天，截止日期和岗位描述保留', () => {
    const MOKA2 = 'https://app.mokahr.com/campus-recruitment/x/1#/job/abc';
    let s = addApplication({ version: 1, items: [] }, { company: '达能', position: '管培生', url: MOKA2, profileTitle: '', status: '已收藏', deadline: '2026-10-30', jd: '岗位职责……', date: '2026-10-01' });
    s = addApplication(s, { company: '达能', position: '', url: MOKA2, profileTitle: 'A' });
    expect(s.items).toHaveLength(1);
    expect(s.items[0]).toMatchObject({ status: '已投递', deadline: '2026-10-30', jd: '岗位职责……', profileTitle: 'A' });
    expect(s.items[0]!.date).not.toBe('2026-10-01');
  });
});
