import { buildChatMessages } from "./contextBuilder";
import { streamProviderChat } from "./client";
import { getAiPrompt } from "./promptConfig";
import type { AiChatMessage } from "./types";
import type { AiArticleContextRef, AiSessionData } from "./sessionTypes";
import type { AiDocumentDraft, AiDocumentDraftOptions } from "./documentTypes";
import type { AiConfig } from "./config";
import { extractThinking } from "./thinking";

function dedupeContextRefs(refs: AiArticleContextRef[]): AiArticleContextRef[] {
  const seen = new Set<string>();
  const result: AiArticleContextRef[] = [];
  for (const ref of refs) {
    if (!seen.has(ref.path)) {
      seen.add(ref.path);
      result.push(ref);
    }
  }
  return result;
}

export function collectSessionContextRefs(session: AiSessionData): AiArticleContextRef[] {
  const all: AiArticleContextRef[] = [...session.attached_context];
  for (const message of session.messages) {
    if (message.context_refs && message.context_refs.length > 0) {
      all.push(...message.context_refs);
    }
  }
  return dedupeContextRefs(all);
}

function renderDocumentRequest(): string {
  const parts: string[] = [];
  parts.push("请根据以上对话生成一篇 Markdown 文档。");
  parts.push("只输出 Markdown 文档本身，不要添加解释性前后缀。");
  return parts.join("\n");
}

export async function buildDocumentMessages(options: {
  vaultPath: string;
  session: AiSessionData;
  memory: string;
  language: string;
  documentOptions: AiDocumentDraftOptions;
}): Promise<AiChatMessage[]> {
  const { vaultPath, session, memory, language, documentOptions } = options;

  // 完全复用 buildChatMessages 的上下文组装策略（memory + 文件上下文 + 最近消息）
  const baseMessages = await buildChatMessages(
    vaultPath,
    session,
    memory,
    language,
    collectSessionContextRefs(session),
  );

  // 将 system prompt 替换为文档生成专用 prompt
  const messages = baseMessages.map((message) =>
    message.id === "system" ? { ...message, content: getAiPrompt("documentGenerate", language) } : message,
  );

  // 追加文档生成请求
  messages.push({
    id: "document-request",
    role: "user",
    content: renderDocumentRequest(),
  });

  return messages;
}

function extractTitle(markdown: string): string {
  const match = markdown.match(/^#\s+(.+)$/m);
  return match ? match[1].trim() : "Untitled Document";
}

function slugifyFileName(title: string): string {
  const cleaned = title
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, "")
    .replace(/\s+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return cleaned || "document";
}

export async function generateDocumentDraft(options: {
  ai: AiConfig;
  vaultPath: string;
  session: AiSessionData;
  memory: string;
  language: string;
  documentOptions: AiDocumentDraftOptions;
  signal?: AbortSignal;
  onToken?: (token: string) => void;
  onThinking?: (token: string) => void;
}): Promise<AiDocumentDraft> {
  const { ai, vaultPath, session, memory, language, documentOptions, signal, onToken, onThinking } = options;

  const messages = await buildDocumentMessages({ vaultPath, session, memory, language, documentOptions });

  let markdown = "";
  await streamProviderChat({
    ai,
    messages,
    signal,
    source: "document-generate",
    onThinking,
    onToken: (token) => {
      markdown += token;
      onToken?.(token);
    },
  });

  const visibleMarkdown = extractThinking(markdown).visibleContent;
  const title = extractTitle(visibleMarkdown);
  const suggestedFileName = `${slugifyFileName(title)}.md`;

  return {
    title,
    markdown: visibleMarkdown,
    suggestedFileName,
    sourceSessionId: session.id,
    contextFiles: collectSessionContextRefs(session).map((r) => r.path),
  };
}
