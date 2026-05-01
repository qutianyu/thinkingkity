import { pathJoin, readFile } from "@/lib/tauriCommands";
import type { AiChatMessage } from "./types";
import type { AiArticleContextRef, AiSessionData } from "./sessionTypes";
import { getAiPrompt } from "./promptConfig";

const MAX_ARTICLE_CHARS = 50 * 1024;

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
  for (const ref of refs) {
    try {
      const fullPath = pathJoin(vaultPath, ref.path);
      const content = trimArticleContent(await readFile(fullPath));
      blocks.push(`<file path="${ref.path}" title="${ref.title}">\n${content}\n</file>`);
    } catch {
      // Missing files are still represented so the model can explain the gap.
      blocks.push(`<file path="${ref.path}" title="${ref.title}" missing="true"></file>`);
    }
  }
  return blocks.join("\n\n");
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

  messages.push(...getRecentMessages(session));
  return messages;
}
