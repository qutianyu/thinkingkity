import { aiFetch } from "@/ai/http";
import type { AiKnowledgeToolResult } from "@/ai/toolTypes";
import type { AiBrowserToolProfile } from "@/ai/tools/toolPolicy";
import { invoke } from "@tauri-apps/api/core";

const MAX_EXTRACTED_CHARS = 60 * 1024;
const TOOL_TIMEOUT_MS = 15000;

function isPrivateIpv4(hostname: string): boolean {
  const parts = hostname.split(".").map((part) => Number(part));
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) {
    return false;
  }
  const [a, b] = parts;
  return a === 10
    || a === 127
    || (a === 172 && b >= 16 && b <= 31)
    || (a === 192 && b === 168)
    || (a === 169 && b === 254)
    || a === 0;
}

function isBlockedHostname(hostname: string): boolean {
  const lower = hostname.toLowerCase();
  if (lower === "localhost" || lower.endsWith(".localhost")) return true;
  if (lower === "::1" || lower.startsWith("fc") || lower.startsWith("fd") || lower.startsWith("fe80")) return true;
  return isPrivateIpv4(lower);
}

export function validatePublicHttpUrl(rawUrl: string): string {
  const url = new URL(rawUrl);
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("Only http and https URLs are allowed.");
  }
  if (url.username || url.password) {
    throw new Error("URLs with credentials are not allowed.");
  }
  if (isBlockedHostname(url.hostname)) {
    throw new Error("Local and private network URLs are not allowed.");
  }
  return url.toString();
}

function extractHtmlText(raw: string): { title?: string; text: string } {
  const doc = new DOMParser().parseFromString(raw, "text/html");
  doc.querySelectorAll("script, style, noscript, svg, canvas").forEach((node) => node.remove());
  const title = doc.querySelector("title")?.textContent?.replace(/\s+/g, " ").trim();
  const root = doc.querySelector("article") ?? doc.querySelector("main") ?? doc.body;
  const text = (root?.textContent ?? doc.documentElement.textContent ?? "")
    .replace(/\s+/g, " ")
    .trim();
  return { title, text };
}

export function extractReadableText(raw: string, contentType: string): { title?: string; text: string } {
  const lower = contentType.toLowerCase();
  if (lower.includes("application/json")) {
    try {
      return { text: JSON.stringify(JSON.parse(raw), null, 2) };
    } catch {
      return { text: raw.trim() };
    }
  }
  if (lower.includes("html")) {
    return extractHtmlText(raw);
  }
  return { text: raw.trim() };
}

export async function fetchUrlText(url: string): Promise<AiKnowledgeToolResult> {
  const safeUrl = validatePublicHttpUrl(url);
  const fetchedAt = new Date().toISOString();
  try {
    const res = await aiFetch(safeUrl, {
      method: "GET",
      headers: {
        Accept: "text/html,application/xhtml+xml,text/plain,application/json;q=0.9,*/*;q=0.8",
      },
      signal: AbortSignal.timeout(TOOL_TIMEOUT_MS),
    });
    if (!res.ok) {
      return {
        ok: false,
        tool: "fetch_url",
        source: safeUrl,
        error: `${res.status} ${res.statusText}`.trim(),
        fetched_at: fetchedAt,
      };
    }
    const contentType = res.headers.get("content-type") ?? "";
    const raw = await res.text();
    const extracted = extractReadableText(raw, contentType);
    return {
      ok: true,
      tool: "fetch_url",
      source: safeUrl,
      title: extracted.title,
      content: extracted.text.slice(0, MAX_EXTRACTED_CHARS),
      fetched_at: fetchedAt,
    };
  } catch (err) {
    return {
      ok: false,
      tool: "fetch_url",
      source: safeUrl,
      error: err instanceof Error ? err.message : "Fetch failed.",
      fetched_at: fetchedAt,
    };
  }
}

function isTauriRuntime(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

export async function browsePageWithPlaywright(url: string, browser?: AiBrowserToolProfile): Promise<AiKnowledgeToolResult> {
  const safeUrl = validatePublicHttpUrl(url);
  const fetchedAt = new Date().toISOString();
  if (!isTauriRuntime()) {
    return {
      ok: false,
      tool: "browse_page",
      source: safeUrl,
      error: "Playwright browsing is only available in the Tauri desktop app.",
      fetched_at: fetchedAt,
    };
  }
  try {
    const raw = await invoke<string>("browse_page_with_playwright", {
      url: safeUrl,
      options: browser ? JSON.stringify(browser) : undefined,
    });
    const parsed = JSON.parse(raw) as { ok: boolean; title?: string; content?: string; error?: string };
    return {
      ok: parsed.ok,
      tool: "browse_page",
      source: safeUrl,
      title: parsed.title,
      content: parsed.content?.slice(0, MAX_EXTRACTED_CHARS),
      error: parsed.error,
      fetched_at: fetchedAt,
    };
  } catch (err) {
    return {
      ok: false,
      tool: "browse_page",
      source: safeUrl,
      error: err instanceof Error ? err.message : String(err),
      fetched_at: fetchedAt,
    };
  }
}
