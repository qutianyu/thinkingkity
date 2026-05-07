# ThinkingKity

<img src="./logo.png" alt="ThinkingKity" width="128" />

> 📖 [中文版](./README_zh.md)

A local-first desktop knowledge base built with Tauri v2 and React 19. Open any folder as a "vault" — like Obsidian — and edit Markdown, code, CSV, and more with specialized editors. Includes an integrated AI assistant with persistent chat sessions.

## Features

- **Vault-based file management** — Open any local folder, browse with a sidebar tree, drag-and-drop to reorder, search by filename and content.
- **Rich Markdown editor** — WYSIWYG editing powered by Milkdown, with YAML frontmatter editing, source/code toggle, and Obsidian-style `[[wiki links]]` with backlinks panel.
- **Code editor** — CodeMirror 6 with syntax highlighting and autocompletion for 20+ languages: JavaScript, TypeScript, Python, Java, C/C++, Rust, Go, HTML, CSS, SCSS, Sass, Less, XML, Vue, JSON, YAML, TOML, SQL, Lua, R, Groovy, Markdown, and more.
- **CSV spreadsheet editor** — Handsontable-based grid editor with add/remove row/column, copy/paste, and fill handle.
- **Mermaid diagram editor** — Split-pane editor with live preview for `.mermaid` files. Edit source code on the left, see rendered diagrams on the right.
- **Image & PDF viewer** — Built-in viewers for images (with dimensions) and PDFs.
- **AI assistant** — Chat with OpenAI or Anthropic models. Attach vault files as context. Sessions persist to disk with automatic memory compaction for long conversations. Extended thinking/reasoning display for supported models.
- **AI agent system** — LangGraph-based multi-step agent that can plan tasks, use tools (fetch URLs, browse web pages with headless Playwright, write markdown documents), and load user-defined skill sets from the vault.
- **AI document generation** — Generate structured Markdown documents (summaries, proposals, meeting notes, etc.) from chat context, with directory picker, filename suggestion, and live preview before saving.
- **9 languages** — English, 简体中文, 繁體中文, Français, 한국어, 日本語, Русский, Deutsch, Español.
- **Optional web login** — Configure a username and password for the web server; leave them empty to keep local/no-login usage.
- **Dark & light themes** — System-following, with manual override per vault.
- **Quick switcher** — `Ctrl/Cmd+P` to fuzzy-find and open any file.
- **Custom file type filters** — Freely add or remove file extensions to control which types appear in the sidebar.

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
- [Rust](https://www.rust-lang.org/) toolchain

### Install

```bash
npm install
```

### Development

```bash
# Web mode (Vite + Rust HTTP server)
npm run dev:web

# Tauri desktop app with hot reload
npm run dev:desktop
```

| Mode | Command | URL | Description |
|------|---------|-----|-------------|
| Web dev | `npm run dev:web` | `http://localhost:19840` | Rust server proxies to Vite, shared Rust backend |
| Desktop dev | `npm run dev:desktop` | Tauri window | Native desktop app with Tauri IPC |

Both modes share the same Rust backend for file operations. File access is restricted by `allowed_paths` in `~/.thinkingkity/vaults.json`. In dev mode, the server proxies frontend requests to Vite (HMR still works).

### Build

```bash
# Production desktop app
npm run build:desktop
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

### Desktop Compatibility

Desktop packages are configured for systems released in the last three years:

| Platform | Compatibility target | Packaging note |
|----------|----------------------|----------------|
| macOS | macOS 14.0+ | `bundle.macOS.minimumSystemVersion` is set to `14.0`. |
| Windows | Windows 11 23H2+ | Installers require WebView2 `110.0.1531.0` or newer and silently trigger the WebView2 bootstrapper when needed. |

### Web Server Build

```bash
# Build everything (frontend + embed into single binary)
npm run build:web

# Run — single binary, no extra files needed
./thinkingkity-server
# → http://localhost:19840
```

The frontend is embedded into the binary at compile time. Deploy just one file.

| Env | Default | Description |
|-----|---------|-------------|
| `THINKINGKITY_PORT` | `19840` | Server listen port |
| `THINKINGKITY_DEV` | — | Set to `1` in dev mode to proxy frontend to Vite `:1420` |

If `auth.username` and `auth.password` are configured in `~/.thinkingkity/vaults.json`, the web UI shows a login page before the vault picker. Login sessions expire after 48 hours, and protected `/api/*` routes require the issued token. If either field is missing or empty, login is disabled.

## Global Config

`~/.thinkingkity/vaults.json`:

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

| Field | Description |
|-------|-------------|
| `allowed_paths` | Whitelist of directories the backend is allowed to access. File operations outside these paths are denied. Demo vault is always allowed. |
| `vaults` | Recently opened vaults (managed automatically). |
| `auth` | Optional web login configuration. Login is enabled only when both `username` and `password` are non-empty. Tokens expire after 48 hours. |

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
├── build.rs             # Auto-generates demo vault file list at compile time
└── src/
    ├── main.rs           # Tauri app entry + command registration
    ├── lib.rs            # Shared library (module declarations)
    ├── commands.rs       # Tauri command wrappers (delegates to fs_ops)
    ├── fs_ops.rs          # Shared file operations + path whitelist validation
    ├── server.rs          # HTTP server for web mode (API routes + static serve)
    ├── bin/
    │   └── server.rs      # Standalone HTTP server entry point
    ├── global_config.rs   # Global vault list + allowed_paths config + demo vault
    ├── sync_common.rs     # Shared sync utilities
    └── sync_git.rs        # Git sync implementation

demo-vault/               # Bundled demo vault with examples (auto-embedded via build.rs)

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
  },
  "sync": {
    "method": "none",
    "direction": "push",
    "webdav": { "url": "", "username": "", "password": "" },
    "git": { "remoteUrl": "", "branch": "main" }
  }
}
```

## Wiki Links & Backlinks

ThinkingKity supports Obsidian-style `[[wiki links]]` for connecting notes. The link index is built automatically from Markdown files and cached at `<vault>/.thinkingkity/link-index.json`.

### Syntax

| Syntax | Meaning | Example |
|--------|---------|---------|
| `[[note]]` | Link to a note by name or path | `[[project-plan]]` |
| `[[folder/note]]` | Link to a note at a specific path | `[[notes/project-plan]]` |
| `[[note\|alias]]` | Link with display alias | `[[project-plan\|Project Plan]]` |
| `[[note#heading]]` | Link to a heading within a note | `[[project-plan#Milestones]]` |
| `[[#heading]]` | Link to a heading in the current note | `[[#TODO]]` |

### How Links Are Resolved

A note can be targeted by multiple names:

1. **Filename** (without extension) — `notes/project-plan.md` can be linked as `[[project-plan]]`
2. **Relative path** (without extension) — `[[notes/project-plan]]`
3. **Frontmatter `title`** — `title: Project Plan` allows `[[Project Plan]]`
4. **Frontmatter `aliases`** — `aliases: [Plan, Roadmap]` allows `[[Plan]]` and `[[Roadmap]]`

When a link target matches multiple files, the note in the same directory takes priority. If ambiguity remains, the link is marked as ambiguous rather than silently picking one.

### Editor

- **Resolved links** appear as clickable links ( blue underline). Click to open the target note.
- **Unresolved links** appear with a dashed underline. Click to create the missing note.
- **Ambiguous links** appear with a wavy underline (yellow).

### Backlinks Panel

Open the right panel in the Markdown editor and switch to the **Links** tab to see:

- **Backlinks** — notes that reference the current note
- **Outgoing Links** — notes referenced by the current note
- **Unresolved** — targets that don't exist yet (click to create)

## License

MIT
