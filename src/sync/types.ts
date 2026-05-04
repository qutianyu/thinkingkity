export type SyncMethod = "none" | "webdav" | "git";
export type SyncDirection = "push" | "pull";

export interface WebDAVConfig {
  url: string;
  username: string;
  password: string;
}

export interface GitConfig {
  remoteUrl: string;
  branch: string;
}

export interface SyncConfig {
  method: SyncMethod;
  direction: SyncDirection;
  webdav: WebDAVConfig;
  git: GitConfig;
}

export const DEFAULT_SYNC_CONFIG: SyncConfig = {
  method: "none",
  direction: "push",
  webdav: { url: "", username: "", password: "" },
  git: { remoteUrl: "", branch: "main" },
};

export type SyncStatus = "idle" | "syncing" | "success" | "error";
