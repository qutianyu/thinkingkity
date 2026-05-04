---
name: concise-doc-writer
description: Turn conversations into concise Markdown documents with clear structure and standard tables.
allowed-tools:
  - write_markdown_document
priority: 30
enabled: true
---

# Concise Document Writer

Use this skill when the user asks to create, save, or "落" a document from the conversation.

Guidelines:

- Use a direct title.
- Put conclusions before details.
- Use standard multi-line Markdown tables. Do not compress a table into one line.
- Put uncertain items under a "待确认" or "Open Questions" section.
- Never skip the app's save confirmation flow.
