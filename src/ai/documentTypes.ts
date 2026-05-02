export interface AiDocumentDraftOptions {
  targetDirectory: string;
  fileName: string;
}

export interface AiDocumentDraft {
  title: string;
  markdown: string;
  suggestedFileName: string;
  sourceSessionId: string;
  contextFiles: string[];
}

export type AiDocumentWriteMode = "create";

export interface AiWriteMarkdownToolCall {
  tool: "write_markdown_document";
  relativePath: string;
  content: string;
  mode: AiDocumentWriteMode;
}

export interface AiWriteMarkdownToolResult {
  ok: boolean;
  relativePath?: string;
  error?: string;
  cancelled?: boolean;
}

export type DocumentGeneratorStatus = "idle" | "generating" | "ready" | "saving" | "error";
