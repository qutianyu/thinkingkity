import { pathBasename, pathJoin, readDirectory } from "@/lib/tauriCommands";
import { isVaultSystemEntry } from "@/lib/vaultConfig";
import type { AiDirectoryContextRef, AiFileContextRef } from "./sessionTypes";
import { canUseAsAiTextContext, shouldSkipAiContextDirectory } from "./contextFileRules";

export interface DirectoryContextOptions {
  recursive: boolean;
  maxFiles: number;
}

const DEFAULT_DIRECTORY_CONTEXT_OPTIONS: DirectoryContextOptions = {
  recursive: true,
  maxFiles: 80,
};

function nowIso(): string {
  return new Date().toISOString();
}

function getVaultRelativePath(vaultPath: string, filePath: string): string {
  const normalizedVault = vaultPath.replace(/[/\\]+$/, "");
  if (filePath === normalizedVault) return "";
  if (filePath.startsWith(`${normalizedVault}/`) || filePath.startsWith(`${normalizedVault}\\`)) {
    return filePath.slice(normalizedVault.length + 1);
  }
  return filePath;
}

async function collectDirectoryFiles(
  vaultPath: string,
  dirPath: string,
  options: DirectoryContextOptions,
  results: AiFileContextRef[],
): Promise<void> {
  if (results.length >= options.maxFiles) return;

  const entries = await readDirectory(dirPath);
  for (const entry of entries) {
    if (results.length >= options.maxFiles) return;
    if (isVaultSystemEntry(entry)) continue;

    if (entry.is_dir) {
      if (!options.recursive || shouldSkipAiContextDirectory(entry.name)) continue;
      try {
        await collectDirectoryFiles(vaultPath, entry.path, options, results);
      } catch {
        // Ignore unreadable subdirectories so one bad folder does not drop the whole context.
      }
      continue;
    }

    if (!canUseAsAiTextContext(entry.path)) continue;
    const relativePath = getVaultRelativePath(vaultPath, entry.path);
    results.push({
      type: "file",
      path: relativePath,
      title: pathBasename(entry.path),
      added_at: nowIso(),
    });
  }
}

export async function expandDirectoryContext(
  vaultPath: string,
  ref: AiDirectoryContextRef,
  options: Partial<DirectoryContextOptions> = {},
): Promise<AiFileContextRef[]> {
  const resolvedOptions = {
    ...DEFAULT_DIRECTORY_CONTEXT_OPTIONS,
    ...options,
    recursive: options.recursive ?? ref.recursive,
  };
  const results: AiFileContextRef[] = [];
  await collectDirectoryFiles(vaultPath, pathJoin(vaultPath, ref.path), resolvedOptions, results);
  return results;
}
