# 网申助手 · 开发约定

完整计划书：docs/PLAN.md。设计规范：design/设计风格规范.md，实现以 src/styles/tokens.css 为准。

## 不可突破的边界（计划书第 2 节）
- 不自动提交、不批量海投；代码层面不点击提交/保存/下一步类按钮。
- 不识别/绕过验证码、滑块、风控；不保存或代填网站账号密码。
- 宁可不填，不填错：低把握字段标黄让用户确认；写入后必须回读校验。
- 档案仅存浏览器本地，无自建服务器；权限只用 activeTab + 用户点击触发。
- LLM 兜底只发字段名和选项，不发个人信息。

## 目标用户
- 给同学用（2026-10-11 确认），不只自用：界面要让不懂技术的同学也能看懂，提示用中文大白话；数据格式要能跨版本导入（schemaVersion + normalize）。

## 工作方式
- 按计划书第 10 节分阶段推进，每个阶段完成后停下来演示确认。
- 每个阶段先说明要新建/修改的文件，再动手。
- 站点选择器与适配以真实页面快照为准，不凭记忆编写。

## 技术
- WXT + Manifest V3 + React + TypeScript；一套代码打 Chrome 与 Edge 包。
- content script 用 `registration: 'runtime'`，由 background 在用户点击后注入。
- 档案：src/lib/profile（schema 结构、normalize 兼容旧数据、store 纯函数操作、io 备份）。改结构时升 SCHEMA_VERSION 并在 normalize 里兼容。
- 与界面无关的逻辑放 src/lib，配 tests/ 下的 Vitest 测试。
- 样式只用 tokens.css 变量；主操作用黑色胶囊按钮（.btn-primary），其余 8px 圆角；图标用 lucide-react，描边 1.5px。
- 动效只表达状态变化和面板出现，缓动 var(--ease)，尊重 prefers-reduced-motion。
