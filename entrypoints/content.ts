import { listen } from '@/src/lib/content/agent';

// runtime 注册：不写进 manifest 的 content_scripts，只在用户点击后由 background 注入。
export default defineContentScript({
  registration: 'runtime',
  main() {
    listen();
  },
});
