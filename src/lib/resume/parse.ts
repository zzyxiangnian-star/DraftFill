import {
  emptyAward, emptyCampusRole, emptyEducation, emptyInternship, emptyLanguage, emptyProfile, emptyProject,
  emptyCertificate, type Profile,
} from '../profile/schema';

// 简历文字 → 档案。纯本地规则，不联网：按“教育背景”“实习经历”等标题分段，
// 每段里以“起止时间”所在行作为一条经历的开头，再按关键词认出学校、公司、职位等。
// 认不准的宁可留空，导入后在档案页补；结果先给用户预览，确认后才另存为新档案。

export interface Found {
  /** 预览里的分组，如“基本信息”“教育经历 1” */
  group: string;
  label: string;
  value: string;
}

export interface ParsedResume {
  profile: Profile;
  found: Found[];
  /** 给用户的提示，如“没找到教育经历” */
  notes: string[];
}

type Block = 'head' | 'basic' | 'intention' | 'education' | 'internship' | 'project' | 'campus' | 'award' | 'skill' | 'self' | 'other';

const HEADERS: [Block, RegExp][] = [
  ['intention', /^(求职意向|应聘意向|意向岗位|求职目标)$/],
  ['education', /^(教育背景|教育经历|学历背景|教育信息|学习经历|教育)$/],
  ['internship', /^(实习经历|实习经验|工作经历|工作经验|实践经历|职业经历|实习与工作经历|实习)$/],
  ['project', /^(项目经历|项目经验|科研经历|科研项目|项目与科研经历|科研与项目经历|项目)$/],
  ['campus', /^(校园经历|在校经历|学生工作|社团经历|校园实践|社会实践|组织经历|学生干部经历|校内经历|社会实践经历)$/],
  ['award', /^(获奖情况|获奖经历|荣誉奖项|奖项荣誉|所获荣誉|荣誉奖励|荣誉证书|获奖荣誉|奖励情况|荣誉|获奖)$/],
  ['skill', /^(专业技能|技能特长|技能证书|技能与证书|证书技能|个人技能|技能|证书|语言能力|技能与语言|其他技能|技能\/证书)$/],
  ['self', /^(自我评价|个人评价|个人总结|自我介绍|个人优势|兴趣爱好)$/],
  ['basic', /^(个人信息|基本信息|联系方式|个人资料)$/],
];

/** 标题行：去掉装饰符号后能对上标题词，且很短 */
function headerOf(line: string): Block | null {
  const t = line.replace(/[【】\[\]■□●○◆◇▌▍|｜#*_\-—=·•:：\s]/g, '').replace(/[A-Za-z\s]+$/, '');
  if (!t || t.length > 10) return null;
  for (const [b, re] of HEADERS) if (re.test(t)) return b;
  return null;
}

// —— 日期 ——

const YM = String.raw`(\d{4})\s*[.\-/年]\s*(\d{1,2})\s*月?`;
const RANGE = new RegExp(String.raw`${YM}(?:\s*[.\-/]\s*\d{1,2}\s*日?)?\s*(?:-|–|—|~|～|至|到)+\s*(?:${YM}(?:\s*[.\-/]\s*\d{1,2}\s*日?)?|(至今|今|现在|目前|present|now))`, 'i');
const SINGLE_DATE = new RegExp(String.raw`${YM}(?:\s*[.\-/]?\s*(\d{1,2})\s*日?)?`);

const pad = (n: string) => n.padStart(2, '0');
const ym = (y: string, m: string) => (Number(m) >= 1 && Number(m) <= 12 ? `${y}-${pad(m)}` : '');

function findRange(line: string): { start: string; end: string; text: string } | null {
  const m = RANGE.exec(line);
  if (!m) return null;
  return { start: ym(m[1]!, m[2]!), end: m[5] ? '' : ym(m[3]!, m[4]!), text: m[0] };
}

function findDate(text: string): string {
  const m = SINGLE_DATE.exec(text);
  if (!m) return '';
  const base = ym(m[1]!, m[2]!);
  return base && m[3] && Number(m[3]) <= 31 ? `${base}-${pad(m[3])}` : base;
}

// —— 文字工具 ——

// 项目符号：圆点、短横，或“1、”“2.”这类编号（不能吃掉“2022.10”里的年份）
const BULLET = /^\s*(?:[•·●○◆◇▪■□\-–—*>》✓√]+|\d{1,2}[、.．)）](?!\d))\s*/;
const isBullet = (l: string) => BULLET.test(l);
const stripBullet = (l: string) => l.replace(BULLET, '').trim();

/** 按空格、竖线等把一行拆成几块 */
function tokens(line: string): string[] {
  return line.split(/\s*[|｜/／]\s*|\s{1,}|\t/).map((t) => t.trim()).filter(Boolean);
}

/** “姓名：王小明 | 电话：138…” 里的键值对 */
function keyValues(line: string): [string, string][] {
  const out: [string, string][] = [];
  const re = /([一-龥A-Za-z]{2,6})\s*[:：]\s*([^|｜;；\t]+?)(?=\s{2,}|\s*[|｜;；\t]|\s+[一-龥A-Za-z]{2,6}\s*[:：]|$)/g;
  for (const m of line.matchAll(re)) out.push([m[1]!, m[2]!.trim()]);
  return out;
}

const SCHOOL = /(大学|学院|学校|University|College|Institute|School)/i;
const ORG = /(公司|集团|科技|银行|有限|股份|研究院|研究所|事务所|证券|基金|保险|信托|网络|传媒|咨询|控股|医院|报社|电视台|实验室|工作室|中心|Inc|Ltd|Co\.|Corp|Bank|Group|Technolog)/i;
const JOB = /(实习生|实习|工程师|助理|经理|分析师|专员|研究员|顾问|设计师|开发|运营|产品|测试|算法|销售|编辑|记者|会计|审计|主管|负责人|Intern|Engineer|Analyst|Manager|Assistant)/i;
const DEGREE: [RegExp, string, string][] = [
  [/博士/, '博士研究生', '博士'],
  [/硕士|研究生|Master/i, '硕士研究生', '硕士'],
  [/本科|学士|Bachelor/i, '本科', '学士'],
  [/大专|专科|高职/, '大专', ''],
];
const LEVEL = /(国家级|省级|市级|校级|院级|国际级|世界级)/;
const ROLE = /(部长|副部长|主席|副主席|干事|会长|副会长|委员|班长|团支书|支书|社长|队长|组长|负责人|成员|志愿者|主持人|理事|秘书长|助教)/;

// —— 主流程 ——

export function parseResume(raw: string): ParsedResume {
  const profile = emptyProfile('简历导入');
  profile.education = [];
  const found: Found[] = [];
  const notes: string[] = [];
  const add = (group: string, label: string, value: string) => { if (value) found.push({ group, label, value }); };

  const text = raw
    // 全角数字、字母和 ＠．－／＋ 转半角；中文标点保持原样
    .replace(/[０-９Ａ-Ｚａ-ｚ＠．－／＋]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
    .replace(/　/g, ' ')
    .replace(/\r/g, '');
  const lines = text.split('\n').map((l) => l.replace(/\s+$/, '')).filter((l) => l.trim());

  // 1. 分段
  const blocks: { kind: Block; lines: string[] }[] = [{ kind: 'head', lines: [] }];
  for (const l of lines) {
    const h = headerOf(l);
    if (h) blocks.push({ kind: h, lines: [] });
    else blocks.at(-1)!.lines.push(l.trim());
  }
  const blockLines = (k: Block) => blocks.filter((b) => b.kind === k).flatMap((b) => b.lines);

  // 2. 基本信息：全文找邮箱、手机号；开头和“个人信息”段找键值对
  const b = profile.basic;
  b.email = /[\w.+-]+@[\w-]+(\.[\w-]+)+/.exec(text)?.[0] ?? '';
  b.phone = (/(?<!\d)(?:\+?86[-\s]?)?(1[3-9]\d[-\s]?\d{4}[-\s]?\d{4})(?!\d)/.exec(text)?.[1] ?? '').replace(/[-\s]/g, '');

  const headLines = [...blockLines('head'), ...blockLines('basic'), ...blockLines('intention')];
  const intention = profile.intention;
  for (const l of headLines) {
    for (const [k, v0] of keyValues(l)) {
      const v = v0.replace(/\s+/g, ' ').trim();
      if (/^姓名$/.test(k)) b.name = v.replace(/\s/g, '');
      else if (/^性别$/.test(k)) b.gender = /女/.test(v) ? '女' : /男/.test(v) ? '男' : '';
      else if (/出生|生日/.test(k)) b.birthDate = findDate(v);
      else if (/^民族$/.test(k)) b.ethnicity = v;
      else if (/政治面貌/.test(k)) b.politicalStatus = v;
      else if (/^籍贯$/.test(k)) b.nativePlace = v;
      else if (/户口|户籍/.test(k)) b.hukou = v;
      else if (/现居|所在地|所在城市|居住地/.test(k)) b.currentCity = v;
      else if (/求职意向|意向岗位|应聘岗位|应聘职位|期望职位|意向职位|目标岗位/.test(k)) intention.positions = v;
      else if (/期望城市|意向城市|工作地点|期望地点/.test(k)) intention.cities = v;
      else if (/期望薪资|期望月薪|薪资/.test(k)) intention.salary = v;
      else if (/到岗|入职时间/.test(k)) intention.availableDate = findDate(v);
    }
  }
  // 没写“姓名：”时，开头第一行常常就是名字
  if (!b.name) {
    for (const l of blockLines('head').slice(0, 3)) {
      const t = l.replace(/\s/g, '');
      if (/^[一-龥]{2,4}$/.test(t) && !/简历|个人|求职/.test(t)) { b.name = t; break; }
      const first = tokens(l)[0]?.replace(/\s/g, '') ?? '';
      if (/^[一-龥]{2,4}$/.test(first) && !/简历|个人|求职|电话|手机|邮箱/.test(first)) { b.name = first; break; }
    }
  }
  if (!b.gender) {
    const g = headLines.flatMap(tokens).find((t) => t === '男' || t === '女');
    if (g) b.gender = g;
  }
  if (!b.politicalStatus) {
    const p = /(中共预备党员|预备党员|中共党员|共青团员|群众)/.exec(headLines.join(' '));
    if (p) b.politicalStatus = p[1]!;
  }
  if (!intention.positions) {
    const l = blockLines('intention').find((x) => !/[:：]/.test(x));
    if (l) intention.positions = l;
  }
  add('基本信息', '姓名', b.name);
  add('基本信息', '性别', b.gender);
  add('基本信息', '出生日期', b.birthDate);
  add('基本信息', '民族', b.ethnicity);
  add('基本信息', '政治面貌', b.politicalStatus);
  add('基本信息', '籍贯', b.nativePlace);
  add('基本信息', '现居城市', b.currentCity);
  add('基本信息', '手机', b.phone);
  add('基本信息', '邮箱', b.email);
  add('求职意向', '意向岗位', intention.positions);
  add('求职意向', '期望城市', intention.cities);
  add('求职意向', '期望薪资', intention.salary);

  // 3. 经历类：按起止时间切成条
  for (const [i, e] of entries(blockLines('education')).entries()) {
    const ed = emptyEducation();
    ed.start = e.start; ed.end = e.end;
    const toks = e.head.flatMap(tokens).filter((t) => !RANGE.test(t));
    const all = [...e.head, ...e.body].join(' ');
    const schools = toks.filter((t) => SCHOOL.test(t));
    ed.school = schools.find((t) => /大学|University/i.test(t)) ?? schools[0] ?? '';
    ed.college = schools.find((t) => t !== ed.school && /学院|系/.test(t)) ?? '';
    const deg = DEGREE.find(([re]) => toks.some((t) => re.test(t)) || re.test(e.head.join(' ')));
    if (deg) { ed.degree = deg[1]; ed.degreeType = deg[2]; }
    const kvMajor = keyValues(all).find(([k]) => /^(专业|所学专业|专业名称)$/.test(k))?.[1];
    ed.major = kvMajor ?? toks.find((t) => t !== ed.school && t !== ed.college && !DEGREE.some(([re]) => re.test(t))
      && /^[一-龥A-Za-z（）()与和及]{2,20}$/.test(t) && !/[:：]/.test(t)) ?? '';
    const gpa = /(?:GPA|绩点)\s*[:：]?\s*(\d+(?:\.\d+)?)\s*(?:\/\s*(\d+(?:\.\d+)?))?/i.exec(all);
    if (gpa) { ed.gpa = gpa[1]!; ed.gpaScale = gpa[2] ?? ''; }
    const rank = /排名\s*[:：]?\s*(?:第)?\s*(\d+)\s*\/\s*(\d+)/.exec(all);
    if (rank) { ed.rank = rank[1]!; ed.rankTotal = rank[2]!; }
    else { const pct = /排名\s*[:：]?\s*(前\s*\d+(?:\.\d+)?\s*%)/.exec(all); if (pct) ed.rank = pct[1]!.replace(/\s/g, ''); }
    const courses = /(?:主修课程|核心课程|主要课程|相关课程)\s*[:：]\s*(.+)/.exec(all);
    if (courses) ed.courses = courses[1]!.trim();
    if (!ed.school && !ed.major) continue;
    profile.education.push(ed);
    const g = `教育经历 ${i + 1}`;
    add(g, '学校', ed.school); add(g, '学院', ed.college); add(g, '专业', ed.major); add(g, '学历', ed.degree);
    add(g, '时间', span(ed.start, ed.end)); add(g, 'GPA', ed.gpa && `${ed.gpa}${ed.gpaScale ? ` / ${ed.gpaScale}` : ''}`);
    add(g, '排名', ed.rank && `${ed.rank}${ed.rankTotal ? ` / ${ed.rankTotal}` : ''}`);
  }
  // 学历从高到低：网申的“最高学历”取第一条
  const rankOf = (d: string) => ['博士研究生', '硕士研究生', '本科', '大专'].indexOf(d);
  profile.education.sort((x, y) => (rankOf(x.degree) === -1 || rankOf(y.degree) === -1 ? 0 : rankOf(x.degree) - rankOf(y.degree)));

  for (const e of entries(blockLines('internship'))) {
    const it = emptyInternship();
    it.start = e.start; it.end = e.end;
    const toks = e.head.flatMap(tokens).filter((t) => !RANGE.test(t));
    it.company = toks.find((t) => ORG.test(t)) ?? toks[0] ?? '';
    it.title = toks.find((t) => t !== it.company && JOB.test(t)) ?? '';
    it.department = toks.find((t) => t !== it.company && t !== it.title && /(部|组|团队|事业群|中心)$/.test(t)) ?? '';
    it.city = toks.find((t) => /^[一-龥]{2,3}(市)?$/.test(t) && CITIES.test(t)) ?? '';
    it.description = e.body.map(stripBullet).join('\n');
    if (!it.company) continue;
    profile.internships.push(it);
    const g = `实习经历 ${profile.internships.length}`;
    add(g, '公司', it.company); add(g, '职位', it.title); add(g, '部门', it.department); add(g, '时间', span(it.start, it.end));
    add(g, '内容', short(it.description));
  }

  for (const e of entries(blockLines('project'))) {
    const p = emptyProject();
    p.start = e.start; p.end = e.end;
    const toks = e.head.flatMap(tokens).filter((t) => !RANGE.test(t));
    p.role = toks.find((t) => /(负责人|组长|队长|成员|核心|主力|开发|主持|参与|独立|算法|前端|后端)/.test(t)) ?? '';
    p.name = toks.find((t) => t !== p.role) ?? '';
    p.link = /https?:\/\/\S+/.exec([...e.head, ...e.body].join(' '))?.[0] ?? '';
    p.description = e.body.map(stripBullet).join('\n');
    if (!p.name) continue;
    profile.projects.push(p);
    const g = `项目经历 ${profile.projects.length}`;
    add(g, '名称', p.name); add(g, '角色', p.role); add(g, '时间', span(p.start, p.end)); add(g, '描述', short(p.description));
  }

  for (const e of entries(blockLines('campus'))) {
    const c = emptyCampusRole();
    c.start = e.start; c.end = e.end;
    const toks = e.head.flatMap(tokens).filter((t) => !RANGE.test(t));
    c.role = toks.find((t) => ROLE.test(t)) ?? '';
    c.organization = toks.find((t) => t !== c.role) ?? '';
    c.description = e.body.map(stripBullet).join('\n');
    if (!c.organization) continue;
    profile.campus.push(c);
    const g = `校园经历 ${profile.campus.length}`;
    add(g, '组织', c.organization); add(g, '职务', c.role); add(g, '时间', span(c.start, c.end));
  }

  // 4. 获奖：一行可能有几项，用逗号、顿号、分号隔开
  for (const l of blockLines('award')) {
    for (const piece of stripBullet(l).split(/[，,；;、]\s*/)) {
      const date = findDate(piece);
      const name = piece.replace(SINGLE_DATE, '').replace(/^[\s\-–—:：()（）]+|[\s\-–—:：()（）]+$/g, '').trim();
      if (name.length < 3) continue;
      const a = emptyAward();
      a.name = name; a.date = date;
      a.level = LEVEL.exec(name)?.[1] ?? (/国家|全国/.test(name) ? '国家级' : /省/.test(name) ? '省级' : /校/.test(name) ? '校级' : '');
      profile.awards.push(a);
      add('获奖', `第 ${profile.awards.length} 项`, [a.name, a.date].filter(Boolean).join('，'));
    }
  }

  // 5. 技能与证书：全文找四六级、计算机等级、语言成绩
  const sk = profile.skills;
  const cet = (re: RegExp) => {
    const m = re.exec(text);
    return m ? (m[1] ?? '已通过') : '';
  };
  sk.cet4 = cet(/(?:CET-?4|英语四级|大学英语四级|四级)\s*[:：(（]?\s*(\d{3})?/i);
  sk.cet6 = cet(/(?:CET-?6|英语六级|大学英语六级|六级)\s*[:：(（]?\s*(\d{3})?/i);
  sk.computerLevel = /(全国)?计算机(?:等级考试)?\s*([一二三四]级[^\s，,；;)）]*)/.exec(text)?.[2] ?? '';
  const langs: [RegExp, string][] = [
    [/(?:雅思|IELTS)\s*[:：]?\s*(\d(?:\.\d)?)/i, '英语（雅思）'],
    [/(?:托福|TOEFL)\s*[:：]?\s*(\d{2,3})/i, '英语（托福）'],
    [/(?:日语|JLPT)\s*[:：]?\s*(N[1-5])/i, '日语'],
    [/(?:专业英语|TEM)\s*-?\s*([48]级?)/i, '英语专业'],
  ];
  for (const [re, name] of langs) {
    const m = re.exec(text);
    if (m) { const lg = emptyLanguage(); lg.language = name; lg.level = m[1]!; sk.languages.push(lg); }
  }
  const skillLines = blockLines('skill');
  const certRe = /([一-龥A-Za-z]{2,20}(?:证书|资格证|资格证书|职业资格)|CPA|ACCA|CFA\s*(?:Level\s*)?[I1-3]*|FRM|CMA|法律职业资格)/gi;
  for (const m of skillLines.join(' ').matchAll(certRe)) {
    const name = m[0].trim();
    if (/四级|六级|CET|技能证书|相关证书/i.test(name) || sk.certificates.some((c) => c.name === name)) continue;
    const c = emptyCertificate(); c.name = name; sk.certificates.push(c);
  }
  sk.summary = skillLines.map(stripBullet).join('\n');
  add('技能与证书', '英语四级', sk.cet4);
  add('技能与证书', '英语六级', sk.cet6);
  add('技能与证书', '计算机等级', sk.computerLevel);
  sk.languages.forEach((l) => add('技能与证书', l.language, l.level));
  sk.certificates.forEach((c, i) => add('技能与证书', `证书 ${i + 1}`, c.name));
  add('技能与证书', '技能描述', short(sk.summary));

  if (!profile.education.length) { profile.education = [emptyEducation()]; notes.push('没认出教育经历，导入后请在档案里补上。'); }
  if (!b.name) notes.push('没认出姓名。');
  if (!blocks.some((x) => x.kind !== 'head')) notes.push('没找到“教育背景”“实习经历”这类标题，可能是排版比较特别，认出的内容会比较少。');
  if (b.name) profile.title = `${b.name}的简历`;
  return { profile, found, notes };
}

const CITIES = /北京|上海|广州|深圳|杭州|南京|成都|武汉|西安|苏州|天津|重庆|长沙|厦门|青岛|合肥|郑州|济南|宁波|无锡|大连|沈阳|福州|东莞|珠海|佛山|昆明|哈尔滨|长春|南昌|贵阳|南宁|太原|石家庄|香港|澳门|台北/;

const span = (s: string, e: string) => (s || e ? `${s || '?'} 至 ${e || '至今'}` : '');
const short = (s: string) => (s.length > 40 ? `${s.slice(0, 40)}…` : s);

interface Entry { start: string; end: string; head: string[]; body: string[] }

/** 一段经历：起止时间所在行是开头；时间单独占一行时，紧挨着的上一行短标题也算开头 */
function entries(lines: string[]): Entry[] {
  const out: Entry[] = [];
  const isTitle = (l: string) => !isBullet(l) && l.length <= 40 && !/[。；;]/.test(l) && !findRange(l);
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i]!;
    const r = findRange(l);
    if (r) {
      const head = [l.replace(r.text, ' ').trim()].filter(Boolean);
      const prev = out.at(-1);
      // 时间在第二行的写法：“北京大学 | 本科”换行“2021.09-2025.06”
      const before = lines[i - 1];
      const headHasOrg = SCHOOL.test(head.join(' ')) || ORG.test(head.join(' '));
      const takePrev = before !== undefined && isTitle(before) && !/[:：]/.test(before)
        && (head.join('').length < 4 || (!headHasOrg && (SCHOOL.test(before) || ORG.test(before))))
        && (!prev || prev.body.at(-1) === before);
      if (takePrev) { prev?.body.pop(); head.unshift(before); }
      out.push({ start: r.start, end: r.end, head, body: [] });
      continue;
    }
    const cur = out.at(-1);
    if (!cur) continue;
    // 紧跟开头的短行（如“计算机科学与技术 | 本科”）算标题的一部分
    if (!cur.body.length && isTitle(l) && cur.head.join(' ').length < 30 && (SCHOOL.test(l) || ORG.test(l) || JOB.test(l) || DEGREE.some(([re]) => re.test(l)) || ROLE.test(l))) {
      cur.head.push(l);
    } else {
      cur.body.push(l);
    }
  }
  // 没有任何起止时间：整段当成一条（比如只写了学校名）
  if (!out.length && lines.length) out.push({ start: '', end: '', head: [lines[0]!], body: lines.slice(1) });
  return out;
}
