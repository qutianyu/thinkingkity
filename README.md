# ThinkingKity

> 📖 [中文版](./README_zh.md)

A local-first desktop knowledge base built with Tauri v2 and React 19. Open any folder as a "vault" — like Obsidian — and edit Markdown, code, CSV, and more with specialized editors. Includes an integrated AI assistant with persistent chat sessions.

## Features

- **Vault-based file management** — Open any local folder, browse with a sidebar tree, drag-and-drop to reorder, search by filename and content.
- **Rich Markdown editor** — WYSIWYG editing powered by Milkdown, with YAML frontmatter editing and source/code toggle.
- **Code editor** — CodeMirror 6 with syntax highlighting, autocompletion, and language support for 30+ languages.
- **CSV spreadsheet editor** — Handsontable-based grid editor with add/remove row/column, copy/paste, and fill handle.
- **Image & PDF viewer** — Built-in viewers for images (with dimensions) and PDFs.
- **AI assistant** — Chat with OpenAI or Anthropic models. Attach vault files as context. Sessions persist to disk with automatic memory compaction for long conversations.
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
| Editors | Milkdown (Markdown), CodeMirror 6 (code), Handsontable (CSV) |
| i18n | react-i18next |
| AI | OpenAI / Anthropic streaming APIs |

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
| macOS (DMG) | `src-tauri/target/release/bundle/dmg/ThinkingKity_0.1.1_aarch64.dmg` |
| Windows | `src-tauri/target/release/bundle/msi/ThinkingKity_0.1.1_x64.msi` |
| Linux (deb) | `src-tauri/target/release/bundle/deb/thinkingkity_0.1.1_amd64.deb` |
| Linux (AppImage) | `src-tauri/target/release/bundle/appimage/thinkingkity_0.1.1_amd64.AppImage` |

The standalone binary (without installer bundle) is `src-tauri/target/release/thinkingkity`.

## Project Structure

```
src/
├── ai/                  # AI assistant (chat, sessions, memory compaction)
├── components/
│   ├── editor/          # EditorArea, CodeEditor, TabBar
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
    └── commands.rs      # File system commands (read/write/create/delete)
```

## AI Setup

Configure your AI provider in the settings panel (`Ctrl/Cmd+,` or the gear icon in the bottom bar):

1. Select **OpenAI** or **Anthropic**
2. Enter your **API key**
3. Enter the **model name** (e.g., `gpt-4o`, `claude-sonnet-4-20250514`)
4. Optionally set a custom **base URL** for proxies or alternatives
5. Click **Test Connection** to verify

Sessions are stored per vault under `<vault>/.thinkingkity/sessions/`.

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
