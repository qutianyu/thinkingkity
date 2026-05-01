import type { FileEntry } from "@/types";
import { readFile, writeFile, createFolder, pathJoin } from "@/lib/tauriCommands";
import { getVaultConfigDir } from "@/lib/vaultConfig";

const SORT_FILE = "sort.json";

export interface VaultSort {
  order: Record<string, string[]>;
}

function getSortFilePath(vaultPath: string): string {
  return pathJoin(getVaultConfigDir(vaultPath), SORT_FILE);
}

export function pathToKey(vaultPath: string, absolutePath: string): string {
  // Sort files by vault-relative keys so ordering survives moving the vault folder.
  const nv = vaultPath.replace(/\\/g, "/");
  const na = absolutePath.replace(/\\/g, "/");
  if (na === nv || na === nv + "/") return "";
  if (na.startsWith(nv + "/")) return na.slice(nv.length + 1);
  return absolutePath;
}

export function keyToPath(vaultPath: string, key: string): string {
  if (!key) return vaultPath;
  return pathJoin(vaultPath, key);
}

export async function readVaultSort(vaultPath: string): Promise<VaultSort> {
  try {
    const raw = await readFile(getSortFilePath(vaultPath));
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && parsed.order && typeof parsed.order === "object") {
      const migrated: Record<string, string[]> = {};
      for (const [key, value] of Object.entries(parsed.order)) {
        if (!Array.isArray(value)) continue;
        const relativeKey = pathToKey(vaultPath, key);
        migrated[relativeKey] = value.filter((v): v is string => typeof v === "string");
      }
      return { order: migrated };
    }
  } catch {
    // file doesn't exist or invalid
  }
  return { order: {} };
}

export async function writeVaultSort(
  vaultPath: string,
  sort: VaultSort,
): Promise<void> {
  await createFolder(getVaultConfigDir(vaultPath));
  await writeFile(getSortFilePath(vaultPath), JSON.stringify(sort, null, 2));
}

function defaultSort(entries: FileEntry[]): FileEntry[] {
  return [...entries].sort((a, b) => {
    if (a.is_dir !== b.is_dir) return a.is_dir ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
}

export function getSortedEntries(
  entries: FileEntry[],
  parentPath: string,
  sort: VaultSort,
  vaultPath: string,
): FileEntry[] {
  // Keep known user order first, then append new entries in deterministic name order.
  const relativeParent = pathToKey(vaultPath, parentPath);
  const orderList = sort.order[relativeParent];
  if (!orderList || orderList.length === 0) {
    return defaultSort(entries);
  }

  const nameMap = new Map(entries.map((e) => [e.name, e]));
  const sorted: FileEntry[] = [];
  const seen = new Set<string>();

  for (const name of orderList) {
    const entry = nameMap.get(name);
    if (entry) {
      sorted.push(entry);
      seen.add(name);
    }
  }

  const remaining = entries.filter((e) => !seen.has(e.name));
  sorted.push(...defaultSort(remaining));

  return sorted;
}

export function buildOrderList(entries: FileEntry[]): string[] {
  // Persist only entry names; parent folder paths are represented by the containing key.
  return entries.map((e) => e.name);
}
