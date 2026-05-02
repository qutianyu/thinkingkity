import type { AiConfig } from "./config";
import { streamProviderChat } from "./client";
import { readAttachedArticleContext } from "./contextBuilder";
import type { AiSessionData, AiSessionManagerData } from "./sessionTypes";
import { readSession, writeSessionMemory } from "./sessionStorage";
import { saveAiSession } from "./sessionManager";
import type { AiChatMessage } from "./types";
import { getAiPrompt } from "./promptConfig";

const MAX_SESSION_JSON_BYTES = 200 * 1024;

function byteLength(text: string): number {
  return new TextEncoder().encode(text).byteLength;
}

export function shouldCompactSession(session: AiSessionData): boolean {
  // Keep session files bounded so loading a chat stays fast over long conversations.
  return byteLength(JSON.stringify(session)) > MAX_SESSION_JSON_BYTES;
}

async function buildCompactionMessages(
  vaultPath: string,
  memory: string,
  session: AiSessionData,
  language: string,
): Promise<AiChatMessage[]> {
  const unsummarized = session.messages.filter((message) => !message.summarized && message.content.trim());
  const articleContext = await readAttachedArticleContext(vaultPath, session.attached_context);
  // Compaction is itself an LLM request with the same provider configuration.
  return [
    {
      id: "compact-system",
      role: "system",
      content: getAiPrompt("memoryCompact", language),
    },
    {
      id: "compact-user",
      role: "user",
      content: [
        "Existing memory:",
        memory.trim() || "(empty)",
        "",
        "New conversation turns:",
        unsummarized.map((message) => `${message.role.toUpperCase()}:\n${message.content}`).join("\n\n"),
        "",
        "Attached file context:",
        articleContext || "(none)",
      ].join("\n"),
    },
  ];
}

export async function compactSessionMemoryIfNeeded(options: {
  ai: AiConfig;
  vaultPath: string;
  session: AiSessionData;
  manager: AiSessionManagerData;
  memory: string;
  language: string;
}): Promise<{ session: AiSessionData; manager: AiSessionManagerData; memory: string }> {
  const { ai, vaultPath, session, manager, memory, language } = options;
  if (!shouldCompactSession(session)) {
    return { session, manager, memory };
  }

  // Mark messages summarized only after the replacement memory has been generated.
  const compactMessages = await buildCompactionMessages(vaultPath, memory, session, language);
  const nextMemory = await streamProviderChat({
    ai,
    messages: compactMessages,
    source: "memory-compact",
    onToken: () => undefined,
  });

  const unsummarizedMessages = session.messages.filter((message) => !message.summarized);
  const lastSummarized = unsummarizedMessages[unsummarizedMessages.length - 1];
  const summarizedIds = new Set(
    session.messages
      .filter((m) => {
        if (m.summarized) return true;
        const idx = session.messages.indexOf(m);
        const cutoffIdx = lastSummarized
          ? session.messages.findIndex((msg) => msg.id === lastSummarized.id)
          : -1;
        return idx <= cutoffIdx && Boolean(m.content.trim());
      })
      .map((m) => m.id),
  );

  // Re-read the latest session from disk so compaction cannot overwrite messages
  // that were added by a concurrent chat turn.
  const latestSession = await readSession(vaultPath, session.id);
  const nextSession: AiSessionData = {
    ...latestSession,
    messages: latestSession.messages.map((message) => ({
      ...message,
      summarized: message.summarized || summarizedIds.has(message.id),
    })),
  };
  const now = new Date().toISOString();
  await writeSessionMemory(vaultPath, session.id, nextMemory);
  const nextManager = await saveAiSession(vaultPath, nextSession, manager, {
    memory_updated_at: now,
    last_summarized_message_id: lastSummarized?.id,
  });

  return {
    session: nextSession,
    manager: nextManager,
    memory: nextMemory,
  };
}
