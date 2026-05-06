---
title: ThinkingKity Demo Vault
created: 2026-05-01
updated: 2026-05-04
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
| `app.ts` | TypeScript | typescript |
| `hello.java` | Java | java |
| `hello.rs` | Rust | rust |
| `hello.go` | Go | go |
| `main.c` | C | c |
| `hello.cpp` | C++ | cpp |
| `hello.cs` | C# | csharp |
| `hello.rb` | Ruby | ruby |
| `hello.php` | PHP | php |
| `utils.js` | JavaScript | javascript |
| `style.css` | CSS | css |
| `queries.sql` | SQL | sql |
| `deploy.sh` | Shell | shell |
| `example.mermaid` | Mermaid | mermaid |

### `code/web/` — Web Frontend

| File | Type | Mode |
|------|------|------|
| `App.tsx` | React component | typescript |
| `index.html` | Landing page | html |
| `data.xml` | XML document | xml |

### `data/` — Structured Data & Config

| File | Type | Editor |
|------|------|--------|
| `sample.csv` | CSV | Handsontable spreadsheet |
| `config.json` | JSON | CodeMirror json |
| `config.yaml` | YAML | CodeMirror yaml |
| `config.toml` | TOML | CodeMirror toml |
| `config.ini` | INI | CodeMirror ini |
| `config.properties` | Properties | CodeMirror properties |
| `.env.example` | ENV | CodeMirror env |

### `text/` — Plain Text & Logs

| File | Type | Editor |
|------|------|--------|
| `plain.txt` | Notes / scratchpad | CodeMirror text |
| `server.log` | Log file | CodeMirror text |

## Editor Types at a Glance

| Extension(s) | Editor | Highlights |
|-------------|--------|------------|
| `.md` | Milkdown (rich) / CodeMirror (source) | WYSIWYG, frontmatter table, outline, two-way toggle |
| `.csv` | Handsontable | Grid, sort, add/remove rows & columns |
| `.mermaid` | Mermaid editor | Live preview, source/preview/split modes |
| `.json` `.yaml` `.toml` `.ini` `.properties` `.env` | CodeMirror | Syntax highlighting + bracket matching |
| `.py` `.ts` `.tsx` `.java` `.rs` `.go` `.c` `.cpp` `.cs` `.rb` `.php` `.js` `.sql` `.sh` `.css` `.html` `.xml` | CodeMirror | Syntax highlighting + language autocomplete |
| `.txt` `.log` | CodeMirror (plain) | Line numbers, word wrap |
