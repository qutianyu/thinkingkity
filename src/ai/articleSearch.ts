import { isImageFile, isPdfFile, pathBasename, readDirectory } from "@/lib/tauriCommands";
import { CODE_TYPES, DOC_TYPES } from "@/lib/codeTypes";
import { isVaultSystemEntry } from "@/lib/vaultConfig";
import type { AiArticleContextRef } from "./sessionTypes";
import { getVaultRelativePath } from "./contextBuilder";

const MAX_RESULTS = 30;
const EXTRA_CONTEXT_EXTENSIONS = [
  ".md",
  ".mdx",
  ".log",
];
const CONTEXT_EXTENSIONS = Array.from(new Set([
  ...DOC_TYPES.map((type) => `.${type.ext}`),
  ...CODE_TYPES.flatMap((type) => type.exts.map((ext) => `.${ext}`)),
  ...EXTRA_CONTEXT_EXTENSIONS,
]));

function nowIso(): string {
  return new Date().toISOString();
}

function canUseAsContextFile(path: string): boolean {
  // Binary formats are skipped because the context builder reads files as text.
  if (isImageFile(path) || isPdfFile(path)) return false;
  const lower = path.toLowerCase();
  return CONTEXT_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

async function searchRecursive(
  vaultPath: string,
  dirPath: string,
  query: string,
  results: AiArticleContextRef[],
): Promise<void> {
  if (results.length >= MAX_RESULTS) return;

  const entries = await readDirectory(dirPath);
  const lowerQuery = query.toLowerCase();
  for (const entry of entries) {
    if (results.length >= MAX_RESULTS) return;
    if (isVaultSystemEntry(entry)) continue;

    if (entry.is_dir) {
      try {
        // Search should stay resilient when a subfolder is unreadable.
        await searchRecursive(vaultPath, entry.path, query, results);
      } catch {
        // Ignore unreadable folders.
      }
      continue;
    }

    if (!canUseAsContextFile(entry.path)) continue;

    const relativePath = getVaultRelativePath(vaultPath, entry.path);
    const haystack = `${entry.name}\n${relativePath}`.toLowerCase();
    if (!haystack.includes(lowerQuery)) continue;

    results.push({
      type: "file",
      path: relativePath,
      title: pathBasename(entry.path),
      added_at: nowIso(),
    });
  }
}

export async function searchArticleContexts(
  vaultPath: string,
  query: string,
): Promise<AiArticleContextRef[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];
  const results: AiArticleContextRef[] = [];
  await searchRecursive(vaultPath, vaultPath, trimmed, results);
  return results;
}
