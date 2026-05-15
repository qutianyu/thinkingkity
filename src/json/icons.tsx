import { SiJson } from "@icons-pack/react-simple-icons";
import type { ComponentType, SVGProps } from "react";
import { JSON_DOT_EXTENSIONS } from "@/json";

interface JsonIconEntry {
  component: ComponentType<SVGProps<SVGSVGElement>>;
  color: string;
}

export const JSON_ICON_ENTRIES: Record<string, JsonIconEntry> = Object.fromEntries(
  JSON_DOT_EXTENSIONS.map((ext) => [ext, { component: SiJson, color: "#5B5B5B" }]),
) as Record<string, JsonIconEntry>;
