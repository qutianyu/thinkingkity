import { json } from "@codemirror/lang-json";
import { javascript } from "@codemirror/lang-javascript";
import type { Extension } from "@codemirror/state";
import { JSON_EXTENSION, JSONC_EXTENSION } from "@/json";

export function jsonLanguageExtension(language: string): Extension | null {
  if (language === JSON_EXTENSION) return json();
  if (language === JSONC_EXTENSION) return javascript();
  return null;
}
