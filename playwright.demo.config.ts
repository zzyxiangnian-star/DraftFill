import { defineConfig } from '@playwright/test';

// 生成 README 演示动图（npm run demo）和截图（npm run screens），不属于测试。
export default defineConfig({
  testDir: 'tests/e2e',
  testMatch: /(demo|screens)\.spec\.ts/,
  workers: 1,
  reporter: [['list']],
});
