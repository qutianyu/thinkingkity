import { create } from "zustand";
import type { Tab } from "@/types";
import {
  readFile,
  writeFile,
  getAssetUrl,
  readFileBase64,
  isImageFile,
  isPdfFile,
} from "@/lib/tauriCommands";

interface EditorState {
  tabs: Tab[];
  activeTabPath: string | null;
  fileContents: Map<string, string>;
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
        content = getAssetUrl(path);
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
    const { tabs, activeTabPath, fileContents } = get();
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
    newMap.delete(path);
    set({ tabs: newTabs, activeTabPath: nextActive, fileContents: newMap });
  },

  closeOthers: (path: string) => {
    const { tabs, fileContents } = get();
    const keepTab = tabs.find((t) => t.path === path);
    if (!keepTab) return;
    // Clean up fileContents for removed tabs
    const newMap = new Map(fileContents);
    for (const tab of tabs) {
      if (tab.path !== path) {
        newMap.delete(tab.path);
      }
    }
    set({
      tabs: [keepTab],
      activeTabPath: path,
      fileContents: newMap,
    });
  },

  closeAll: () => {
    set({
      tabs: [],
      activeTabPath: null,
      fileContents: new Map(),
    });
  },

  setActiveTab: (path: string) => set({ activeTabPath: path }),

  updateContent: (path: string, content: string) => {
    // Dirty tracking is path-scoped because multiple tabs can be open at once.
    if (isImageFile(path) || isPdfFile(path)) return;
    const { fileContents, tabs } = get();
    const newMap = new Map(fileContents);
    newMap.set(path, content);
    const newTabs = tabs.map((t) =>
      t.path === path ? { ...t, isDirty: true } : t,
    );
    set({ fileContents: newMap, tabs: newTabs });
  },

  saveFile: async (path: string) => {
    // Save uses the latest in-memory content, not the content captured when called.
    if (isImageFile(path) || isPdfFile(path)) return;
    const { fileContents, tabs } = get();
    const content = fileContents.get(path) ?? "";
    try {
      await writeFile(path, content);
      const newTabs = tabs.map((t) =>
        t.path === path ? { ...t, isDirty: false } : t,
      );
      set({ tabs: newTabs });
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
