import type { ArticleId, LinkIndex, WikiLink } from "./types";

/**
 * Resolve a wiki link target to a specific ArticleId.
 *
 * Resolution order:
 * 1. Exact match on absolute file path
 * 2. Match as vault-relative path (target joined with vaultPath)
 * 3. Match with .md / .markdown extension
 * 4. Look up in aliases reverse index
 * 5. Same-directory priority for ambiguous matches
 * 6. Fall back to ambiguous if multiple matches remain
 */
export function resolveTarget(
  target: string,
  sourcePath: ArticleId,
  index: LinkIndex,
): { resolvedPath?: ArticleId; status: "resolved" | "unresolved" | "ambiguous" } {
  // empty target = self-reference ([[#heading]])
  if (!target) {
    return { resolvedPath: sourcePath, status: "resolved" };
  }

  const vaultPath = index.vaultPath;

  // 1. Exact absolute path match (index keys are absolute paths)
  if (index.files[target]) {
    return { resolvedPath: target, status: "resolved" };
  }

  // 2. Try as vault-relative path → construct absolute path
  const sep = vaultPath.includes("\\") ? "\\" : "/";
  const absTarget = `${vaultPath}${sep}${target}`;
  if (index.files[absTarget]) {
    return { resolvedPath: absTarget, status: "resolved" };
  }

  // 3. Try with .md / .markdown extension (absolute + relative variants)
  for (const ext of [".md", ".markdown"]) {
    const t = target.endsWith(ext) ? target : `${target}${ext}`;
    if (index.files[t]) return { resolvedPath: t, status: "resolved" };
    const absT = target.endsWith(ext) ? absTarget : `${absTarget}${ext}`;
    if (index.files[absT]) return { resolvedPath: absT, status: "resolved" };
  }

  // 4. Look up in aliases
  const aliasPaths = index.aliases[target.toLowerCase()];
  if (!aliasPaths || aliasPaths.length === 0) {
    return { status: "unresolved" };
  }

  if (aliasPaths.length === 1) {
    return { resolvedPath: aliasPaths[0], status: "resolved" };
  }

  // 5. Multiple matches — prefer same directory
  const sourceDir = getDir(sourcePath);
  const sameDirMatches = aliasPaths.filter((p) => getDir(p) === sourceDir);
  if (sameDirMatches.length === 1) {
    return { resolvedPath: sameDirMatches[0], status: "resolved" };
  }

  // 6. Still ambiguous
  return { status: "ambiguous" };
}

/**
 * Resolve all wiki links in a file against the index.
 */
export function resolveFileLinks(
  sourcePath: ArticleId,
  links: WikiLink[],
  index: LinkIndex,
): WikiLink[] {
  return links.map((link) => {
    const resolved = resolveTarget(link.target, sourcePath, index);
    return {
      ...link,
      resolvedPath: resolved.resolvedPath,
      status: resolved.status,
    };
  });
}

function getDir(path: string): string {
  const lastSep = Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\"));
  return lastSep > 0 ? path.slice(0, lastSep) : "";
}
