import type { FileEntry } from "@/types";
import { createFolder, readFile, writeFile, pathJoin } from "@/lib/tauriCommands";
import { ensureVaultToolFiles } from "@/ai/tools/toolPolicy";
import { DEFAULT_SYNC_CONFIG, type SyncConfig } from "@/sync";
import { normalizeAppFontSizePx } from "@/lib/fontSize";
import { JSON_DISPLAY_TYPES, JSON_EXTENSION, JSONC_EXTENSION } from "@/json";

export const THINKINGKITY_DIR = ".thinkingkity";
const CONFIG_FILE = "config.json";

export type VaultMode = "system" | "dark" | "light";

interface DisplayTypeGroup {
  labelKey: string;
  types: string[];
}

const DISPLAY_TYPE_GROUPS: DisplayTypeGroup[] = [
  {
    labelKey: "settings.displayGroupDocuments",
    types: ["md", "markdown", "tkdoc", "csv", ...JSON_DISPLAY_TYPES, "yaml", "yml", "toml", "ini", "cfg", "conf", "env", "properties", "mermaid", "txt", "log", "pdf"],
  },
  {
    labelKey: "settings.displayGroupImages",
    types: ["jpg", "jpeg", "png", "gif", "svg", "webp", "ico"],
  },
  {
    labelKey: "settings.displayGroupCode",
    types: ["java", "py", "ts", "tsx", "js", "jsx", "c", "h", "cpp", "hpp", "cs", "go", "rs", "rb", "css", "scss", "sass", "less", "html", "htm", "xml", "vue", "sql", "sh", "bash", "zsh", "r", "lua", "groovy"],
  },
];

export const ALL_DISPLAY_TYPES = DISPLAY_TYPE_GROUPS.flatMap((g) => g.types);

export interface VaultConfig {
  language: string;
  mode: VaultMode;
  font_size_px: number;
  display_type: string[];
  sync: SyncConfig;
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
  // `.tkdoc` was added after the original display-type defaults shipped.
  // Existing vaults should gain the new first-party document type on upgrade
  // instead of silently hiding files created by the new editor.
  if (!valid.includes("tkdoc")) {
    valid.push("tkdoc");
  }
  if (valid.includes(JSON_EXTENSION) && !valid.includes(JSONC_EXTENSION)) {
    valid.push(JSONC_EXTENSION);
  }
  return valid.length > 0 ? valid : fallback;
}

function normalizeSyncConfig(
  raw: unknown,
  defaults: SyncConfig,
): SyncConfig {
  if (!raw || typeof raw !== "object") return defaults;
  const s = raw as Partial<SyncConfig>;

  const method: SyncConfig["method"] =
    s.method === "github" || s.method === "none"
      ? s.method
      : s.method === "git"
        ? "github"
      : defaults.method;

  const direction: SyncConfig["direction"] =
    s.direction === "pull" ? "pull" : defaults.direction;

  const gitRaw = s.git as Record<string, unknown> | undefined;
  const git = {
    remoteUrl:
      typeof gitRaw?.remoteUrl === "string"
        ? gitRaw.remoteUrl
        : defaults.git.remoteUrl,
    branch:
      typeof gitRaw?.branch === "string" && gitRaw.branch
        ? gitRaw.branch
        : defaults.git.branch,
  };

  return { method, direction, git };
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
    font_size_px: normalizeAppFontSizePx(raw.font_size_px, defaults.font_size_px),
    display_type: normalizeDisplayType(raw.display_type, defaults.display_type),
    sync: normalizeSyncConfig(raw.sync, defaults.sync),
  };
}

export async function writeVaultConfig(
  vaultPath: string,
  config: VaultConfig,
): Promise<void> {
  await createFolder(getVaultConfigDir(vaultPath));
  await writeFile(getVaultConfigPath(vaultPath), serializeVaultConfig(config));
}

function serializeVaultConfig(config: VaultConfig): string {
  const { ...git } = config.sync.git;
  return JSON.stringify({
    ...config,
    sync: {
      ...config.sync,
      git,
    },
  }, null, 2);
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
    shouldWrite = raw !== serializeVaultConfig(config);
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
