import { create } from "zustand";
import { DEFAULT_SYNC_CONFIG, type SyncConfig, type SyncMethod, type SyncDirection, type GitConfig, type SyncStatus } from "./types";

interface SyncState {
  config: SyncConfig;
  status: SyncStatus;
  statusMessage: string;
  setConfig: (config: SyncConfig) => void;
  setMethod: (method: SyncMethod) => void;
  setDirection: (direction: SyncDirection) => void;
  updateGitConfig: (partial: Partial<GitConfig>) => void;
  setStatus: (status: SyncStatus, message?: string) => void;

  toast: { visible: boolean; kind: "loading" | "success" | "error"; message: string };
  showToast: (kind: "loading" | "success" | "error", message: string) => void;
  dismissToast: () => void;
}

export const useSyncStore = create<SyncState>((set) => ({
  config: { ...DEFAULT_SYNC_CONFIG },
  status: "idle",
  statusMessage: "",

  toast: { visible: false, kind: "success", message: "" },

  setConfig: (config) => set({ config }),

  setMethod: (method) =>
    set((state) => ({ config: { ...state.config, method } })),

  setDirection: (direction) =>
    set((state) => ({ config: { ...state.config, direction } })),

  updateGitConfig: (partial) =>
    set((state) => ({
      config: {
        ...state.config,
        git: { ...state.config.git, ...partial },
      },
    })),

  setStatus: (status, message = "") =>
    set({ status, statusMessage: message }),

  showToast: (kind, message) =>
    set({ toast: { visible: true, kind, message } }),

  dismissToast: () =>
    set({ toast: { visible: false, kind: "success", message: "" } }),
}));
