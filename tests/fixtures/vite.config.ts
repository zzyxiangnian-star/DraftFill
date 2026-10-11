import react from '@vitejs/plugin-react';
import vue from '@vitejs/plugin-vue';
import { resolve } from 'node:path';
import { defineConfig } from 'vite';

// 测试表单：用真实的 Ant Design / Element Plus 组件模拟 Moka、北森一类的网申页面。
// npm run fixtures 构建到 tests/fixtures/dist，Playwright 测试从这里加载。
const root = resolve(__dirname, 'forms');
export default defineConfig({
  root,
  base: './',
  plugins: [react(), vue()],
  build: {
    outDir: resolve(__dirname, 'dist'),
    emptyOutDir: true,
    rollupOptions: {
      input: {
        native: resolve(root, 'native.html'),
        antd: resolve(root, 'antd.html'),
        element: resolve(root, 'element.html'),
        steps: resolve(root, 'steps.html'),
        'steps-frame': resolve(root, 'steps-frame.html'),
        multi: resolve(root, 'multi.html'),
      },
    },
  },
});
