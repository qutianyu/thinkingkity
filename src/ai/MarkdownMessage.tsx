import type { ReactNode } from "react";

interface MarkdownMessageProps {
  content: string;
}

interface TextSegment {
  type: "text" | "code" | "strong" | "em" | "link";
  text: string;
  href?: string;
}

function isSafeHref(href: string): boolean {
  return /^(https?:\/\/|mailto:|tel:|\/|\.{0,2}\/)/i.test(href);
}

function parseInline(markdown: string): TextSegment[] {
  const segments: TextSegment[] = [];
  // This intentionally handles a small safe subset of Markdown used in chat output.
  const pattern = /(`[^`]+`|\*\*[^*]+\*\*|\*[^*]+\*|\[[^\]]+\]\([^)]+\))/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(markdown))) {
    if (match.index > lastIndex) {
      segments.push({ type: "text", text: markdown.slice(lastIndex, match.index) });
    }

    const value = match[0];
    const linkMatch = value.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
    if (value.startsWith("`")) {
      segments.push({ type: "code", text: value.slice(1, -1) });
    } else if (value.startsWith("**")) {
      segments.push({ type: "strong", text: value.slice(2, -2) });
    } else if (value.startsWith("*")) {
      segments.push({ type: "em", text: value.slice(1, -1) });
    } else if (linkMatch) {
      segments.push({ type: "link", text: linkMatch[1], href: linkMatch[2] });
    }

    lastIndex = pattern.lastIndex;
  }

  if (lastIndex < markdown.length) {
    segments.push({ type: "text", text: markdown.slice(lastIndex) });
  }

  return segments;
}

function renderInline(markdown: string): ReactNode[] {
  return parseInline(markdown).map((segment, index) => {
    switch (segment.type) {
      case "code":
        return <code key={index}>{segment.text}</code>;
      case "strong":
        return <strong key={index}>{renderInline(segment.text)}</strong>;
      case "em":
        return <em key={index}>{renderInline(segment.text)}</em>;
      case "link":
        if (!segment.href || !isSafeHref(segment.href)) {
          return <span key={index}>{segment.text}</span>;
        }
        return (
          <a key={index} href={segment.href} target="_blank" rel="noreferrer">
            {segment.text}
          </a>
        );
      case "text":
      default:
        return segment.text;
    }
  });
}

function flushParagraph(blocks: ReactNode[], paragraph: string[], key: number): number {
  if (paragraph.length === 0) return key;
  blocks.push(<p key={key}>{renderInline(paragraph.join(" "))}</p>);
  paragraph.length = 0;
  return key + 1;
}

function flushList(blocks: ReactNode[], list: string[], ordered: boolean, key: number): number {
  if (list.length === 0) return key;
  const ListTag = ordered ? "ol" : "ul";
  blocks.push(
    <ListTag key={key}>
      {list.map((item, index) => (
        <li key={index}>{renderInline(item)}</li>
      ))}
    </ListTag>,
  );
  list.length = 0;
  return key + 1;
}

function normalizeTables(markdown: string): string {
  // Models sometimes stream a whole Markdown table as one physical line:
  // | A | B | |---|---| | C | D |
  // Split only at row boundaries, which appear as an end pipe followed by a new start pipe.
  return markdown.replace(/\|\s+(?=\|(?:\s*:?-{3,}:?\s*\||\s*\S))/g, "|\n");
}

function isTableRow(line: string): boolean {
  const trimmed = line.trim();
  return trimmed.startsWith("|") && trimmed.endsWith("|") && trimmed.includes("|", 1);
}

function isTableSeparator(line: string): boolean {
  const cells = line.trim().slice(1, -1).split("|").map((cell) => cell.trim());
  return cells.length > 0 && cells.every((cell) => /^:?-{3,}:?$/.test(cell));
}

function parseTableRow(line: string): string[] {
  return line.trim().slice(1, -1).split("|").map((cell) => cell.trim());
}

function flushTable(blocks: ReactNode[], table: string[], key: number): number {
  if (table.length === 0) return key;
  if (table.length < 2 || !isTableSeparator(table[1])) {
    blocks.push(<p key={key}>{renderInline(table.join(" "))}</p>);
    table.length = 0;
    return key + 1;
  }
  const header = parseTableRow(table[0]);
  const rows = table.slice(2).filter(isTableRow).map(parseTableRow);
  blocks.push(
    <div key={key} className="ai-markdown-table-wrap">
      <table>
        <thead>
          <tr>
            {header.map((cell, index) => (
              <th key={index}>{renderInline(cell)}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, rowIndex) => (
            <tr key={rowIndex}>
              {header.map((_, cellIndex) => (
                <td key={cellIndex}>{renderInline(row[cellIndex] ?? "")}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>,
  );
  table.length = 0;
  return key + 1;
}

export function MarkdownMessage({ content }: MarkdownMessageProps) {
  const lines = normalizeTables(content).split(/\r?\n/);
  const blocks: ReactNode[] = [];
  const paragraph: string[] = [];
  const list: string[] = [];
  const table: string[] = [];
  let orderedList = false;
  let inCodeBlock = false;
  let codeLanguage = "";
  let codeLines: string[] = [];
  let key = 0;

  for (const line of lines) {
    const fence = line.match(/^```(\S*)\s*$/);
    if (fence) {
      if (inCodeBlock) {
        blocks.push(
          <pre key={key} data-language={codeLanguage || undefined}>
            <code>{codeLines.join("\n")}</code>
          </pre>,
        );
        key += 1;
        inCodeBlock = false;
        codeLanguage = "";
        codeLines = [];
      } else {
        // Flush open prose before switching into fenced code mode.
        key = flushParagraph(blocks, paragraph, key);
        key = flushList(blocks, list, orderedList, key);
        inCodeBlock = true;
        codeLanguage = fence[1] || "";
      }
      continue;
    }

    if (inCodeBlock) {
      codeLines.push(line);
      continue;
    }

    if (!line.trim()) {
      key = flushParagraph(blocks, paragraph, key);
      key = flushList(blocks, list, orderedList, key);
      key = flushTable(blocks, table, key);
      continue;
    }

    if (isTableRow(line)) {
      key = flushParagraph(blocks, paragraph, key);
      key = flushList(blocks, list, orderedList, key);
      table.push(line);
      continue;
    }

    const heading = line.match(/^(#{1,6})\s+(.+)$/);
    if (heading) {
      key = flushParagraph(blocks, paragraph, key);
      key = flushList(blocks, list, orderedList, key);
      key = flushTable(blocks, table, key);
      const level = Math.min(heading[1].length, 4);
      const HeadingTag = `h${level}` as "h1" | "h2" | "h3" | "h4";
      blocks.push(<HeadingTag key={key}>{renderInline(heading[2].replace(/\s+#*$/, ""))}</HeadingTag>);
      key += 1;
      continue;
    }

    const quote = line.match(/^>\s?(.*)$/);
    if (quote) {
      key = flushParagraph(blocks, paragraph, key);
      key = flushList(blocks, list, orderedList, key);
      key = flushTable(blocks, table, key);
      blocks.push(<blockquote key={key}>{renderInline(quote[1])}</blockquote>);
      key += 1;
      continue;
    }

    const unordered = line.match(/^\s*[-*+]\s+(.+)$/);
    const ordered = line.match(/^\s*\d+[.)]\s+(.+)$/);
    if (unordered || ordered) {
      key = flushParagraph(blocks, paragraph, key);
      key = flushTable(blocks, table, key);
      const nextOrdered = Boolean(ordered);
      if (list.length > 0 && orderedList !== nextOrdered) {
        key = flushList(blocks, list, orderedList, key);
      }
      orderedList = nextOrdered;
      list.push((ordered?.[1] ?? unordered?.[1] ?? "").trim());
      continue;
    }

    key = flushList(blocks, list, orderedList, key);
    key = flushTable(blocks, table, key);
    paragraph.push(line.trim());
  }

  key = flushParagraph(blocks, paragraph, key);
  key = flushList(blocks, list, orderedList, key);
  flushTable(blocks, table, key);

  if (inCodeBlock) {
    blocks.push(
      <pre key="open-code-block" data-language={codeLanguage || undefined}>
        <code>{codeLines.join("\n")}</code>
      </pre>,
    );
  }

  return <div className="ai-markdown-message">{blocks}</div>;
}
