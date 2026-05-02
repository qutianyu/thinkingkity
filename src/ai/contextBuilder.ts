import { pathJoin, readFile } from "@/lib/tauriCommands";
import type { AiChatMessage } from "./types";
import type { AiArticleContextRef, AiSessionData } from "./sessionTypes";
import { getAiPrompt } from "./promptConfig";
import { expandDirectoryContext } from "./directoryContext";
import type { AiKnowledgeToolResult } from "./toolTypes";

const MAX_ARTICLE_CHARS = 50 * 1024;
const MAX_ATTACHED_CONTEXT_CHARS = 180 * 1024;

function trimArticleContent(content: string): string {
  if (content.length <= MAX_ARTICLE_CHARS) return content;
  // Preserve beginning, middle, and end so the model sees declarations and conclusions.
  const part = Math.floor(MAX_ARTICLE_CHARS / 3);
  return [
    content.slice(0, part),
    "\n\n...[middle omitted]...\n\n",
    content.slice(Math.max(part, Math.floor(content.length / 2) - Math.floor(part / 2)), Math.floor(content.length / 2) + Math.floor(part / 2)),
    "\n\n...[tail]...\n\n",
    content.slice(-part),
  ].join("");
}

export function getVaultRelativePath(vaultPath: string, filePath: string): string {
  // Store session context as vault-relative paths so sessions survive vault moves.
  const normalizedVault = vaultPath.replace(/[/\\]+$/, "");
  if (filePath === normalizedVault) return "";
  if (filePath.startsWith(`${normalizedVault}/`) || filePath.startsWith(`${normalizedVault}\\`)) {
    return filePath.slice(normalizedVault.length + 1);
  }
  return filePath;
}

export async function readAttachedArticleContext(
  vaultPath: string,
  refs: AiArticleContextRef[],
): Promise<string> {
  if (refs.length === 0) return "";
  const blocks: string[] = [];
  const seenFiles = new Set<string>();
  let usedChars = 0;
  for (const ref of refs) {
    if (usedChars >= MAX_ATTACHED_CONTEXT_CHARS) break;
    if (ref.type === "directory") {
      try {
        const files = await expandDirectoryContext(vaultPath, ref);
        const fileBlocks: string[] = [];
        for (const file of files) {
          if (usedChars >= MAX_ATTACHED_CONTEXT_CHARS) break;
          if (seenFiles.has(file.path)) continue;
          seenFiles.add(file.path);
          try {
            const fullPath = pathJoin(vaultPath, file.path);
            const remaining = Math.max(0, MAX_ATTACHED_CONTEXT_CHARS - usedChars);
            const content = trimArticleContent(await readFile(fullPath)).slice(0, remaining);
            usedChars += content.length;
            fileBlocks.push(`<file path="${file.path}" title="${file.title}">\n${content}\n</file>`);
          } catch {
            fileBlocks.push(`<file path="${file.path}" title="${file.title}" missing="true"></file>`);
          }
        }
        blocks.push(`<directory path="${ref.path}" title="${ref.title}" recursive="${ref.recursive}">\n${fileBlocks.join("\n\n")}\n</directory>`);
      } catch {
        blocks.push(`<directory path="${ref.path}" title="${ref.title}" missing="true"></directory>`);
      }
      continue;
    }
    if (seenFiles.has(ref.path)) continue;
    seenFiles.add(ref.path);
    try {
      const fullPath = pathJoin(vaultPath, ref.path);
      const remaining = Math.max(0, MAX_ATTACHED_CONTEXT_CHARS - usedChars);
      const content = trimArticleContent(await readFile(fullPath)).slice(0, remaining);
      usedChars += content.length;
      blocks.push(`<file path="${ref.path}" title="${ref.title}">\n${content}\n</file>`);
    } catch {
      // Missing files are still represented so the model can explain the gap.
      blocks.push(`<file path="${ref.path}" title="${ref.title}" missing="true"></file>`);
    }
  }
  return blocks.join("\n\n");
}

export function buildKnowledgeToolContext(results: AiKnowledgeToolResult[]): string {
  if (results.length === 0) return "";
  return results.map((result) => {
    if (!result.ok) {
      return `<tool_result tool="${result.tool}" source="${result.source}" ok="false" fetched_at="${result.fetched_at}">\n${result.error ?? "Tool failed."}\n</tool_result>`;
    }
    return `<tool_result tool="${result.tool}" source="${result.source}" ok="true" fetched_at="${result.fetched_at}" title="${result.title ?? ""}">\n${result.content ?? ""}\n</tool_result>`;
  }).join("\n\n");
}

function getRecentMessages(session: AiSessionData): AiChatMessage[] {
  // Keep all unsummarized turns plus a recent tail for continuity after compaction.
  const unsummarized = session.messages.filter((message) => !message.summarized);
  const recent = session.messages.slice(-4);
  const byId = new Map<string, AiChatMessage>();
  for (const message of [...unsummarized, ...recent]) {
    if (!message.content.trim()) continue;
    byId.set(message.id, {
      id: message.id,
      role: message.role,
      content: message.content,
      created_at: message.created_at,
    });
  }
  return Array.from(byId.values());
}

export async function buildChatMessages(
  vaultPath: string,
  session: AiSessionData,
  memory: string,
  language: string,
  articleRefs: AiArticleContextRef[] = session.attached_context,
  toolResults: AiKnowledgeToolResult[] = [],
): Promise<AiChatMessage[]> {
  const messages: AiChatMessage[] = [
    {
      id: "system",
      role: "system",
      content: getAiPrompt("chatSystem", language),
    },
  ];

  if (memory.trim()) {
    messages.push({
      id: "session-memory",
      role: "system",
      content: `Session memory:\n\n${memory.trim()}`,
    });
  }

  const articleContext = await readAttachedArticleContext(vaultPath, articleRefs);
  if (articleContext.trim()) {
    messages.push({
      id: "file-context",
      role: "system",
      content: `Attached file context:\n\n${articleContext}`,
    });
  }

  const toolContext = buildKnowledgeToolContext(toolResults);
  if (toolContext.trim()) {
    messages.push({
      id: "external-knowledge",
      role: "system",
      content: `External knowledge gathered by user-approved tools:\n\n${toolContext}`,
    });
  }

  messages.push(...getRecentMessages(session));
  return messages;
}
