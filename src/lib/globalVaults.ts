import { isTauri, ensureDemoVault as ensureDemoVaultApi } from "./tauriCommands";

export async function loadGlobalVaults(): Promise<string[]> {
  if (isTauri()) {
    const { invoke } = await import("@tauri-apps/api/core");
    try {
      return await invoke<string[]>("read_global_vaults");
    } catch { /* fall through */ }
  } else {
    try {
      const res = await fetch("/api/read-global-vaults");
      if (res.ok) return await res.json();
    } catch { /* server not running */ }
  }
  return [];
}

export async function saveGlobalVaults(vaults: string[]): Promise<void> {
  if (isTauri()) {
    const { invoke } = await import("@tauri-apps/api/core");
    try {
      await invoke("write_global_vaults", { vaults });
      return;
    } catch { /* fall through */ }
  } else {
    try {
      await fetch("/api/write-global-vaults", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ vaults }),
      });
    } catch { /* server not running */ }
  }
}

export async function ensureDemoVault(): Promise<string | null> {
  return ensureDemoVaultApi();
}
