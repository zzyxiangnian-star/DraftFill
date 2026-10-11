import { describe, expect, it } from 'vitest';
import { chooseFuzzy, coreName, expandSchool } from '../src/lib/fill/fuzzy';

const pick = (v: string, opts: string[], k: 'school' | 'major') => {
  const r = chooseFuzzy(v, opts, k);
  return r.ok ? opts[r.index] : null;
};

describe('学校、专业模糊匹配', () => {
  it('去掉英文名和专业代码后相同就选，带中文的括号不当成一样', () => {
    expect(coreName('北京大学(Peking University)')).toBe('北京大学');
    expect(coreName('计算机技术（085404）')).toBe('计算机技术');
    expect(coreName('北京大学（医学部）')).not.toBe('北京大学');
    expect(pick('北京大学', ['北京大学(Peking University)', '北京大学医学部(Peking University Health Science Center)'], 'school')).toBe('北京大学(Peking University)');
    expect(pick('计算机技术', ['计算机科学与技术(081200)', '计算机技术(085404)', '软件工程(083500)'], 'major')).toBe('计算机技术(085404)');
  });

  it('常见简称能认，有歧义的不认', () => {
    expect(expandSchool('北大')).toBe('北京大学');
    expect(pick('华科', ['华中科技大学', '华中师范大学', '华中农业大学'], 'school')).toBe('华中科技大学');
    expect(pick('交大', ['上海交通大学', '西安交通大学', '北京交通大学'], 'school')).toBeNull();
  });

  it('写法略有不同但很接近时选上，并标为需要核对', () => {
    const r = chooseFuzzy('计算机科学技术', ['计算机科学与技术', '软件工程', '网络工程'], 'major');
    expect(r).toMatchObject({ ok: true, index: 0, sure: false });
  });

  it('不够像或者有两个都像，就不选', () => {
    expect(pick('计算机技术', ['计算机科学与技术', '计算机应用技术'], 'major')).toBeNull();
    expect(pick('武汉大学', ['武汉理工大学', '武汉科技大学'], 'school')).toBeNull();
    expect(pick('湖南大学', ['湖南师范大学', '湖南农业大学', '湖南科技大学'], 'school')).toBeNull();
  });
});

import { chooseRegion, chooseRepeat } from '../src/lib/fill/region';

describe('省市级联', () => {
  const PROV = ['北京市', '湖北省', '湖南省', '吉林省', '广西壮族自治区'];
  it('带不带“省”“市”都能对上', () => {
    expect(chooseRegion('湖南长沙', PROV)).toEqual({ index: 2, consumed: 2 });
    expect(chooseRegion('湖南省长沙市', PROV)).toEqual({ index: 2, consumed: 3 });
    expect(chooseRegion('广西桂林', PROV)).toEqual({ index: 4, consumed: 2 });
    expect(chooseRegion('长沙', ['长沙市', '株洲市'])).toEqual({ index: 0, consumed: 2 });
  });
  it('吉林省吉林市：先选省，再选市', () => {
    expect(chooseRegion('吉林省吉林市', PROV)).toEqual({ index: 3, consumed: 3 });
    expect(chooseRegion('吉林市', ['长春市', '吉林市'])).toEqual({ index: 1, consumed: 3 });
  });
  it('对不上就不选；直辖市重复一级', () => {
    expect(chooseRegion('湖', PROV)).toBeNull();
    expect(chooseRegion('上海', PROV)).toBeNull();
    expect(chooseRepeat('北京市', ['北京市'])).toBe(0);
    expect(chooseRepeat('北京市', ['市辖区', '县'])).toBe(0);
    expect(chooseRepeat('湖南省', ['长沙市', '株洲市'])).toBeNull();
  });
});
