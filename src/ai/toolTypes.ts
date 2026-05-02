export interface AiFetchUrlToolCall {
  tool: "fetch_url";
  url: string;
  purpose: string;
}

export interface AiBrowsePageToolCall {
  tool: "browse_page";
  url: string;
  purpose: string;
}

export type AiKnowledgeToolCall = AiFetchUrlToolCall | AiBrowsePageToolCall;

export interface AiKnowledgeToolResult {
  ok: boolean;
  tool: AiKnowledgeToolCall["tool"];
  source: string;
  title?: string;
  content?: string;
  error?: string;
  fetched_at: string;
}
