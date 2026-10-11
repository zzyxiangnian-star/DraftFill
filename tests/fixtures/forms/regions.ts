// 测试表单用的省市数据（只取几个省，够测试级联选择就行）
export const REGIONS: { label: string; children: string[] }[] = [
  { label: '北京市', children: ['北京市'] },
  { label: '湖北省', children: ['武汉市', '宜昌市', '襄阳市'] },
  { label: '湖南省', children: ['长沙市', '株洲市', '湘潭市', '岳阳市'] },
  { label: '吉林省', children: ['长春市', '吉林市'] },
  { label: '广东省', children: ['广州市', '深圳市', '珠海市'] },
  { label: '广西壮族自治区', children: ['南宁市', '桂林市'] },
];
export const cascaderOptions = () => REGIONS.map((p) => ({ label: p.label, value: p.label, children: p.children.map((c) => ({ label: c, value: c })) }));
