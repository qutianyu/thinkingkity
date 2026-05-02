import { createFolder, pathJoin, readFile, writeFile } from "@/lib/tauriCommands";
import { THINKINGKITY_DIR } from "@/lib/vaultConfig";
import { DEFAULT_AI_TOOLS, getDefaultAiTool, type AiToolDefinition } from "./toolRegistry";

const TOOLS_DIR = "tools";
const REGISTRY_FILE = "registry.json";
const POLICIES_FILE = "policies.json";

export interface AiToolPolicy {
  enabled: boolean;
  requireConfirmation: boolean;
  allowedDomains: string[];
  blockedDomains: string[];
  timeoutMs: number;
  allowOverwrite?: boolean;
  browser?: AiBrowserToolProfile;
}

export interface AiBrowserToolProfile {
  userAgent: string;
  acceptLanguage: string;
  locale: string;
  timezoneId: string;
  viewport: {
    width: number;
    height: number;
  };
  deviceScaleFactor: number;
  colorScheme: "light" | "dark" | "no-preference";
  extraHTTPHeaders: Record<string, string>;
  stealth: {
    disableAutomationControlled: boolean;
    maskWebdriver: boolean;
    mockLanguages: boolean;
    mockPlugins: boolean;
    mockChromeRuntime: boolean;
  };
  interaction: {
    mouseMove: boolean;
    scroll: boolean;
    settleMs: number;
  };
}

export interface AiToolRuntime {
  definition: AiToolDefinition;
  policy: AiToolPolicy;
}

interface RegistryFile {
  version: 1;
  enabled: string[];
}

interface PoliciesFile {
  version: 1;
  policies: Record<string, Partial<AiToolPolicy>>;
}

const DEFAULT_POLICIES: Record<string, AiToolPolicy> = {
  fetch_url: {
    enabled: true,
    requireConfirmation: true,
    allowedDomains: [],
    blockedDomains: ["localhost", "127.0.0.1"],
    timeoutMs: 15000,
  },
  browse_page: {
    enabled: true,
    requireConfirmation: true,
    allowedDomains: [],
    blockedDomains: ["localhost", "127.0.0.1"],
    timeoutMs: 15000,
    browser: {
      userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
      acceptLanguage: "zh-CN,zh;q=0.9,en-US;q=0.8,en;q=0.7",
      locale: "zh-CN",
      timezoneId: "Asia/Shanghai",
      viewport: {
        width: 1440,
        height: 900,
      },
      deviceScaleFactor: 1,
      colorScheme: "light",
      extraHTTPHeaders: {
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
        "Upgrade-Insecure-Requests": "1",
      },
      stealth: {
        disableAutomationControlled: true,
        maskWebdriver: true,
        mockLanguages: true,
        mockPlugins: true,
        mockChromeRuntime: true,
      },
      interaction: {
        mouseMove: true,
        scroll: true,
        settleMs: 300,
      },
    },
  },
  write_markdown_document: {
    enabled: true,
    requireConfirmation: true,
    allowedDomains: [],
    blockedDomains: [],
    timeoutMs: 15000,
    allowOverwrite: false,
  },
};

function clampNumber(value: unknown, fallback: number, min: number, max: number): number {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.min(max, Math.max(min, value))
    : fallback;
}

function normalizeString(value: unknown, fallback: string, maxLength = 512): string {
  return typeof value === "string" && value.trim()
    ? value.trim().slice(0, maxLength)
    : fallback;
}

function normalizeHeaders(value: unknown, fallback: Record<string, string>): Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return fallback;
  const next: Record<string, string> = {};
  for (const [key, rawHeaderValue] of Object.entries(value)) {
    if (!/^[A-Za-z0-9-]+$/.test(key)) continue;
    const lower = key.toLowerCase();
    if (["cookie", "authorization", "proxy-authorization", "host", "connection"].includes(lower)) continue;
    if (typeof rawHeaderValue !== "string") continue;
    next[key] = rawHeaderValue.slice(0, 1024);
  }
  return { ...fallback, ...next };
}

function normalizeBrowserProfile(value: unknown, fallback?: AiBrowserToolProfile): AiBrowserToolProfile | undefined {
  if (!fallback) return undefined;
  if (!value || typeof value !== "object" || Array.isArray(value)) return fallback;
  const raw = value as Partial<AiBrowserToolProfile>;
  const viewport = raw.viewport && typeof raw.viewport === "object"
    ? raw.viewport as { width?: unknown; height?: unknown }
    : {};
  const stealth = raw.stealth && typeof raw.stealth === "object"
    ? raw.stealth as Partial<AiBrowserToolProfile["stealth"]>
    : {};
  const interaction = raw.interaction && typeof raw.interaction === "object"
    ? raw.interaction as Partial<AiBrowserToolProfile["interaction"]>
    : {};
  const colorScheme = raw.colorScheme === "dark" || raw.colorScheme === "light" || raw.colorScheme === "no-preference"
    ? raw.colorScheme
    : fallback.colorScheme;
  return {
    userAgent: normalizeString(raw.userAgent, fallback.userAgent),
    acceptLanguage: normalizeString(raw.acceptLanguage, fallback.acceptLanguage, 256),
    locale: normalizeString(raw.locale, fallback.locale, 64),
    timezoneId: normalizeString(raw.timezoneId, fallback.timezoneId, 128),
    viewport: {
      width: clampNumber(viewport.width, fallback.viewport.width, 320, 3840),
      height: clampNumber(viewport.height, fallback.viewport.height, 320, 2160),
    },
    deviceScaleFactor: clampNumber(raw.deviceScaleFactor, fallback.deviceScaleFactor, 1, 3),
    colorScheme,
    extraHTTPHeaders: normalizeHeaders(raw.extraHTTPHeaders, fallback.extraHTTPHeaders),
    stealth: {
      disableAutomationControlled: stealth.disableAutomationControlled !== false,
      maskWebdriver: stealth.maskWebdriver !== false,
      mockLanguages: stealth.mockLanguages !== false,
      mockPlugins: stealth.mockPlugins !== false,
      mockChromeRuntime: stealth.mockChromeRuntime !== false,
    },
    interaction: {
      mouseMove: interaction.mouseMove !== false,
      scroll: interaction.scroll !== false,
      settleMs: clampNumber(interaction.settleMs, fallback.interaction.settleMs, 0, 3000),
    },
  };
}

function getToolsDir(vaultPath: string): string {
  return pathJoin(vaultPath, THINKINGKITY_DIR, TOOLS_DIR);
}

function normalizeRegistry(value: unknown): RegistryFile {
  if (!value || typeof value !== "object") {
    return { version: 1, enabled: DEFAULT_AI_TOOLS.map((tool) => tool.name) };
  }
  const raw = value as Partial<RegistryFile>;
  const enabled = Array.isArray(raw.enabled)
    ? raw.enabled.filter((item): item is string => typeof item === "string")
    : DEFAULT_AI_TOOLS.map((tool) => tool.name);
  return { version: 1, enabled };
}

function normalizePolicy(toolName: string, value: unknown): AiToolPolicy {
  const defaults = DEFAULT_POLICIES[toolName] ?? {
    enabled: true,
    requireConfirmation: true,
    allowedDomains: [],
    blockedDomains: [],
    timeoutMs: 15000,
  };
  if (!value || typeof value !== "object") return defaults;
  const raw = value as Partial<AiToolPolicy>;
  return {
    ...defaults,
    // Vault policy may disable tools, but cannot skip confirmation.
    enabled: raw.enabled !== false,
    requireConfirmation: true,
    allowedDomains: Array.isArray(raw.allowedDomains)
      ? raw.allowedDomains.filter((item): item is string => typeof item === "string")
      : defaults.allowedDomains,
    blockedDomains: Array.isArray(raw.blockedDomains)
      ? Array.from(new Set([...defaults.blockedDomains, ...raw.blockedDomains.filter((item): item is string => typeof item === "string")]))
      : defaults.blockedDomains,
    timeoutMs: typeof raw.timeoutMs === "number" && raw.timeoutMs > 0
      ? Math.min(raw.timeoutMs, 30000)
      : defaults.timeoutMs,
    allowOverwrite: false,
    browser: normalizeBrowserProfile(raw.browser, defaults.browser),
  };
}

async function readJson<T>(path: string, normalize: (value: unknown) => T, fallback: T): Promise<T> {
  try {
    return normalize(JSON.parse(await readFile(path)));
  } catch {
    return fallback;
  }
}

export async function ensureVaultToolFiles(vaultPath: string): Promise<void> {
  const dir = getToolsDir(vaultPath);
  await createFolder(dir);
  const registryPath = pathJoin(dir, REGISTRY_FILE);
  const policiesPath = pathJoin(dir, POLICIES_FILE);
  try {
    await readFile(registryPath);
  } catch {
    await writeFile(registryPath, JSON.stringify({
      version: 1,
      enabled: DEFAULT_AI_TOOLS.map((tool) => tool.name),
    }, null, 2));
  }
  try {
    const raw = JSON.parse(await readFile(policiesPath)) as Partial<PoliciesFile>;
    const normalized: PoliciesFile = {
      version: 1,
      policies: Object.fromEntries(
        DEFAULT_AI_TOOLS.map((tool) => [
          tool.name,
          normalizePolicy(tool.name, raw.policies?.[tool.name]),
        ]),
      ),
    };
    if (JSON.stringify(raw, null, 2) !== JSON.stringify(normalized, null, 2)) {
      await writeFile(policiesPath, JSON.stringify(normalized, null, 2));
    }
  } catch {
    await writeFile(policiesPath, JSON.stringify({
      version: 1,
      policies: DEFAULT_POLICIES,
    }, null, 2));
  }
}

export async function loadVaultToolRuntimes(vaultPath: string): Promise<AiToolRuntime[]> {
  const dir = getToolsDir(vaultPath);
  const fallbackRegistry = { version: 1 as const, enabled: DEFAULT_AI_TOOLS.map((tool) => tool.name) };
  const registry = await readJson(
    pathJoin(dir, REGISTRY_FILE),
    normalizeRegistry,
    fallbackRegistry,
  );
  const policiesFile = await readJson<PoliciesFile>(
    pathJoin(dir, POLICIES_FILE),
    (value) => {
      const raw = value && typeof value === "object" ? value as Partial<PoliciesFile> : {};
      return {
        version: 1,
        policies: raw.policies && typeof raw.policies === "object" ? raw.policies : {},
      };
    },
    { version: 1, policies: {} },
  );

  return registry.enabled
    .map((name) => getDefaultAiTool(name))
    .filter((tool): tool is AiToolDefinition => Boolean(tool))
    .map((definition) => ({
      definition: {
        ...definition,
        enabled: definition.enabled && normalizePolicy(definition.name, policiesFile.policies[definition.name]).enabled,
      },
      policy: normalizePolicy(definition.name, policiesFile.policies[definition.name]),
    }))
    .filter((runtime) => runtime.definition.enabled && runtime.policy.enabled);
}

export async function isVaultToolEnabled(vaultPath: string, toolName: string): Promise<boolean> {
  const runtimes = await loadVaultToolRuntimes(vaultPath);
  return runtimes.some((runtime) => runtime.definition.name === toolName);
}
