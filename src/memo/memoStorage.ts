import { createFolder, deleteFile, pathJoin, readFile, writeFile } from "@/lib/tauriCommands";
import { THINKINGKITY_DIR } from "@/lib/vaultConfig";
import type { MemoIndex, MemoItem, MemoType } from "./types";

const MEMO_DIR = "memo";
const INDEX_FILE = "index.json";
const EMPTY_INDEX: MemoIndex = { version: 1, items: [] };

function getMemoDir(vaultPath: string): string {
  return pathJoin(vaultPath, THINKINGKITY_DIR, MEMO_DIR);
}

function getMemoIndexPath(vaultPath: string): string {
  return pathJoin(getMemoDir(vaultPath), INDEX_FILE);
}

function getMemoFilePath(vaultPath: string, file: string): string {
  return pathJoin(getMemoDir(vaultPath), file);
}

function createMemoId(): string {
  const now = new Date();
  const pad = (value: number) => String(value).padStart(2, "0");
  const stamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  const random = Math.random().toString(16).slice(2, 6).padEnd(4, "0");
  return `m_${stamp}_${random}`;
}

function normalizeTimestamp(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Date.parse(value);
    if (Number.isFinite(parsed)) return parsed;
    const numeric = Number(value);
    if (Number.isFinite(numeric)) return numeric;
  }
  return Date.now();
}

function normalizeMemoIndex(value: unknown): MemoIndex {
  if (!value || typeof value !== "object") return EMPTY_INDEX;
  const raw = value as Partial<MemoIndex>;
  if (!Array.isArray(raw.items)) return EMPTY_INDEX;
  return {
    version: 1,
    items: raw.items
      .filter((item): item is MemoItem => {
        if (!item || typeof item !== "object") return false;
        const candidate = item as Partial<MemoItem>;
        return (
          typeof candidate.id === "string" &&
          typeof candidate.file === "string" &&
          (candidate.type === "note" || candidate.type === "code" || candidate.type === "todo")
        );
      })
      .map((item) => ({
        id: item.id,
        type: item.type,
        title: typeof item.title === "string" && item.title.trim() ? item.title : "Untitled",
        language: typeof item.language === "string" && item.language ? item.language : undefined,
        file: item.file,
        createdAt: normalizeTimestamp(item.createdAt),
        updatedAt: normalizeTimestamp(item.updatedAt),
        pinned: Boolean(item.pinned),
        archived: Boolean(item.archived),
        tags: Array.isArray(item.tags) ? item.tags.filter((tag): tag is string => typeof tag === "string") : [],
      })),
  };
}

export async function ensureMemoStorage(vaultPath: string): Promise<void> {
  try {
    await createFolder(pathJoin(vaultPath, THINKINGKITY_DIR));
  } catch {
    // Existing folders are fine.
  }
  try {
    await createFolder(getMemoDir(vaultPath));
  } catch {
    // Existing folders are fine.
  }
  try {
    await readFile(getMemoIndexPath(vaultPath));
  } catch {
    await writeFile(getMemoIndexPath(vaultPath), `${JSON.stringify(EMPTY_INDEX, null, 2)}\n`);
  }
}

export async function readMemoIndex(vaultPath: string): Promise<MemoIndex> {
  await ensureMemoStorage(vaultPath);
  try {
    return normalizeMemoIndex(JSON.parse(await readFile(getMemoIndexPath(vaultPath))));
  } catch {
    return EMPTY_INDEX;
  }
}

async function writeMemoIndex(vaultPath: string, index: MemoIndex): Promise<void> {
  await ensureMemoStorage(vaultPath);
  await writeFile(getMemoIndexPath(vaultPath), `${JSON.stringify(index, null, 2)}\n`);
}

function getDefaultTitle(type: MemoType, content: string): string {
  const firstLine = content.split(/\r?\n/).map((line) => line.trim()).find(Boolean);
  if (firstLine) return firstLine.slice(0, 40);
  if (type === "code") return "代码块";
  if (type === "todo") return "待办事项";
  return "便签";
}

export async function createMemo(
  vaultPath: string,
  input: { type: MemoType; content: string; title?: string; language?: string },
): Promise<MemoItem> {
  const index = await readMemoIndex(vaultPath);
  const id = createMemoId();
  const now = Date.now();
  const item: MemoItem = {
    id,
    type: input.type,
    title: input.title?.trim() || getDefaultTitle(input.type, input.content),
    language: input.type === "code" ? input.language || "typescript" : undefined,
    file: `${id}.txt`,
    createdAt: now,
    updatedAt: now,
    pinned: false,
    archived: false,
    tags: [],
  };
  await writeFile(getMemoFilePath(vaultPath, item.file), input.content);
  await writeMemoIndex(vaultPath, { version: 1, items: [item, ...index.items] });
  return item;
}

export async function readMemoContent(vaultPath: string, item: MemoItem): Promise<string> {
  return readFile(getMemoFilePath(vaultPath, item.file));
}

export async function updateMemo(
  vaultPath: string,
  id: string,
  patch: Partial<Pick<MemoItem, "title" | "type" | "language" | "pinned" | "archived" | "tags">> & { content?: string },
): Promise<MemoItem | null> {
  const index = await readMemoIndex(vaultPath);
  const current = index.items.find((item) => item.id === id);
  if (!current) return null;
  const next: MemoItem = {
    ...current,
    ...patch,
    title: patch.title !== undefined ? patch.title.trim() || current.title : current.title,
    updatedAt: Date.now(),
  };
  if (patch.content !== undefined) {
    await writeFile(getMemoFilePath(vaultPath, current.file), patch.content);
  }
  await writeMemoIndex(vaultPath, {
    version: 1,
    items: index.items.map((item) => (item.id === id ? next : item)),
  });
  return next;
}

export async function deleteMemo(vaultPath: string, id: string): Promise<void> {
  const index = await readMemoIndex(vaultPath);
  const current = index.items.find((item) => item.id === id);
  if (!current) return;
  try {
    await deleteFile(getMemoFilePath(vaultPath, current.file));
  } catch {
    // Keep deleting the index entry even if the content file is already gone.
  }
  await writeMemoIndex(vaultPath, {
    version: 1,
    items: index.items.filter((item) => item.id !== id),
  });
}
