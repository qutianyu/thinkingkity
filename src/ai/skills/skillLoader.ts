import { pathJoin, readDirectory, readFile } from "@/lib/tauriCommands";
import { THINKINGKITY_DIR } from "@/lib/vaultConfig";
import type { AiToolDefinition } from "../tools/toolRegistry";
import type { AiSkill, AiSkillIndexItem } from "./skillTypes";

const SKILL_DIR = "skill";
const SKILL_FILE = "SKILL.md";
const MAX_SKILL_CHARS = 10 * 1024;

function parseScalar(value: string): string {
  return value.trim().replace(/^["']|["']$/g, "");
}

function parseFrontmatter(raw: string): { attrs: Record<string, unknown>; body: string } | null {
  if (!raw.startsWith("---")) return null;
  const end = raw.indexOf("\n---", 3);
  if (end < 0) return null;
  const yaml = raw.slice(3, end).trim().split(/\r?\n/);
  const body = raw.slice(end + 4).trim();
  const attrs: Record<string, unknown> = {};
  let currentListKey = "";
  for (const line of yaml) {
    const listItem = line.match(/^\s*-\s+(.+)$/);
    if (listItem && currentListKey) {
      const list = Array.isArray(attrs[currentListKey]) ? attrs[currentListKey] as string[] : [];
      list.push(parseScalar(listItem[1]));
      attrs[currentListKey] = list;
      continue;
    }
    const pair = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (!pair) continue;
    const key = pair[1];
    const value = pair[2];
    currentListKey = "";
    if (!value.trim()) {
      attrs[key] = [];
      currentListKey = key;
    } else if (value.trim() === "true" || value.trim() === "false") {
      attrs[key] = value.trim() === "true";
    } else if (/^-?\d+$/.test(value.trim())) {
      attrs[key] = Number(value.trim());
    } else if (value.trim().startsWith("[") && value.trim().endsWith("]")) {
      attrs[key] = value.trim().slice(1, -1).split(",").map((item) => parseScalar(item)).filter(Boolean);
    } else {
      attrs[key] = parseScalar(value);
    }
  }
  return { attrs, body };
}

function normalizeName(name: unknown): string {
  return typeof name === "string" && /^[a-z0-9][a-z0-9-]{0,63}$/.test(name) ? name : "";
}

function normalizeAllowedTools(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
}

function getSkillRoot(vaultPath: string): string {
  return pathJoin(vaultPath, THINKINGKITY_DIR, SKILL_DIR);
}

function toKnownToolSet(tools: AiToolDefinition[]): Set<string> {
  return new Set(tools.filter((tool) => tool.enabled).map((tool) => tool.name));
}

export async function loadSkillIndex(
  vaultPath: string,
  tools: AiToolDefinition[],
): Promise<AiSkillIndexItem[]> {
  const root = getSkillRoot(vaultPath);
  let entries;
  try {
    entries = await readDirectory(root);
  } catch {
    return [];
  }
  const knownTools = toKnownToolSet(tools);
  const skills: AiSkillIndexItem[] = [];
  const seen = new Set<string>();
  for (const entry of entries) {
    if (!entry.is_dir) continue;
    try {
      const skillPath = pathJoin(entry.path, SKILL_FILE);
      const parsed = parseFrontmatter(await readFile(skillPath));
      if (!parsed) continue;
      if (parsed.attrs.enabled === false) continue;
      const name = normalizeName(parsed.attrs.name);
      const description = typeof parsed.attrs.description === "string" ? parsed.attrs.description.trim() : "";
      if (!name || !description || seen.has(name)) continue;
      const allowedTools = normalizeAllowedTools(parsed.attrs["allowed-tools"] ?? parsed.attrs.tools)
        .filter((tool) => knownTools.has(tool));
      skills.push({
        name,
        description,
        path: skillPath,
        allowedTools,
        priority: typeof parsed.attrs.priority === "number" ? parsed.attrs.priority : 0,
      });
      seen.add(name);
    } catch {
      // Bad skills are skipped so one corrupt SKILL.md cannot break AI.
    }
  }
  return skills.sort((a, b) => b.priority - a.priority || a.name.localeCompare(b.name));
}

export async function loadFullSkills(
  _vaultPath: string,
  names: string[],
  index: AiSkillIndexItem[],
): Promise<AiSkill[]> {
  const wanted = new Set(names);
  const selected = index.filter((item) => wanted.has(item.name)).slice(0, 3);
  const result: AiSkill[] = [];
  for (const item of selected) {
    try {
      const parsed = parseFrontmatter(await readFile(item.path));
      if (!parsed) continue;
      const truncated = parsed.body.length > MAX_SKILL_CHARS;
      result.push({
        index: item,
        body: truncated ? `${parsed.body.slice(0, MAX_SKILL_CHARS)}\n\n...[skill truncated]...` : parsed.body,
        truncated,
      });
    } catch {
      // Skill disappeared between index and load; skip it and let replan continue.
    }
  }
  return result;
}

