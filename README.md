# ExNihilo OS

一个运行在浏览器中的 AI 原生桌面操作系统原型。通过 Spotlight 启动器输入任意需求，系统会调用兼容 OpenAI 格式的大模型实时流式生成完整的可交互 Web 应用，并在沙箱窗口中运行与持久化。

## 核心特性

- **Spotlight 启动器 (`⌘K` / `Ctrl+K`)**：输入想法或功能描述，快速推荐候选应用并一键生成，或检索已安装的本地应用。
- **流式应用生成与沙箱运行**：通过 SSE 流式接收模型输出的 HTML/CSS/JS，在严格 CSP 隔离的 `iframe` 窗口中实时预览并执行脚本。
- **应用内扩展与动态挂载**：
  - 支持在已运行的应用窗口内直接提出新需求（Extend），增量扩展应用功能。
  - 内置 `guest-kit` 运行时套件，支持局部区域动态生成（`data-mount`）、占位媒体渲染（SVG）及 DOM 状态持久化。
- **桌面与窗口管理**：支持窗口拖拽、缩放、最小化、最大化、任务栏切换以及桌面图标管理。
- **纯前端本地持久化**：应用数据默认保存在浏览器的 `IndexedDB`（支持 `localStorage` 降级），LLM 配置保存在本地 `localStorage`，零后端依赖。
- **BYOK（自带密钥）配置**：支持自定义任意兼容 OpenAI `/chat/completions` 接口的服务端地址（含本地代理或本地模型）、主模型、快速推荐模型（`fastModel`）与采样温度。

## 技术栈

- **语言与构建**：TypeScript + Vite（无第三方运行时依赖）
- **测试**：Vitest
- **部署**：静态站点输出（`dist/`），内置 GitHub Pages 自动部署工作流

## 快速开始

### 1. 安装依赖

```bash
npm install
```

### 2. 启动开发服务器

```bash
npm run dev
```

打开浏览器访问控制台输出的地址（默认 `http://localhost:5173`）。

> 提示：首次使用请点击桌面或任务栏的设置按钮，填入兼容 OpenAI API 的 `Base URL`、`API Key` 与 `Model`。如使用本地代理，可在 `vite.config.ts` 中配置开发代理。

### 3. 运行测试与构建

```bash
# 运行单元测试
npm test

# 类型检查并构建生产版本
npm run build

# 本地预览构建产物
npm run preview
```

## 目录结构

```text
.
├── .github/workflows/deploy.yml  # GitHub Pages 自动构建与部署配置
├── index.html                    # 应用入口页面
├── src/
│   ├── main.ts                   # OS 启动引导与全局快捷键注册
│   ├── core/
│   │   ├── llm.ts                # OpenAI 兼容流式请求与响应解析
│   │   ├── llm.test.ts           # LLM 解析与流式过滤器单元测试
│   │   ├── os-state.ts           # 全局窗口与应用状态管理
│   │   ├── prompts.ts            # 应用推荐、生成与扩展提示词
│   │   ├── runtime.ts            # 沙箱 iframe 生命周期与流式渲染管理
│   │   └── storage.ts            # IndexedDB / localStorage 持久化封装
│   ├── runtime-guest/
│   │   ├── guest-kit.ts          # 注入沙箱应用的运行时桥接与辅助能力
│   │   └── guest.css             # 沙箱应用默认基础样式
│   ├── styles/                   # OS 主题 Token 与桌面/窗口样式
│   ├── types/                    # TypeScript 类型定义
│   └── ui/                       # 桌面、任务栏、窗口管理器、Spotlight 与设置弹窗
├── package.json
├── tsconfig.json
└── vite.config.ts
```

## 部署

仓库已包含 [deploy.yml](.github/workflows/deploy.yml)，推送到 `main` 分支后会自动通过 GitHub Actions 构建 `dist/` 并部署至 GitHub Pages。
