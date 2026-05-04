import { invoke, convertFileSrc } from "@tauri-apps/api/core";
import type { FileEntry } from "@/types";

const IS_TAURI = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

// Fallback: simple in-memory file system for browser-only dev
const fallbackFS: Map<string, string> = new Map();

export function seedFallbackFs(files: Record<string, string>, vaultPath: string): void {
  // Pre-populate the browser fallback filesystem with demo vault content.
  for (const [rawPath, content] of Object.entries(files)) {
    // Strip leading segment (e.g. /demo-vault/...) and remap to the given vaultPath.
    const slashIdx = rawPath.indexOf("/", 1);
    const relative = slashIdx >= 0 ? rawPath.slice(slashIdx) : "";
    if (!relative) continue;
    const targetPath = `${vaultPath}${relative}`;
    fallbackFS.set(targetPath, content);

    // Ensure parent directory entries exist so readDirectory works correctly.
    const parts = targetPath.split("/");
    for (let i = 1; i < parts.length; i++) {
      const dirPath = parts.slice(0, i + 1).join("/");
      if (!fallbackFS.has(dirPath)) {
        fallbackFS.set(dirPath, "");
      }
    }
  }
}

function fallbackReadDir(_path: string): FileEntry[] {
  // Browser-only mode uses an in-memory tree so the UI can run without Tauri.
  const entries: FileEntry[] = [];
  const prefix = _path.endsWith("/") ? _path : _path + "/";
  const seen = new Set<string>();
  for (const key of fallbackFS.keys()) {
    if (key.startsWith(prefix)) {
      const relative = key.slice(prefix.length);
      const slashIdx = relative.indexOf("/");
      const name = slashIdx === -1 ? relative : relative.slice(0, slashIdx);
      if (!seen.has(name)) {
        seen.add(name);
        entries.push({
          name,
          path: prefix + name,
          is_dir: slashIdx !== -1,
        });
      }
    }
  }
  return entries;
}

export async function readDirectory(path: string): Promise<FileEntry[]> {
  if (IS_TAURI) {
    return invoke<FileEntry[]>("read_directory", { path });
  }
  return fallbackReadDir(path);
}

export async function readFile(path: string): Promise<string> {
  if (IS_TAURI) {
    return invoke("read_file", { path });
  }
  return fallbackFS.get(path) ?? "";
}

export async function readFileBase64(path: string): Promise<string> {
  if (IS_TAURI) {
    return invoke<string>("read_file_base64", { path });
  }
  return fallbackFS.get(path) ?? "";
}

export async function writeFile(path: string, content: string): Promise<void> {
  if (IS_TAURI) {
    return invoke("write_file", { path, content });
  }
  fallbackFS.set(path, content);
  // Also create parent folder entries for the browser fallback tree.
  const parts = path.split("/");
  for (let i = 0; i < parts.length - 1; i++) {
    const dirPath = parts.slice(0, i + 1).join("/");
    if (!fallbackFS.has(dirPath)) {
      fallbackFS.set(dirPath, "");
    }
  }
}

export async function writeVaultMarkdownFile(
  vaultPath: string,
  relativePath: string,
  content: string,
): Promise<string> {
  if (IS_TAURI) {
    return invoke<string>("write_vault_markdown_file", {
      vaultPath,
      relativePath,
      content,
    });
  }
  const target = pathJoin(vaultPath, relativePath);
  await writeFile(target, content);
  return target;
}

export async function createFile(path: string): Promise<void> {
  if (IS_TAURI) {
    return invoke("create_file", { path });
  }
  fallbackFS.set(path, "");
}

export async function getVaultSize(path: string): Promise<number> {
  if (IS_TAURI) {
    return invoke<number>("get_vault_size", { path });
  }
  let total = 0;
  for (const [, content] of fallbackFS) {
    total += content.length;
  }
  return total;
}

export async function createFolder(path: string): Promise<void> {
  if (IS_TAURI) {
    return invoke("create_folder", { path });
  }
  fallbackFS.set(path, "");
}

export async function copyFile(
  sourcePath: string,
  destinationPath: string,
): Promise<void> {
  if (IS_TAURI) {
    return invoke("copy_file", { sourcePath, destinationPath });
  }
  const content = fallbackFS.get(sourcePath);
  fallbackFS.set(destinationPath, content ?? "");
}

export async function renameFile(
  oldPath: string,
  newPath: string,
): Promise<void> {
  if (IS_TAURI) {
    return invoke("rename_file", { oldPath, newPath });
  }
  const content = fallbackFS.get(oldPath);
  if (content !== undefined) {
    fallbackFS.delete(oldPath);
    fallbackFS.set(newPath, content);
  }
}

export async function deleteFile(path: string): Promise<void> {
  if (IS_TAURI) {
    return invoke("delete_file", { path });
  }
  // Remove the file and all children
  for (const key of fallbackFS.keys()) {
    if (key === path || key.startsWith(path + "/")) {
      fallbackFS.delete(key);
    }
  }
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
  // Match the path separator style of the first segment to preserve Windows paths.
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
  ".properties": "text",
  ".mermaid": "mermaid",
  ".csv": "csv",
  ".json": "json",
  ".txt": "text",
};

export function isCodeFile(path: string): boolean {
  // Unknown short extensions are treated as code so uncommon languages still open in CodeMirror.
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
