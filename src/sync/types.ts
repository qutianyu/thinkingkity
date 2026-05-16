export type SyncMethod = "none" | "github";
export type SyncDirection = "push" | "pull";

export interface GitConfig {
  remoteUrl: string;
  branch: string;
}

export interface SyncConfig {
  method: SyncMethod;
  direction: SyncDirection;
  git: GitConfig;
}

export const DEFAULT_SYNC_CONFIG: SyncConfig = {
  method: "none",
  direction: "push",
  git: { remoteUrl: "", branch: "main" },
};

export type SyncStatus = "idle" | "syncing" | "success" | "error";
