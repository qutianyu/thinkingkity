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

export function MarkdownMessage({ content }: MarkdownMessageProps) {
  const lines = content.split(/\r?\n/);
  const blocks: ReactNode[] = [];
  const paragraph: string[] = [];
  const list: string[] = [];
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
      continue;
    }

    const heading = line.match(/^(#{1,6})\s+(.+)$/);
    if (heading) {
      key = flushParagraph(blocks, paragraph, key);
      key = flushList(blocks, list, orderedList, key);
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
      blocks.push(<blockquote key={key}>{renderInline(quote[1])}</blockquote>);
      key += 1;
      continue;
    }

    const unordered = line.match(/^\s*[-*+]\s+(.+)$/);
    const ordered = line.match(/^\s*\d+[.)]\s+(.+)$/);
    if (unordered || ordered) {
      key = flushParagraph(blocks, paragraph, key);
      const nextOrdered = Boolean(ordered);
      if (list.length > 0 && orderedList !== nextOrdered) {
        key = flushList(blocks, list, orderedList, key);
      }
      orderedList = nextOrdered;
      list.push((ordered?.[1] ?? unordered?.[1] ?? "").trim());
      continue;
    }

    key = flushList(blocks, list, orderedList, key);
    paragraph.push(line.trim());
  }

  key = flushParagraph(blocks, paragraph, key);
  flushList(blocks, list, orderedList, key);

  if (inCodeBlock) {
    blocks.push(
      <pre key="open-code-block" data-language={codeLanguage || undefined}>
        <code>{codeLines.join("\n")}</code>
      </pre>,
    );
  }

  return <div className="ai-markdown-message">{blocks}</div>;
}
