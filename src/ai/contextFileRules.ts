import { CODE_TYPES, DOC_TYPES } from "@/lib/codeTypes";
import { isImageFile, isPdfFile } from "@/lib/tauriCommands";

const EXTRA_CONTEXT_EXTENSIONS = [".md", ".markdown", ".log"];
const CONTEXT_EXTENSIONS = Array.from(new Set([
  ...DOC_TYPES.map((type) => `.${type.ext}`),
  ...CODE_TYPES.flatMap((type) => type.exts.map((ext) => `.${ext}`)),
  ...EXTRA_CONTEXT_EXTENSIONS,
]));

const SKIPPED_DIRECTORY_NAMES = new Set([
  ".git",
  ".thinkingkity",
  "dist",
  "node_modules",
  "target",
]);

export function canUseAsAiTextContext(path: string): boolean {
  if (isImageFile(path) || isPdfFile(path)) return false;
  const lower = path.toLowerCase();
  return CONTEXT_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

export function shouldSkipAiContextDirectory(name: string): boolean {
  return SKIPPED_DIRECTORY_NAMES.has(name);
}
