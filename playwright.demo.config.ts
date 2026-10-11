import { defineConfig } from '@playwright/test';

// 生成 README 演示动图（npm run demo），不属于测试。
export default defineConfig({
  testDir: 'tests/e2e',
  testMatch: 'demo.spec.ts',
  workers: 1,
  reporter: [['list']],
});
