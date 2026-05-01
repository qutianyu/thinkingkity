import type { AiChatMessage } from "./types";

export interface AiArticleContextRef {
  type: "file";
  path: string;
  title: string;
  added_at?: string;
}

// Persisted chat message. User messages may carry the one-shot files submitted with that turn.
export interface AiSessionMessage extends AiChatMessage {
  role: "user" | "assistant";
  created_at: string;
  context_refs?: AiArticleContextRef[];
  summarized?: boolean;
}

// Full on-disk session state, including the composer-level pending context queue.
export interface AiSessionData {
  version: 1;
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
  messages: AiSessionMessage[];
  attached_context: AiArticleContextRef[];
}

export interface AiSessionSummary {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
  message_count: number;
  memory_updated_at?: string;
  last_summarized_message_id?: string;
}

// Lightweight index file used to switch sessions without reading every session body.
export interface AiSessionManagerData {
  version: 1;
  active_session_id: string;
  sessions: AiSessionSummary[];
}

export interface LoadedAiSessions {
  manager: AiSessionManagerData;
  activeSession: AiSessionData;
  memory: string;
}
