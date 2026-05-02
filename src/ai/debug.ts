import type { AiConfig } from "./config";
import type { AiChatMessage } from "./types";

declare global {
  interface Window {
    __THINKINGKITY_AI_CONTEXT_LOGS__?: unknown[];
  }
}

export function logLlmContext(
  ai: AiConfig,
  messages: AiChatMessage[],
  source: string,
): void {
  const payload = {
    logged_at: new Date().toISOString(),
    source,
    provider: ai.provider,
    base_url: ai.base_url,
    model: ai.model,
    message_count: messages.length,
    messages: messages.map((message, index) => ({
      index,
      id: message.id,
      role: message.role,
      created_at: message.created_at,
      chars: message.content.length,
      content: message.content,
    })),
  };

  if (typeof window !== "undefined") {
    window.__THINKINGKITY_AI_CONTEXT_LOGS__ = [
      ...(window.__THINKINGKITY_AI_CONTEXT_LOGS__ ?? []),
      payload,
    ].slice(-20);
  }

  const label = `[ThinkingKity AI] LLM context -> ${source} (${messages.length} messages)`;
  console.groupCollapsed(label);
  console.info(payload);
  console.info(JSON.stringify(payload, null, 2));
  console.groupEnd();
}
