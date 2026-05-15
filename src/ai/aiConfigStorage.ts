import { createFolder, pathJoin, readFile, writeFile } from "@/lib/tauriCommands";
import { getVaultConfigDir, getVaultConfigPath, THINKINGKITY_DIR } from "@/lib/vaultConfig";
import { normalizeAiConfig, type AiConfig } from "./config";

const AI_CONFIG_FILE = "ai-config.json";

export function getAiConfigPath(vaultPath: string): string {
  return pathJoin(vaultPath, THINKINGKITY_DIR, AI_CONFIG_FILE);
}

async function readLegacyAiConfig(vaultPath: string): Promise<unknown> {
  try {
    const raw = JSON.parse(await readFile(getVaultConfigPath(vaultPath)));
    return raw && typeof raw === "object" ? (raw as Record<string, unknown>).ai : undefined;
  } catch {
    return undefined;
  }
}

export async function writeAiConfig(vaultPath: string, config: AiConfig): Promise<void> {
  await createFolder(getVaultConfigDir(vaultPath));
  await writeFile(getAiConfigPath(vaultPath), JSON.stringify(config, null, 2));
}

export async function ensureAiConfig(vaultPath: string, defaults: AiConfig): Promise<AiConfig> {
  await createFolder(getVaultConfigDir(vaultPath));

  let config = defaults;
  let shouldWrite = true;

  try {
    const raw = await readFile(getAiConfigPath(vaultPath));
    config = normalizeAiConfig(JSON.parse(raw), defaults);
    shouldWrite = raw !== JSON.stringify(config, null, 2);
  } catch {
    const legacyAi = await readLegacyAiConfig(vaultPath);
    config = normalizeAiConfig(legacyAi, defaults);
  }

  if (shouldWrite) {
    await writeAiConfig(vaultPath, config);
  }

  return config;
}
