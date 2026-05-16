import { createFolder, pathJoin, readFile, writeFile } from "@/lib/tauriCommands";
import { getVaultConfigDir, THINKINGKITY_DIR } from "@/lib/vaultConfig";

export interface GitCredentials {
  username?: string;
  token?: string;
}

export const DEFAULT_GIT_CREDENTIALS: GitCredentials = {
  username: "",
  token: "",
};

const GITHUB_CONFIG_FILE = "github-config.json";

export function getGitHubConfigPath(vaultPath: string): string {
  return pathJoin(vaultPath, THINKINGKITY_DIR, GITHUB_CONFIG_FILE);
}

function normalizeGitCredentials(raw: unknown): GitCredentials {
  if (!raw || typeof raw !== "object") return { ...DEFAULT_GIT_CREDENTIALS };
  const value = raw as Record<string, unknown>;
  return {
    username:
      typeof value.username === "string"
        ? value.username
        : typeof value.github_username === "string"
          ? value.github_username
          : "",
    token:
      typeof value.token === "string"
        ? value.token
        : typeof value.github_token === "string"
          ? value.github_token
          : "",
  };
}

export async function writeGitConfig(vaultPath: string, config: GitCredentials): Promise<void> {
  await createFolder(getVaultConfigDir(vaultPath));
  await writeFile(getGitHubConfigPath(vaultPath), JSON.stringify(config, null, 2));
}

export async function ensureGitConfig(vaultPath: string): Promise<GitCredentials> {
  await createFolder(getVaultConfigDir(vaultPath));

  let config = DEFAULT_GIT_CREDENTIALS;
  let shouldWrite = true;

  try {
    const raw = await readFile(getGitHubConfigPath(vaultPath));
    config = normalizeGitCredentials(JSON.parse(raw));
    shouldWrite = raw !== JSON.stringify(config, null, 2);
  } catch {
    config = { ...DEFAULT_GIT_CREDENTIALS };
  }

  if (shouldWrite) {
    await writeGitConfig(vaultPath, config);
  }
  return config;
}
