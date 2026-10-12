import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { describe as describeControl, detectControls } from '../src/lib/fill/detect';
import { fillDocument, planFill } from '../src/lib/fill/fill';
import { sampleProfile } from './fixtures/profile';
import { concretePath, scorePlan } from './fixtures/score';

// 真实网申页面快照（tests/fixtures/forms/real）。这里只验证识别；下拉框的真实交互要在真页面上验证。

function load(file: string) {
  const html = readFileSync(`${import.meta.dirname}/fixtures/forms/real/${file}`, 'utf8');
  document.documentElement.innerHTML = html.replace(/^<!--[\s\S]*?-->\s*/, '').replace(/^<!doctype html>/i, '');
}

describe.each([
  ['moka-danone.html', 'Moka · 达能'],
  ['beisen-zhuanzhuan.html', '北森 · 转转'],
  ['hotjob-crpower.html', 'Wecruit · 华润电力'],
  ['feishu-moonton.html', '飞书招聘 · 沐瞳科技'],
  ['feishu-xpeng.html', '飞书招聘新版 · 小鹏'],
])('%s', (file, name) => {
  it(`${name}：没有错认、不该填的不碰，识别率 ≥ 90%`, () => {
    load(file);
    const plan = planFill(document, sampleProfile());
    const s = scorePlan(plan, document);
    console.log(`${name} 识别 ${s.correct}/${s.expected}`, s.details);
    expect(s.wrong).toBe(0);
    expect(s.falsePositive).toBe(0);
    expect(s.correct / s.expected).toBeGreaterThanOrEqual(0.9);
  });
});

describe('必填标记（计划书 V7）', () => {
  // 对照快照里的星号逐个核对：北森 form-item__required，Moka required-asterisk
  const required = (file: string) => {
    load(file);
    return [...new Set(detectControls(document).filter((c) => c.required).map(describeControl))];
  };
  it('北森：13 个必填字段，上传简历、推荐码不是必填', () => {
    expect(required('beisen-zhuanzhuan.html')).toEqual(['姓名', '性别', '出生日期', '邮箱', '手机号码', '期望工作城市', '到岗时间',
      '学校名称', '开始时间', '结束时间', '专业名称', '学历', '学位']);
  });
  it('Moka：必填的附件、意向城市、起止时间都认出；荣誉、照片等选填的不算', () => {
    const r = required('moka-danone.html');
    expect(r).toEqual(expect.arrayContaining(['上传简历', '第二意向城市', '姓名', '性别', '邮箱', '就读时间', '学校名称', '起止时间', '公司名称', '招聘信息来源渠道']));
    for (const optional of ['英文名', '上传照片', '荣誉类型', '荣誉名称', '获奖时间', '推荐码', '最高学历GPA证明']) expect(r).not.toContain(optional);
  });
});

describe('Wecruit、飞书招聘的识别细节（计划书 V9）', () => {
  const plan = (file: string) => { load(file); return planFill(document, sampleProfile()); };
  const paths = (file: string, label: string) => plan(file).filter((f) => describeControl(f.control) === label).map((f) => concretePath(f.path, f.index));

  it('Wecruit：家庭关系里的“姓名”是家属姓名，不是本人', () => {
    expect(paths('hotjob-crpower.html', '姓名')).toEqual(['basic.name', 'family[0].name']);
  });
  it('Wecruit：基本信息里的毕业院校、学历按第 1 段教育经历填，教育经历分区也从第 1 段开始', () => {
    expect(paths('hotjob-crpower.html', '毕业院校')).toEqual(['education[0].school']);
    expect(paths('hotjob-crpower.html', '学校名称')).toEqual(['education[0].school']);
  });
  it('“是否第一学历”是是非题，不当成学历；“生源地（高考户籍地）”不当成户口', () => {
    expect(paths('hotjob-crpower.html', '是否第一学历')).toEqual(['none']);
    expect(paths('hotjob-crpower.html', '生源地（高考户籍地）')).toEqual(['basic.sourceRegion', 'basic.sourceRegion']);
  });
  it('Wecruit：并排的省、市下拉框标上第几级', () => {
    const levels = plan('hotjob-crpower.html').filter((f) => describeControl(f.control) === '现居住地').map((f) => f.control.level);
    expect(levels).toEqual([0, 1]);
  });
  it('飞书：改了前缀的下拉框（atsx-select）认得出，区号下拉不当成手机号', () => {
    const p = plan('feishu-moonton.html');
    const kinds = p.filter((f) => ['学校名称', '学历', '获取职位信息的渠道'].includes(describeControl(f.control))).map((f) => f.control.kind);
    expect(kinds).toEqual(['antd-select', 'antd-select', 'antd-select']);
    expect(paths('feishu-moonton.html', '手机号码')).toEqual(['none', 'basic.phone']);
  });
  it('飞书：标签上的必填类认得出（手机号前面有区号下拉也算）', () => {
    load('feishu-moonton.html');
    const req = [...new Set(detectControls(document).filter((c) => c.required).map(describeControl))];
    expect(req).toEqual(expect.arrayContaining(['推荐方式', '姓名', '手机号码', '邮箱', '学校名称', '学历', '专业', '起止时间']));
    expect(req).not.toContain('国籍（地区）');
    expect(req).not.toContain('成绩排名');
  });
});

/** 给静态快照里的 Ant Design 3 下拉框装上最简单的行为：点开弹出选项，点选项写入选中值 */
function mockAntd3(options: (label: string, prev: string) => string[]) {
  for (const root of document.querySelectorAll<HTMLElement>('.ant-select')) {
    const item = root.closest('.ant-form-item');
    const label = item?.querySelector('label')?.textContent?.replace(/[*\s]/g, '') ?? '';
    const sel = root.querySelector<HTMLElement>('.ant-select-selection')!;
    sel.addEventListener('click', () => {
      const all = [...item!.querySelectorAll('.ant-select')];
      const prevRoot = all[all.indexOf(root) - 1];
      const prev = prevRoot?.querySelector('.ant-select-selection-selected-value')?.getAttribute('title') ?? '';
      const panel = document.createElement('div');
      panel.className = 'ant-select-dropdown';
      panel.innerHTML = `<ul class="ant-select-dropdown-menu">${options(label, prev).map((o) => `<li class="ant-select-dropdown-menu-item">${o}</li>`).join('')}</ul>`;
      document.body.append(panel);
      for (const li of panel.querySelectorAll('li')) {
        li.addEventListener('click', () => {
          root.querySelector('.ant-select-selection-selected-value')?.remove();
          const v = document.createElement('div');
          v.className = 'ant-select-selection-selected-value';
          v.title = li.textContent!;
          v.textContent = li.textContent;
          root.querySelector('.ant-select-selection__rendered')!.prepend(v);
          panel.classList.add('ant-select-dropdown-hidden');
        });
      }
    });
  }
}

describe('真实页面上的填写（静态快照，没有页面脚本）', () => {
  it('Wecruit：Ant Design 3 下拉框选中并回读；省、市分开的两个下拉框一级一级选', async () => {
    load('hotjob-crpower.html');
    const CITY: Record<string, string[]> = { '': ['北京', '湖南省', '上海'], 北京: ['北京市'], 湖南省: ['长沙市', '湘潭市'], 上海: ['上海市'] };
    mockAntd3((label, prev) => {
      if (/现居住地|生源地|期望工作地点/.test(label)) return CITY[prev] ?? [];
      return ({ 学历: ['大专', '本科', '硕士研究生', '博士研究生'], 学位: ['学士', '硕士', '博士'], 民族: ['汉族', '回族'],
        政治面貌: ['中共党员', '共青团员', '群众'], 毕业院校: ['北京大学', '武汉大学'], 学校名称: ['北京大学', '武汉大学'] } as Record<string, string[]>)[label] ?? ['其他'];
    });
    const report = await fillDocument(document, sampleProfile());
    const all = (label: string) => report.items.filter((i) => i.label.startsWith(label)).map((i) => `${i.status}:${i.value}`);
    expect(all('现居住地')).toEqual(['ok:北京', 'ok:北京市']);
    // 档案只写了“湖南”，市一级有两个选项，不替用户选
    expect(all('生源地')).toEqual(['ok:湖南省', 'skip:']);
    expect(all('期望工作地点')).toEqual(['ok:北京', 'ok:北京市']);
    expect(all('毕业院校')).toEqual(['ok:北京大学']);
    expect(all('民族')).toEqual(['ok:汉族']);
    expect(all('政治面貌')).toEqual(['ok:共青团员']);
    expect(all('学位')).toEqual(['ok:硕士', 'ok:硕士']);
    expect(all('学历')).toEqual(['warn:硕士研究生', 'warn:硕士研究生']);
    expect(all('姓名')).toEqual(['ok:王小明', 'ok:王大明']);
    expect(report.items.find((i) => i.label.startsWith('是否第一学历'))).toMatchObject({ status: 'skip', path: null });
  }, 60_000);

  it('飞书：文本框写入；区号下拉、日期面板不碰', async () => {
    load('feishu-moonton.html');
    const report = await fillDocument(document, sampleProfile());
    const by = (label: string) => report.items.filter((i) => i.label.startsWith(label));
    expect(by('姓名')[0]).toMatchObject({ status: 'ok', value: '王小明' });
    expect(by('邮箱')[0]).toMatchObject({ status: 'ok', value: 'xiaoming@example.com' });
    expect(by('专业')[0]).toMatchObject({ status: 'ok', value: '计算机技术' });
    expect(by('手机号码').map((i) => i.status)).toEqual(['skip', 'ok']);
    expect(by('起止时间')[0]).toMatchObject({ status: 'skip' });
  }, 60_000);

  it('北森：文本框写入并回读；性别单选按北森的选中样式回读；下拉框打不开时如实标红', async () => {
    load('beisen-zhuanzhuan.html');
    // 快照里没有页面脚本：模拟北森单选“点击后加上 --checked 样式”的行为（类名取自北森自己的样式表）
    for (const w of document.querySelectorAll('.phoenix-radio__wrapper')) {
      w.addEventListener('click', () => w.querySelector('.phoenix-radio__dot')!.classList.add('phoenix-radio__dot--checked'));
    }
    const report = await fillDocument(document, sampleProfile());
    const by = (label: string) => report.items.find((i) => i.label.startsWith(label));
    expect(by('姓名')).toMatchObject({ status: 'ok', value: '王小明' });
    expect(by('性别')).toMatchObject({ status: 'ok', value: '男' });
    expect(by('学校名称')).toMatchObject({ status: 'ok' });
    expect(by('学历')).toMatchObject({ status: 'err', note: '输入“硕士研究生”后没有出现可选项' });
    expect(report.items.filter((i) => i.status === 'ok').length).toBeGreaterThanOrEqual(5);
  }, 30_000);

  it('Moka：文本框写入；区号、英文名、附件、只读日期不碰', async () => {
    load('moka-danone.html');
    const report = await fillDocument(document, sampleProfile());
    const by = (label: string) => report.items.find((i) => i.label.startsWith(label));
    expect(by('姓名')).toMatchObject({ status: 'ok', value: '王小明' });
    expect(by('英文名')).toMatchObject({ status: 'skip' });
    expect(by('出生日期')).toMatchObject({ status: 'skip', note: expect.stringContaining('面板') });
    expect(by('公司名称')).toMatchObject({ status: 'ok' });
    const inputs = [...document.querySelectorAll<HTMLInputElement>('input[placeholder="英文名"], input[readonly]')];
    expect(inputs.every((i) => i.value === '')).toBe(true);
  }, 60_000);
});

describe('飞书招聘新版（UD 组件库，小鹏）', () => {
  it('字段名、分区、必填都认出；推荐方式是一组单选；学历、起止时间列为要自己点选的', () => {
    load('feishu-xpeng.html');
    const cs = detectControls(document);
    const by = (label: string) => cs.filter((c) => describeControl(c) === label);
    expect(cs.filter((c) => describeControl(c) === '未命名字段')).toEqual([]);
    expect(by('推荐方式')).toHaveLength(1);
    expect(by('推荐方式')[0]!.options).toEqual(['无', '内推', '大使推荐']);
    expect(by('学历')[0]!.kind).toBe('readonly');
    expect(by('起止时间').map((c) => [c.kind, c.section])).toEqual([['readonly', 'education'], ['readonly', 'internship'], ['readonly', 'project']]);
    expect(by('公司名称')[0]).toMatchObject({ section: 'internship', required: true });
    expect(by('项目角色')[0]!.required).toBe(false);
  });
});

describe('腾讯校招的写法（按 2026-10-12 的页面结构自制，不含真实信息）', () => {
  const PAGE = `
    <ul>
      <li class="send_box"><div class="send_title"><span>基础信息</span></div><div class="send_content"><div class="info_list">
        <div class="info_box"><div class="subtitle must">姓名<span>*</span></div><div class="input_box"><div class="el-input"><input type="text" class="el-input__inner" placeholder="请输入姓名"></div></div></div>
        <div class="info_box"><div class="subtitleBold">证件信息</div><div class="subtitle must">手机号码<span>*</span></div><div class="input_box"><div class="el-input"><input type="text" class="el-input__inner"></div></div></div>
      </div></div></li>
      <li class="send_box"><div class="send_title"><span>教育经历</span></div><div class="send_content"><div class="info_list">
        <div class="info_box"><div class="subtitle">GPA-GPA</div><div class="input_box"><input type="text"></div></div>
        <div class="info_box"><div class="subtitle">GPA-BASE</div><div class="input_box"><input type="text"></div></div>
      </div></div></li>
      <li class="send_box"><div class="send_title"><span>获奖情况</span></div><div class="send_content"><div class="info_list">
        <div class="info_box"><div class="subtitle">奖项说明</div><textarea></textarea></div>
      </div></div></li>
      <li class="send_box"><div class="send_title"><span>语言能力</span></div><div class="send_content"><div class="info_list">
        <div class="info_box"><div class="subtitle">开发语言</div><div class="input_box"><input type="text"></div></div>
      </div></div></li>
    </ul>`;
  it('字段名取 subtitle，分区取 send_title；开发语言不当外语，GPA 基数、奖项说明不填错', () => {
    document.body.innerHTML = PAGE;
    const plan = planFill(document, sampleProfile());
    const got = Object.fromEntries(plan.map((f) => [describeControl(f.control), [f.control.section, f.path]]));
    expect(got).toEqual({
      姓名: ['basic', 'basic.name'],
      手机号码: ['basic', 'basic.phone'],
      'GPA-GPA': ['education', 'education[].gpa'],
      'GPA-BASE': ['education', 'education[].gpaScale'],
      奖项说明: ['award', 'awards[].description'],
      开发语言: ['language', null],
    });
  });
});
