import type { Section } from './sections';

// 字段词典：档案路径 → 网申页面上常见的叫法。
// strong：单独出现就能确定的叫法；ctx：只有在对应分区里才算数的泛称（如“开始时间”）。
// home：这个字段所属的分区。分区已知且不在 home 里时，不匹配。
// exclude：标签里出现这些词就一定不是这个字段。
// keys：name / id 属性里的英文词。

export interface Alias {
  path: string;
  strong: string[];
  ctx?: string[];
  home: Section[];
  exclude?: string[];
  keys?: string[][];
  /** 起止时间写在同一个标签下（如“就读时间：年 月 - 年 月”）时的叫法，只对开始/结束字段有用 */
  range?: string[];
}

const PERSON_EXCLUDE = ['英文', '拼音', '紧急', '联系人', '父', '母', '家庭', '亲属', '推荐', '内推', '配偶', '导师', '证明人'];
const BASIC: Section[] = ['basic'];
const EDU: Section[] = ['education'];
const INTERN: Section[] = ['internship'];
const PROJ: Section[] = ['project'];
const CAMPUS: Section[] = ['campus'];

export const ALIASES: Alias[] = [
  // 基本信息
  { path: 'basic.name', strong: ['姓名', '真实姓名', '中文姓名', '申请人姓名', '本人姓名', '名字'], home: BASIC, exclude: PERSON_EXCLUDE,
    keys: [['name'], ['real', 'name'], ['true', 'name'], ['full', 'name'], ['cn', 'name'], ['candidate', 'name']] },
  { path: 'basic.gender', strong: ['性别'], home: BASIC, keys: [['gender'], ['sex']] },
  { path: 'basic.birthDate', strong: ['出生日期', '出生年月', '生日', '出生时间', '出生年月日'], home: BASIC, keys: [['birthday'], ['birth', 'date'], ['birth']] },
  { path: 'basic.ethnicity', strong: ['民族'], home: BASIC, keys: [['nation'], ['nationality'], ['ethnic'], ['ethnicity']] },
  { path: 'basic.politicalStatus', strong: ['政治面貌', '政治身份'], home: BASIC, keys: [['political'], ['political', 'status'], ['politics']] },
  { path: 'basic.nativePlace', strong: ['籍贯'], home: BASIC, keys: [['native', 'place']] },
  { path: 'basic.hukou', strong: ['户口所在地', '户籍所在地', '户籍地', '户籍', '户口', '户籍地址', '户口地址'], home: BASIC,
    exclude: ['性质', '类型', '类别', '是否'] },
  { path: 'basic.sourceRegion', strong: ['生源地', '生源所在地', '高考省份', '生源省份', '高考所在地'], home: BASIC },
  { path: 'basic.currentCity', strong: ['现居城市', '现居住地', '现居地', '目前所在城市', '所在城市', '居住城市', '当前所在地', '现所在地', '现居住城市'],
    home: BASIC, exclude: ['期望', '意向', '学校'] },
  { path: 'basic.phone', strong: ['手机', '手机号', '手机号码', '移动电话', '联系电话', '电话', '电话号码'], ctx: ['联系方式'], home: BASIC,
    exclude: PERSON_EXCLUDE, keys: [['mobile'], ['phone'], ['tel'], ['cellphone'], ['telephone'], ['mobile', 'phone']] },
  { path: 'basic.email', strong: ['邮箱', '电子邮箱', '电子邮件', 'email', 'e-mail', '邮件地址', '邮箱地址', '个人邮箱'], home: BASIC,
    exclude: ['紧急', '推荐'], keys: [['email'], ['mail'], ['e', 'mail']] },
  { path: 'basic.idType', strong: ['证件类型', '身份证件类型'], home: BASIC, keys: [['id', 'type'], ['card', 'type']] },
  { path: 'basic.idNumber', strong: ['身份证号', '身份证号码', '证件号码', '证件号', '身份证', '身份证件号码'], home: BASIC, exclude: ['类型', '紧急', '父', '母'],
    keys: [['id', 'card'], ['idcard'], ['id', 'number'], ['id', 'no'], ['card', 'no']] },
  { path: 'basic.address', strong: ['通讯地址', '联系地址', '家庭住址', '现居住地址', '详细地址', '邮寄地址', '现住址', '家庭地址'], home: BASIC,
    keys: [['address']] },

  // 求职意向
  { path: 'intention.positions', strong: ['意向岗位', '应聘岗位', '期望职位', '意向职位', '期望岗位', '申请职位', '应聘职位', '求职意向'],
    home: ['intention', 'basic'] },
  { path: 'intention.cities', strong: ['期望城市', '意向城市', '期望工作城市', '意向工作城市', '意向工作地点', '期望工作地点', '意向城市'], ctx: ['工作地点', '城市'],
    home: ['intention', 'basic'], exclude: ['第二', '第三', '其他', '备选'] },
  { path: 'intention.salary', strong: ['期望薪资', '期望月薪', '期望薪酬', '薪资要求', '期望年薪', '期望待遇'], home: ['intention', 'basic'] },
  { path: 'intention.availableDate', strong: ['到岗时间', '最早到岗时间', '可入职时间', '预计到岗时间', '可到岗时间'], ctx: ['入职时间'],
    home: ['intention', 'basic'] },
  { path: 'intention.acceptAdjust', strong: ['是否服从调剂', '服从调剂', '是否接受调剂', '接受调剂', '是否服从分配', '是否服从岗位调剂'],
    home: ['intention', 'basic'] },
  { path: 'intention.infoSource', strong: ['信息来源', '招聘信息来源', '获知渠道', '了解渠道', '从何得知', '获取信息渠道', '渠道来源'],
    home: ['intention', 'basic'] },
  { path: 'intention.referralCode', strong: ['内推码', '推荐码', '内推编码', '内推码(选填)'], home: ['intention', 'basic'] },

  // 教育经历（多条）
  { path: 'education[].school', strong: ['学校', '学校名称', '毕业院校', '就读院校', '院校名称', '毕业学校', '院校', '就读学校'], home: EDU,
    exclude: ['城市', '所在地', '地址', '类型', '性质', '代码', '国家', '地区', '层次', '是否'], keys: [['school'], ['university'], ['school', 'name']] },
  { path: 'education[0].degree', strong: ['最高学历'], home: ['education', 'basic'], keys: [['highest', 'degree'], ['highest', 'education']] },
  { path: 'education[].degree', strong: ['学历', '学历层次', '教育程度', '学历类别', '培养层次'], home: EDU, exclude: ['最高', '证书', '编号', '性质'],
    keys: [['degree'], ['education'], ['edu', 'level']] },
  { path: 'education[].degreeType', strong: ['学位', '学位类型', '所获学位', '获得学位'], home: EDU, exclude: ['证书', '编号'] },
  { path: 'education[].studyMode', strong: ['学习形式', '学习方式', '培养方式', '就读方式', '教育形式'], home: EDU },
  { path: 'education[].college', strong: ['院系', '学院', '所在院系', '所在学院', '院系名称'], home: EDU },
  { path: 'education[].major', strong: ['专业', '专业名称', '所学专业', '就读专业'], home: EDU, exclude: ['排名', '人数', '方向', '技能', '类别', '代码'],
    keys: [['major'], ['major', 'name'], ['specialty']] },
  { path: 'education[].start', strong: ['入学时间', '入学日期', '入学年月'], ctx: ['开始时间', '起始时间', '开始日期', '起始日期'], home: EDU,
    range: ['就读时间', '在校时间', '就读起止时间', '在读时间', '起止时间', '学习时间'] },
  { path: 'education[].end', strong: ['毕业时间', '毕业日期', '毕业年月', '预计毕业时间'], ctx: ['结束时间', '截止时间', '结束日期'], home: EDU },
  { path: 'education[].gpa', strong: ['gpa', '绩点', '平均绩点', '平均学分绩点', '学分绩点', 'gpa成绩'], home: EDU, exclude: ['满分', '总分', '排名', '证明'], keys: [['gpa']] },
  { path: 'education[].gpaScale', strong: ['gpa满分', '绩点满分', '满分', 'gpa总分'], home: EDU },
  { path: 'education[].rank', strong: ['专业排名', '成绩排名', '年级排名', '班级排名', '排名'], home: EDU, exclude: ['人数', '总'] },
  { path: 'education[].rankTotal', strong: ['专业总人数', '排名总人数', '总人数', '专业人数', '年级人数'], home: EDU },
  { path: 'education[].courses', strong: ['主修课程', '主要课程', '核心课程', '专业课程'], home: EDU },

  // 实习经历
  { path: 'internships[].company', strong: ['实习单位', '实习公司'], ctx: ['公司', '公司名称', '单位名称', '工作单位', '单位', '企业名称'], home: INTERN,
    exclude: ['性质', '类型', '规模', '行业', '地点', '城市'] },
  { path: 'internships[].title', strong: ['实习岗位', '实习职位'], ctx: ['职位', '岗位', '职位名称', '担任职位', '岗位名称', '职务'], home: INTERN,
    exclude: ['类别', '类型', '性质', '级别'] },
  { path: 'internships[].department', strong: ['实习部门'], ctx: ['部门', '所在部门'], home: INTERN },
  { path: 'internships[].city', strong: ['实习城市'], ctx: ['城市', '工作城市', '工作地点'], home: INTERN },
  { path: 'internships[].start', strong: ['实习开始时间'], ctx: ['开始时间', '入职时间', '起始时间', '开始日期', '起始日期'], home: INTERN,
    range: ['起止时间', '实习时间', '在职时间', '工作时间', '任职时间'] },
  { path: 'internships[].end', strong: ['实习结束时间'], ctx: ['结束时间', '离职时间', '截止时间', '结束日期'], home: INTERN },
  { path: 'internships[].description', strong: ['实习内容', '实习描述'], ctx: ['工作内容', '工作描述', '职责描述', '主要职责', '描述', '工作职责'], home: INTERN },

  // 项目经历
  { path: 'projects[].name', strong: ['项目名称', '项目名'], home: PROJ },
  { path: 'projects[].role', strong: ['项目角色'], ctx: ['担任角色', '角色', '担任职务', '职责'], home: PROJ },
  { path: 'projects[].start', strong: ['项目开始时间'], ctx: ['开始时间', '起始时间', '开始日期'], home: PROJ,
    range: ['起止时间', '项目时间'] },
  { path: 'projects[].end', strong: ['项目结束时间'], ctx: ['结束时间', '截止时间', '结束日期'], home: PROJ },
  { path: 'projects[].link', strong: ['项目链接', '项目地址'], ctx: ['链接'], home: PROJ },
  { path: 'projects[].description', strong: ['项目描述', '项目内容', '项目简介', '项目经历描述'], ctx: ['描述', '内容'], home: PROJ },

  // 校园经历
  { path: 'campus[].organization', strong: ['社团名称', '学生组织'], ctx: ['组织名称', '组织', '社团'], home: CAMPUS },
  { path: 'campus[].role', strong: ['担任职务'], ctx: ['职务', '任职', '职位', '角色'], home: CAMPUS },
  { path: 'campus[].start', strong: [], ctx: ['开始时间', '起始时间', '开始日期'], home: CAMPUS, range: ['起止时间', '任职时间'] },
  { path: 'campus[].end', strong: [], ctx: ['结束时间', '截止时间', '结束日期'], home: CAMPUS },
  { path: 'campus[].description', strong: [], ctx: ['经历描述', '描述', '工作内容', '内容'], home: CAMPUS },

  // 获奖
  { path: 'awards[].name', strong: ['奖项名称', '获奖名称', '奖励名称', '荣誉名称'], ctx: ['奖项', '名称'], home: ['award'] },
  { path: 'awards[].level', strong: ['获奖级别', '奖项级别', '奖励级别'], ctx: ['级别'], home: ['award'] },
  { path: 'awards[].date', strong: ['获奖时间', '获奖日期'], ctx: ['获得时间', '颁发时间', '时间', '日期'], home: ['award'] },
  { path: 'awards[].description', strong: ['获奖描述'], ctx: ['说明', '描述'], home: ['award'] },

  // 语言与证书
  { path: 'skills.cet4', strong: ['英语四级', 'cet4', 'cet-4', '大学英语四级', '四级成绩', '四级'], home: ['language', 'skill', 'certificate', 'basic'], exclude: ['六级'] },
  { path: 'skills.cet6', strong: ['英语六级', 'cet6', 'cet-6', '大学英语六级', '六级成绩', '六级'], home: ['language', 'skill', 'certificate', 'basic'], exclude: ['四级'] },
  { path: 'skills.computerLevel', strong: ['计算机等级', '计算机水平', '计算机能力', '计算机等级证书'], home: ['skill', 'certificate', 'basic'] },
  { path: 'skills.summary', strong: ['专业技能', '技能特长', '个人技能', '技能描述'], ctx: ['技能', '特长'], home: ['skill'] },
  { path: 'skills.languages[].language', strong: ['外语语种'], ctx: ['语种', '语言'], home: ['language'] },
  { path: 'skills.languages[].level', strong: ['外语水平', '语言等级'], ctx: ['等级', '掌握程度', '熟练程度', '水平', '成绩'], home: ['language'],
    exclude: ['测试', '证明'] },
  { path: 'skills.certificates[].name', strong: ['证书名称'], ctx: ['证书', '名称'], home: ['certificate'] },
  { path: 'skills.certificates[].date', strong: ['获证时间', '发证时间'], ctx: ['获得时间', '时间', '日期'], home: ['certificate'] },

  // 家庭成员
  { path: 'family[].relation', strong: ['与本人关系'], ctx: ['关系', '称谓', '亲属关系'], home: ['family'] },
  { path: 'family[].name', strong: [], ctx: ['姓名', '成员姓名', '亲属姓名'], home: ['family'] },
  { path: 'family[].employer', strong: [], ctx: ['工作单位', '单位', '所在单位', '工作单位及职务'], home: ['family'] },
  { path: 'family[].title', strong: [], ctx: ['职务', '职位', '职业'], home: ['family'] },
  { path: 'family[].phone', strong: [], ctx: ['联系电话', '电话', '手机', '联系方式'], home: ['family'] },

  // 紧急联系人：“紧急联系人”字样足够明确，放在任何分区都认
  { path: 'emergencyContact.name', strong: ['紧急联系人', '紧急联系人姓名'], ctx: ['姓名', '联系人'],
    home: ['emergency', 'basic', 'family'], exclude: ['电话', '手机', '关系', '方式', '推荐', '内推', '父', '母', '英文'] },
  { path: 'emergencyContact.relation', strong: ['紧急联系人关系', '与紧急联系人关系'], ctx: ['关系', '与本人关系'], home: ['emergency', 'basic', 'family'] },
  { path: 'emergencyContact.phone', strong: ['紧急联系人电话', '紧急联系电话', '紧急联系人手机', '紧急联系人联系方式'], ctx: ['电话', '联系电话', '手机', '联系方式'],
    home: ['emergency', 'basic', 'family'] },
];
