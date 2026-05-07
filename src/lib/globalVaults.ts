import { isTauri, ensureDemoVault as ensureDemoVaultApi } from "./tauriCommands";
import { authHeaders, clearAuthTokens, getAuthToken } from "./authSession";

export interface LoginStatus {
  enabled: boolean;
  username?: string | null;
}

interface LoginResult {
  ok: boolean;
  token?: string | null;
}

export async function loadGlobalVaults(): Promise<string[]> {
  if (isTauri()) {
    const { invoke } = await import("@tauri-apps/api/core");
    try {
      return await invoke<string[]>("read_global_vaults");
    } catch { /* fall through */ }
  } else {
    try {
      const res = await fetch("/api/read-global-vaults", { headers: authHeaders() });
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
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({ vaults }),
      });
    } catch { /* server not running */ }
  }
}

export async function ensureDemoVault(): Promise<string | null> {
  return ensureDemoVaultApi();
}

export async function readLoginStatus(): Promise<LoginStatus> {
  if (isTauri()) {
    const { invoke } = await import("@tauri-apps/api/core");
    try {
      return await invoke<LoginStatus>("read_login_status");
    } catch { /* fall through */ }
  } else {
    try {
      const res = await fetch("/api/read-login-status");
      if (res.ok) return await res.json();
    } catch { /* server not running */ }
  }
  return { enabled: false };
}

export async function verifyLogin(username: string, password: string): Promise<LoginResult> {
  if (isTauri()) {
    const { invoke } = await import("@tauri-apps/api/core");
    try {
      return await invoke<LoginResult>("verify_login", { username, password });
    } catch { /* fall through */ }
  } else {
    try {
      const res = await fetch("/api/verify-login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      if (res.ok) {
        return await res.json();
      }
    } catch { /* server not running */ }
  }
  return { ok: false };
}

export async function logout(): Promise<void> {
  const token = getAuthToken();
  try {
    if (isTauri()) {
      const { invoke } = await import("@tauri-apps/api/core");
      if (token) await invoke("logout", { token });
    } else if (token) {
      await fetch("/api/logout", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({}),
      });
    }
  } catch {
    // Local token cleanup is still the important client-side outcome.
  } finally {
    clearAuthTokens();
    window.dispatchEvent(new CustomEvent("thinkingkity-auth-logout"));
  }
}
