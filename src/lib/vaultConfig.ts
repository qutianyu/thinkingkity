import type { FileEntry } from "@/types";
import { createFolder, readFile, writeFile, pathJoin } from "@/lib/tauriCommands";
import { normalizeAiConfig, type AiConfig } from "@/ai";
import { ensureVaultToolFiles } from "@/ai/tools/toolPolicy";

export const THINKINGKITY_DIR = ".thinkingkity";
const CONFIG_FILE = "config.json";

export type VaultMode = "system" | "dark" | "light";

export const ALL_DISPLAY_TYPES = [
  "md", "markdown", "csv", "json", "yaml", "yml", "toml", "ini", "cfg", "conf", "env", "properties", "mermaid", "txt", "log", "gitignore", "dockerignore",
  "jpg", "jpeg", "png", "gif", "svg", "webp", "bmp", "ico",
  "pdf",
  "java", "py", "ts", "tsx", "js", "jsx", "c", "h", "cpp", "hpp", "cs", "go", "rs", "rb", "php", "swift", "kt", "dart", "css", "scss", "less", "html", "htm", "xml", "sql", "sh", "bash", "zsh", "r", "lua", "vim", "zig", "hs", "ml", "scala", "clj", "ex", "exs", "erl", "v", "sv", "vhd",
];

export interface VaultConfig {
  language: string;
  mode: VaultMode;
  display_type: string[];
  ai: AiConfig;
}

export function getVaultConfigDir(vaultPath: string): string {
  return pathJoin(vaultPath, THINKINGKITY_DIR);
}

export function getVaultConfigPath(vaultPath: string): string {
  return pathJoin(vaultPath, THINKINGKITY_DIR, CONFIG_FILE);
}

export function isVaultSystemEntry(entry: FileEntry): boolean {
  return entry.name === THINKINGKITY_DIR;
}

function normalizeMode(mode: unknown, fallback: VaultMode): VaultMode {
  return mode === "system" || mode === "dark" || mode === "light" ? mode : fallback;
}

function normalizeDisplayType(raw: unknown, fallback: string[]): string[] {
  // Drop invalid values so hand-edited configs cannot enable unsupported filters.
  if (!Array.isArray(raw)) return fallback;
  const valid = raw.filter((v) => typeof v === "string" && v);
  return valid.length > 0 ? valid : fallback;
}

function normalizeConfig(value: unknown, defaults: VaultConfig): VaultConfig {
  // Vault config is local JSON and can be edited by hand; normalize every field.
  if (!value || typeof value !== "object") return defaults;
  const raw = value as Partial<VaultConfig>;
  return {
    language: typeof raw.language === "string" && raw.language
      ? raw.language
      : defaults.language,
    mode: normalizeMode(raw.mode, defaults.mode),
    display_type: normalizeDisplayType(raw.display_type, defaults.display_type),
    ai: normalizeAiConfig(raw.ai, defaults.ai),
  };
}

export async function writeVaultConfig(
  vaultPath: string,
  config: VaultConfig,
): Promise<void> {
  await createFolder(getVaultConfigDir(vaultPath));
  await writeFile(getVaultConfigPath(vaultPath), JSON.stringify(config, null, 2));
}

export async function ensureVaultConfig(
  vaultPath: string,
  defaults: VaultConfig,
): Promise<VaultConfig> {
  await createFolder(getVaultConfigDir(vaultPath));

  let config = defaults;
  let shouldWrite = true;

  try {
    const raw = await readFile(getVaultConfigPath(vaultPath));
    config = normalizeConfig(JSON.parse(raw), defaults);
    shouldWrite = raw !== JSON.stringify(config, null, 2);
  } catch {
    // First open or corrupt config: continue with defaults and rewrite a valid file.
    config = defaults;
  }

  if (shouldWrite) {
    await writeVaultConfig(vaultPath, config);
  }
  await ensureVaultToolFiles(vaultPath);

  return config;
}
