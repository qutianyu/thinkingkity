import { readDirectory, readFile, writeFile, createFolder, pathJoin } from "@/lib/tauriCommands";
import { isVaultSystemEntry } from "@/lib/vaultConfig";
import { type ArticleId, type LinkIndex, type LinkFileEntry, type BacklinkRef } from "./types";
import {
  parseMarkdownFile,
  getTitleForFile,
  getIndexNamesForFile,
  getFrontmatterTitle,
  getFrontmatterAliases,
} from "./markdownLinkParser";
import { resolveFileLinks } from "./linkResolver";

// ── Cache path ────────────────────────────────────────────────────

function getCachePath(vaultPath: string): string {
  return pathJoin(vaultPath, ".thinkingkity", "link-index.json");
}

// ── File scanning ─────────────────────────────────────────────────

async function scanMarkdownFiles(vaultPath: string): Promise<ArticleId[]> {
  const results: ArticleId[] = [];

  async function walk(dir: string) {
    const entries = await readDirectory(dir);
    for (const entry of entries) {
      if (isVaultSystemEntry(entry)) continue;
      if (entry.is_dir) {
        await walk(entry.path);
      } else if (entry.name.endsWith(".md") || entry.name.endsWith(".markdown")) {
        results.push(entry.path);
      }
    }
  }

  await walk(vaultPath);
  return results;
}

// ── Index building ────────────────────────────────────────────────

async function parseOneFile(
  filePath: ArticleId,
  vaultPath: string,
): Promise<{ entry: LinkFileEntry; indexNames: string[] }> {
  const content = await readFile(filePath);
  const parsed = parseMarkdownFile(content);
  const title = getTitleForFile(filePath, parsed.frontmatter);
  const aliases = getFrontmatterAliases(parsed.frontmatter);
  const indexNames = getIndexNamesForFile(filePath, parsed.frontmatter, vaultPath);

  const entry: LinkFileEntry = {
    path: filePath,
    title,
    aliases,
    headings: parsed.headings,
    outgoing: parsed.links, // unresolved initially
    backlinks: [],
    mtimeMs: 0,
    size: content.length,
  };

  return { entry, indexNames };
}

export async function buildIndex(vaultPath: string): Promise<LinkIndex> {
  const mdFiles = await scanMarkdownFiles(vaultPath);
  const index: LinkIndex = {
    version: 1,
    vaultPath,
    updatedAt: Date.now(),
    files: {},
    aliases: {},
  };

  // Concurrent parse with pool size 6
  const CONCURRENCY = 6;
  const tasks = mdFiles.map((filePath) =>
    parseOneFile(filePath, vaultPath).then(({ entry, indexNames }) => {
      index.files[filePath] = entry;
      for (const name of indexNames) {
        const key = name.toLowerCase();
        if (!index.aliases[key]) index.aliases[key] = [];
        if (!index.aliases[key].includes(filePath)) {
          index.aliases[key].push(filePath);
        }
      }
    }),
  );

  // Process in batches to limit concurrency
  for (let i = 0; i < tasks.length; i += CONCURRENCY) {
    await Promise.all(tasks.slice(i, i + CONCURRENCY));
  }

  // Resolve all outgoing links
  for (const filePath of Object.keys(index.files)) {
    const entry = index.files[filePath];
    entry.outgoing = resolveFileLinks(filePath, entry.outgoing, index);
  }

  // Compute backlinks
  computeBacklinks(index);

  return index;
}

// ── Backlink computation ──────────────────────────────────────────

export function computeBacklinks(index: LinkIndex): void {
  // Clear existing backlinks
  for (const filePath of Object.keys(index.files)) {
    index.files[filePath].backlinks = [];
  }

  // Reverse outgoing → backlinks
  for (const sourcePath of Object.keys(index.files)) {
    const entry = index.files[sourcePath];
    for (const link of entry.outgoing) {
      if (!link.resolvedPath) continue;
      const target = index.files[link.resolvedPath];
      if (!target) continue;

      const preview = buildPreview(sourcePath, link.position?.line ?? 0);
      target.backlinks.push({
        sourcePath,
        raw: link.raw,
        alias: link.alias,
        heading: link.heading,
        line: link.position?.line ?? 0,
        preview,
      });
    }
  }
}

function buildPreview(sourcePath: string, line: number): string {
  // A simple path + line reference; the panel reads actual context from the file if needed
  const parts = sourcePath.replace(/[/\\]$/, "").split(/[/\\]/);
  const basename = parts[parts.length - 1] || sourcePath;
  return `${basename}:${line + 1}`;
}

// ── Incremental updates ───────────────────────────────────────────

export async function updateFileInIndex(
  filePath: ArticleId,
  content: string,
  vaultPath: string,
  oldIndex: LinkIndex,
): Promise<LinkIndex> {
  const index = structuredClone(oldIndex);
  const oldEntry = index.files[filePath];

  // Remove old aliases
  if (oldEntry) {
    const oldNames = getIndexNamesForFile(filePath, { title: oldEntry.title, aliases: oldEntry.aliases }, vaultPath);
    for (const name of oldNames) {
      const key = name.toLowerCase();
      if (index.aliases[key]) {
        index.aliases[key] = index.aliases[key].filter((p) => p !== filePath);
        if (index.aliases[key].length === 0) delete index.aliases[key];
      }
    }
  }

  // Parse new content
  const parsed = parseMarkdownFile(content);
  const title = getTitleForFile(filePath, parsed.frontmatter);
  const aliases = getFrontmatterAliases(parsed.frontmatter);
  const indexNames = getIndexNamesForFile(filePath, parsed.frontmatter, vaultPath);

  const newEntry: LinkFileEntry = {
    path: filePath,
    title,
    aliases,
    headings: parsed.headings,
    outgoing: parsed.links,
    backlinks: [],
    mtimeMs: Date.now(),
    size: content.length,
  };

  index.files[filePath] = newEntry;

  // Add new aliases
  for (const name of indexNames) {
    const key = name.toLowerCase();
    if (!index.aliases[key]) index.aliases[key] = [];
    if (!index.aliases[key].includes(filePath)) {
      index.aliases[key].push(filePath);
    }
  }

  // Resolve this file's outgoing links
  newEntry.outgoing = resolveFileLinks(filePath, newEntry.outgoing, index);

  // Recompute backlinks (cheap for small-to-medium vaults)
  computeBacklinks(index);

  index.updatedAt = Date.now();
  return index;
}

export function removeFileFromIndex(
  filePath: ArticleId,
  oldIndex: LinkIndex,
): LinkIndex {
  const index = structuredClone(oldIndex);
  const oldEntry = index.files[filePath];
  if (!oldEntry) return index;

  // Remove from aliases
  const names = getIndexNamesForFile(filePath, { title: oldEntry.title, aliases: oldEntry.aliases }, oldIndex.vaultPath);
  for (const name of names) {
    const key = name.toLowerCase();
    if (index.aliases[key]) {
      index.aliases[key] = index.aliases[key].filter((p) => p !== filePath);
      if (index.aliases[key].length === 0) delete index.aliases[key];
    }
  }

  delete index.files[filePath];

  // Mark links pointing to this file as unresolved
  for (const sourcePath of Object.keys(index.files)) {
    const entry = index.files[sourcePath];
    for (const link of entry.outgoing) {
      if (link.resolvedPath === filePath) {
        link.resolvedPath = undefined;
        link.status = "unresolved";
      }
    }
  }

  computeBacklinks(index);
  index.updatedAt = Date.now();
  return index;
}

export function renameFileInIndex(
  oldPath: ArticleId,
  newPath: ArticleId,
  oldIndex: LinkIndex,
): LinkIndex {
  const index = structuredClone(oldIndex);
  const entry = index.files[oldPath];
  if (!entry) return index;

  // Update aliases with new path's basename
  const newTitle = getTitleForFile(newPath, { title: entry.title, aliases: entry.aliases });
  const newNames = getIndexNamesForFile(newPath, { title: entry.title, aliases: entry.aliases }, oldIndex.vaultPath);

  // Remove old aliases
  const oldNames = getIndexNamesForFile(oldPath, { title: entry.title, aliases: entry.aliases }, oldIndex.vaultPath);
  for (const name of oldNames) {
    const key = name.toLowerCase();
    if (index.aliases[key]) {
      index.aliases[key] = index.aliases[key].filter((p) => p !== oldPath);
      if (index.aliases[key].length === 0) delete index.aliases[key];
    }
  }

  // Move entry
  entry.path = newPath;
  entry.title = newTitle;
  index.files[newPath] = entry;
  delete index.files[oldPath];

  // Add new aliases
  for (const name of newNames) {
    const key = name.toLowerCase();
    if (!index.aliases[key]) index.aliases[key] = [];
    if (!index.aliases[key].includes(newPath)) {
      index.aliases[key].push(newPath);
    }
  }

  // Update outgoing links that pointed to oldPath
  for (const sourcePath of Object.keys(index.files)) {
    const sourceEntry = index.files[sourcePath];
    for (const link of sourceEntry.outgoing) {
      if (link.resolvedPath === oldPath) {
        link.resolvedPath = newPath;
      }
    }
  }

  // Re-resolve this file's own outgoing links (paths may have changed)
  entry.outgoing = resolveFileLinks(newPath, entry.outgoing, index);

  computeBacklinks(index);
  index.updatedAt = Date.now();
  return index;
}

// ── Cache I/O ─────────────────────────────────────────────────────

export async function readCache(vaultPath: string): Promise<LinkIndex | null> {
  try {
    const raw = await readFile(getCachePath(vaultPath));
    const parsed = JSON.parse(raw);
    if (parsed && parsed.version === 1 && parsed.vaultPath === vaultPath) {
      return parsed as LinkIndex;
    }
    return null;
  } catch {
    return null;
  }
}

export async function writeCache(vaultPath: string, index: LinkIndex): Promise<void> {
  try {
    const configDir = pathJoin(vaultPath, ".thinkingkity");
    await createFolder(configDir);
    await writeFile(getCachePath(vaultPath), JSON.stringify(index, null, 2));
  } catch (e) {
    console.warn("Failed to write link index cache:", e);
  }
}

// ── Cache validation ──────────────────────────────────────────────

export async function isCacheValid(
  cache: LinkIndex,
  vaultPath: string,
): Promise<boolean> {
  if (cache.version !== 1) return false;
  if (cache.vaultPath !== vaultPath) return false;

  // Scan current .md files and compare with cached paths
  let currentFiles: string[];
  try {
    currentFiles = await scanMarkdownFiles(vaultPath);
  } catch {
    return false;
  }

  const cachedPaths = Object.keys(cache.files);
  if (currentFiles.length !== cachedPaths.length) return false;

  for (const f of currentFiles) {
    if (!cache.files[f]) return false;
  }

  return true;
}
