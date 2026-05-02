import { writeVaultMarkdownFile } from "@/lib/tauriCommands";
import type { AiDocumentDraft, AiWriteMarkdownToolCall, AiWriteMarkdownToolResult } from "./documentTypes";

export function sanitizeMarkdownFileName(name: string): string {
  let cleaned = name
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, "")
    .replace(/\s+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  if (!cleaned.toLowerCase().endsWith(".md")) {
    cleaned += ".md";
  }
  return cleaned || "document.md";
}

export function buildDocumentRelativePath(directory: string, fileName: string): string {
  const dir = directory.trim().replace(/[/\\]+$/, "");
  const name = sanitizeMarkdownFileName(fileName);
  if (!dir) return name;
  return `${dir}/${name}`;
}

export function prepareWriteMarkdownToolCall(options: {
  draft: AiDocumentDraft;
  targetDirectory: string;
  fileName: string;
}): AiWriteMarkdownToolCall {
  const { draft, targetDirectory, fileName } = options;
  const relativePath = buildDocumentRelativePath(targetDirectory, fileName);
  return {
    tool: "write_markdown_document",
    relativePath,
    content: draft.markdown,
    mode: "create",
  };
}

export async function executeWriteMarkdownToolCall(options: {
  vaultPath: string;
  toolCall: AiWriteMarkdownToolCall;
}): Promise<AiWriteMarkdownToolResult> {
  const { vaultPath, toolCall } = options;
  try {
    const fullPath = await writeVaultMarkdownFile(vaultPath, toolCall.relativePath, toolCall.content);
    return { ok: true, relativePath: toolCall.relativePath };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    return { ok: false, error };
  }
}
