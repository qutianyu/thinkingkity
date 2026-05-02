export interface ExtractedThinking {
  visibleContent: string;
  thinking: string[];
}

const THINKING_RE = /<(think|thinking)>\s*([\s\S]*?)(?:<\/\1>|$)/gi;

export function extractThinking(content: string): ExtractedThinking {
  const thinking: string[] = [];
  const visibleContent = content.replace(THINKING_RE, (_match, _tag, body) => {
    const text = String(body ?? "").trim();
    if (text) thinking.push(text);
    return "";
  }).trim();
  return { visibleContent, thinking };
}
