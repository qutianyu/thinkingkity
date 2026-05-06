// ── Article identity ──────────────────────────────────────────────
export type ArticleId = string; // vault-relative path, e.g. "notes/project-plan.md"

// ── Wiki link ─────────────────────────────────────────────────────
export interface WikiLink {
  raw: string; // original text "[[note|alias]]"
  target: string; // parsed target "note"
  alias?: string;
  heading?: string;
  resolvedPath?: ArticleId;
  status: "resolved" | "unresolved" | "ambiguous";
  position?: { line: number; column: number };
}

// ── Article metadata ──────────────────────────────────────────────
export interface LinkHeading {
  text: string;
  level: number;
  slug: string;
  line: number;
}

export interface LinkFileEntry {
  path: ArticleId;
  title: string;
  aliases: string[];
  headings: LinkHeading[];
  outgoing: WikiLink[];
  backlinks: BacklinkRef[];
  mtimeMs: number;
  size: number;
}

export interface BacklinkRef {
  sourcePath: ArticleId;
  raw: string;
  alias?: string;
  heading?: string;
  line: number;
  preview: string;
}

// ── Index ─────────────────────────────────────────────────────────
export interface LinkIndex {
  version: 1;
  vaultPath: string;
  updatedAt: number;
  files: Record<ArticleId, LinkFileEntry>;
  aliases: Record<string, ArticleId[]>; // alias/title → paths
}
