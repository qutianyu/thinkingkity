import MarkdownIt from "markdown-it";
import type { LinkHeading, WikiLink } from "./types";
import { extractWikiLinks, slugify } from "./wikiLinkParser";

const md = MarkdownIt("commonmark", { html: false });

export interface ParsedMarkdownFile {
  headings: LinkHeading[];
  links: WikiLink[];
  frontmatter: Record<string, unknown>;
}

// ── Frontmatter ───────────────────────────────────────────────────

function splitFrontmatter(content: string): { frontmatter: string; body: string } {
  const match = content.match(/^(---\r?\n[\s\S]*?\r?\n---)(?:[ \t]*\r?\n)*/);
  if (!match) return { frontmatter: "", body: content };
  return {
    frontmatter: `${match[1]}\n\n`,
    body: content.slice(match[0].length),
  };
}

function parseFrontmatter(frontmatter: string): Record<string, unknown> {
  if (!frontmatter) return {};
  const lines = frontmatter
    .replace(/^---\r?\n/, "")
    .replace(/\r?\n---\s*\r?\n?$/, "")
    .split(/\r?\n/);
  const result: Record<string, unknown> = {};
  let currentKey: string | null = null;

  for (const line of lines) {
    const listMatch = line.match(/^\s*-\s*(.*)$/);
    if (listMatch && currentKey) {
      const existing = result[currentKey];
      if (Array.isArray(existing)) {
        existing.push(listMatch[1]);
      } else {
        result[currentKey] = [existing as string, listMatch[1]];
      }
      continue;
    }

    const fieldMatch = line.match(/^([^:#][^:]*):\s*(.*)$/);
    if (!fieldMatch) continue;

    currentKey = fieldMatch[1].trim();
    result[currentKey] = fieldMatch[2].trim();
  }

  return result;
}

// ── Headings ──────────────────────────────────────────────────────

function getMarkdownHeadings(markdown: string): LinkHeading[] {
  const seen = new Map<string, number>();

  return markdown
    .split(/\r?\n/)
    .map((line, lineIndex) => {
      const match = line.match(/^(#{1,6})\s+(.+)$/);
      if (!match) return null;

      const text = match[2].replace(/[#*_`[\]()]/g, "").trim();
      if (!text) return null;

      const baseId = slugify(text);
      const count = seen.get(baseId) ?? 0;
      seen.set(baseId, count + 1);

      const heading: LinkHeading = {
        level: match[1].length,
        line: lineIndex,
        text,
        slug: count === 0 ? baseId : `${baseId}-${count + 1}`,
      };
      return heading;
    })
    .filter((h): h is LinkHeading => h !== null);
}

// ── Wiki link extraction from AST ─────────────────────────────────

function extractWikiLinksFromTokens(content: string): WikiLink[] {
  const tokens = md.parse(content, {});
  const links: WikiLink[] = [];

  for (const token of tokens) {
    if (token.type === "inline" && token.children) {
      for (const child of token.children) {
        // Only scan plain text nodes, skip code_inline, link, html_inline etc.
        if (child.type === "text" && child.content) {
          const found = extractWikiLinks(child.content, child.map?.[0] ?? 0);
          links.push(...found);
        }
      }
    }
    // code_block, fence, html_block are skipped automatically
  }

  return links;
}

// ── Public API ────────────────────────────────────────────────────

export function parseMarkdownFile(content: string): ParsedMarkdownFile {
  const { frontmatter, body } = splitFrontmatter(content);
  const headings = getMarkdownHeadings(body);
  const links = extractWikiLinksFromTokens(body);
  const fm = parseFrontmatter(frontmatter);

  return { headings, links, frontmatter: fm };
}

export function getFrontmatterTitle(fm: Record<string, unknown>): string | undefined {
  const title = fm.title;
  if (typeof title === "string" && title.trim()) return title.trim();
  return undefined;
}

export function getFrontmatterAliases(fm: Record<string, unknown>): string[] {
  const aliases = fm.aliases;
  if (Array.isArray(aliases)) {
    return aliases.filter((a): a is string => typeof a === "string" && a.trim().length > 0).map((a) => a.trim());
  }
  return [];
}

export function getTitleForFile(
  filePath: string,
  fm: Record<string, unknown>,
): string {
  const fmTitle = getFrontmatterTitle(fm);
  if (fmTitle) return fmTitle;
  // basename without extension
  const parts = filePath.replace(/[/\\]$/, "").split(/[/\\]/);
  const basename = parts[parts.length - 1] || "";
  return basename.replace(/\.(?:md|markdown)$/i, "");
}

export function getIndexNamesForFile(
  filePath: string,
  fm: Record<string, unknown>,
  vaultPath?: string,
): string[] {
  const names: string[] = [];
  const fmTitle = getFrontmatterTitle(fm);
  if (fmTitle) names.push(fmTitle);
  names.push(...getFrontmatterAliases(fm));
  // basename without extension
  const parts = filePath.replace(/[/\\]$/, "").split(/[/\\]/);
  const basename = parts[parts.length - 1] || "";
  const name = basename.replace(/\.(?:md|markdown)$/i, "");
  if (name && !names.includes(name)) names.push(name);
  // vault-relative path without extension (e.g. "notes/subdir/foo")
  if (vaultPath) {
    const sep = filePath.includes("\\") ? "\\" : "/";
    const vaultPrefix = vaultPath.endsWith(sep) ? vaultPath : vaultPath + sep;
    if (filePath.startsWith(vaultPrefix)) {
      const relativePath = filePath.slice(vaultPrefix.length);
      const relativeName = relativePath.replace(/\.(?:md|markdown)$/i, "");
      if (relativeName && !names.includes(relativeName)) names.push(relativeName);
    }
  }
  return names;
}
