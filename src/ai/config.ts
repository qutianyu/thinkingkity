export type AiProvider = "openai" | "anthropic";

export interface AiConfig {
  provider: AiProvider;
  base_url: string;
  api_key: string;
  model: string;
}

export const AI_PROVIDER_BASE_URLS: Record<AiProvider, string> = {
  openai: "https://api.openai.com/v1",
  anthropic: "https://api.anthropic.com",
};

export const DEFAULT_AI_CONFIG: AiConfig = {
  provider: "openai",
  base_url: AI_PROVIDER_BASE_URLS.openai,
  api_key: "",
  model: "",
};

export function getDefaultAiBaseUrl(provider: AiProvider): string {
  return AI_PROVIDER_BASE_URLS[provider];
}

export function normalizeAiConfig(raw: unknown, defaults: AiConfig): AiConfig {
  // Vault config is user-editable JSON, so every field is treated as untrusted.
  if (!raw || typeof raw !== "object") return defaults;
  const ai = raw as Record<string, unknown>;
  return {
    provider: ai.provider === "anthropic" ? "anthropic" : defaults.provider,
    base_url: typeof ai.base_url === "string" && ai.base_url ? ai.base_url : defaults.base_url,
    api_key: typeof ai.api_key === "string" ? ai.api_key : defaults.api_key,
    model: typeof ai.model === "string" ? ai.model : defaults.model,
  };
}
