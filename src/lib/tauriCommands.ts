import { invoke, convertFileSrc } from "@tauri-apps/api/core";
import type { FileEntry } from "@/types";
import { authHeaders, clearAuthTokens } from "@/lib/authSession";

const IS_TAURI = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
// Relative paths work in both dev (Vite proxies /api) and production (same origin).
const SERVER_BASE = IS_TAURI ? "" : "";

async function apiGet(path: string): Promise<Response> {
  const res = await fetch(`${SERVER_BASE}${path}`, { headers: authHeaders() });
  if (!res.ok) {
    if (res.status === 401) {
      clearAuthTokens();
      window.dispatchEvent(new CustomEvent("thinkingkity-auth-logout"));
    }
    const body = await res.text();
    let msg = body;
    try { msg = JSON.parse(body).error || body; } catch { /* use raw text */ }
    throw new Error(msg);
  }
  return res;
}

async function apiPost(path: string, body: Record<string, unknown>): Promise<Response> {
  const res = await fetch(`${SERVER_BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    if (res.status === 401) {
      clearAuthTokens();
      window.dispatchEvent(new CustomEvent("thinkingkity-auth-logout"));
    }
    const text = await res.text();
    let msg = text;
    try { msg = JSON.parse(text).error || text; } catch { /* use raw text */ }
    throw new Error(msg);
  }
  return res;
}

async function apiDelete(path: string): Promise<Response> {
  const res = await fetch(`${SERVER_BASE}${path}`, { method: "DELETE", headers: authHeaders() });
  if (!res.ok) {
    if (res.status === 401) {
      clearAuthTokens();
      window.dispatchEvent(new CustomEvent("thinkingkity-auth-logout"));
    }
    const text = await res.text();
    let msg = text;
    try { msg = JSON.parse(text).error || text; } catch { /* use raw text */ }
    throw new Error(msg);
  }
  return res;
}

export async function readDirectory(path: string): Promise<FileEntry[]> {
  if (IS_TAURI) {
    return invoke<FileEntry[]>("read_directory", { path });
  }
  const res = await apiGet(`/api/read-directory?path=${encodeURIComponent(path)}`);
  return res.json();
}

export async function readFile(path: string): Promise<string> {
  if (IS_TAURI) {
    return invoke("read_file", { path });
  }
  const res = await apiGet(`/api/read-file?path=${encodeURIComponent(path)}`);
  return res.text();
}

export async function readFileBase64(path: string): Promise<string> {
  if (IS_TAURI) {
    return invoke<string>("read_file_base64", { path });
  }
  const res = await apiGet(`/api/read-file-base64?path=${encodeURIComponent(path)}`);
  return res.text();
}

export async function readFileBytes(path: string): Promise<Uint8Array> {
  const dataUrl = await readFileBase64(path);
  const marker = ";base64,";
  const index = dataUrl.indexOf(marker);
  if (index === -1) return new Uint8Array();
  const binary = atob(dataUrl.slice(index + marker.length));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

export async function writeFile(path: string, content: string): Promise<void> {
  if (IS_TAURI) {
    return invoke("write_file", { path, content });
  }
  await apiPost("/api/write-file", { path, content });
}

export async function writeFileBase64(path: string, content: string): Promise<void> {
  if (IS_TAURI) {
    return invoke("write_file_base64", { path, content });
  }
  await apiPost("/api/write-file-base64", { path, content });
}

export async function writeVaultMarkdownFile(
  vaultPath: string,
  relativePath: string,
  content: string,
): Promise<string> {
  if (IS_TAURI) {
    return invoke<string>("write_vault_markdown_file", { vaultPath, relativePath, content });
  }
  const res = await apiPost("/api/write-vault-markdown", { vaultPath, relativePath, content });
  return res.text();
}

export async function createFile(path: string): Promise<void> {
  if (IS_TAURI) {
    return invoke("create_file", { path });
  }
  await apiPost("/api/create-file", { path });
}

export async function getVaultSize(path: string): Promise<number> {
  if (IS_TAURI) {
    return invoke<number>("get_vault_size", { path });
  }
  const res = await apiGet(`/api/get-vault-size?path=${encodeURIComponent(path)}`);
  const text = await res.text();
  return Number(text);
}

export async function createFolder(path: string): Promise<void> {
  if (IS_TAURI) {
    return invoke("create_folder", { path });
  }
  await apiPost("/api/create-folder", { path });
}

export async function copyFile(
  sourcePath: string,
  destinationPath: string,
): Promise<void> {
  if (IS_TAURI) {
    return invoke("copy_file", { sourcePath, destinationPath });
  }
  await apiPost("/api/copy-file", { sourcePath, destinationPath });
}

export async function renameFile(
  oldPath: string,
  newPath: string,
): Promise<void> {
  if (IS_TAURI) {
    return invoke("rename_file", { oldPath, newPath });
  }
  await apiPost("/api/rename-file", { oldPath, newPath });
}

export async function deleteFile(path: string): Promise<void> {
  if (IS_TAURI) {
    return invoke("delete_file", { path });
  }
  await apiDelete(`/api/delete-file?path=${encodeURIComponent(path)}`);
}

export interface SnapshotEntry {
  id: string;
  filePath: string;
  snapshotPath: string;
  createdAt: string;
  size: number;
  reason: string;
  contentHash: string;
}

export interface TrashEntry {
  id: string;
  originalPath: string;
  trashPath: string;
  deletedAt: string;
  size: number;
  isDirectory: boolean;
}

export async function createSnapshot(
  vaultPath: string,
  filePath: string,
  reason = "manual-save",
): Promise<SnapshotEntry | null> {
  if (IS_TAURI) {
    return invoke<SnapshotEntry | null>("create_snapshot", { vaultPath, filePath, reason });
  }
  const res = await apiPost("/api/create-snapshot", { vaultPath, filePath, reason });
  return res.json();
}

export async function listSnapshots(
  vaultPath: string,
  filePath?: string,
): Promise<SnapshotEntry[]> {
  if (IS_TAURI) {
    return invoke<SnapshotEntry[]>("list_snapshots", { vaultPath, filePath: filePath ?? null });
  }
  const params = [`vaultPath=${encodeURIComponent(vaultPath)}`];
  if (filePath) params.push(`filePath=${encodeURIComponent(filePath)}`);
  const res = await apiGet(`/api/list-snapshots?${params.join("&")}`);
  return res.json();
}

export async function readSnapshot(vaultPath: string, snapshotId: string): Promise<string> {
  if (IS_TAURI) {
    return invoke<string>("read_snapshot", { vaultPath, snapshotId });
  }
  const res = await apiGet(
    `/api/read-snapshot?vaultPath=${encodeURIComponent(vaultPath)}&snapshotId=${encodeURIComponent(snapshotId)}`,
  );
  return res.text();
}

export async function restoreSnapshot(vaultPath: string, snapshotId: string): Promise<string> {
  if (IS_TAURI) {
    return invoke<string>("restore_snapshot", { vaultPath, snapshotId });
  }
  const res = await apiPost("/api/restore-snapshot", { vaultPath, snapshotId });
  return res.text();
}

export async function moveToTrash(vaultPath: string, path: string): Promise<TrashEntry> {
  if (IS_TAURI) {
    return invoke<TrashEntry>("move_to_trash", { vaultPath, path });
  }
  const res = await apiPost("/api/move-to-trash", { vaultPath, path });
  return res.json();
}

export async function listTrash(vaultPath: string): Promise<TrashEntry[]> {
  if (IS_TAURI) {
    return invoke<TrashEntry[]>("list_trash", { vaultPath });
  }
  const res = await apiGet(`/api/list-trash?vaultPath=${encodeURIComponent(vaultPath)}`);
  return res.json();
}

export async function restoreTrash(
  vaultPath: string,
  trashId: string,
  targetPath?: string,
): Promise<string> {
  if (IS_TAURI) {
    return invoke<string>("restore_trash", { vaultPath, trashId, targetPath: targetPath ?? null });
  }
  const res = await apiPost("/api/restore-trash", { vaultPath, trashId, targetPath: targetPath ?? null });
  return res.text();
}

export async function deleteTrashEntry(vaultPath: string, trashId: string): Promise<void> {
  if (IS_TAURI) {
    return invoke("delete_trash_entry", { vaultPath, trashId });
  }
  await apiPost("/api/delete-trash-entry", { vaultPath, trashId });
}

export function getAssetUrl(filePath: string): string {
  if (!IS_TAURI) return filePath;
  return convertFileSrc(filePath);
}

export function isTauri(): boolean {
  return IS_TAURI;
}

export function pathBasename(path: string): string {
  const lastSep = Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\"));
  return lastSep >= 0 ? path.slice(lastSep + 1) : path;
}

export function pathParentDir(path: string): string {
  const lastSep = Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\"));
  return lastSep > 0 ? path.slice(0, lastSep) : path;
}

export function pathJoin(...segments: string[]): string {
  if (segments.length === 0) return "";
  const base = segments[0];
  const sep = base.includes("\\") && !base.includes("/") ? "\\" : "/";
  const parts = [base.replace(/[/\\]+$/, "")];
  for (let i = 1; i < segments.length; i++) {
    parts.push(segments[i].replace(/^[/\\]+|[/\\]+$/g, ""));
  }
  return parts.join(sep);
}

export async function revealInExplorer(path: string): Promise<void> {
  if (!IS_TAURI) return;
  const { revealItemInDir } = await import("@tauri-apps/plugin-opener");
  await revealItemInDir(path);
}

const IMAGE_EXTENSIONS = [".jpg", ".jpeg", ".png", ".gif", ".svg", ".webp", ".ico"];

export function isImageFile(path: string): boolean {
  const lower = path.toLowerCase();
  return IMAGE_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

export function isPdfFile(path: string): boolean {
  return path.toLowerCase().endsWith(".pdf");
}

export function isJsonFile(path: string): boolean {
  return path.toLowerCase().endsWith(".json");
}

export function isMarkdownFile(path: string): boolean {
  const lower = path.toLowerCase();
  return lower.endsWith(".md") || lower.endsWith(".markdown");
}

export function isMermaidFile(path: string): boolean {
  return path.toLowerCase().endsWith(".mermaid");
}

export function isTextFile(path: string): boolean {
  return path.toLowerCase().endsWith(".txt");
}

const CODE_EXTENSIONS: Record<string, string> = {
  ".js": "javascript",
  ".jsx": "javascript",
  ".ts": "typescript",
  ".tsx": "typescript",
  ".py": "python",
  ".java": "java",
  ".rs": "rust",
  ".c": "c",
  ".cpp": "cpp",
  ".h": "c",
  ".hpp": "cpp",
  ".cs": "csharp",
  ".go": "go",
  ".rb": "ruby",
  ".sql": "sql",
  ".sh": "shell",
  ".bash": "shell",
  ".zsh": "shell",
  ".css": "css",
  ".scss": "scss",
  ".sass": "sass",
  ".less": "less",
  ".html": "html",
  ".xml": "xml",
  ".yaml": "yaml",
  ".yml": "yaml",
  ".toml": "toml",
  ".ini": "ini",
  ".cfg": "ini",
  ".conf": "ini",
  ".r": "r",
  ".lua": "lua",
  ".groovy": "groovy",
  ".vue": "vue",
  ".md": "markdown",
  ".log": "text",
  ".env": "text",
  ".properties": "properties",
  ".mermaid": "mermaid",
  ".csv": "csv",
  ".json": "json",
  ".txt": "text",
};

export function isCodeFile(path: string): boolean {
  const lower = path.toLowerCase();
  if (isMarkdownFile(path)) return false;
  if (isMermaidFile(path)) return false;
  if (lower.endsWith(".csv")) return false;
  if (lower.endsWith(".json")) return false;
  if (lower.endsWith(".txt")) return false;
  if (isImageFile(path)) return false;
  if (isPdfFile(path)) return false;
  for (const ext of Object.keys(CODE_EXTENSIONS)) {
    if (lower.endsWith(ext)) return true;
  }
  const lastDot = lower.lastIndexOf(".");
  if (lastDot > 0) {
    const ext = lower.slice(lastDot);
    if (ext.length > 1 && ext.length <= 6) return true;
  }
  return false;
}

export function getCodeLanguage(path: string): string {
  const lower = path.toLowerCase();
  const basename = lower.split("/").pop()?.split("\\").pop() ?? lower;
  if (basename === "dockerfile") return "dockerfile";
  for (const [ext, lang] of Object.entries(CODE_EXTENSIONS)) {
    if (lower.endsWith(ext)) return lang;
  }
  return "text";
}

// ── Sync commands ──────────────────────────────────────────────

export interface SyncResult {
  success: boolean;
  message: string;
  files_changed: number;
  errors: string[];
}

export async function syncGitInit(
  vaultPath: string,
  remoteUrl: string,
  branch: string,
): Promise<SyncResult> {
  if (IS_TAURI) {
    return invoke<SyncResult>("sync_git_init", { vaultPath, remoteUrl, branch });
  }
  return { success: false, message: "Not available in browser mode.", files_changed: 0, errors: [] };
}

export async function syncGitSync(
  vaultPath: string,
  remoteUrl: string,
  branch: string,
): Promise<SyncResult> {
  if (IS_TAURI) {
    return invoke<SyncResult>("sync_git_sync", { vaultPath, remoteUrl, branch });
  }
  return { success: false, message: "Not available in browser mode.", files_changed: 0, errors: [] };
}

// ── Vault listing (web mode) ──────────────────────────────────

export async function listVaults(): Promise<{ name: string; path: string }[]> {
  if (IS_TAURI) {
    return invoke<{ name: string; path: string }[]>("list_vaults");
  }
  const res = await apiGet("/api/list-vaults");
  return res.json();
}

export async function ensureAllowedPath(path: string): Promise<void> {
  if (IS_TAURI) {
    return invoke("ensure_allowed_path_cmd", { path });
  }
  await apiPost("/api/ensure-allowed-path", { path });
}

export async function ensureDemoVault(): Promise<string | null> {
  if (IS_TAURI) {
    return invoke<string>("ensure_demo_vault");
  }
  const res = await apiGet("/api/ensure-demo-vault");
  return res.text();
}
