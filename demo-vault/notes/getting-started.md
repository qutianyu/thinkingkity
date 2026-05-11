---
title: Getting Started with ThinkingKity
date: 2026-05-01
tags:
 - knowledge-base
 - markdown
 - tutorial
author: ThinkingKity Team
---

# Getting Started with ThinkingKity

Welcome to your new knowledge base! ThinkingKity is a **local-first** desktop app for managing your notes, code, data, and more.

## What You Can Do

- Write notes in **Markdown** with rich editing or source mode
- Edit **code** with syntax highlighting for common programming and config languages
- Work with **CSV data** in a spreadsheet-like editor
- View **images** and **PDFs** directly
- Chat with an **AI assistant** that can read your vault files
- Connect notes with **wiki links** (`[[note]]`) and browse **backlinks**

## Wiki Links & Backlinks

ThinkingKity supports Obsidian-style `[[wiki links]]` to connect your notes. Type `[[` in the editor to reference another note — the backlinks panel on the right lets you see who references the current note.

Try clicking these:

- [[project-plan]] — our project roadmap
- [[todo]] — shared task list
- [[daily-journal]] — today's journal entry
- [[cheatsheet|Markdown Cheatsheet]] — syntax reference with an alias

When you open any of those notes, switch the right panel to the **Links** tab to see backlinks in action. Notes that reference each other form a connected knowledge graph.

You can also link to specific headings:

- [[project-plan#Milestones]] — jump straight to milestones
- [[project-plan#Risks & Mitigations]] — project risks
- [[#Tips]] — quick tips section in this page

If you type `[[something-that-doesnt-exist]]`, it appears with a dashed underline. Click it to create the note.

## Markdown Features

### Text Formatting

You can use **bold**, *italic*, ~~strikethrough~~, `inline code`, and [links](https://example.com).

### Code Blocks

```python
def greet(name: str) -> str:
    """Say hello to someone."""
    return f"Hello, {name}!"

print(greet("World"))
```

### Tables

| Feature | Status | Priority |
|---------|--------|----------|
| Markdown Editor | Done | High |
| Code Editor | Done | High |
| CSV Editor | Done | Medium |
| AI Chat | Done | High |
| Wiki Links | Done | High |

### Blockquotes

> The only way to do great work is to love what you do.
> — Steve Jobs

### Lists

#### Unordered List

- Item one
- Item two
  - Nested item A
  - Nested item B
- Item three

#### Ordered List

1. First step
2. Second step
3. Third step

## Tips

- Press `Cmd/Ctrl+P` to open the **Quick Switcher** for fast file navigation
- Press `Cmd/Ctrl+S` to save the current file
- Right-click on files in the sidebar for more options
- Drag and drop files to reorganize your vault
- Open the right panel's **Links** tab to see backlinks for any note

---

Happy writing!
