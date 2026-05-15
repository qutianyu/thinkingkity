export const JSON_EXTENSION = "json";
export const JSONC_EXTENSION = "jsonc";

export const JSON_EXTENSIONS = [JSON_EXTENSION, JSONC_EXTENSION] as const;
export const JSON_DOT_EXTENSIONS = JSON_EXTENSIONS.map((ext) => `.${ext}` as const);
export const JSON_DISPLAY_TYPES = [...JSON_EXTENSIONS];
export const JSON_DEFAULT_CONTENT = "{\n  \n}\n";

export const JSON_DOC_TYPES = [
  { ext: JSON_EXTENSION, labelKey: "sidebar.newJson", titleKey: "dialog.newJsonTitle", descKey: "dialog.newJsonDescription" },
  { ext: JSONC_EXTENSION, labelKey: "sidebar.newJsonc", titleKey: "dialog.newJsoncTitle", descKey: "dialog.newJsoncDescription" },
];
export const JSON_DEFAULT_DOC_TYPE = JSON_DOC_TYPES[0];
export const JSON_FILE_TYPE = "json";

export const JSON_CODE_LANGUAGES = [JSON_EXTENSION, JSONC_EXTENSION];

export const JSON_MEMO_LANGUAGE_OPTIONS = [
  { value: JSON_EXTENSION, label: "JSON" },
  { value: JSONC_EXTENSION, label: "JSONC" },
];

export function isJsonExtension(ext: string): boolean {
  return JSON_EXTENSIONS.includes(ext.toLowerCase() as (typeof JSON_EXTENSIONS)[number]);
}

export function isJsonPath(path: string): boolean {
  const lower = path.toLowerCase();
  return JSON_DOT_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

export function isJsonLanguage(language: string): boolean {
  return isJsonExtension(language);
}

export function getJsonLanguage(path: string): string | null {
  const lower = path.toLowerCase();
  if (lower.endsWith(`.${JSONC_EXTENSION}`)) return JSONC_EXTENSION;
  if (lower.endsWith(`.${JSON_EXTENSION}`)) return JSON_EXTENSION;
  return null;
}

export function withJsonExtension(name: string, ext: string): string {
  return name.endsWith(`.${ext}`) ? name : `${name}.${ext}`;
}
