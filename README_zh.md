# ThinkingKity

<img src="./logo.png" alt="ThinkingKity" width="128" />

> 📖 [English version](./README.md)

基于 Tauri v2 和 React 19 构建的本地优先桌面知识库。打开任意文件夹作为「vault」——类似 Obsidian——使用专用编辑器编辑 Markdown、代码、CSV 等文件。集成 AI 助手，支持持久化对话记录。

## 功能特性

- **Vault 文件管理** — 打开本地文件夹，侧边栏树形浏览，拖拽排序，文件名和内容搜索。
- **Markdown 富文本编辑器** — 基于 Milkdown 的所见即所得编辑，支持 YAML frontmatter 编辑、源码/富文切换，以及 Obsidian 风格的 `[[wiki链接]]` 与反向链接面板。
- **代码编辑器** — CodeMirror 6 驱动，语法高亮、自动补全，支持 20+ 种语言：JavaScript、TypeScript、Python、Java、C/C++、Rust、Go、HTML、CSS、SCSS、Sass、Less、XML、Vue、JSON、YAML、TOML、SQL、Lua、R、Groovy、Markdown 等。
- **CSV 表格编辑器** — 基于 Handsontable，支持增删行列、复制粘贴、填充柄。
- **Mermaid 图表编辑器** — 支持 `.mermaid` 文件的分栏编辑，左侧源码右侧实时预览渲染图表。
- **图片与 PDF 查看** — 内置图片查看器（含尺寸信息）和 PDF 阅读器。
- **AI 助手** — 支持 OpenAI / Anthropic 模型对话。可附加 Vault 文件作为上下文。对话记录持久化存储，长对话自动记忆压缩。支持扩展思考/推理内容显示。
- **AI Agent 系统** — 基于 LangGraph 的多步骤智能体，可规划任务、调用工具（获取 URL 内容、无头浏览器浏览网页、写入 Markdown 文件）、加载用户自定义技能集。
- **AI 文档生成** — 从对话上下文生成结构化 Markdown 文档（摘要、方案、会议纪要等），可选择目录、编辑文件名、实时预览后保存到 Vault。
- **9 种语言** — English, 简体中文, 繁體中文, Français, 한국어, 日本語, Русский, Deutsch, Español。
- **可选 Web 登录** — 可为 Web Server 配置用户名和密码；留空则保持本地免登录使用。
- **深色/浅色主题** — 跟随系统，也可手动切换，设置按 Vault 保存。
- **快速切换器** — `Ctrl/Cmd+P` 模糊搜索并打开文件。
- **自定义文件类型过滤** — 自由添加或移除文件后缀，精确控制侧边栏中显示的文件类型。

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
- [Rust](https://www.rust-lang.org/) 工具链

### 安装

```bash
npm install
```

### 开发

```bash
# Web 模式（Vite + Rust HTTP server）
npm run dev:web

# Tauri 桌面应用（含热更新）
npm run dev:desktop
```

| 模式 | 命令 | URL | 说明 |
|------|------|-----|------|
| Web 开发 | `npm run dev:web` | `http://localhost:19840` | Rust server 代理到 Vite，共享 Rust 后端 |
| 桌面开发 | `npm run dev:desktop` | Tauri 窗口 | 原生桌面应用，Tauri IPC |

两种模式共享同一套 Rust 后端。文件访问受 `~/.thinkingkity/vaults.json` 中的 `allowed_paths` 白名单限制。开发模式下 server 将前端请求代理到 Vite（HMR 仍然可用）。

### npm 脚本

| 命令 | 说明 |
|------|------|
| `npm run dev` | 仅启动 Vite 前端开发服务器。 |
| `npm run dev:web` | 启动 Web 开发模式，包括 Vite 和 Rust HTTP server。 |
| `npm run dev:desktop` | 启动 Tauri 桌面端开发模式。 |
| `npm run dev:android` | 通过 Tauri 启动 Android 开发模式。 |
| `npm run build` | 执行类型检查并构建前端产物。 |
| `npm run build:web` | 构建前端和独立 Web server 二进制文件。 |
| `npm run build:desktop` | 使用 Tauri 构建桌面端安装包。 |
| `npm run build:android` | 使用 Tauri 构建 Android APK/AAB 产物。 |
| `npm run preview` | 使用 Vite 预览生产环境前端构建结果。 |
| `npm run init:android` | 初始化 Tauri 生成的 Android 工程。 |
| `npm run clean` | 清理生成的构建目录和本地构建产物。 |
| `npm run release -- X.Y.Z` | 更新版本文件，创建发布提交和 tag，并推送。 |
| `npm run version:sync` | 以 `package.json` 为准同步 Tauri 和 Cargo 版本。 |
| `npm run postversion` | `npm version` 后触发的生命周期脚本；同步并暂存 Tauri/Cargo 版本文件。 |
| `npm run tauri -- <command>` | 未封装命令时直接调用 Tauri CLI 的底层入口。 |

### 构建

```bash
# 生产环境桌面应用
npm run build:desktop
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

### 发布

桌面端、Android 和 Web 端的发布流程见 [`RELEASING.md`](./RELEASING.md)。

### 桌面端兼容性

桌面端安装包按最近三年发布的系统做兼容目标：

| 平台 | 兼容目标 | 打包说明 |
|------|----------|----------|
| macOS | macOS 14.0+ | `bundle.macOS.minimumSystemVersion` 设置为 `14.0`。 |
| Windows | Windows 11 23H2+ | 安装包要求 WebView2 `110.0.1531.0` 或更新版本；低于该版本时会静默触发 WebView2 bootstrapper 更新。 |

### Web Server 构建

```bash
# 构建全部（前端 + 嵌入到单个二进制文件）
npm run build:web

# 运行 — 单文件部署，无需额外文件
./thinkingkity
# → http://localhost:19840

# 自定义端口
./thinkingkity --port 1010
# → http://localhost:1010
```

前端在编译时嵌入到二进制中。部署时只需一个名为 `thinkingkity` 的 Linux 二进制文件。

| 环境变量 | 默认值 | 说明 |
|----------|--------|------|
| `THINKINGKITY_PORT` | `19840` | Server 监听端口 |
| `THINKINGKITY_DEV` | — | 设为 `1` 时，前端请求代理到 Vite `:1420`（开发模式） |

命令行参数 `--port` 的优先级高于 `THINKINGKITY_PORT`。

如果在 `~/.thinkingkity/vaults.json` 中配置了 `auth.username` 和 `auth.password`，Web UI 会先展示登录页，再进入选择 Vault 页面。登录会话 48 小时后过期，受保护的 `/api/*` 接口需要携带登录后签发的 token。任一字段缺失或为空时，不启用登录。

## 全局配置

`~/.thinkingkity/vaults.json`：

```json
{
  "allowed_paths": [
    "/Users/you/Documents/notes",
    "/Users/you/work"
  ],
  "vaults": [
    "/Users/you/Documents/notes/vault1"
  ],
  "auth": {
    "username": "admin",
    "password": "change-me"
  }
}
```

| 字段 | 说明 |
|------|------|
| `allowed_paths` | 白名单目录列表，后端只允许在这些路径及子目录内进行文件操作。白名单外的路径将被拒绝。Demo Vault 始终允许。 |
| `vaults` | 最近打开的 Vault 列表（自动管理）。 |
| `auth` | 可选 Web 登录配置。只有 `username` 和 `password` 都非空时才启用登录；token 48 小时后过期。 |

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
├── build.rs             # 编译时自动扫描 demo-vault 生成嵌入文件列表
└── src/
    ├── main.rs           # Tauri 应用入口 + 命令注册
    ├── lib.rs            # 共享库（模块声明）
    ├── commands.rs       # Tauri 命令包装（委托到 fs_ops）
    ├── fs_ops.rs          # 共享文件操作 + 路径白名单校验
    ├── server.rs          # Web 模式 HTTP server（API 路由 + 静态文件）
    ├── bin/
    │   └── server.rs      # 独立 HTTP server 入口
    ├── global_config.rs   # 全局 Vault 列表 + allowed_paths 配置 + Demo Vault
    ├── sync_common.rs     # 同步通用工具
    └── sync_git.rs        # Git 同步实现

demo-vault/               # 内置示例 Vault（通过 build.rs 自动嵌入）

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
  },
  "sync": {
    "method": "none",
    "direction": "push",
    "webdav": { "url": "", "username": "", "password": "" },
    "git": { "remoteUrl": "", "branch": "main" }
  }
}
```

## 双链（Wiki Links）与反向链接

ThinkingKity 支持 Obsidian 风格的 `[[wiki链接]]` 语法来连接笔记。链接索引从 Markdown 文件自动构建，并缓存至 `<vault>/.thinkingkity/link-index.json`。

### 语法

| 语法 | 含义 | 示例 |
|------|------|------|
| `[[笔记名]]` | 按名称或路径链接笔记 | `[[项目计划]]` |
| `[[目录/笔记名]]` | 链接到指定路径的笔记 | `[[notes/项目计划]]` |
| `[[笔记名\|别名]]` | 带显示别名的链接 | `[[项目计划\|Project Plan]]` |
| `[[笔记名#标题]]` | 链接到笔记内的某个标题 | `[[项目计划#里程碑]]` |
| `[[#标题]]` | 链接到当前笔记内的标题 | `[[#待办]]` |

### 链接解析规则

一篇笔记可以通过多种名称被定位：

1. **文件名**（不含扩展名）—— `notes/项目计划.md` 可通过 `[[项目计划]]` 链接
2. **相对路径**（不含扩展名）—— `[[notes/项目计划]]`
3. **Frontmatter `title`** —— 如 `title: 项目计划`，则 `[[项目计划]]` 生效
4. **Frontmatter `aliases`** —— 如 `aliases: [计划, Roadmap]`，则 `[[计划]]` 和 `[[Roadmap]]` 均可定位

当目标匹配到多个文件时，优先选择同目录下的文件。若仍有歧义，标记为 ambiguous 而非静默选择一个。

### 编辑器

- **已解析链接**显示为蓝色可点击链接（实线下划线），点击打开目标笔记。
- **未解析链接**显示为虚线下划线，点击可创建笔记。
- **歧义链接**显示为黄色波浪下划线。

### 反向链接面板

在 Markdown 编辑器中打开右侧面板，切换到 **Links（链接）** 选项卡可查看：

- **Backlinks（反向链接）**—— 哪些笔记引用了当前笔记
- **Outgoing Links（出链）**—— 当前笔记引用了哪些笔记
- **Unresolved（未解析）**—— 尚不存在的目标笔记（点击创建）

## License

MIT
