import { create } from "zustand";
import type { FileEntry } from "@/types";
import {
  isCodeFile,
  isImageFile,
  isJsonFile,
  isPdfFile,
  isTextFile,
  readDirectory,
  readFile,
  renameFile,
  getVaultSize,
} from "@/lib/tauriCommands";
import { isVaultSystemEntry } from "@/lib/vaultConfig";
import { useVaultStore } from "@/stores/vaultStore";
import {
  readVaultSort,
  writeVaultSort,
  getSortedEntries,
  buildOrderList,
  pathToKey,
  keyToPath,
  type VaultSort,
} from "@/lib/vaultSort";
import { useEditorStore } from "@/stores/editorStore";

function isFileAllowedByDisplayType(entry: FileEntry): boolean {
  // Directories are always visible so users can navigate to allowed descendants.
  if (entry.is_dir) return true;
  const displayType = useVaultStore.getState().displayType;
  if (!displayType || displayType.length === 0) return true;
  const dotIndex = entry.name.lastIndexOf(".");
  if (dotIndex < 0) return false;
  const ext = entry.name.slice(dotIndex + 1).toLowerCase();
  return displayType.includes(ext);
}

type DropPosition = "before" | "inside" | "after";

const CONTENT_SEARCH_EXTENSIONS = [".md", ".markdown", ".csv", ".mermaid", ".log"];
const SEARCH_SNIPPET_CONTEXT = 48;
const SEARCH_SNIPPET_MAX_LENGTH = 140;

interface FileTreeState {
  nodes: FileEntry[];
  treeVersion: number;
  fileCount: number;
  vaultSize: number;
  expandedPaths: Set<string>;
  loading: boolean;
  searchQuery: string;
  searchResults: FileEntry[];
  sort: VaultSort;
  dragSourcePath: string | null;
  dropTarget: { path: string; position: DropPosition } | null;
  refreshTree: (rootPath: string) => Promise<void>;
  toggleExpand: (path: string) => void;
  loadChildren: (entry: FileEntry) => Promise<FileEntry[]>;
  moveEntry: (sourcePath: string, targetDirPath: string) => Promise<void>;
  moveEntryToPosition: (
    sourcePath: string,
    targetParentPath: string,
    targetName: string,
    position: "before" | "after",
  ) => Promise<void>;
  reorderEntry: (parentPath: string, entryName: string, newIndex: number) => Promise<void>;
  setSearchQuery: (query: string) => void;
  searchFiles: (rootPath: string, query: string) => Promise<void>;
  clearSearch: () => void;
  setDragSource: (path: string | null) => void;
  setDropTarget: (target: { path: string; position: DropPosition } | null) => void;
}

async function searchRecursive(
  path: string,
  query: string,
): Promise<FileEntry[]> {
  // Search walks the vault tree lazily and tolerates unreadable branches.
  const entries = (await readDirectory(path))
    .filter((entry) => !isVaultSystemEntry(entry) && isFileAllowedByDisplayType(entry));
  const results: FileEntry[] = [];
  const lowerQuery = query.toLowerCase();
  for (const entry of entries) {
    const nameMatches = entry.name.toLowerCase().includes(lowerQuery);

    if (entry.is_dir) {
      if (nameMatches) {
        results.push({ ...entry, searchMatch: "name" });
      }
      try {
        const childResults = await searchRecursive(entry.path, query);
        results.push(...childResults);
      } catch {
        // skip dirs we can't read
      }
    } else if (canSearchFileContent(entry)) {
      try {
        const content = await readFile(entry.path);
        const contentMatch = getContentMatch(content, query);
        if (contentMatch) {
          results.push({
            ...entry,
            searchMatch: "content",
            searchSnippet: contentMatch.snippet,
            searchLine: contentMatch.line,
          });
        } else if (nameMatches) {
          results.push({ ...entry, searchMatch: "name" });
        }
      } catch {
        if (nameMatches) {
          results.push({ ...entry, searchMatch: "name" });
        }
      }
    } else if (nameMatches) {
      results.push({ ...entry, searchMatch: "name" });
    }
  }
  return results;
}

function getContentMatch(
  content: string,
  query: string,
): { snippet: string; line: number } | null {
  // Provide a compact snippet around the first text hit for sidebar search results.
  const trimmedQuery = query.trim();
  if (!trimmedQuery) return null;

  const matchIndex = content.toLowerCase().indexOf(trimmedQuery.toLowerCase());
  if (matchIndex < 0) return null;

  const line = content.slice(0, matchIndex).split(/\r\n|\r|\n/).length;
  const lineStart = Math.max(
    content.lastIndexOf("\n", matchIndex - 1),
    content.lastIndexOf("\r", matchIndex - 1),
  ) + 1;
  const nextLf = content.indexOf("\n", matchIndex);
  const nextCr = content.indexOf("\r", matchIndex);
  const lineEndCandidates = [nextLf, nextCr].filter((idx) => idx >= 0);
  const lineEnd = lineEndCandidates.length > 0
    ? Math.min(...lineEndCandidates)
    : content.length;
  const sourceLine = content.slice(lineStart, lineEnd);
  const inLineIndex = Math.max(0, matchIndex - lineStart);
  const queryEnd = inLineIndex + trimmedQuery.length;
  const needsTruncate = sourceLine.length > SEARCH_SNIPPET_MAX_LENGTH;
  const snippetStart = needsTruncate
    ? Math.max(0, inLineIndex - SEARCH_SNIPPET_CONTEXT)
    : 0;
  const snippetEnd = needsTruncate
    ? Math.min(sourceLine.length, queryEnd + SEARCH_SNIPPET_CONTEXT)
    : sourceLine.length;
  const prefix = snippetStart > 0 ? "..." : "";
  const suffix = snippetEnd < sourceLine.length ? "..." : "";
  const snippet = `${prefix}${sourceLine
    .slice(snippetStart, snippetEnd)
    .replace(/\s+/g, " ")
    .trim()}${suffix}`;

  return { snippet, line };
}

function canSearchFileContent(entry: FileEntry): boolean {
  // Skip binary assets and PDFs; content search is text-only.
  if (entry.is_dir || isImageFile(entry.path) || isPdfFile(entry.path)) {
    return false;
  }
  if (isJsonFile(entry.path) || isTextFile(entry.path) || isCodeFile(entry.path)) {
    return true;
  }
  const lower = entry.name.toLowerCase();
  return CONTENT_SEARCH_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

async function countFilesRecursive(path: string): Promise<number> {
  const entries = (await readDirectory(path))
    .filter((entry) => !isVaultSystemEntry(entry) && isFileAllowedByDisplayType(entry));
  let count = 0;

  for (const entry of entries) {
    if (entry.is_dir) {
      try {
        count += await countFilesRecursive(entry.path);
      } catch {
        // skip dirs we can't read
      }
    } else {
      count += 1;
    }
  }

  return count;
}

function getPathSeparator(path: string): string {
  return path.includes("\\") ? "\\" : "/";
}

function getEntryName(path: string): string {
  const lastSep = Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\"));
  return lastSep >= 0 ? path.slice(lastSep + 1) : path;
}

function getParentPath(path: string): string {
  const lastSep = Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\"));
  return lastSep > 0 ? path.slice(0, lastSep) : path;
}

async function readSortedAllowedEntries(parentPath: string, sort: VaultSort): Promise<FileEntry[]> {
  // Every tree refresh applies both visibility filters and persisted manual order.
  const vaultPath = useVaultStore.getState().vaultPath;
  if (!vaultPath) return [];
  const entries = (await readDirectory(parentPath))
    .filter((entry) => !isVaultSystemEntry(entry) && isFileAllowedByDisplayType(entry));
  return getSortedEntries(entries as FileEntry[], parentPath, sort, vaultPath);
}

export const useFileTreeStore = create<FileTreeState>((set, get) => ({
  nodes: [],
  treeVersion: 0,
  fileCount: 0,
  vaultSize: 0,
  expandedPaths: new Set(),
  loading: false,
  searchQuery: "",
  searchResults: [],
  sort: { order: {} },
  dragSourcePath: null,
  dropTarget: null,

  setDragSource: (path: string | null) => set({ dragSourcePath: path }),
  setDropTarget: (target: { path: string; position: DropPosition } | null) => set({ dropTarget: target }),

  refreshTree: async (rootPath: string) => {
    set({ loading: true });
    try {
      const [nodes, fileCount, sort, vaultSize] = await Promise.all([
        readDirectory(rootPath),
        countFilesRecursive(rootPath),
        readVaultSort(rootPath),
        getVaultSize(rootPath),
      ]);
      const filtered = (nodes as FileEntry[]).filter(
        (entry) => !isVaultSystemEntry(entry) && isFileAllowedByDisplayType(entry),
      );
      set({
        nodes: getSortedEntries(filtered, rootPath, sort, rootPath),
        fileCount,
        vaultSize,
        sort,
        treeVersion: get().treeVersion + 1,
        loading: false,
      });
    } catch (e) {
      console.error("Failed to read directory:", e);
      set({ loading: false });
    }
  },

  toggleExpand: (path: string) =>
    set((state) => {
      const next = new Set(state.expandedPaths);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return { expandedPaths: next };
    }),

  loadChildren: async (entry: FileEntry) => {
    if (!entry.is_dir) return [];
    try {
      const vaultPath = useVaultStore.getState().vaultPath;
      if (!vaultPath) return [];
      const nodes = (await readDirectory(entry.path))
        .filter((node) => !isVaultSystemEntry(node) && isFileAllowedByDisplayType(node));
      const sort = get().sort;
      return getSortedEntries(nodes as FileEntry[], entry.path, sort, vaultPath);
    } catch {
      return [];
    }
  },

  moveEntry: async (sourcePath: string, targetDirPath: string) => {
    // Moving updates filesystem first, then rewrites per-folder order metadata.
    const vaultPath = useVaultStore.getState().vaultPath;
    if (!vaultPath) return;

    const sourceName = getEntryName(sourcePath);
    const sep = getPathSeparator(targetDirPath);
    const newPath = `${targetDirPath}${sep}${sourceName}`;

    if (sourcePath === newPath || newPath.startsWith(sourcePath + sep)) return;

    try {
      const sort = { ...get().sort, order: { ...get().sort.order } };
      const targetKey = pathToKey(vaultPath, targetDirPath);
      const targetOrder = sort.order[targetKey]
        ? [...sort.order[targetKey]]
        : buildOrderList(await readSortedAllowedEntries(targetDirPath, sort));

      await renameFile(sourcePath, newPath);

      const oldParent = getParentPath(sourcePath);
      const oldParentKey = pathToKey(vaultPath, oldParent);

      if (sort.order[oldParentKey]) {
        sort.order[oldParentKey] = sort.order[oldParentKey].filter((n) => n !== sourceName);
        if (sort.order[oldParentKey].length === 0) delete sort.order[oldParentKey];
      }

      sort.order[targetKey] = targetOrder.filter((name) => name !== sourceName);
      if (!sort.order[targetKey].includes(sourceName)) {
        sort.order[targetKey].push(sourceName);
      }

      set({ sort });
      await writeVaultSort(vaultPath, sort);

      const closeTab = useEditorStore.getState().closeTab;
      closeTab(sourcePath);

      await get().refreshTree(vaultPath);
    } catch (e) {
      console.error("Failed to move entry:", e);
    }
  },

  moveEntryToPosition: async (sourcePath, targetParentPath, targetName, position) => {
    // Position drops preserve sibling ordering around the target item.
    const vaultPath = useVaultStore.getState().vaultPath;
    if (!vaultPath) return;

    const sourceName = getEntryName(sourcePath);
    const sourceParentPath = getParentPath(sourcePath);
    const sep = getPathSeparator(targetParentPath);
    const newPath = `${targetParentPath}${sep}${sourceName}`;

    if (sourcePath === newPath && sourceName === targetName) return;
    if (newPath.startsWith(sourcePath + sep)) return;

    try {
      const sort = { ...get().sort, order: { ...get().sort.order } };
      const targetParentKey = pathToKey(vaultPath, targetParentPath);
      const targetEntries = await readSortedAllowedEntries(targetParentPath, sort);
      let targetOrder = buildOrderList(targetEntries);

      if (sourceParentPath !== targetParentPath) {
        await renameFile(sourcePath, newPath);

        const sourceParentKey = pathToKey(vaultPath, sourceParentPath);
        const sourceOrder = sort.order[sourceParentKey]
          ? [...sort.order[sourceParentKey]]
          : buildOrderList(await readSortedAllowedEntries(sourceParentPath, sort));
        sort.order[sourceParentKey] = sourceOrder.filter((name) => name !== sourceName);
        if (sort.order[sourceParentKey].length === 0) {
          delete sort.order[sourceParentKey];
        }

        targetOrder = targetOrder.filter((name) => name !== sourceName);
      } else {
        targetOrder = targetOrder.filter((name) => name !== sourceName);
      }

      let targetIndex = targetOrder.indexOf(targetName);
      if (targetIndex === -1) targetIndex = targetOrder.length;
      if (position === "after") targetIndex += 1;
      targetOrder.splice(targetIndex, 0, sourceName);
      sort.order[targetParentKey] = targetOrder;

      set({ sort });
      await writeVaultSort(vaultPath, sort);

      if (sourceParentPath !== targetParentPath) {
        const closeTab = useEditorStore.getState().closeTab;
        closeTab(sourcePath);
      }

      await get().refreshTree(vaultPath);
    } catch (e) {
      console.error("Failed to move entry to position:", e);
    }
  },

  reorderEntry: async (parentPath: string, entryName: string, newIndex: number) => {
    // Reordering within one folder only updates sort metadata, not the filesystem.
    const vaultPath = useVaultStore.getState().vaultPath;
    if (!vaultPath) return;

    const parentKey = pathToKey(vaultPath, parentPath);
    const sort = get().sort;
    if (!sort.order[parentKey]) {
      const entries = parentPath === vaultPath
        ? get().nodes
        : await readSortedAllowedEntries(parentPath, sort);
      sort.order[parentKey] = buildOrderList(entries);
    }

    const orderList = sort.order[parentKey];
    const currentIndex = orderList.indexOf(entryName);
    if (currentIndex === -1) {
      orderList.splice(newIndex, 0, entryName);
    } else {
      orderList.splice(currentIndex, 1);
      orderList.splice(newIndex, 0, entryName);
    }

    sort.order[parentKey] = orderList;
    set({ sort: { ...sort } });
    await writeVaultSort(vaultPath, sort);

    await get().refreshTree(vaultPath);
  },

  setSearchQuery: (query: string) => set({ searchQuery: query }),

  searchFiles: async (rootPath: string, query: string) => {
    if (!query.trim()) {
      set({ searchResults: [], searchQuery: "", loading: false });
      return;
    }
    const requestQuery = query;
    set({ searchQuery: query, loading: true });
    try {
      const results = await searchRecursive(rootPath, requestQuery);
      if (get().searchQuery === requestQuery) {
        set({ searchResults: results, loading: false });
      }
    } catch (e) {
      console.error("Search failed:", e);
      if (get().searchQuery === requestQuery) {
        set({ searchResults: [], loading: false });
      }
    }
  },

  clearSearch: () => set({ searchQuery: "", searchResults: [], loading: false }),
}));
