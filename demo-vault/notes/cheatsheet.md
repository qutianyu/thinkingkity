---
title: Markdown Cheatsheet
category: reference
updated: 2026-05-01
tags:
 - markdown
 - reference
 - cheatsheet
---

# Markdown Cheatsheet

A quick reference for all supported Markdown syntax in ThinkingKity. Also check [[getting-started]] for a hands-on tutorial.

## Wiki Links

| Syntax | Meaning | Example |
|--------|---------|---------|
| `[[note]]` | Link to a note | [[getting-started]] |
| `[[folder/note]]` | Link by path | [[notes/todo]] |
| `[[note\|alias]]` | Link with display alias | [[cheatsheet\|cheatsheet]] |
| `[[note#heading]]` | Link to a heading | [[project-plan#Milestones]] |
| `[[#heading]]` | Link within current note | [[#Typography]] |

Open the right panel and switch to **Links** to see backlinks for any note.

## Typography

| Element | Syntax |
|---------|--------|
| **Bold** | `**text**` or `__text__` |
| *Italic* | `*text*` or `_text_` |
| ~~Strikethrough~~ | `~~text~~` |
| `Inline code` | `` `code` `` |
| [Link](https://example.com) | `[text](url)` |
| Footnote[^1] | `[^1]` |

[^1]: This is a footnote.

## Headings

```
# H1
## H2
### H3
#### H4
##### H5
###### H6
```

## Lists

### Unordered

- Level 1
  - Level 2
    - Level 3

### Ordered

1. First
2. Second
3. Third

### Task List

- [x] Completed item
- [ ] Pending item
- [ ] Another pending item

## Code Blocks

### Fenced with language

```rust
fn main() {
    println!("Hello, world!");
}
```

### Fenced without language

```
Plain preformatted text
  preserves spacing
    and indentation
```

## Blockquotes

> Single line

> Multi-line
> blockquote
>
> > Nested blockquote

## Tables

| Left Align | Center Align | Right Align |
|:-----------|:------------:|------------:|
| Row 1     |     Data     |       $100 |
| Row 2     |     More     |        $50 |
| Row 3     |     Extra    |       $250 |

## Horizontal Rules

---

## HTML in Markdown

<details>
<summary>Click to expand</summary>

This content is hidden by default.
- Works with nested Markdown
- Inside the `<details>` tag

</details>

## Escaping

\*literal asterisks\* · \_literal underscores\_ · \`literal backticks\`
