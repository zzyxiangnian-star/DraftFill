import { describe, expect, it } from 'vitest';
import { backupFileName, exportBackup, parseBackup } from '../src/lib/profile/io';
import { normalizeProfile } from '../src/lib/profile/normalize';
import { emptyProfile, emptyInternship, deriveProfile, type Profile } from '../src/lib/profile/schema';
import { addProfile, duplicateProfile, removeProfile, setActive } from '../src/lib/profile/store';
import { checkEmail, checkIdNumber, checkPhone, checkRange } from '../src/lib/profile/validate';

const emptyStore = { schemaVersion: 1, activeId: '', profiles: [] };

describe('档案操作', () => {
  it('第一份档案自动成为当前档案，复制后内容相同但 id 不同', () => {
    let s = addProfile(emptyStore);
    expect(s.activeId).toBe(s.profiles[0]!.id);
    expect(s.profiles[0]!.title).toBe('主档案');

    s.profiles[0]!.basic.name = '王小明';
    s.profiles[0]!.internships.push(emptyInternship());
    s = duplicateProfile(s, s.profiles[0]!.id, '后端开发');
    const [main, copy] = s.profiles as [Profile, Profile];
    expect(copy.basic.name).toBe('王小明');
    expect(copy.basedOn).toBe(main.id);
    expect(copy.id).not.toBe(main.id);
    expect(copy.internships[0]!.id).not.toBe(main.internships[0]!.id);
    expect(s.activeId).toBe(main.id);
  });

  it('删除当前档案后切到剩下的第一份', () => {
    let s = addProfile(addProfile(emptyStore));
    const [a, b] = s.profiles as [Profile, Profile];
    s = setActive(s, b.id);
    s = removeProfile(s, b.id);
    expect(s.activeId).toBe(a.id);
    expect(removeProfile(s, a.id).activeId).toBe('');
  });

  it('敏感信息默认不允许自动填写', () => {
    expect(Object.values(emptyProfile().autofill).every((v) => v === false)).toBe(true);
  });
});

describe('数据整理', () => {
  it('补齐缺失字段、丢弃错误类型、修复重复 id', () => {
    const p = normalizeProfile({
      title: '旧档案',
      basic: { name: '李华', phone: 13800138000, gender: { bad: true }, unknownField: 'x' },
      internships: [{ id: 'dup', company: 'A' }, { id: 'dup', company: 'B' }, 'garbage'],
      autofill: { phone: true, email: 'yes' },
    });
    expect(p.basic.name).toBe('李华');
    expect(p.basic.phone).toBe('13800138000');
    expect(p.basic.gender).toBe('');
    expect(p.basic).not.toHaveProperty('unknownField');
    expect(p.internships.map((i) => i.company)).toEqual(['A', 'B']);
    expect(new Set(p.internships.map((i) => i.id)).size).toBe(2);
    expect(p.autofill).toEqual({ phone: true, email: false, idNumber: false, family: false, emergencyContact: false });
    expect(p.skills.languages).toEqual([]);
  });
});

describe('备份导入导出', () => {
  it('导出再导入得到相同内容，id 重新生成，重名加后缀', () => {
    const p = emptyProfile('主档案');
    p.basic.name = '王小明';
    p.education[0]!.school = '北京大学';
    const derived = deriveProfile(p, '产品经理');
    const text = exportBackup([p, derived]);

    const r = parseBackup(text, ['主档案']);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.profiles.map((x) => x.title)).toEqual(['主档案（导入）', '产品经理']);
    expect(r.profiles[0]!.id).not.toBe(p.id);
    expect(r.profiles[0]!.education[0]!.school).toBe('北京大学');
    expect(r.profiles[0]!.basic.name).toBe('王小明');
  });

  it('拒绝无效文件并给出原因', () => {
    expect(parseBackup('not json')).toMatchObject({ ok: false, reason: expect.stringContaining('JSON') });
    expect(parseBackup('{"a":1}')).toMatchObject({ ok: false, reason: expect.stringContaining('不是网申助手') });
    expect(parseBackup('{"app":"wangshen-helper","schemaVersion":99,"profiles":[{}]}'))
      .toMatchObject({ ok: false, reason: expect.stringContaining('更新') });
    expect(parseBackup('{"app":"wangshen-helper","schemaVersion":1,"profiles":[]}'))
      .toMatchObject({ ok: false, reason: expect.stringContaining('没有档案') });
  });

  it('备份文件名带日期', () => {
    expect(backupFileName(new Date(2026, 9, 11))).toBe('wangshen-backup-20261011.json');
  });
});

describe('格式提示', () => {
  it('身份证校验位', () => {
    expect(checkIdNumber('11010519491231002X')).toBeNull();
    expect(checkIdNumber('110105194912310021')).toContain('校验位');
    expect(checkIdNumber('123')).toContain('18 位');
    expect(checkIdNumber('')).toBeNull();
  });
  it('手机、邮箱、时间顺序', () => {
    expect(checkPhone('138 0013 8000')).toBeNull();
    expect(checkPhone('12345')).not.toBeNull();
    expect(checkEmail('a@b.cn')).toBeNull();
    expect(checkEmail('a@b')).not.toBeNull();
    expect(checkRange('2022-09', '2026-06')).toBeNull();
    expect(checkRange('2026-09', '2022-06')).not.toBeNull();
  });
});
