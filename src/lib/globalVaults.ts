import { invoke } from "@tauri-apps/api/core";
import { isTauri } from "./tauriCommands";

const LOCAL_STORAGE_KEY = "thinkingkity.recentVaults";

export async function loadGlobalVaults(): Promise<string[]> {
  if (isTauri()) {
    try {
      return await invoke<string[]>("read_global_vaults");
    } catch {
      // Fall back to localStorage if the new backend command fails.
    }
  }
  try {
    const stored = localStorage.getItem(LOCAL_STORAGE_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
}

export async function saveGlobalVaults(vaults: string[]): Promise<void> {
  if (isTauri()) {
    try {
      await invoke("write_global_vaults", { vaults });
      return;
    } catch {
      // Fall through to localStorage.
    }
  }
  try {
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(vaults));
  } catch { /* ignore */ }
}

export async function ensureDemoVault(): Promise<string | null> {
  if (isTauri()) {
    try {
      return await invoke<string>("ensure_demo_vault");
    } catch {
      return null;
    }
  }
  // Browser mode: add /demo-vault to localStorage recent vaults so it
  // appears on the home page automatically.
  const DEMO = "/demo-vault";
  const LEGACY_DEMO = "/test-vault";
  try {
    const stored = localStorage.getItem(LOCAL_STORAGE_KEY);
    const vaults: string[] = stored ? JSON.parse(stored) : [];
    const recent = [DEMO, ...vaults.filter((p) => p !== DEMO && p !== LEGACY_DEMO)].slice(0, 5);
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(recent));
  } catch { /* ignore */ }
  return DEMO;
}
