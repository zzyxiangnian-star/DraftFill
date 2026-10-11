# 网申助手

Edge / Chrome 浏览器插件：在国内校招、社招网申页面一键填写本地档案，清楚标出哪些填了、哪些需要确认、哪些没填及原因。**只填不交**，检查后由你自己提交。

> 当前进度：阶段 3 进行中。已完成页面标色、点结果定位字段、一键撤销、高风险字段标黄；北森、Moka 适配器等待真实页面快照。完整计划见 [docs/PLAN.md](docs/PLAN.md)，设计规范见 [design/](design/)。

## 开发

需要 Node.js 20 或更高版本。

```bash
npm install          # 安装依赖（会自动生成 .wxt 类型）
npm run dev          # 打开一个装好插件的 Chrome，改代码自动重载
npm run dev:edge     # 同上，用 Edge
npm run build        # 打包到 .output/chrome-mv3
npm run build:edge   # 打包到 .output/edge-mv3
npm run compile      # TypeScript 类型检查
npm test             # 单元测试（Vitest），含原生测试表单的识别率
npm run fixtures     # 构建测试表单（原生 / Ant Design / Element Plus）到 tests/fixtures/dist
npm run test:e2e     # 端到端测试：在 Chromium 里加载插件，填写测试表单
```

第一次跑端到端测试前，先运行 `npx playwright install chromium` 下载测试用浏览器。

### 测试表单与识别率

`tests/fixtures/forms/` 下有三张测试表单，每个字段外层用 `data-expect` 标出正确的档案路径（`none` 表示不该填）。测试会统计：识别正确、认错（最危险，必须为 0）、没认出、不该填却认出。

| 表单 | 模拟 | 识别 |
|---|---|---|
| native.html | 老式表单（表格布局、无 for 的 label、只有 placeholder） | 38/38 |
| antd.html | Moka 一类 React + Ant Design 页面 | 17/17 |
| element.html | 北森一类 Vue + Element Plus 页面 | 20/20 |

这些是自制页面，词典是对着它们写的，数字只说明流程跑通；真实网申页面的识别率在阶段 3 用真实页面快照统计。

### 手动加载

1. 运行 `npm run build`（或 `npm run build:edge`）。
2. Chrome 打开 `chrome://extensions`，Edge 打开 `edge://extensions`，打开"开发者模式"。
3. 点"加载已解压的扩展程序"，选 `.output/chrome-mv3`（Edge 选 `.output/edge-mv3`，两者都能用）。

## 结构

```
entrypoints/
  popup/        点击工具栏图标弹出：识别当前页、切换档案
  sidepanel/    侧边栏：填写结果、投递看板
  options/      档案编辑、导入导出、AI 设置
  background.ts 用户点击后把 content script 注入当前页，转发消息
  content.ts    在网申页面里扫描、填写（运行时注入，不常驻）
src/
  lib/profile/  档案结构、存储、导入导出
  lib/fill/     字段识别（detect）、词典（aliases）、匹配（match）、填写回读与撤销（fill）、页面标色（marks）、只填不交（safety）
  lib/          其他与界面无关的逻辑
  components/   共用 React 组件
  styles/       tokens.css（设计规范的唯一来源）+ base.css
tests/          单元测试；fixtures/ 测试表单；e2e/ 端到端测试
design/         设计规范、tokens 原稿、组件示例页
docs/PLAN.md    完整计划书
```

## 原则

- 只填不交：不点击提交、保存、下一步。
- 宁可不填，不填错；写入后回读校验。
- 档案只存在本机浏览器；只申请 `activeTab`，不申请"读取所有网站"。
- 不识别、不绕过验证码和风控，不保存网站账号密码。

## 许可

MIT
