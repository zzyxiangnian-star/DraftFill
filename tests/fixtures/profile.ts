import { emptyProfile, type Profile } from '../../src/lib/profile/schema';

// 测试用档案（虚构人物），覆盖各分区。证件号故意不开自动填写，用来测试敏感信息拦截。
export function sampleProfile(): Profile {
  const p = emptyProfile('测试档案');
  p.basic = {
    name: '王小明', gender: '男', birthDate: '2001-05-20', ethnicity: '汉族', politicalStatus: '共青团员',
    nativePlace: '湖南长沙', hukou: '湖南省长沙市', sourceRegion: '湖南', currentCity: '北京',
    phone: '13800138000', email: 'xiaoming@example.com', idType: '居民身份证', idNumber: '11010519491231002X', address: '北京市海淀区颐和园路5号',
  };
  p.intention = { positions: '后端开发工程师', cities: '北京、上海', salary: '面议', availableDate: '2027-07-01', acceptAdjust: '是', infoSource: '官网', referralCode: 'NTA8X2' };
  p.education = [
    { id: 'e1', school: '北京大学', degree: '硕士研究生', degreeType: '硕士', studyMode: '全日制', college: '计算机学院', major: '计算机技术',
      start: '2024-09', end: '2027-06', gpa: '3.8', gpaScale: '4.0', rank: '5', rankTotal: '120', courses: '分布式系统、机器学习' },
    { id: 'e2', school: '武汉大学', degree: '本科', degreeType: '学士', studyMode: '全日制', college: '计算机学院', major: '软件工程',
      start: '2020-09', end: '2024-06', gpa: '3.6', gpaScale: '4.0', rank: '12', rankTotal: '200', courses: '数据结构、操作系统' },
  ];
  p.internships = [{ id: 'i1', company: '示例科技', title: '后端开发实习生', department: '基础架构部', city: '北京', start: '2025-06', end: '2025-09', description: '负责订单服务的接口开发与压测。' }];
  p.projects = [{ id: 'p1', name: '校园二手交易平台', role: '后端负责人', start: '2023-03', end: '2023-12', link: '', description: '用 Go 实现交易与消息模块。' }];
  p.awards = [{ id: 'a1', name: '国家奖学金', level: '国家级', date: '2022-10', description: '' }];
  p.skills = { cet4: '580', cet6: '530', computerLevel: '二级', languages: [], certificates: [], summary: '熟悉 Go、Java、MySQL' };
  p.family = [
    { id: 'f1', relation: '父亲', name: '王大明', employer: '长沙某机械厂', title: '工程师', phone: '13900000001' },
    { id: 'f2', relation: '母亲', name: '李秀英', employer: '长沙某中学', title: '教师', phone: '13900000002' },
  ];
  p.emergencyContact = { name: '王大明', relation: '父亲', phone: '13900000001' };
  p.autofill = { phone: true, email: true, idNumber: false, family: true, emergencyContact: true };
  return p;
}
