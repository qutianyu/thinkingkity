import type { AiConfig } from "./config";
import type { AiChatMessage, AiChatRequest } from "./types";
import { aiFetch } from "./http";
import { logLlmContext } from "./debug";

async function readErrorMessage(res: Response): Promise<string> {
  const fallback = `${res.status} ${res.statusText}`.trim();
  try {
    const text = await res.text();
    if (!text.trim()) return fallback;
    try {
      const json = JSON.parse(text);
      const message = json.error?.message ?? json.message ?? text;
      return typeof message === "string" ? message : fallback;
    } catch {
      return text.slice(0, 240);
    }
  } catch {
    return fallback;
  }
}

export async function testAiConnection(ai: AiConfig): Promise<boolean> {
  assertAiReady(ai);

  const baseUrl = ai.base_url.replace(/\/+$/, "");
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  let res: Response;
  if (ai.provider === "anthropic") {
    headers["x-api-key"] = ai.api_key;
    headers["anthropic-version"] = "2023-06-01";
    res = await aiFetch(`${baseUrl}/v1/messages`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        model: ai.model,
        max_tokens: 1,
        messages: [{ role: "user", content: "ping" }],
      }),
      signal: AbortSignal.timeout(10000),
    });
  } else {
    headers["Authorization"] = `Bearer ${ai.api_key}`;
    res = await aiFetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        model: ai.model,
        max_tokens: 1,
        messages: [{ role: "user", content: "ping" }],
      }),
      signal: AbortSignal.timeout(10000),
    });
  }

  if (!res.ok) {
    throw new Error(await readErrorMessage(res));
  }

  return res.ok;
}

interface StreamProviderOptions {
  ai: AiConfig;
  messages: AiChatMessage[];
  onToken: (token: string) => void;
  onThinking?: (token: string) => void;
  signal?: AbortSignal;
  source?: string;
}

function assertAiReady(ai: AiConfig): void {
  // Fail before opening a stream so composer state can be restored cleanly.
  if (!ai.api_key.trim()) {
    throw new Error("API key is required.");
  }
  if (!ai.base_url.trim()) {
    throw new Error("Base URL is required.");
  }
  if (!ai.model.trim()) {
    throw new Error("Model is required.");
  }
}

async function readSse(
  res: Response,
  onEvent: (data: string) => void,
): Promise<void> {
  if (!res.body) throw new Error("Streaming response is empty.");

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const chunks = buffer.split(/\r?\n\r?\n/);
    buffer = chunks.pop() ?? "";

    // SSE events may arrive split across chunks, so only complete events are parsed.
    for (const chunk of chunks) {
      const data = chunk
        .split(/\r?\n/)
        .filter((line) => line.startsWith("data:"))
        .map((line) => line.slice(5).trimStart())
        .join("\n");
      if (data) onEvent(data);
    }
  }

  const tail = buffer.trim();
  if (tail) {
    const data = tail
      .split(/\r?\n/)
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice(5).trimStart())
      .join("\n");
    if (data) onEvent(data);
  }
}

async function streamOpenAiCompatible({
  ai,
  messages,
  onToken,
  onThinking,
  signal,
}: StreamProviderOptions): Promise<string> {
  const baseUrl = ai.base_url.replace(/\/+$/, "");
  const res = await aiFetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${ai.api_key}`,
    },
    body: JSON.stringify({
      model: ai.model,
      stream: true,
      messages: messages.map((message) => ({
        role: message.role,
        content: message.content,
      })),
    }),
    signal,
  });

  if (!res.ok) {
    throw new Error(`OpenAI-compatible request failed: ${await readErrorMessage(res)}`);
  }

  let content = "";
  await readSse(res, (data) => {
    if (data === "[DONE]") return;
    try {
      const json = JSON.parse(data);
      const delta = json.choices?.[0]?.delta;
      const thinkingToken = delta?.reasoning_content ?? delta?.reasoning ?? delta?.thinking;
      if (typeof thinkingToken === "string" && thinkingToken.length > 0) {
        onThinking?.(thinkingToken);
      }
      const token = delta?.content;
      if (typeof token !== "string" || token.length === 0) return;
      // Update both the caller and accumulated return value from the same token stream.
      content += token;
      onToken(token);
    } catch {
      // Ignore malformed keepalive events.
    }
  });

  return content;
}

async function streamAnthropic({
  ai,
  messages,
  onToken,
  onThinking,
  signal,
}: StreamProviderOptions): Promise<string> {
  const baseUrl = ai.base_url.replace(/\/+$/, "");
  const supportsExtendedThinking = /claude-(3-7|sonnet-4|opus-4|haiku-4)/i.test(ai.model);
  const maxTokens = supportsExtendedThinking ? 8192 : 4096;
  const system = messages
    .filter((message) => message.role === "system")
    .map((message) => message.content)
    .join("\n\n");
  const chatMessages = messages.filter((message) => message.role !== "system");
  const res = await aiFetch(`${baseUrl}/v1/messages`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": ai.api_key,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: ai.model,
      max_tokens: maxTokens,
      stream: true,
      ...(supportsExtendedThinking ? { temperature: 1 } : {}),
      ...(supportsExtendedThinking
        ? { thinking: { type: "enabled", budget_tokens: 2048 } }
        : {}),
      ...(system ? { system } : {}),
      messages: chatMessages.map((message) => ({
        role: message.role,
        content: message.content,
      })),
    }),
    signal,
  });

  if (!res.ok) {
    throw new Error(`Anthropic request failed: ${await readErrorMessage(res)}`);
  }

  let content = "";
  await readSse(res, (data) => {
    try {
      const json = JSON.parse(data);
      const delta = json.type === "content_block_delta" ? json.delta : undefined;
      const thinkingToken = delta?.type === "thinking_delta" ? delta.thinking : undefined;
      if (typeof thinkingToken === "string" && thinkingToken.length > 0) {
        onThinking?.(thinkingToken);
      }
      // Anthropic streams final answer text as text_delta events.
      const token = delta?.type === "text_delta" ? delta.text : undefined;
      if (typeof token !== "string" || token.length === 0) return;
      content += token;
      onToken(token);
    } catch {
      // Ignore malformed keepalive events.
    }
  });

  return content;
}

export async function streamProviderChat(options: StreamProviderOptions): Promise<string> {
  assertAiReady(options.ai);
  logLlmContext(options.ai, options.messages, options.source ?? "streamProviderChat");
  // Keep provider branching isolated so UI code only deals with one streaming contract.
  if (options.ai.provider === "anthropic") {
    return streamAnthropic(options);
  }
  return streamOpenAiCompatible(options);
}

export async function streamAiChat(
  ai: AiConfig,
  request: AiChatRequest,
): Promise<string> {
  return streamProviderChat({
    ai,
    messages: request.messages,
    onToken: request.onToken,
    onThinking: request.onThinking,
    signal: request.signal,
    source: request.source,
  });
}
