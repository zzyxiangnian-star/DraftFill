import { describe, expect, it } from 'vitest';
import { chooseNumber, chooseOption } from '../src/lib/fill/choice';

// 选项归一化（计划书 V3）：档案里的标准写法映射到页面上各种写法。

const pick = (v: string, opts: string[]) => {
  const r = chooseOption(v, opts);
  return r.ok ? { option: opts[r.index], sure: r.sure } : { reason: r.reason };
};

describe('chooseOption', () => {
  it('学历、政治面貌、民族的常见写法', () => {
    expect(pick('本科', ['大专', '大学本科', '硕士研究生'])).toEqual({ option: '大学本科', sure: true });
    expect(pick('中共党员', ['中国共产党员', '共青团员', '群众'])).toEqual({ option: '中国共产党员', sure: true });
    expect(pick('汉族', ['汉', '回', '满'])).toEqual({ option: '汉', sure: true });
  });

  it('计算机等级', () => {
    expect(pick('二级', ['无', '全国计算机一级', '全国计算机二级', '全国计算机三级'])).toEqual({ option: '全国计算机二级', sure: true });
    expect(pick('二级', ['NCRE一级', 'NCRE二级'])).toEqual({ option: 'NCRE二级', sure: true });
  });

  it('获奖级别', () => {
    expect(pick('省部级', ['国家级', '省级', '市级', '校级'])).toEqual({ option: '省级', sure: true });
    expect(pick('校级', ['国家', '省', '市', '校', '院'])).toEqual({ option: '校', sure: true });
  });

  it('外语语种', () => {
    expect(pick('英语', ['English', 'Japanese', 'French'])).toEqual({ option: 'English', sure: true });
    expect(pick('韩语', ['英语', '朝鲜语'])).toEqual({ option: '朝鲜语', sure: true });
  });

  it('认不准就不选', () => {
    expect(pick('硕士研究生', ['研究生', '硕士', '博士'])).toHaveProperty('reason');
    expect(pick('本科', ['专科', '硕士'])).toEqual({ reason: '选项里没有“本科”' });
    expect(pick('', ['男', '女'])).toEqual({ reason: '档案里没有这一项' });
  });
});

describe('chooseNumber', () => {
  it('年月数字', () => {
    expect(chooseNumber('9', ['8月', '9月', '10月'])).toEqual({ ok: true, index: 1, sure: true });
    expect(chooseNumber('2024', ['2023年', '2024年'])).toEqual({ ok: true, index: 1, sure: true });
  });
});
