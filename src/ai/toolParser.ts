import type { AiKnowledgeToolCall } from "./toolTypes";

const TOOL_CALL_RE = /<tool_call>\s*([\s\S]*?)\s*<\/tool_call>/;
const TOOL_CALL_GLOBAL_RE = /<tool_call>\s*([\s\S]*?)\s*<\/tool_call>/g;

function isKnowledgeToolCall(value: unknown): value is AiKnowledgeToolCall {
  if (!value || typeof value !== "object") return false;
  const raw = value as Partial<AiKnowledgeToolCall>;
  return (raw.tool === "fetch_url" || raw.tool === "browse_page")
    && typeof raw.url === "string"
    && raw.url.trim().length > 0
    && typeof raw.purpose === "string";
}

function normalizeSearchToolCall(value: unknown): AiKnowledgeToolCall | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as { tool?: unknown; query?: unknown; purpose?: unknown };
  if (raw.tool !== "search" || typeof raw.query !== "string" || !raw.query.trim()) return null;
  const query = raw.query.trim();
  return {
    tool: "browse_page",
    url: `https://duckduckgo.com/?q=${encodeURIComponent(query)}`,
    purpose: typeof raw.purpose === "string" && raw.purpose.trim()
      ? raw.purpose.trim()
      : `Search the public web for: ${query}`,
  };
}

function parseToolCallJson(rawJson: string): AiKnowledgeToolCall | null {
  try {
    const parsed = JSON.parse(rawJson);
    const normalizedSearchCall = normalizeSearchToolCall(parsed);
    if (normalizedSearchCall) return normalizedSearchCall;
    if (!isKnowledgeToolCall(parsed)) return null;
    return {
      tool: parsed.tool,
      url: parsed.url.trim(),
      purpose: parsed.purpose.trim(),
    };
  } catch {
    return null;
  }
}

export function parseAiToolCall(content: string): AiKnowledgeToolCall | null {
  const match = content.match(TOOL_CALL_RE);
  if (!match) return null;
  return parseToolCallJson(match[1]);
}

export function parseAiToolCalls(content: string): AiKnowledgeToolCall[] {
  return Array.from(content.matchAll(TOOL_CALL_GLOBAL_RE))
    .map((match) => parseToolCallJson(match[1]))
    .filter((call): call is AiKnowledgeToolCall => Boolean(call));
}

export function stripToolCall(content: string): string {
  return content.replace(TOOL_CALL_GLOBAL_RE, "").trim();
}

export function stripToolCalls(content: string): string {
  return stripToolCall(content);
}

export function inferToolCallFromUserText(content: string): AiKnowledgeToolCall | null {
  const urlMatch = content.match(/https?:\/\/[^\s<>"'）)]+/i);
  if (!urlMatch) return null;
  const url = urlMatch[0];
  const lower = content.toLowerCase();
  const explicitlyRequestsBrowser = [
    "用浏览器",
    "使用浏览器",
    "用无头浏览器",
    "使用无头浏览器",
    "用 playwright",
    "使用 playwright",
    "打开浏览器",
    "浏览器打开",
    "无头浏览器打开",
    "use browser",
    "use a browser",
    "use headless browser",
    "use playwright",
    "open with browser",
    "open in browser",
  ].some((keyword) => lower.includes(keyword));
  if (!explicitlyRequestsBrowser) return null;

  return {
    tool: "browse_page",
    url,
    purpose: "User explicitly asked to inspect the URL with a browser-capable retrieval tool.",
  };
}

export function hasBrowserIntent(content: string): boolean {
  const lower = content.toLowerCase();
  return [
    "浏览器",
    "无头",
    "browser",
    "playwright",
  ].some((keyword) => lower.includes(keyword));
}
