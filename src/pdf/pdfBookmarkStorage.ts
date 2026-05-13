import { createFolder, pathJoin, readFile, writeFile } from "@/lib/tauriCommands";
import { THINKINGKITY_DIR } from "@/lib/vaultConfig";

export interface PdfBookmark {
  id: string;
  title: string;
  page: number;
  createdAt: number;
}

interface PdfBookmarkFile {
  version: 1;
  filePath: string;
  bookmarks: PdfBookmark[];
}

const PDF_DIR = "pdf";

function getPdfDir(vaultPath: string): string {
  return pathJoin(vaultPath, THINKINGKITY_DIR, PDF_DIR);
}

function hashFilePath(filePath: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < filePath.length; i++) {
    hash ^= filePath.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function getFileStem(filePath: string): string {
  const base = filePath.replace(/[/\\]$/, "").split(/[/\\]/).pop() || "document";
  return base.replace(/\.pdf$/i, "").replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 72) || "document";
}

function getPdfBookmarkPath(vaultPath: string, filePath: string): string {
  return pathJoin(getPdfDir(vaultPath), `${getFileStem(filePath)}-${hashFilePath(filePath)}.json`);
}

function createBookmarkId(): string {
  return `pdf_${Date.now().toString(36)}_${Math.random().toString(16).slice(2, 8)}`;
}

function normalizeBookmark(value: unknown): PdfBookmark | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Partial<PdfBookmark>;
  const page = Number(raw.page);
  if (!Number.isInteger(page) || page < 1) return null;
  return {
    id: typeof raw.id === "string" && raw.id ? raw.id : createBookmarkId(),
    title: typeof raw.title === "string" && raw.title.trim() ? raw.title.trim() : `第 ${page} 页`,
    page,
    createdAt: typeof raw.createdAt === "number" && Number.isFinite(raw.createdAt) ? raw.createdAt : Date.now(),
  };
}

function normalizeBookmarkFile(value: unknown, filePath: string): PdfBookmarkFile {
  if (!value || typeof value !== "object") {
    return { version: 1, filePath, bookmarks: [] };
  }
  const raw = value as Partial<PdfBookmarkFile>;
  return {
    version: 1,
    filePath,
    bookmarks: Array.isArray(raw.bookmarks)
      ? raw.bookmarks.map(normalizeBookmark).filter((item): item is PdfBookmark => Boolean(item))
      : [],
  };
}

async function ensurePdfBookmarkStorage(vaultPath: string): Promise<void> {
  try {
    await createFolder(pathJoin(vaultPath, THINKINGKITY_DIR));
  } catch {
    // Existing folders are fine.
  }
  try {
    await createFolder(getPdfDir(vaultPath));
  } catch {
    // Existing folders are fine.
  }
}

async function writePdfBookmarkFile(vaultPath: string, filePath: string, data: PdfBookmarkFile): Promise<void> {
  await ensurePdfBookmarkStorage(vaultPath);
  await writeFile(getPdfBookmarkPath(vaultPath, filePath), `${JSON.stringify(data, null, 2)}\n`);
}

export async function readPdfBookmarks(vaultPath: string, filePath: string): Promise<PdfBookmark[]> {
  await ensurePdfBookmarkStorage(vaultPath);
  try {
    const data = normalizeBookmarkFile(JSON.parse(await readFile(getPdfBookmarkPath(vaultPath, filePath))), filePath);
    return data.bookmarks;
  } catch {
    return [];
  }
}

export async function addPdfBookmark(
  vaultPath: string,
  filePath: string,
  input: { page: number; title?: string },
): Promise<PdfBookmark[]> {
  const current = await readPdfBookmarks(vaultPath, filePath);
  const page = Math.max(1, Math.floor(input.page));
  const bookmark: PdfBookmark = {
    id: createBookmarkId(),
    page,
    title: input.title?.trim() || `第 ${page} 页`,
    createdAt: Date.now(),
  };
  const next = [...current, bookmark].sort((a, b) => a.page - b.page || a.createdAt - b.createdAt);
  await writePdfBookmarkFile(vaultPath, filePath, { version: 1, filePath, bookmarks: next });
  return next;
}

export async function deletePdfBookmark(vaultPath: string, filePath: string, id: string): Promise<PdfBookmark[]> {
  const next = (await readPdfBookmarks(vaultPath, filePath)).filter((bookmark) => bookmark.id !== id);
  await writePdfBookmarkFile(vaultPath, filePath, { version: 1, filePath, bookmarks: next });
  return next;
}
