import { create } from "zustand";
import { loadGlobalVaults, saveGlobalVaults } from "@/lib/globalVaults";

interface VaultState {
  vaultPath: string | null;
  vaultName: string;
  recentVaults: string[];
  displayType: string[];
  setVault: (path: string) => void;
  loadRecentVaults: () => Promise<void>;
  setDisplayType: (types: string[]) => void;
  removeRecentVault: (path: string) => void;
  clearVault: () => void;
}

function getVaultName(path: string): string {
  const parts = path.replace(/[/\\]$/, "").split(/[/\\]/);
  return parts[parts.length - 1] || path;
}

export const useVaultStore = create<VaultState>((set) => ({
  vaultPath: null,
  vaultName: "",
  recentVaults: [],
  displayType: [],
  setVault: (path: string) =>
    set((state) => {
      const recent = [
        path,
        ...state.recentVaults.filter((p) => p !== path),
      ].slice(0, 5);
      saveGlobalVaults(recent);
      return {
        vaultPath: path,
        vaultName: getVaultName(path),
        recentVaults: recent,
      };
    }),
  loadRecentVaults: async () => {
    const recentVaults = await loadGlobalVaults();
    set({ recentVaults });
  },
  setDisplayType: (types: string[]) => set({ displayType: types }),
  removeRecentVault: (path: string) =>
    set((state) => {
      const recent = state.recentVaults.filter((p) => p !== path);
      saveGlobalVaults(recent);
      return { recentVaults: recent };
    }),
  clearVault: () => set({ vaultPath: null, vaultName: "", displayType: [] }),
}));
