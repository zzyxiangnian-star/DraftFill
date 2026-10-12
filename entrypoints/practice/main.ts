import { listen } from '@/src/lib/content/agent';
import './style.css';

// 练习页自带填写助手：background 发给这个标签页的消息（带 practiceTab）才处理。
browser.tabs.getCurrent().then((tab) => {
  if (tab?.id != null) listen((msg) => msg.practiceTab === tab.id);
});

document.getElementById('apply')!.addEventListener('submit', () => {
  document.getElementById('submit-msg')!.textContent = '这是练习页，不会提交。真网站上检查无误后再自己点提交。';
});
