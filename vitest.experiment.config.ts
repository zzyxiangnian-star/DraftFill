import { defineConfig } from 'vitest/config';
import { WxtVitest } from 'wxt/testing/vitest-plugin';

// 对照实验（计划书第 8 节第 4 条）：不在日常测试里跑。npm run experiment
export default defineConfig({
  plugins: [WxtVitest()],
  test: { environment: 'happy-dom', include: ['tests/experiment/**/*.exp.ts'], testTimeout: 120_000 },
});
