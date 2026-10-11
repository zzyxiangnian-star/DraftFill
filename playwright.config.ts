import { defineConfig } from '@playwright/test';

// 端到端测试：加载打包好的插件，在 tests/fixtures 的测试表单上识别并填写。
// 先运行 npm run build 和 npm run fixtures。
export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 60_000,
  workers: 1,
  reporter: [['list']],
});
