import "./styles.css";

export {
  AI_PROVIDER_BASE_URLS,
  DEFAULT_AI_CONFIG,
  getDefaultAiBaseUrl,
  normalizeAiConfig,
  type AiConfig,
  type AiProvider,
} from "./config";
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
