import {
  createFolder,
  deleteFile,
  pathBasename,
  pathJoin,
  readFile,
  renameFile,
  writeFile,
} from "@/lib/tauriCommands";
import { THINKINGKITY_DIR } from "@/lib/vaultConfig";
import type {
  AiArticleContextRef,
  AiSessionData,
  AiSessionManagerData,
  AiSessionSummary,
} from "./sessionTypes";

const SESSIONS_DIR = "sessions";
const SESSION_MANAGER_FILE = "session-manager.json";

function nowIso(): string {
  return new Date().toISOString();
}

export function createSessionId(): string {
  return crypto.randomUUID();
}

export function getSessionsDir(vaultPath: string): string {
  return pathJoin(vaultPath, THINKINGKITY_DIR, SESSIONS_DIR);
}

export function getSessionManagerPath(vaultPath: string): string {
  return pathJoin(getSessionsDir(vaultPath), SESSION_MANAGER_FILE);
}

export function getSessionPath(vaultPath: string, sessionId: string): string {
  return pathJoin(getSessionsDir(vaultPath), `${sessionId}.json`);
}

export function getSessionMemoryPath(vaultPath: string, sessionId: string): string {
  return pathJoin(getSessionsDir(vaultPath), `${sessionId}-memory.md`);
}

export async function ensureSessionsDir(vaultPath: string): Promise<void> {
  await createFolder(getSessionsDir(vaultPath));
}

export function createEmptySession(id = createSessionId()): AiSessionData {
  const created_at = nowIso();
  return {
    version: 1,
    id,
    title: "New chat",
    created_at,
    updated_at: created_at,
    messages: [],
    attached_context: [],
  };
}

export function toSessionSummary(
  session: AiSessionData,
  previous?: Partial<AiSessionSummary>,
): AiSessionSummary {
  return {
    id: session.id,
    title: session.title,
    created_at: session.created_at,
    updated_at: session.updated_at,
    message_count: session.messages.length,
    memory_updated_at: previous?.memory_updated_at,
    last_summarized_message_id: previous?.last_summarized_message_id,
  };
}

function isSessionData(value: unknown): value is AiSessionData {
  if (!value || typeof value !== "object") return false;
  const data = value as Partial<AiSessionData>;
  return data.version === 1
    && typeof data.id === "string"
    && typeof data.title === "string"
    && Array.isArray(data.messages)
    && Array.isArray(data.attached_context);
}

function normalizeArticleRef(value: unknown): AiArticleContextRef | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Partial<AiArticleContextRef>;
  if (raw.type === "file" && typeof raw.path === "string" && raw.path) {
    return {
      type: "file",
      path: raw.path,
      title: typeof raw.title === "string" && raw.title ? raw.title : pathBasename(raw.path),
      added_at: typeof raw.added_at === "string" ? raw.added_at : undefined,
    };
  }
  if (raw.type === "directory" && typeof raw.path === "string" && raw.path) {
    return {
      type: "directory",
      path: raw.path,
      title: typeof raw.title === "string" && raw.title ? raw.title : pathBasename(raw.path),
      recursive: raw.recursive !== false,
      added_at: typeof raw.added_at === "string" ? raw.added_at : undefined,
    };
  }
  return null;
}

function normalizeSessionData(value: unknown, fallback: AiSessionData): AiSessionData {
  // Session files may come from older app versions or manual edits; coerce conservatively.
  if (!isSessionData(value)) return fallback;
  return {
    version: 1,
    id: value.id,
    title: value.title || "New chat",
    created_at: typeof value.created_at === "string" ? value.created_at : fallback.created_at,
    updated_at: typeof value.updated_at === "string" ? value.updated_at : fallback.updated_at,
    messages: value.messages
      .filter((message) =>
        message
        && (message.role === "user" || message.role === "assistant")
        && typeof message.content === "string",
      )
      .map((message) => ({
        id: typeof message.id === "string" && message.id ? message.id : createSessionId(),
        role: message.role,
        content: message.content,
        created_at: typeof message.created_at === "string" ? message.created_at : nowIso(),
        context_refs: Array.isArray(message.context_refs)
          ? message.context_refs.map(normalizeArticleRef).filter((ref): ref is AiArticleContextRef => Boolean(ref))
          : undefined,
        summarized: Boolean(message.summarized),
      })),
    attached_context: value.attached_context
      .map(normalizeArticleRef)
      .filter((ref): ref is AiArticleContextRef => Boolean(ref)),
  };
}

function normalizeManager(value: unknown, fallback: AiSessionManagerData): AiSessionManagerData {
  if (!value || typeof value !== "object") return fallback;
  const raw = value as Partial<AiSessionManagerData>;
  const sessions = Array.isArray(raw.sessions)
    ? raw.sessions.filter((session): session is AiSessionSummary =>
      Boolean(session)
      && typeof session.id === "string"
      && typeof session.title === "string"
      && typeof session.created_at === "string"
      && typeof session.updated_at === "string",
    )
    : fallback.sessions;
  const active_session_id = typeof raw.active_session_id === "string" && sessions.some((s) => s.id === raw.active_session_id)
    ? raw.active_session_id
    : sessions[0]?.id ?? fallback.active_session_id;
  return {
    version: 1,
    active_session_id,
    sessions,
  };
}

async function readJson<T>(
  path: string,
  normalize: (value: unknown) => T,
  fallback: T,
): Promise<T> {
  try {
    return normalize(JSON.parse(await readFile(path)));
  } catch {
    // Corrupt or missing metadata should not prevent the vault from opening.
    return fallback;
  }
}

export async function readSessionManager(
  vaultPath: string,
  fallback: AiSessionManagerData,
): Promise<AiSessionManagerData> {
  return readJson(
    getSessionManagerPath(vaultPath),
    (value) => normalizeManager(value, fallback),
    fallback,
  );
}

export async function writeSessionManager(
  vaultPath: string,
  manager: AiSessionManagerData,
): Promise<void> {
  await ensureSessionsDir(vaultPath);
  await writeFile(getSessionManagerPath(vaultPath), JSON.stringify(manager, null, 2));
}

export async function readSession(
  vaultPath: string,
  sessionId: string,
): Promise<AiSessionData> {
  const fallback = createEmptySession(sessionId);
  return readJson(
    getSessionPath(vaultPath, sessionId),
    (value) => normalizeSessionData(value, fallback),
    fallback,
  );
}

export async function writeSession(
  vaultPath: string,
  session: AiSessionData,
): Promise<void> {
  await ensureSessionsDir(vaultPath);
  await writeFile(getSessionPath(vaultPath, session.id), JSON.stringify(session, null, 2));
}

export async function readSessionMemory(
  vaultPath: string,
  sessionId: string,
): Promise<string> {
  try {
    return await readFile(getSessionMemoryPath(vaultPath, sessionId));
  } catch {
    // Memory is an optimization layer; missing memory should behave like an empty summary.
    return "";
  }
}

export async function writeSessionMemory(
  vaultPath: string,
  sessionId: string,
  memory: string,
): Promise<void> {
  await ensureSessionsDir(vaultPath);
  await writeFile(getSessionMemoryPath(vaultPath, sessionId), memory);
}

export async function deleteSessionFiles(vaultPath: string, sessionId: string): Promise<void> {
  // A partially missing session should still count as deleted from the UI perspective.
  await Promise.allSettled([
    deleteFile(getSessionPath(vaultPath, sessionId)),
    deleteFile(getSessionMemoryPath(vaultPath, sessionId)),
  ]);
}

export async function preserveCorruptSession(
  vaultPath: string,
  sessionId: string,
): Promise<void> {
  // Keep unreadable session JSON for manual recovery instead of overwriting it.
  const source = getSessionPath(vaultPath, sessionId);
  const target = pathJoin(
    getSessionsDir(vaultPath),
    `${sessionId}.corrupt.${Date.now()}.json`,
  );
  await renameFile(source, target);
}
