import chatSystemEn from "./prompts/chat-system.en-US.txt?raw";
import chatSystemZhCn from "./prompts/chat-system.zh-CN.txt?raw";
import chatSystemZhTw from "./prompts/chat-system.zh-TW.txt?raw";
import memoryCompactEn from "./prompts/memory-compact.en-US.txt?raw";
import memoryCompactZhCn from "./prompts/memory-compact.zh-CN.txt?raw";
import memoryCompactZhTw from "./prompts/memory-compact.zh-TW.txt?raw";

export type AiPromptKind = "chatSystem" | "memoryCompact";

const PROMPTS: Record<AiPromptKind, Record<string, string>> = {
  chatSystem: {
    "en-US": chatSystemEn,
    "zh-CN": chatSystemZhCn,
    "zh-TW": chatSystemZhTw,
  },
  memoryCompact: {
    "en-US": memoryCompactEn,
    "zh-CN": memoryCompactZhCn,
    "zh-TW": memoryCompactZhTw,
  },
};

function normalizeLanguage(language: string | undefined): string {
  const value = (language || "").trim();
  if (!value) return "en-US";
  if (value.toLowerCase().startsWith("zh-tw")) return "zh-TW";
  if (value.toLowerCase().startsWith("zh-hk")) return "zh-TW";
  if (value.toLowerCase().startsWith("zh")) return "zh-CN";
  if (value.toLowerCase().startsWith("en")) return "en-US";
  return value;
}

export function getAiPrompt(kind: AiPromptKind, language: string | undefined): string {
  const prompts = PROMPTS[kind];
  const normalized = normalizeLanguage(language);
  return (prompts[normalized] ?? prompts["en-US"]).trim();
}
