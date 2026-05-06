import { create } from "zustand";
import type { ArticleId, LinkIndex, WikiLink, BacklinkRef } from "./types";
import {
  buildIndex,
  readCache,
  writeCache,
  isCacheValid,
  updateFileInIndex,
  removeFileFromIndex,
  renameFileInIndex,
} from "./linkIndex";
import { useEditorStore } from "@/stores/editorStore";
import { refreshWikiLinkDecorations } from "@/md/WikiLinkPlugin";

interface LinkStoreState {
  index: LinkIndex | null;
  loading: boolean;
  scanning: boolean;

  initIndex: (vaultPath: string) => Promise<void>;
  onFileChanged: (filePath: string) => void;
  onFileDeleted: (filePath: string) => void;
  onFileRenamed: (oldPath: string, newPath: string) => void;
  clearIndex: () => void;

  getBacklinks: (filePath: string) => BacklinkRef[];
  getOutgoing: (filePath: string) => WikiLink[];
  getUnresolved: (filePath: string) => WikiLink[];
}

const DEBOUNCE_MS = 800;
const debounceTimers = new Map<string, ReturnType<typeof setTimeout>>();

export const useLinkStore = create<LinkStoreState>((set, get) => ({
  index: null,
  loading: false,
  scanning: false,

  initIndex: async (vaultPath: string) => {
    set({ loading: true, scanning: false });

    try {
      const cached = await readCache(vaultPath);
      if (cached && (await isCacheValid(cached, vaultPath))) {
        set({ index: cached, loading: false });
        return;
      }
    } catch {
      // Cache read failed, will rebuild
    }

    set({ scanning: true });
    try {
      const index = await buildIndex(vaultPath);
      await writeCache(vaultPath, index);
      set({ index, loading: false, scanning: false });
    } catch (e) {
      console.error("Failed to build link index:", e);
      set({ loading: false, scanning: false });
    }
  },

  onFileChanged: (filePath: string) => {
    const existing = debounceTimers.get(filePath);
    if (existing) clearTimeout(existing);

    const timer = setTimeout(async () => {
      debounceTimers.delete(filePath);

      const { index } = get();
      if (!index) return;

      try {
        const vaultPath = index.vaultPath;
        const content = useEditorStore.getState().fileContents.get(filePath) ?? "";
        if (!content) return;

        const newIndex = await updateFileInIndex(filePath, content, vaultPath, index);
        set({ index: newIndex });
        writeCache(vaultPath, newIndex).catch(() => {});
      } catch (e) {
        console.warn("Failed to update link index for:", filePath, e);
      }
    }, DEBOUNCE_MS);

    debounceTimers.set(filePath, timer);
  },

  onFileDeleted: (filePath: string) => {
    const { index } = get();
    if (!index) return;

    const newIndex = removeFileFromIndex(filePath, index);
    set({ index: newIndex });
    writeCache(newIndex.vaultPath, newIndex).catch(() => {});
  },

  onFileRenamed: (oldPath: string, newPath: string) => {
    const { index } = get();
    if (!index) return;

    const newIndex = renameFileInIndex(oldPath, newPath, index);
    set({ index: newIndex });
    writeCache(newIndex.vaultPath, newIndex).catch(() => {});
  },

  clearIndex: () => {
    set({ index: null, loading: false, scanning: false });
  },

  getBacklinks: (filePath: string) => {
    const { index } = get();
    if (!index) return [];
    return index.files[filePath]?.backlinks ?? [];
  },

  getOutgoing: (filePath: string) => {
    const { index } = get();
    if (!index) return [];
    return index.files[filePath]?.outgoing ?? [];
  },

  getUnresolved: (filePath: string) => {
    const { index } = get();
    if (!index) return [];
    return (index.files[filePath]?.outgoing ?? []).filter(
      (link) => link.status === "unresolved",
    );
  },
}));

// Refresh editor decorations when index changes
useLinkStore.subscribe((state, prev) => {
  if (state.index !== prev.index) {
    refreshWikiLinkDecorations();
  }
});
