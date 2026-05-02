# ThinkingKity

> 📖 [English version](./README.md)

基于 Tauri v2 和 React 19 构建的本地优先桌面知识库。打开任意文件夹作为「vault」——类似 Obsidian——使用专用编辑器编辑 Markdown、代码、CSV 等文件。集成 AI 助手，支持持久化对话记录。

## 功能特性

- **Vault 文件管理** — 打开本地文件夹，侧边栏树形浏览，拖拽排序，文件名和内容搜索。
- **Markdown 富文本编辑器** — 基于 Milkdown 的所见即所得编辑，支持 YAML frontmatter 编辑和源码/富文切换。
- **代码编辑器** — CodeMirror 6 驱动，语法高亮、自动补全，支持 30+ 种编程语言。
- **CSV 表格编辑器** — 基于 Handsontable，支持增删行列、复制粘贴、填充柄。
- **Mermaid 图表编辑器** — 支持 `.mermaid` 文件的分栏编辑，左侧源码右侧实时预览渲染图表。
- **图片与 PDF 查看** — 内置图片查看器（含尺寸信息）和 PDF 阅读器。
- **AI 助手** — 支持 OpenAI / Anthropic 模型对话。可附加 Vault 文件作为上下文。对话记录持久化存储，长对话自动记忆压缩。支持扩展思考/推理内容显示。
- **AI Agent 系统** — 基于 LangGraph 的多步骤智能体，可规划任务、调用工具（获取 URL 内容、无头浏览器浏览网页、写入 Markdown 文件）、加载用户自定义技能集。
- **AI 文档生成** — 从对话上下文生成结构化 Markdown 文档（摘要、方案、会议纪要等），可选择目录、编辑文件名、实时预览后保存到 Vault。
- **9 种语言** — English, 简体中文, 繁體中文, Français, 한국어, 日本語, Русский, Deutsch, Español。
- **深色/浅色主题** — 跟随系统，也可手动切换，设置按 Vault 保存。
- **快速切换器** — `Ctrl/Cmd+P` 模糊搜索并打开文件。
- **按 Vault 配置文件过滤** — 在侧边栏中选择显示或隐藏特定文件类型。

## 技术栈

| 层级 | 技术 |
|------|------|
| 前端 | React 19, TypeScript, Vite 8, Tailwind CSS v4 |
| 桌面 | Tauri v2 (Rust 后端) |
| 状态管理 | Zustand |
| 编辑器 | Milkdown (Markdown), CodeMirror 6 (代码), Handsontable (CSV), Mermaid (图表) |
| 国际化 | react-i18next |
| AI | OpenAI / Anthropic 流式 API, LangGraph Agent, Playwright 浏览器 |

## 快速开始

### 环境要求

- [Node.js](https://nodejs.org/) 20+
- [Rust](https://www.rust-lang.org/) 工具链（仅 Tauri 桌面构建需要）

### 安装

```bash
npm install
```

### 开发

```bash
# 浏览器模式（无需 Tauri 后端，使用内存文件系统）
npm run dev

# Tauri 桌面应用（含热更新）
npm run tauri:dev
```

开发服务器运行在 `http://localhost:1420`。

### 构建

```bash
# 生产环境桌面应用
npm run tauri:build
```

构建产物位置：

| 平台 | 路径 |
|------|------|
| macOS | `src-tauri/target/release/bundle/macos/ThinkingKity.app/` |
| macOS (DMG) | `src-tauri/target/release/bundle/dmg/ThinkingKity_{version}_aarch64.dmg` |
| Windows | `src-tauri/target/release/bundle/msi/ThinkingKity_{version}_x64.msi` |
| Linux (deb) | `src-tauri/target/release/bundle/deb/thinkingkity_{version}_amd64.deb` |
| Linux (AppImage) | `src-tauri/target/release/bundle/appimage/thinkingkity_{version}_amd64.AppImage` |

独立二进制文件（不含安装器包装）在 `src-tauri/target/release/thinkingkity`。

## 项目结构

```
src/
├── ai/                  # AI 助手模块
│   ├── graph/           # LangGraph 智能体（规划、工具执行、技能加载）
│   ├── skills/          # 用户自定义技能加载（从 Vault 读取 SKILL.md）
│   ├── tools/           # 工具注册与策略（fetch_url, browse_page, write_markdown）
│   ├── AiChatDock.tsx   # AI 聊天主界面
│   ├── client.ts        # OpenAI / Anthropic 流式客户端
│   ├── DocumentDraftModal.tsx # 文档生成 UI
│   ├── documentGenerator.ts   # AI 驱动的文档生成
│   ├── memoryCompactor.ts     # 会话记忆压缩
│   └── ...
├── components/
│   ├── editor/          # EditorArea, CodeEditor, MermaidEditor, TabBar
│   ├── sidebar/         # Sidebar, FileTree, VaultSelector
│   ├── settings/        # 设置面板
│   └── common/          # PromptModal, QuickSwitcher, EmptyState
├── hooks/               # useFileOperations
├── i18n/                # i18next 配置 + 语言 JSON 文件（9 种语言）
├── lib/                 # Tauri 命令封装、Vault 配置、文件工具
├── md/                  # Milkdown 编辑器插件
├── stores/              # Zustand 状态（vault, fileTree, editor, theme, dialog）
└── types/               # 共享 TypeScript 类型

src-tauri/
└── src/
    ├── main.rs          # Tauri 应用入口
    └── commands.rs      # 文件系统命令（读写/创建/删除/浏览）

scripts/
└── playwright-browse.mjs # AI 网页浏览用的无头 Playwright 脚本
```

## AI 配置

在设置面板（`Ctrl/Cmd+,` 或底部状态栏齿轮图标）中配置 AI 服务：

1. 选择 **OpenAI** 或 **Anthropic**
2. 输入 **API Key**
3. 输入 **模型名称**（如 `gpt-4o`、`claude-sonnet-4-20250514`）
4. 可选：设置自定义 **Base URL** 用于代理或替代服务
5. 点击 **Test Connection** 测试连接

会话文件保存在 `<vault>/.thinkingkity/sessions/` 目录下。

### AI Agent 与工具

AI 助手基于 LangGraph 智能体，可规划多步骤任务并执行工具。可用工具：

| 工具 | 说明 |
|------|------|
| `fetch_url` | 获取公开 URL 的可读文本内容（HTTP GET + 内容提取） |
| `browse_page` | 使用无头 Playwright 浏览器打开 URL（渲染 JavaScript 页面；仅桌面端） |
| `write_markdown_document` | 在 Vault 中创建 Markdown 文件 |

工具调用始终需要用户确认后才会执行。工具策略（启用的工具、域名白名单、超时配置）可在 `<vault>/.thinkingkity/tools/` 中按 Vault 配置。

### AI 技能

用户可在 `<vault>/.thinkingkity/skill/<名称>/SKILL.md` 中创建本地技能文件，使用 YAML frontmatter（`name`、`description`、`allowed-tools`、`priority`）。技能在规划阶段将自定义指令注入 AI 上下文。每次请求最多加载 3 个技能。

### 文档生成

在任意 AI 对话会话中，点击 **生成文档** 即可生成结构化 Markdown 文件。AI 使用完整对话上下文生成摘要、方案、会议纪要、技术设计等内容。弹窗支持选择目标目录、编辑文件名、预览内容，确认后直接保存到 Vault。

## Vault 配置

每个 Vault 的配置保存在 `<vault>/.thinkingkity/config.json`：

```json
{
  "language": "zh-CN",
  "mode": "system",
  "display_type": ["md", "csv", "json", "txt", ...],
  "ai": {
    "provider": "openai",
    "base_url": "https://api.openai.com/v1",
    "api_key": "",
    "model": ""
  }
}
```

## License

MIT
