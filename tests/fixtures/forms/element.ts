import ElementPlus from 'element-plus';
import 'element-plus/dist/index.css';
import zhCn from 'element-plus/es/locale/lang/zh-cn';
import { createApp, h, reactive } from 'vue';
import { ETHNICITIES } from '../../../src/lib/profile/options';
import { cascaderOptions } from './regions';

// data-expect 写在 el-form-item 外层 div 上。用渲染函数写，避免引入 Vue 模板编译。
const form = reactive<Record<string, unknown>>({});
(window as any).__values = form;
const opts = (xs: string[]) => xs.map((x) => h(resolve('ElOption'), { label: x, value: x }));
let app: ReturnType<typeof createApp>;
const resolve = (name: string) => app.component(name)!;

function item(path: string, label: string, key: string, control: 'input' | 'textarea' | 'select' | 'month' | 'date' | 'cascader', options: string[] = []) {
  const model = { modelValue: form[key], 'onUpdate:modelValue': (v: unknown) => { form[key] = v; } };
  const inner =
    // 学历下拉故意不带清空按钮，用来测试“无法自动撤销”的提示
    control === 'select' ? h(resolve('ElSelect'), { ...model, placeholder: '请选择', clearable: key !== 'degree' }, () => opts(options))
    : control === 'cascader' ? h(resolve('ElCascader'), { ...model, options: cascaderOptions(), clearable: true, placeholder: '请选择省 / 市' })
    : control === 'month' ? h(resolve('ElDatePicker'), { ...model, type: 'month', placeholder: '选择月份', valueFormat: 'YYYY-MM', format: 'YYYY-MM' })
    : control === 'date' ? h(resolve('ElDatePicker'), { ...model, type: 'date', placeholder: '选择日期', valueFormat: 'YYYY-MM-DD', format: 'YYYY-MM-DD' })
    : h(resolve('ElInput'), { ...model, type: control === 'textarea' ? 'textarea' : 'text' });
  return h('div', { 'data-expect': path }, [h(resolve('ElFormItem'), { label }, () => inner)]);
}

const Title = (t: string) => h('h3', { class: 'section-title' }, t);

app = createApp({
  render: () => h('div', { style: 'max-width:720px;margin:24px auto' }, [
    h('h2', '示例银行 2027 校园招聘 · 网上申请'),
    h(resolve('ElForm'), { labelWidth: '120px' }, () => [
      Title('个人信息'),
      item('basic.name', '姓名', 'name', 'input'),
      item('basic.gender', '性别', 'gender', 'select', ['男', '女']),
      item('basic.birthDate', '出生年月', 'birth', 'month'),
      item('basic.politicalStatus', '政治面貌', 'political', 'select', ['中共党员', '中共预备党员', '共青团员', '民主党派', '群众']),
      item('basic.ethnicity', '民族', 'nation', 'select', ETHNICITIES),
      item('basic.nativePlace', '籍贯', 'native', 'cascader'),
      item('basic.hukou', '户籍所在地', 'hukou', 'input'),
      item('basic.phone', '手机号码', 'phone', 'input'),
      item('basic.idType', '证件类型', 'idType', 'select', ['身份证', '护照', '港澳通行证']),
      Title('教育背景'),
      item('education[0].school', '学校', 'school', 'select', ['北京大学(Peking University)', '北京大学医学部(Peking University Health Science Center)', '清华大学(Tsinghua University)', '武汉大学(Wuhan University)']),
      item('education[0].degree', '学历', 'degree', 'select', ['本科', '硕士研究生', '博士研究生']),
      item('education[0].degreeType', '学位', 'degreeType', 'select', ['学士', '硕士', '博士']),
      item('education[0].major', '专业名称', 'major', 'input'),
      item('education[0].start', '入学时间', 'start', 'month'),
      item('education[0].end', '毕业时间', 'end', 'month'),
      Title('家庭主要成员'),
      item('family[0].relation', '称谓', 'rel', 'select', ['父亲', '母亲', '兄弟姐妹', '配偶']),
      item('family[0].name', '姓名', 'fname', 'input'),
      item('family[0].employer', '工作单位', 'femp', 'input'),
      item('family[0].title', '职务', 'ftitle', 'input'),
      Title('其他'),
      item('intention.availableDate', '可到岗时间', 'avail', 'date'),
      item('none', '自我评价', 'self', 'textarea'),
    ]),
    h(resolve('ElButton'), { type: 'primary', onClick: () => { (window as any).__submitted = true; } }, () => '提交'),
  ]),
});
app.use(ElementPlus, { locale: zhCn });
app.mount('#app');
