import {
  SiOpenjdk,
  SiPython,
  SiTypescript,
  SiJavascript,
  SiGo,
  SiRust,
  SiC,
  SiCplusplus,
  SiHtml5,
  SiCss,
  SiSass,
  SiLess,
  SiXml,
  SiMysql,
  SiGnubash,
  SiJson,
  SiMarkdown,
} from "@icons-pack/react-simple-icons";

import type { ComponentType, SVGProps } from "react";

interface IconEntry {
  component: ComponentType<SVGProps<SVGSVGElement>>;
  color: string;
}

const EXT_ICON_MAP: Record<string, IconEntry> = {
  ".java": { component: SiOpenjdk, color: "#ED8B00" },
  ".py": { component: SiPython, color: "#3776AB" },
  ".ts": { component: SiTypescript, color: "#3178C6" },
  ".tsx": { component: SiTypescript, color: "#3178C6" },
  ".js": { component: SiJavascript, color: "#F7DF1E" },
  ".jsx": { component: SiJavascript, color: "#F7DF1E" },
  ".go": { component: SiGo, color: "#00ADD8" },
  ".rs": { component: SiRust, color: "#DEA584" },
  ".c": { component: SiC, color: "#A8B9CC" },
  ".h": { component: SiC, color: "#A8B9CC" },
  ".cpp": { component: SiCplusplus, color: "#00599C" },
  ".hpp": { component: SiCplusplus, color: "#00599C" },
  ".html": { component: SiHtml5, color: "#E34F26" },
  ".htm": { component: SiHtml5, color: "#E34F26" },
  ".css": { component: SiCss, color: "#1572B6" },
  ".scss": { component: SiSass, color: "#CC6699" },
  ".less": { component: SiLess, color: "#1D365D" },
  ".xml": { component: SiXml, color: "#AE007F" },
  ".sql": { component: SiMysql, color: "#4479A1" },
  ".sh": { component: SiGnubash, color: "#4EAA25" },
  ".bash": { component: SiGnubash, color: "#4EAA25" },
  ".zsh": { component: SiGnubash, color: "#4EAA25" },
  ".json": { component: SiJson, color: "#5B5B5B" },
  ".md": { component: SiMarkdown, color: "#083FA1" },
  ".mdx": { component: SiMarkdown, color: "#083FA1" },
};

export function getIconEntry(path: string): IconEntry | null {
  const lower = path.toLowerCase();
  for (const [ext, entry] of Object.entries(EXT_ICON_MAP)) {
    if (lower.endsWith(ext)) return entry;
  }
  return null;
}

export function getIconEntryForExt(ext: string): IconEntry | null {
  return EXT_ICON_MAP[`.${ext}`] ?? null;
}