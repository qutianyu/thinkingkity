import { create } from "zustand";
import type { Tab } from "@/types";
import {
  readFile,
  writeFile,
  readFileBase64,
  isImageFile,
  isPdfFile,
  createSnapshot,
} from "@/lib/tauriCommands";
import { useVaultStore } from "@/stores/vaultStore";

interface EditorState {
  tabs: Tab[];
  activeTabPath: string | null;
  fileContents: Map<string, string>;
  lastEditedAt: Map<string, number>;
  openFile: (path: string) => Promise<void>;
  closeTab: (path: string) => void;
  closeOthers: (path: string) => void;
  closeAll: () => void;
  setActiveTab: (path: string) => void;
  updateContent: (path: string, content: string) => void;
  saveFile: (path: string) => Promise<void>;
  getContent: (path: string) => string;
  isTabDirty: (path: string) => boolean;
  hasDirtyTabs: () => boolean;
}

function getTitle(path: string): string {
  const parts = path.replace(/[/\\]$/, "").split(/[/\\]/);
  return parts[parts.length - 1] || "Untitled";
}

export const useEditorStore = create<EditorState>((set, get) => ({
  tabs: [],
  activeTabPath: null,
  fileContents: new Map(),
  lastEditedAt: new Map(),

  openFile: async (path: string) => {
    // Opening an already-loaded tab should not re-read from disk or lose dirty state.
    const { tabs, fileContents } = get();
    const existing = tabs.find((t) => t.path === path);
    if (existing) {
      set({ activeTabPath: path });
      return;
    }
    try {
      let content: string;
      if (isImageFile(path)) {
        content = await readFileBase64(path);
      } else if (isPdfFile(path)) {
        content = await readFileBase64(path);
      } else {
        content = await readFile(path);
      }
      const newMap = new Map(fileContents);
      newMap.set(path, content);
      set({
        tabs: [...tabs, { path, title: getTitle(path), isDirty: false }],
        activeTabPath: path,
        fileContents: newMap,
      });
    } catch (e) {
      console.error("Failed to open file:", e);
    }
  },

  closeTab: (path: string) => {
    const { tabs, activeTabPath, fileContents, lastEditedAt } = get();
    const idx = tabs.findIndex((t) => t.path === path);
    if (idx === -1) return;
    const newTabs = tabs.filter((t) => t.path !== path);
    let nextActive = activeTabPath;
    if (activeTabPath === path) {
      if (newTabs.length === 0) {
        nextActive = null;
      } else {
        const newIdx = Math.min(idx, newTabs.length - 1);
        nextActive = newTabs[newIdx].path;
      }
    }
    const newMap = new Map(fileContents);
    const content = newMap.get(path);
    if (isPdfFile(path) && content?.startsWith("blob:")) {
      URL.revokeObjectURL(content);
    }
    newMap.delete(path);
    const newEditedMap = new Map(lastEditedAt);
    newEditedMap.delete(path);
    set({ tabs: newTabs, activeTabPath: nextActive, fileContents: newMap, lastEditedAt: newEditedMap });
  },

  closeOthers: (path: string) => {
    const { tabs, fileContents, lastEditedAt } = get();
    const keepTab = tabs.find((t) => t.path === path);
    if (!keepTab) return;
    // Clean up fileContents for removed tabs
    const newMap = new Map(fileContents);
    const newEditedMap = new Map(lastEditedAt);
    for (const tab of tabs) {
      if (tab.path !== path) {
        const content = newMap.get(tab.path);
        if (isPdfFile(tab.path) && content?.startsWith("blob:")) {
          URL.revokeObjectURL(content);
        }
        newMap.delete(tab.path);
        newEditedMap.delete(tab.path);
      }
    }
    set({
      tabs: [keepTab],
      activeTabPath: path,
      fileContents: newMap,
      lastEditedAt: newEditedMap,
    });
  },

  closeAll: () => {
    for (const [path, content] of get().fileContents) {
      if (isPdfFile(path) && content.startsWith("blob:")) {
        URL.revokeObjectURL(content);
      }
    }
    set({
      tabs: [],
      activeTabPath: null,
      fileContents: new Map(),
      lastEditedAt: new Map(),
    });
  },

  setActiveTab: (path: string) => set({ activeTabPath: path }),

  updateContent: (path: string, content: string) => {
    // Dirty tracking is path-scoped because multiple tabs can be open at once.
    if (isImageFile(path) || isPdfFile(path)) return;
    const { fileContents, tabs, lastEditedAt } = get();
    const newMap = new Map(fileContents);
    newMap.set(path, content);
    const newEditedMap = new Map(lastEditedAt);
    newEditedMap.set(path, Date.now());
    const newTabs = tabs.map((t) =>
      t.path === path ? { ...t, isDirty: true } : t,
    );
    set({ fileContents: newMap, tabs: newTabs, lastEditedAt: newEditedMap });
  },

  saveFile: async (path: string) => {
    // Save uses the latest in-memory content, not the content captured when called.
    if (isImageFile(path) || isPdfFile(path)) return;
    const { fileContents } = get();
    const content = fileContents.get(path) ?? "";
    try {
      const vaultPath = useVaultStore.getState().vaultPath;
      if (vaultPath) {
        try {
          await createSnapshot(vaultPath, path, "manual-save");
        } catch (snapshotError) {
          console.warn("Failed to create recovery snapshot:", snapshotError);
        }
      }
      await writeFile(path, content);
      set((state) => {
        if ((state.fileContents.get(path) ?? "") !== content) {
          return state;
        }
        const newEditedMap = new Map(state.lastEditedAt);
        newEditedMap.delete(path);
        return {
          tabs: state.tabs.map((t) =>
            t.path === path ? { ...t, isDirty: false } : t,
          ),
          lastEditedAt: newEditedMap,
        };
      });
    } catch (e) {
      console.error("Failed to save file:", e);
    }
  },

  getContent: (path: string) => {
    return get().fileContents.get(path) ?? "";
  },

  isTabDirty: (path: string) => {
    return get().tabs.find((t) => t.path === path)?.isDirty ?? false;
  },

  hasDirtyTabs: () => {
    return get().tabs.some((t) => t.isDirty);
  },
}));
