import { pathBasename, readDirectory } from "@/lib/tauriCommands";
import { isVaultSystemEntry } from "@/lib/vaultConfig";
import type { AiArticleContextRef } from "./sessionTypes";
import { getVaultRelativePath } from "./contextBuilder";
import { canUseAsAiTextContext, shouldSkipAiContextDirectory } from "./contextFileRules";

const MAX_RESULTS = 30;
function nowIso(): string {
  return new Date().toISOString();
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
      const relativePath = getVaultRelativePath(vaultPath, entry.path);
      const haystack = `${entry.name}\n${relativePath}`.toLowerCase();
      if (haystack.includes(lowerQuery)) {
        results.push({
          type: "directory",
          path: relativePath,
          title: pathBasename(entry.path),
          recursive: true,
          added_at: nowIso(),
        });
        if (results.length >= MAX_RESULTS) return;
      }
      if (shouldSkipAiContextDirectory(entry.name)) continue;
      try {
        // Search should stay resilient when a subfolder is unreadable.
        await searchRecursive(vaultPath, entry.path, query, results);
      } catch {
        // Ignore unreadable folders.
      }
      continue;
    }

    if (!canUseAsAiTextContext(entry.path)) continue;

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
