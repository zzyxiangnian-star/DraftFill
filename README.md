# 网申助手

Edge / Chrome 浏览器插件：在国内校招、社招网申页面一键填写本地档案，清楚标出哪些填了、哪些需要确认、哪些没填及原因。**只填不交**，检查后由你自己提交。

> 当前进度：阶段 1（个人档案、多份档案、导入导出）。完整计划见 [docs/PLAN.md](docs/PLAN.md)，设计规范见 [design/](design/)。

## 开发

需要 Node.js 20 或更高版本。

```bash
npm install          # 安装依赖（会自动生成 .wxt 类型）
npm run dev          # 打开一个装好插件的 Chrome，改代码自动重载
npm run dev:edge     # 同上，用 Edge
npm run build        # 打包到 .output/chrome-mv3
npm run build:edge   # 打包到 .output/edge-mv3
npm run compile      # TypeScript 类型检查
npm test             # 单元测试（Vitest）
```

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
  lib/          与界面无关的逻辑（消息约定、表单扫描……）
  components/   共用 React 组件
  styles/       tokens.css（设计规范的唯一来源）+ base.css
tests/          Vitest 单元测试
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
