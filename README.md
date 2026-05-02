# ThinkingKity

> 📖 [中文版](./README_zh.md)

A local-first desktop knowledge base built with Tauri v2 and React 19. Open any folder as a "vault" — like Obsidian — and edit Markdown, code, CSV, and more with specialized editors. Includes an integrated AI assistant with persistent chat sessions.

## Features

- **Vault-based file management** — Open any local folder, browse with a sidebar tree, drag-and-drop to reorder, search by filename and content.
- **Rich Markdown editor** — WYSIWYG editing powered by Milkdown, with YAML frontmatter editing and source/code toggle.
- **Code editor** — CodeMirror 6 with syntax highlighting, autocompletion, and language support for 30+ languages.
- **CSV spreadsheet editor** — Handsontable-based grid editor with add/remove row/column, copy/paste, and fill handle.
- **Mermaid diagram editor** — Split-pane editor with live preview for `.mermaid` files. Edit source code on the left, see rendered diagrams on the right.
- **Image & PDF viewer** — Built-in viewers for images (with dimensions) and PDFs.
- **AI assistant** — Chat with OpenAI or Anthropic models. Attach vault files as context. Sessions persist to disk with automatic memory compaction for long conversations. Extended thinking/reasoning display for supported models.
- **AI agent system** — LangGraph-based multi-step agent that can plan tasks, use tools (fetch URLs, browse web pages with headless Playwright, write markdown documents), and load user-defined skill sets from the vault.
- **AI document generation** — Generate structured Markdown documents (summaries, proposals, meeting notes, etc.) from chat context, with directory picker, filename suggestion, and live preview before saving.
- **9 languages** — English, 简体中文, 繁體中文, Français, 한국어, 日本語, Русский, Deutsch, Español.
- **Dark & light themes** — System-following, with manual override per vault.
- **Quick switcher** — `Ctrl/Cmd+P` to fuzzy-find and open any file.
- **Per-vault display filters** — Show or hide file types in the sidebar.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 19, TypeScript, Vite 8, Tailwind CSS v4 |
| Desktop | Tauri v2 (Rust backend) |
| State | Zustand |
| Editors | Milkdown (Markdown), CodeMirror 6 (code), Handsontable (CSV), Mermaid (diagrams) |
| i18n | react-i18next |
| AI | OpenAI / Anthropic streaming APIs, LangGraph agent, Playwright browser |

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) 20+
- [Rust](https://www.rust-lang.org/) toolchain (for Tauri desktop builds only)

### Install

```bash
npm install
```

### Development

```bash
# Browser-only (no Tauri backend — uses in-memory file system)
npm run dev

# Full Tauri desktop app with hot reload
npm run tauri:dev
```

The dev server runs on `http://localhost:1420`.

### Build

```bash
# Production desktop app
npm run tauri:build
```

The build output is located at:

| Platform | Path |
|----------|------|
| macOS | `src-tauri/target/release/bundle/macos/ThinkingKity.app/` |
| macOS (DMG) | `src-tauri/target/release/bundle/dmg/ThinkingKity_{version}_aarch64.dmg` |
| Windows | `src-tauri/target/release/bundle/msi/ThinkingKity_{version}_x64.msi` |
| Linux (deb) | `src-tauri/target/release/bundle/deb/thinkingkity_{version}_amd64.deb` |
| Linux (AppImage) | `src-tauri/target/release/bundle/appimage/thinkingkity_{version}_amd64.AppImage` |

The standalone binary (without installer bundle) is `src-tauri/target/release/thinkingkity`.

## Project Structure

```
src/
├── ai/                  # AI assistant module
│   ├── graph/           # LangGraph agent (planning, tool execution, skills)
│   ├── skills/           # User-authored skill loading (SKILL.md from vault)
│   ├── tools/            # Tool registry & policy (fetch_url, browse_page, write_markdown)
│   ├── AiChatDock.tsx   # Main AI chat UI component
│   ├── client.ts        # OpenAI / Anthropic streaming clients
│   ├── DocumentDraftModal.tsx # Document generation UI
│   ├── documentGenerator.ts   # AI-powered document generation
│   ├── memoryCompactor.ts     # Session memory compression
│   └── ...
├── components/
│   ├── editor/          # EditorArea, CodeEditor, MermaidEditor, TabBar
│   ├── sidebar/         # Sidebar, FileTree, VaultSelector
│   ├── settings/        # Settings modal
│   └── common/          # PromptModal, QuickSwitcher, EmptyState
├── hooks/               # useFileOperations
├── i18n/                # i18next config + locale JSON (9 languages)
├── lib/                 # Tauri commands, vault config, file utilities
├── md/                  # Milkdown editor plugins
├── stores/              # Zustand stores (vault, fileTree, editor, theme, dialog)
└── types/               # Shared TypeScript types

src-tauri/
└── src/
    ├── main.rs          # Tauri app entry
    └── commands.rs      # File system commands (read/write/create/delete/broswe)

scripts/
└── playwright-browse.mjs # Headless Playwright browser script for AI web browsing
```

## AI Setup

Configure your AI provider in the settings panel (`Ctrl/Cmd+,` or the gear icon in the bottom bar):

1. Select **OpenAI** or **Anthropic**
2. Enter your **API key**
3. Enter the **model name** (e.g., `gpt-4o`, `claude-sonnet-4-20250514`)
4. Optionally set a custom **base URL** for proxies or alternatives
5. Click **Test Connection** to verify

Sessions are stored per vault under `<vault>/.thinkingkity/sessions/`.

### AI Agent & Tools

The AI assistant uses a LangGraph-based agent that can plan multi-step tasks and execute tools. Available tools:

| Tool | Description |
|------|-------------|
| `fetch_url` | Fetch a public URL as readable text (HTTP GET + content extraction) |
| `browse_page` | Open a URL with headless Playwright (JavaScript-rendered pages; desktop only) |
| `write_markdown_document` | Create a markdown file inside the vault |

Tool calls always require user confirmation before execution. Tool policies (enabled tools, domain allowlists, timeouts) are configurable per vault in `<vault>/.thinkingkity/tools/`.

### AI Skills

Users can create local skill files in `<vault>/.thinkingkity/skill/<name>/SKILL.md` with YAML frontmatter (`name`, `description`, `allowed-tools`, `priority`). Skills inject custom instructions into the AI context during planning. Up to 3 skills are loaded per request.

### Document Generation

From any AI chat session, click **Generate Document** to produce a structured Markdown file. The AI uses the full conversation context to generate summaries, proposals, meeting notes, technical designs, and more. A modal lets you pick a target directory, edit the filename, preview the content, and save directly into the vault.

## Vault Config

Each vault stores its settings in `<vault>/.thinkingkity/config.json`:

```json
{
  "language": "en-US",
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
