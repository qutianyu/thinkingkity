import type { WikiLink } from "./types";

const WIKI_LINK_RE = /\[\[([\s\S]*?)\]\]/g;

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9一-龥]+/g, "-")
    .replace(/^-|-$/g, "") || "heading";
}

/**
 * Parse a single [[...]] string into a WikiLink.
 * Returns null if the raw text doesn't look like a wiki link.
 */
export function parseWikiLink(raw: string): WikiLink | null {
  const inner = raw.match(/^\[\[([\s\S]*?)\]\]$/);
  if (!inner) return null;

  const content = inner[1];
  // Split by first unescaped | for alias
  let targetPart = content;
  let alias: string | undefined;

  const pipeIdx = indexOfUnescaped(content, "|");
  if (pipeIdx >= 0) {
    targetPart = content.slice(0, pipeIdx);
    alias = content.slice(pipeIdx + 1).trim();
  }

  // Split by first unescaped # for heading
  let target = targetPart;
  let heading: string | undefined;

  const hashIdx = indexOfUnescaped(targetPart, "#");
  if (hashIdx >= 0) {
    target = targetPart.slice(0, hashIdx);
    heading = targetPart.slice(hashIdx + 1).trim();
  }

  target = target.trim();
  if (heading) heading = heading.trim();

  return {
    raw,
    target,
    alias: alias || undefined,
    heading: heading || undefined,
    status: "unresolved",
  };
}

/**
 * Extract all wiki links from a text string, with position info.
 */
export function extractWikiLinks(
  text: string,
  baseLine = 0,
): WikiLink[] {
  const links: WikiLink[] = [];
  let line = baseLine;
  let columnOffset = 0;

  // Track line boundaries for accurate position reporting
  const lines = text.split("\n");

  for (let i = 0; i < lines.length; i++) {
    const lineText = lines[i];
    const currentLine = baseLine + i;
    let match: RegExpExecArray | null;

    // Reset lastIndex for new line
    const re = new RegExp(WIKI_LINK_RE.source, "g");
    while ((match = re.exec(lineText)) !== null) {
      const parsed = parseWikiLink(match[0]);
      if (parsed) {
        parsed.position = {
          line: currentLine,
          column: match.index,
        };
        links.push(parsed);
      }
    }
  }

  return links;
}

function indexOfUnescaped(str: string, char: string): number {
  for (let i = 0; i < str.length; i++) {
    if (str[i] === "\\" && i + 1 < str.length && str[i + 1] === char) {
      i++; // skip escaped char
      continue;
    }
    if (str[i] === char) return i;
  }
  return -1;
}
