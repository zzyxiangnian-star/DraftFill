import { defineConfig } from 'wxt';

// 计划书第 2 节：最小权限。只用 activeTab + 用户点击触发，不申请 host_permissions。
export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  manifest: {
    name: '网申助手',
    description: '在网申页面一键填写个人档案，只填不交，填完由你检查后自己提交。',
    permissions: ['activeTab', 'scripting', 'storage', 'sidePanel'],
    action: { default_title: '网申助手' },
  },
});
