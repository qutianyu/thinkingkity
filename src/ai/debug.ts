import type { AiConfig } from "./config";
import type { AiChatMessage } from "./types";

export function logLlmContext(
  ai: AiConfig,
  messages: AiChatMessage[],
  source: string,
): void {
  if (!import.meta.env.DEV) return;

  const payload = {
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

  console.groupCollapsed(
    `[ThinkingKity AI] LLM context -> ${source} (${messages.length} messages)`,
  );
  console.log(payload);
  console.log(JSON.stringify(payload, null, 2));
  console.groupEnd();
}
