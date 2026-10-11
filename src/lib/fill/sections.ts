import { clean } from './text';

// 表单分区：用来消除同名字段的歧义，例如“姓名”在家庭成员区就不是本人姓名。

export type Section =
  | 'basic' | 'intention' | 'education' | 'internship' | 'project' | 'campus'
  | 'award' | 'language' | 'certificate' | 'skill' | 'family' | 'emergency';

// 顺序有意义：先判断更具体的
const RULES: [Section, RegExp][] = [
  ['emergency', /紧急/],
  ['family', /家庭|亲属|社会关系|家人/],
  ['internship', /实习|工作经历|工作经验|实践经历|职业经历/],
  ['project', /项目/],
  ['campus', /校园|社团|学生干部|在校经历|学生工作|校内/],
  ['award', /获奖|奖励|荣誉|奖学金|奖惩/],
  ['language', /语言|外语|英语/],
  ['certificate', /证书|资格/],
  ['education', /教育|学历|学习经历|求学/],
  ['skill', /技能|特长/],
  ['intention', /求职意向|意向|应聘信息|岗位信息|职位信息|投递信息/],
  ['basic', /基本信息|个人信息|基础信息|个人资料|联系方式|身份信息/],
];

export function classifySection(title: string): Section | null {
  const t = clean(title);
  if (!t || t.length > 20) return null;
  for (const [s, re] of RULES) if (re.test(t)) return s;
  return null;
}

const HEADING = 'h1, h2, h3, h4, h5, h6, legend, [role="heading"], .ant-card-head-title, .el-card__header, [class*="section-title"], [class*="sectionTitle"], [class*="module-title"], [class*="block-title"], [class*="group-title"], [class*="blockTitle"], [id*="_Recruitment_"]:not([name])';
// 后两个来自真实页面：Moka 的分区标题 blockTitle-xxx；北森的分区标题是带 _Recruitment_ id 的 div（表单本身同 id 但带 name）

function level(h: Element): number {
  const m = /^H([1-6])$/.exec(h.tagName);
  return m ? Number(m[1]) : 6;
}

/**
 * 找出控件所在的分区：文档顺序上它前面的标题里，层级最深的、能识别的那个。
 * 认不出的标题（如“其他”）会结束同级及更深的分区，避免把后面的字段算进上一个分区。
 */
export function sectionOf(el: Element, headings: Element[]): Section | null {
  const stack: (Section | null)[] = [];
  for (const h of headings) {
    const pos = h.compareDocumentPosition(el);
    if (!(pos & Node.DOCUMENT_POSITION_FOLLOWING || pos & Node.DOCUMENT_POSITION_CONTAINED_BY)) break;
    const lv = level(h);
    stack.length = lv;
    const s = classifySection(headingText(h));
    // h1 一般是页面标题（公司名、招聘名），认不出时不清空
    if (s || lv > 1) stack[lv - 1] = s;
  }
  for (let i = stack.length - 1; i >= 0; i--) {
    if (stack[i] !== undefined) return stack[i] ?? null;
  }
  return null;
}

/** 标题文字：跳过标题栏里的按钮（“添加”）和说明文字（Moka 的 describe-xxx） */
function headingText(h: Element): string {
  let out = '';
  const walk = (n: Node) => {
    if (n.nodeType === Node.TEXT_NODE) { out += n.textContent ?? ''; return; }
    if (!(n instanceof Element) || n.matches('button, [class*="describe"], [class*="desc"], [class*="tip"], [class*="hint"]')) return;
    for (const c of n.childNodes) walk(c);
  };
  walk(h);
  return out;
}

export function collectHeadings(root: ParentNode): Element[] {
  return [...root.querySelectorAll(HEADING)];
}
