import "./styles.css";

export {
  AI_PROVIDER_BASE_URLS,
  DEFAULT_AI_CONFIG,
  DEFAULT_AI_CONTEXT_COMPACTION_THRESHOLD_KB,
  MAX_AI_CONTEXT_COMPACTION_THRESHOLD_KB,
  MIN_AI_CONTEXT_COMPACTION_THRESHOLD_KB,
  getDefaultAiBaseUrl,
  normalizeAiContextCompactionThresholdKb,
  normalizeAiConfig,
  type AiConfig,
  type AiProvider,
} from "./config";
export { ensureAiConfig, getAiConfigPath, writeAiConfig } from "./aiConfigStorage";
export { streamAiChat, testAiConnection } from "./client";
export type { AiChatMessage, AiChatRequest, AiChatRole } from "./types";
export type {
  AiArticleContextRef,
  AiSessionData,
  AiSessionManagerData,
  AiSessionMessage,
  AiSessionSummary,
} from "./sessionTypes";
export { useAiStore } from "./aiStore";
export { AiChatDock } from "./AiChatDock";
