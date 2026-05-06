export type AiProvider = "openai" | "anthropic";

export interface AiConfig {
  provider: AiProvider;
  provider_name: string;
  base_url: string;
  api_key: string;
  model: string;
  context_compaction_threshold_kb: number;
}

export const DEFAULT_AI_CONTEXT_COMPACTION_THRESHOLD_KB = 200;
export const MIN_AI_CONTEXT_COMPACTION_THRESHOLD_KB = 10;
export const MAX_AI_CONTEXT_COMPACTION_THRESHOLD_KB = 2000;

export const AI_PROVIDER_BASE_URLS: Record<AiProvider, string> = {
  openai: "https://api.openai.com/v1",
  anthropic: "https://api.anthropic.com",
};

export const DEFAULT_AI_CONFIG: AiConfig = {
  provider: "openai",
  provider_name: "",
  base_url: AI_PROVIDER_BASE_URLS.openai,
  api_key: "",
  model: "",
  context_compaction_threshold_kb: DEFAULT_AI_CONTEXT_COMPACTION_THRESHOLD_KB,
};

export function getDefaultAiBaseUrl(provider: AiProvider): string {
  return AI_PROVIDER_BASE_URLS[provider];
}

export function normalizeAiContextCompactionThresholdKb(value: unknown, fallback: number): number {
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.min(
    MAX_AI_CONTEXT_COMPACTION_THRESHOLD_KB,
    Math.max(MIN_AI_CONTEXT_COMPACTION_THRESHOLD_KB, Math.round(numeric)),
  );
}

export function normalizeAiConfig(raw: unknown, defaults: AiConfig): AiConfig {
  // Vault config is user-editable JSON, so every field is treated as untrusted.
  if (!raw || typeof raw !== "object") return defaults;
  const ai = raw as Record<string, unknown>;
  return {
    provider: ai.provider === "anthropic" ? "anthropic" : defaults.provider,
    provider_name: typeof ai.provider_name === "string" ? ai.provider_name : defaults.provider_name,
    base_url: typeof ai.base_url === "string" && ai.base_url ? ai.base_url : defaults.base_url,
    api_key: typeof ai.api_key === "string" ? ai.api_key : defaults.api_key,
    model: typeof ai.model === "string" ? ai.model : defaults.model,
    context_compaction_threshold_kb: normalizeAiContextCompactionThresholdKb(
      ai.context_compaction_threshold_kb,
      defaults.context_compaction_threshold_kb,
    ),
  };
}
