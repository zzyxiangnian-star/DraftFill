import { defineConfig } from 'wxt';

// 计划书第 2 节：最小权限。只用 activeTab + 用户点击触发，不申请 host_permissions。
export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  manifest: {
    name: '网申助手 DraftFill',
    description: '在网申页面一键填写个人档案，只填不交，填完由你检查后自己提交。',
    permissions: ['activeTab', 'scripting', 'storage', 'sidePanel', 'alarms'], // alarms：每小时检查收藏岗位的截止日期，安装时不弹任何权限提示
    // AI 服务商的接口：用户在设置页点“保存”时才申请对应的那一个网站，安装时不申请
    optional_host_permissions: [
      'https://api.deepseek.com/*', 'https://dashscope.aliyuncs.com/*', 'https://open.bigmodel.cn/*', 'https://api.moonshot.cn/*',
      'https://ark.cn-beijing.volces.com/*', 'https://api.siliconflow.cn/*',
      'https://api.hunyuan.cloud.tencent.com/*', 'https://qianfan.baidubce.com/*', 'https://*/*', 'http://localhost/*', 'http://127.0.0.1/*',
    ],
    action: { default_title: '网申助手 DraftFill' },
  },
});
