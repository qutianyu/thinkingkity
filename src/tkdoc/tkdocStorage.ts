import type { JSONContent } from "@tiptap/react";
import { createEmptyTkdoc, TKDOC_VERSION, type TkdocDocument } from "./types";

export interface ParsedTkdoc {
  document: TkdocDocument;
  error: string | null;
}

function isJsonContent(value: unknown): value is JSONContent {
  return Boolean(value && typeof value === "object" && (value as JSONContent).type === "doc");
}

export function parseTkdoc(raw: string): ParsedTkdoc {
  if (!raw.trim()) {
    return { document: createEmptyTkdoc(), error: null };
  }

  try {
    const parsed = JSON.parse(raw) as Partial<TkdocDocument>;
    if (
      parsed.type !== "tkdoc" ||
      typeof parsed.version !== "number" ||
      !isJsonContent(parsed.content)
    ) {
      return {
        document: createEmptyTkdoc(),
        error: "Invalid .tkdoc document structure.",
      };
    }

    if (parsed.version !== TKDOC_VERSION) {
      return {
        document: createEmptyTkdoc(),
        error: `Unsupported .tkdoc version: ${parsed.version}.`,
      };
    }

    return {
      document: parsed as TkdocDocument,
      error: null,
    };
  } catch {
    return {
      document: createEmptyTkdoc(),
      error: "Invalid .tkdoc JSON.",
    };
  }
}

export function serializeTkdoc(content: JSONContent): string {
  return `${JSON.stringify({
    version: TKDOC_VERSION,
    type: "tkdoc",
    content,
  }, null, 2)}\n`;
}

export const EMPTY_TKDOC_FILE = serializeTkdoc(createEmptyTkdoc().content);
