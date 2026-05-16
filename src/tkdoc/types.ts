import type { JSONContent } from "@tiptap/react";

export const TKDOC_VERSION = 1;

export interface TkdocDocument {
  version: number;
  type: "tkdoc";
  content: JSONContent;
}

export const EMPTY_TKDOC_CONTENT: JSONContent = {
  type: "doc",
  content: [{ type: "paragraph" }],
};

export function createEmptyTkdoc(): TkdocDocument {
  return {
    version: TKDOC_VERSION,
    type: "tkdoc",
    content: EMPTY_TKDOC_CONTENT,
  };
}
