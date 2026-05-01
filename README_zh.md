# ThinkingKity

> 📖 [English version](./README.md)

基于 Tauri v2 和 React 19 构建的本地优先桌面知识库。打开任意文件夹作为「vault」——类似 Obsidian——使用专用编辑器编辑 Markdown、代码、CSV 等文件。集成 AI 助手，支持持久化对话记录。

## 功能特性

- **Vault 文件管理** — 打开本地文件夹，侧边栏树形浏览，拖拽排序，文件名和内容搜索。
- **Markdown 富文本编辑器** — 基于 Milkdown 的所见即所得编辑，支持 YAML frontmatter 编辑和源码/富文切换。
- **代码编辑器** — CodeMirror 6 驱动，语法高亮、自动补全，支持 30+ 种编程语言。
- **CSV 表格编辑器** — 基于 Handsontable，支持增删行列、复制粘贴、填充柄。
- **图片与 PDF 查看** — 内置图片查看器（含尺寸信息）和 PDF 阅读器。
- **AI 助手** — 支持 OpenAI / Anthropic 模型对话。可附加 Vault 文件作为上下文。对话记录持久化存储，长对话自动记忆压缩。
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
| 编辑器 | Milkdown (Markdown), CodeMirror 6 (代码), Handsontable (CSV) |
| 国际化 | react-i18next |
| AI | OpenAI / Anthropic 流式 API |

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
| macOS (DMG) | `src-tauri/target/release/bundle/dmg/ThinkingKity_0.1.1_aarch64.dmg` |
| Windows | `src-tauri/target/release/bundle/msi/ThinkingKity_0.1.1_x64.msi` |
| Linux (deb) | `src-tauri/target/release/bundle/deb/thinkingkity_0.1.1_amd64.deb` |
| Linux (AppImage) | `src-tauri/target/release/bundle/appimage/thinkingkity_0.1.1_amd64.AppImage` |

独立二进制文件（不含安装器包装）在 `src-tauri/target/release/thinkingkity`。

## 项目结构

```
src/
├── ai/                  # AI 助手（聊天、会话管理、记忆压缩）
├── components/
│   ├── editor/          # EditorArea, CodeEditor, TabBar
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
    └── commands.rs      # 文件系统命令（读写/创建/删除/复制/重命名）
```

## AI 配置

在设置面板（`Ctrl/Cmd+,` 或底部状态栏齿轮图标）中配置 AI 服务：

1. 选择 **OpenAI** 或 **Anthropic**
2. 输入 **API Key**
3. 输入 **模型名称**（如 `gpt-4o`、`claude-sonnet-4-20250514`）
4. 可选：设置自定义 **Base URL** 用于代理或替代服务
5. 点击 **Test Connection** 测试连接

会话文件保存在 `<vault>/.thinkingkity/sessions/` 目录下。

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
