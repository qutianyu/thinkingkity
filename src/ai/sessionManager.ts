import { pathBasename } from "@/lib/tauriCommands";
import type { AiArticleContextRef, AiSessionData, AiSessionManagerData, LoadedAiSessions } from "./sessionTypes";
import {
  createEmptySession,
  createSessionId,
  deleteSessionFiles,
  readSession,
  readSessionManager,
  readSessionMemory,
  toSessionSummary,
  writeSession,
  writeSessionManager,
} from "./sessionStorage";

function nowIso(): string {
  return new Date().toISOString();
}

function createDefaultManager(session: AiSessionData): AiSessionManagerData {
  return {
    version: 1,
    active_session_id: session.id,
    sessions: [toSessionSummary(session)],
  };
}

async function readSessionMemoryIfPresent(
  vaultPath: string,
  manager: AiSessionManagerData,
  sessionId: string,
): Promise<string> {
  const summary = manager.sessions.find((session) => session.id === sessionId);
  if (!summary?.memory_updated_at) return "";
  return readSessionMemory(vaultPath, sessionId);
}

function normalizeTitle(text: string): string {
  const title = text.replace(/\s+/g, " ").trim();
  if (!title) return "New chat";
  return title.length > 40 ? `${title.slice(0, 40)}...` : title;
}

export async function loadAiSessions(vaultPath: string): Promise<LoadedAiSessions> {
  const defaultSession = createEmptySession();
  const defaultManager = createDefaultManager(defaultSession);
  let manager = await readSessionManager(vaultPath, defaultManager);

  // A manager with no sessions is repaired immediately to keep the UI state simple.
  if (manager.sessions.length === 0) {
    await writeSession(vaultPath, defaultSession);
    await writeSessionManager(vaultPath, defaultManager);
    return {
      manager: defaultManager,
      activeSession: defaultSession,
      memory: "",
    };
  }

  let activeSessionId = manager.active_session_id;
  if (!manager.sessions.some((session) => session.id === activeSessionId)) {
    // Prefer opening some valid session over surfacing a broken active id.
    activeSessionId = manager.sessions[0].id;
    manager = { ...manager, active_session_id: activeSessionId };
    await writeSessionManager(vaultPath, manager);
  }

  const activeSession = await readSession(vaultPath, activeSessionId);
  const memory = await readSessionMemoryIfPresent(vaultPath, manager, activeSessionId);
  manager = {
    ...manager,
    sessions: manager.sessions.map((item) =>
      item.id === activeSession.id ? toSessionSummary(activeSession, item) : item,
    ),
  };
  await writeSession(vaultPath, activeSession);
  await writeSessionManager(vaultPath, manager);
  return { manager, activeSession, memory };
}

export async function createAiSession(vaultPath: string): Promise<LoadedAiSessions> {
  const loaded = await loadAiSessions(vaultPath);
  const session = createEmptySession(createSessionId());
  const manager: AiSessionManagerData = {
    version: 1,
    active_session_id: session.id,
    sessions: [toSessionSummary(session), ...loaded.manager.sessions],
  };
  await writeSession(vaultPath, session);
  await writeSessionManager(vaultPath, manager);
  return { manager, activeSession: session, memory: "" };
}

export async function switchAiSession(
  vaultPath: string,
  sessionId: string,
): Promise<LoadedAiSessions> {
  const loaded = await loadAiSessions(vaultPath);
  if (!loaded.manager.sessions.some((session) => session.id === sessionId)) {
    return loaded;
  }
  const manager = { ...loaded.manager, active_session_id: sessionId };
  const activeSession = await readSession(vaultPath, sessionId);
  const memory = await readSessionMemoryIfPresent(vaultPath, manager, sessionId);
  await writeSessionManager(vaultPath, manager);
  return { manager, activeSession, memory };
}

export async function deleteAiSession(
  vaultPath: string,
  sessionId: string,
): Promise<LoadedAiSessions> {
  const loaded = await loadAiSessions(vaultPath);
  const remaining = loaded.manager.sessions.filter((session) => session.id !== sessionId);
  await deleteSessionFiles(vaultPath, sessionId);

  if (remaining.length === 0) {
    const session = createEmptySession();
    const manager = createDefaultManager(session);
    await writeSession(vaultPath, session);
    await writeSessionManager(vaultPath, manager);
    return { manager, activeSession: session, memory: "" };
  }

  const active_session_id = loaded.manager.active_session_id === sessionId
    ? remaining[0].id
    : loaded.manager.active_session_id;
  const manager: AiSessionManagerData = {
    version: 1,
    active_session_id,
    sessions: remaining,
  };
  const activeSession = await readSession(vaultPath, active_session_id);
  const memory = await readSessionMemoryIfPresent(vaultPath, manager, active_session_id);
  await writeSessionManager(vaultPath, manager);
  return { manager, activeSession, memory };
}

export async function saveAiSession(
  vaultPath: string,
  session: AiSessionData,
  manager: AiSessionManagerData,
  summaryPatch: Partial<ReturnType<typeof toSessionSummary>> = {},
): Promise<AiSessionManagerData> {
  const previous = manager.sessions.find((item) => item.id === session.id);
  // Preserve summary-only fields such as memory timestamps unless the caller patches them.
  const summary = {
    ...toSessionSummary(session, previous),
    ...summaryPatch,
  };
  const nextManager: AiSessionManagerData = {
    ...manager,
    active_session_id: session.id,
    sessions: [
      summary,
      ...manager.sessions.filter((item) => item.id !== session.id),
    ],
  };
  await writeSession(vaultPath, session);
  await writeSessionManager(vaultPath, nextManager);
  return nextManager;
}

export function appendUserAndAssistantPlaceholders(
  session: AiSessionData,
  userText: string,
  contextRefs: AiArticleContextRef[],
): { session: AiSessionData; userMessageId: string; assistantMessageId: string } {
  const created_at = nowIso();
  const userMessageId = createSessionId();
  const assistantMessageId = createSessionId();
  const shouldRename = session.messages.length === 0 && session.title === "New chat";
  return {
    userMessageId,
    assistantMessageId,
    session: {
      ...session,
      title: shouldRename ? normalizeTitle(userText) : session.title,
      updated_at: created_at,
      // Attached files are one-shot composer state; the user message keeps the audit trail.
      attached_context: [],
      messages: [
        ...session.messages,
        {
          id: userMessageId,
          role: "user",
          content: userText,
          created_at,
          context_refs: contextRefs,
          summarized: false,
        },
        {
          id: assistantMessageId,
          role: "assistant",
          content: "",
          created_at,
          summarized: false,
        },
      ],
    },
  };
}

export function updateSessionMessageContent(
  session: AiSessionData,
  messageId: string,
  content: string,
): AiSessionData {
  return {
    ...session,
    updated_at: nowIso(),
    messages: session.messages.map((message) =>
      message.id === messageId ? { ...message, content } : message,
    ),
  };
}

export function removeEmptyAssistantMessage(
  session: AiSessionData,
  messageId: string,
): AiSessionData {
  return {
    ...session,
    updated_at: nowIso(),
    messages: session.messages.filter((message) => message.id !== messageId || message.content.trim()),
  };
}

export function toggleArticleContext(
  session: AiSessionData,
  relativePath: string,
): AiSessionData {
  const existing = session.attached_context.some((ref) => ref.path === relativePath);
  const attached_context = existing
    ? session.attached_context.filter((ref) => ref.path !== relativePath)
    : [
      ...session.attached_context,
      {
        type: "file" as const,
        path: relativePath,
        title: pathBasename(relativePath),
        added_at: nowIso(),
      },
    ];
  return {
    ...session,
    updated_at: nowIso(),
    attached_context,
  };
}

export function toggleArticleContextRef(
  session: AiSessionData,
  ref: AiArticleContextRef,
): AiSessionData {
  const existing = session.attached_context.some((item) => item.path === ref.path && item.type === ref.type);
  return {
    ...session,
    updated_at: nowIso(),
    attached_context: existing
      ? session.attached_context.filter((item) => item.path !== ref.path || item.type !== ref.type)
      : [...session.attached_context, ref],
  };
}

export function removeArticleContext(
  session: AiSessionData,
  relativePath: string,
): AiSessionData {
  return {
    ...session,
    updated_at: nowIso(),
    attached_context: session.attached_context.filter((ref) => ref.path !== relativePath),
  };
}
