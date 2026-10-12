import { Button, Cascader, Checkbox, ConfigProvider, DatePicker, Form, Input, Radio, Select, Typography } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { ETHNICITIES } from '../../../src/lib/profile/options';
import { cascaderOptions } from './regions';

// data-expect 写在 Form.Item 外层 div 上：档案路径，none 表示不应填写。
const E = ({ path, children }: { path: string; children: React.ReactNode }) => <div data-expect={path}>{children}</div>;
const opts = (xs: string[]) => xs.map((x) => ({ label: x, value: x }));
// 专业带学科代码，测试模糊匹配
const MAJORS = ['计算机科学与技术(081200)', '计算机技术(085404)', '软件工程(083500)', '电子信息(085400)'];
const SCHOOLS = ['北京大学', '北京交通大学', '北京理工大学', '清华大学', '武汉大学', '武汉理工大学', '复旦大学', '浙江大学', '南京大学', '中山大学', '四川大学', '山东大学'];

/** 远程搜索的学校框：不输入时没有选项，点了也不弹出，要先打字（真实网申页常见） */
function RemoteSchool(props: object) {
  const [list, setList] = useState<string[]>([]);
  return (
    <Select {...props} showSearch allowClear filterOption={false} notFoundContent={null} options={opts(list)} placeholder="请输入就读学校"
      onSearch={(q) => setTimeout(() => setList(q ? SCHOOLS.filter((x) => x.includes(q)) : []), 150)} />
  );
}

function App() {
  return (
    <ConfigProvider locale={zhCN}>
      <div style={{ maxWidth: 640, margin: '24px auto' }}>
        <Typography.Title level={3}>示例互联网公司 · 校招网申</Typography.Title>
        <Form layout="vertical" onValuesChange={(_, all) => { (window as any).__values = all; }} onFinish={() => { (window as any).__submitted = true; }}>
          <Typography.Title level={4}>基本信息</Typography.Title>
          <E path="basic.name"><Form.Item label="姓名" name="name" rules={[{ required: true }]}><Input /></Form.Item></E>
          <E path="basic.phone"><Form.Item label="手机" name="mobile"><Input /></Form.Item></E>
          <E path="basic.email"><Form.Item label="邮箱" name="email"><Input /></Form.Item></E>
          <E path="basic.gender"><Form.Item label="性别" name="gender"><Radio.Group options={['男', '女']} /></Form.Item></E>
          <E path="basic.ethnicity"><Form.Item label="民族" name="nation"><Select allowClear options={opts(ETHNICITIES)} placeholder="请选择" /></Form.Item></E>
          <E path="basic.politicalStatus"><Form.Item label="政治面貌" name="political"><Select allowClear options={opts(['中共党员', '中共预备党员', '共青团员', '群众'])} /></Form.Item></E>
          <E path="basic.hukou"><Form.Item label="户口所在地" name="hukou"><Cascader options={cascaderOptions()} placeholder="请选择省 / 市" /></Form.Item></E>
          <E path="basic.birthDate"><Form.Item label="出生日期" name="birthday"><DatePicker style={{ width: '100%' }} /></Form.Item></E>

          <Typography.Title level={4}>教育经历</Typography.Title>
          <E path="education[0].degree"><Form.Item label="最高学历" name="topDegree"><Select options={opts(['本科', '硕士', '博士', '其他'])} /></Form.Item></E>
          <E path="education[0].school"><Form.Item label="毕业院校" name="school"><RemoteSchool /></Form.Item></E>
          <E path="education[0].major"><Form.Item label="专业" name="major"><Select showSearch allowClear options={opts(MAJORS)} placeholder="请选择专业" /></Form.Item></E>
          <E path="education[0].end"><Form.Item label="毕业时间" name="graduate"><DatePicker picker="month" style={{ width: '100%' }} /></Form.Item></E>

          <Typography.Title level={4}>实习经历</Typography.Title>
          <E path="internships[0].company"><Form.Item label="公司" name="company"><Input /></Form.Item></E>
          <E path="internships[0].title"><Form.Item label="岗位" name="title"><Input /></Form.Item></E>
          <E path="internships[0].start"><Form.Item label="开始时间" name="start"><DatePicker picker="month" style={{ width: '100%' }} /></Form.Item></E>
          <E path="internships[0].description"><Form.Item label="工作描述" name="desc"><Input.TextArea rows={3} maxLength={300} showCount /></Form.Item></E>

          <Typography.Title level={4}>求职意向</Typography.Title>
          <E path="intention.cities"><Form.Item label="期望城市" name="city"><Input /></Form.Item></E>
          <E path="intention.acceptAdjust"><Form.Item label="是否接受调剂" name="adjust"><Radio.Group options={['是', '否']} /></Form.Item></E>
          <E path="none"><Form.Item name="agree" valuePropName="checked"><Checkbox>我已阅读并同意隐私政策</Checkbox></Form.Item></E>
          <Button type="primary" htmlType="submit">提交</Button>
        </Form>
      </div>
    </ConfigProvider>
  );
}

createRoot(document.getElementById('root')!).render(<App />);
