---
title: ThinkingKity Demo Vault
created: 2026-05-01
updated: 2026-05-09
category: demo
---

# ThinkingKity Demo Vault

This vault contains sample files across multiple languages and formats to showcase ThinkingKity's editing capabilities.

## What's Inside

### `notes/` — Markdown Notes

| File | Description |
|------|-------------|
| `getting-started.md` | Feature tour with wiki links, frontmatter, tables, code blocks, lists |
| `cheatsheet.md` | Full Markdown syntax reference including wiki link syntax |
| `todo.md` | Task list with nested checkboxes — links to project-plan |
| `daily-journal.md` | Daily journal entry with wiki links to other notes |
| `project-plan.md` | Project planning doc with milestones, Mermaid diagram, and backlinks |

### `code/` — Multi-language Source Code

| File | Language | Mode |
|------|----------|------|
| `hello.py` | Python | python |
| `hello.java` | Java | java |
| `hello.rs` | Rust | rust |
| `hello.go` | Go | go |
| `main.c` | C | c |
| `hello.cpp` | C++ | cpp |
| `hello.cs` | C# | csharp |
| `hello.rb` | Ruby | ruby |
| `hello.lua` | Lua | lua |
| `hello.r` | R | r |
| `hello.groovy` | Groovy | groovy |
| `queries.sql` | SQL | sql |
| `deploy.sh` | Shell | shell |
| `example.mermaid` | Mermaid | mermaid |

### `code/web/` — Web Frontend

| File | Type | Mode |
|------|------|------|
| `App.tsx` | React component | typescript |
| `app.ts` | TypeScript module | typescript |
| `utils.js` | JavaScript utilities | javascript |
| `index.html` | Landing page | html |
| `style.css` | CSS stylesheet | css |
| `style.scss` | SCSS stylesheet | scss |
| `style.sass` | Sass stylesheet | sass |
| `style.less` | Less stylesheet | less |
| `hello.vue` | Vue single-file component | vue |
| `data.xml` | XML document | xml |

### `data/` — Structured Data & Config

| File | Type | Editor |
|------|------|--------|
| `sample.csv` | CSV | Handsontable spreadsheet |
| `config.json` | JSON | CodeMirror json |
| `config.jsonc` | JSON with Comments | CodeMirror jsonc |
| `config.yaml` | YAML | CodeMirror yaml |
| `config.toml` | TOML | CodeMirror toml |
| `config.ini` | INI | CodeMirror ini |
| `config.properties` | Properties | CodeMirror properties |

### `text/` — Plain Text

| File | Type | Editor |
|------|------|--------|
| `plain.txt` | Notes / scratchpad | CodeMirror text |

### `documents/` — Documents

| File | Type | Viewer |
|------|------|--------|
| `sample.pdf` | 3-page PDF | Built-in PDF viewer |

## Editor Types at a Glance

| Extension(s) | Editor | Highlights |
|-------------|--------|------------|
| `.md` | Milkdown (rich) / CodeMirror (source) | WYSIWYG, frontmatter table, outline, two-way toggle |
| `.csv` | Handsontable | Grid, sort, add/remove rows & columns |
| `.mermaid` | Mermaid editor | Live preview, source/preview/split modes |
| `.json` `.jsonc` `.yaml` `.toml` `.ini` `.properties` | CodeMirror | Syntax highlighting + bracket matching |
| `.py` `.ts` `.tsx` `.java` `.rs` `.go` `.c` `.cpp` `.cs` `.rb` `.js` `.sql` `.sh` `.css` `.scss` `.sass` `.less` `.html` `.xml` `.vue` `.lua` `.r` `.groovy` | CodeMirror | Syntax highlighting where a language mode is available |
| `.txt` `.log` | CodeMirror (plain) | Line numbers, word wrap |
| `.pdf` | PDF viewer | Page rendering, zoom, navigation |
