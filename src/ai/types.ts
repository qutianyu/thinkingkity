export type AiChatRole = "system" | "user" | "assistant";

export interface AiChatMessage {
  id: string;
  role: AiChatRole;
  content: string;
  created_at?: string;
}

export interface AiChatRequest {
  messages: AiChatMessage[];
  onToken: (token: string) => void;
  onThinking?: (token: string) => void;
  signal?: AbortSignal;
  source?: string;
}
