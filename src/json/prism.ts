import json5 from "refractor/json5";
import { JSONC_EXTENSION } from "@/json";

export function configureJsonRefractor(refractor: any): void {
  if (!refractor.registered("json5")) refractor.register(json5);
}

export function normalizeJsonPrismLanguage(language: any): any {
  return language === JSONC_EXTENSION ? "json5" : language;
}
