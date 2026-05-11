import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import {
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
  FileText,
  Hash,
  LoaderCircle,
  Plus,
} from "lucide-react";
import MarkdownIt from "markdown-it";
import { readFile } from "@/lib/tauriCommands";
import { useEditorStore } from "@/stores/editorStore";

interface HoverInfo {
  raw: string;
  target: string;
  alias?: string;
  heading?: string;
  resolvedPath?: string;
  status: "resolved" | "unresolved" | "ambiguous" | "loading";
  rect: DOMRect;
}

interface PreviewData {
  title: string;
  snippetHtml: string;
  lineCount: number;
  headings: string[];
}

const PREVIEW_LINES = 8;
const MAX_HEADINGS = 5;

const md = MarkdownIt("default", { html: false, linkify: false, typographer: false });

function extractBody(content: string): { body: string; startLine: number } {
  const match = content.match(/^---\r?\n[\s\S]*?\r?\n---(?:[ \t]*\r?\n)?/);
  if (!match) return { body: content, startLine: 0 };
  return { body: content.slice(match[0].length), startLine: match[0].split("\n").length };
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9一-龥]+/g, "-")
    .replace(/^-|-$/g, "") || "heading";
}

function extractPreview(content: string, heading?: string): PreviewData | null {
  const lines = content.split("\n");
  let title = "";
  let startLine = 0;
  const headings: string[] = [];

  const fmMatch = content.match(/^---\r?\n[\s\S]*?\r?\n---/);
  if (fmMatch) {
    const fmText = fmMatch[0];
    const titleMatch = fmText.match(/^title:\s*(.+)$/m);
    if (titleMatch) title = titleMatch[1].trim();
    startLine = fmText.split("\n").length;
  }

  for (let i = 0; i < lines.length; i++) {
    const headingMatch = lines[i].match(/^#{1,6}\s+(.+)$/);
    if (headingMatch && headings.length < MAX_HEADINGS) {
      headings.push(headingMatch[1].replace(/[#*_`[\]()]/g, "").trim());
    }
  }

  let contentStartLine = startLine;
  if (heading) {
    const targetSlug = slugify(heading);
    for (let i = 0; i < lines.length; i++) {
      const headingMatch = lines[i].match(/^#{1,6}\s+(.+)$/);
      if (headingMatch) {
        const hSlug = slugify(headingMatch[1].replace(/[#*_`[\]()]/g, "").trim());
        if (hSlug === targetSlug) {
          contentStartLine = i;
          break;
        }
      }
    }
  }

  let snippetLines: string[] = [];
  let linesToRead = 0;
  for (let i = contentStartLine; i < lines.length && linesToRead < PREVIEW_LINES; i++) {
    const line = lines[i];
    if (!line.trim()) continue;
    snippetLines.push(line);
    linesToRead++;
  }

  if (!title) {
    const { body } = extractBody(content);
    const firstLine = body.split("\n").find((l) => l.trim() && !l.trim().startsWith("---"));
    if (firstLine) {
      const h1 = firstLine.match(/^#\s+(.+)$/);
      title = h1 ? h1[1].replace(/[#*_`[\]()]/g, "").trim() : firstLine.trim().slice(0, 60);
    }
  }

  const snippet = snippetLines.join("\n");
  const snippetHtml = md.render(snippet);

  return {
    title: title || "Untitled",
    snippetHtml,
    lineCount: lines.length,
    headings,
  };
}

function getTargetDisplay(info: HoverInfo): string {
  if (info.alias) return info.alias;
  if (info.heading) return `${info.target}#${info.heading}`;
  return info.target;
}

export function LinkHoverPreview() {
  const { t } = useTranslation();
  const [hoverInfo, setHoverInfo] = useState<HoverInfo | null>(null);
  const [preview, setPreview] = useState<PreviewData | null>(null);
  const [loading, setLoading] = useState(false);
  const [position, setPosition] = useState<{ top: number; left: number }>({ top: 0, left: 0 });
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isHoveringCardRef = useRef(false);
  const cardRef = useRef<HTMLDivElement>(null);

  const statusInfo = useMemo(() => {
    if (!hoverInfo) return null;
    if (loading || hoverInfo.status === "loading") {
      return {
        className: "link-hover-preview-status--loading",
        icon: <LoaderCircle size={12} strokeWidth={2.2} />,
        text: t("hoverPreview.loading"),
      };
    }
    if (hoverInfo.status === "resolved") {
      return {
        className: "link-hover-preview-status",
        icon: <CheckCircle2 size={12} strokeWidth={2.2} />,
        text: t("hoverPreview.resolved"),
      };
    }
    if (hoverInfo.status === "ambiguous") {
      return {
        className: "link-hover-preview-status--ambiguous",
        icon: <AlertTriangle size={12} strokeWidth={2.2} />,
        text: t("hoverPreview.ambiguous"),
      };
    }
    return {
      className: "link-hover-preview-status--unresolved",
      icon: <Plus size={12} strokeWidth={2.2} />,
      text: t("hoverPreview.unresolved"),
    };
  }, [hoverInfo, loading, t]);

  const forceHidePreview = useCallback(() => {
    isHoveringCardRef.current = false;
    if (hideTimerRef.current) {
      clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }
    setHoverInfo(null);
    setPreview(null);
    setLoading(false);
  }, []);

  const hidePreview = useCallback(() => {
    if (isHoveringCardRef.current) return;
    setHoverInfo(null);
    setPreview(null);
    setLoading(false);
  }, []);

  const scheduleHide = useCallback(() => {
    hideTimerRef.current = setTimeout(() => {
      if (!isHoveringCardRef.current) {
        hidePreview();
      }
    }, 150);
  }, [hidePreview]);

  const cancelHide = useCallback(() => {
    if (hideTimerRef.current) {
      clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }
  }, []);

  useEffect(() => {
    const handleHover = (e: Event) => {
      const detail = (e as CustomEvent).detail as HoverInfo;
      cancelHide();
      if (!detail) return;

      const gapX = 12;
      const gapY = 8;
      const cardWidth = 380;
      const cardHeight = 340;

      let left = detail.rect.left;
      let top = detail.rect.bottom + gapY;

      if (left + cardWidth > window.innerWidth - gapX) {
        left = window.innerWidth - cardWidth - gapX;
      }
      if (left < gapX) left = gapX;

      const maxBottom = window.innerHeight - gapX;
      if (top + cardHeight > maxBottom) {
        top = detail.rect.top - gapY - cardHeight;
      }

      setPosition({ top, left });
      setHoverInfo(detail);
      setPreview(null);
      setLoading(true);

      if (detail.status === "resolved" && detail.resolvedPath) {
        const editorStore = useEditorStore.getState();
        const cached = editorStore.fileContents.get(detail.resolvedPath);
        if (cached) {
          const data = extractPreview(cached, detail.heading);
          setPreview(data);
          setLoading(false);
        } else {
          readFile(detail.resolvedPath)
            .then((content) => {
              const data = extractPreview(content, detail.heading);
              setPreview(data);
              setLoading(false);
            })
            .catch(() => {
              setLoading(false);
            });
        }
      } else {
        setLoading(false);
      }
    };

    const handleLeave = () => {
      scheduleHide();
    };

    const handleLinkAction = () => {
      forceHidePreview();
    };

    window.addEventListener("wiki-link-hover", handleHover);
    window.addEventListener("wiki-link-hover-leave", handleLeave);
    window.addEventListener("wiki-link-scroll-to", handleLinkAction);
    window.addEventListener("wiki-link-unresolved", handleLinkAction);
    return () => {
      window.removeEventListener("wiki-link-hover", handleHover);
      window.removeEventListener("wiki-link-hover-leave", handleLeave);
      window.removeEventListener("wiki-link-scroll-to", handleLinkAction);
      window.removeEventListener("wiki-link-unresolved", handleLinkAction);
    };
  }, [cancelHide, scheduleHide, forceHidePreview]);

  const handleCardEnter = useCallback(() => {
    isHoveringCardRef.current = true;
    cancelHide();
  }, [cancelHide]);

  const handleCardLeave = useCallback(() => {
    isHoveringCardRef.current = false;
    scheduleHide();
  }, [scheduleHide]);

  const handleOpenFile = useCallback(() => {
    if (!hoverInfo || hoverInfo.status !== "resolved" || !hoverInfo.resolvedPath) return;
    const editorStore = useEditorStore.getState();
    forceHidePreview();
    editorStore.openFile(hoverInfo.resolvedPath);
    if (hoverInfo.heading) {
      window.dispatchEvent(
        new CustomEvent("wiki-link-scroll-to", {
          detail: { heading: hoverInfo.heading },
        }),
      );
    }
  }, [hoverInfo, forceHidePreview]);

  const handleCreateFile = useCallback(() => {
    if (!hoverInfo) return;
    forceHidePreview();
    window.dispatchEvent(
      new CustomEvent("wiki-link-unresolved", {
        detail: { target: hoverInfo.target },
      }),
    );
  }, [hoverInfo, forceHidePreview]);

  if (!hoverInfo) return null;

  const statusClass =
    hoverInfo.status === "resolved"
      ? "link-hover-preview--resolved"
      : hoverInfo.status === "ambiguous"
        ? "link-hover-preview--ambiguous"
        : "link-hover-preview--unresolved";

  return createPortal(
    <div
      ref={cardRef}
      className={`link-hover-preview ${statusClass}`}
      style={{ top: position.top, left: position.left }}
      onMouseEnter={handleCardEnter}
      onMouseLeave={handleCardLeave}
    >
      <div className="link-hover-preview-header">
        <span className="link-hover-preview-icon" aria-hidden="true">
          <FileText size={16} strokeWidth={2} />
        </span>
        <div className="link-hover-preview-heading">
          <span className="link-hover-preview-kicker">{hoverInfo.raw}</span>
          <span className="link-hover-preview-target">{getTargetDisplay(hoverInfo)}</span>
        </div>
        {statusInfo && (
          <span className={statusInfo.className}>
            {statusInfo.icon}
            {statusInfo.text}
          </span>
        )}
      </div>
      {loading && (
        <div className="link-hover-preview-loading">
          <div className="link-hover-preview-skeleton link-hover-preview-skeleton-title" />
          <div className="link-hover-preview-skeleton" />
          <div className="link-hover-preview-skeleton link-hover-preview-skeleton-short" />
        </div>
      )}
      {!loading && preview && (
        <>
          <div className="link-hover-preview-title-row">
            <span className="link-hover-preview-title">{preview.title}</span>
            <span className="link-hover-preview-meta-pill">
              {preview.lineCount} {t("hoverPreview.lines")}
            </span>
          </div>
          {preview.snippetHtml && (
            <div
              className="link-hover-preview-snippet link-hover-preview-md"
              dangerouslySetInnerHTML={{ __html: preview.snippetHtml }}
            />
          )}
          {preview.headings.length > 0 && (
            <div className="link-hover-preview-headings">
              {preview.headings.map((h, i) => (
                <div key={i} className="link-hover-preview-heading-item">
                  <Hash size={11} strokeWidth={2.2} />
                  {h}
                </div>
              ))}
            </div>
          )}
        </>
      )}
      <div className="link-hover-preview-actions">
        {hoverInfo.status === "resolved" && hoverInfo.resolvedPath && (
          <button className="link-hover-preview-btn" onClick={handleOpenFile}>
            <ExternalLink size={13} strokeWidth={2.1} />
            {t("hoverPreview.openFile")}
          </button>
        )}
        {hoverInfo.status === "unresolved" && (
          <button className="link-hover-preview-btn" onClick={handleCreateFile}>
            <Plus size={13} strokeWidth={2.2} />
            {t("hoverPreview.createFile")}
          </button>
        )}
      </div>
    </div>,
    document.body,
  );
}
