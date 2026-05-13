import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { Bookmark, ChevronDown, ChevronRight, ListTree, MoveRight, PanelLeftClose, PanelLeftOpen, Plus, Trash2 } from "lucide-react";
import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";
import type { PDFDocumentProxy, PDFPageProxy } from "pdfjs-dist/legacy/build/pdf.mjs";
import pdfWorkerUrl from "pdfjs-dist/legacy/build/pdf.worker.mjs?url";
import { addPdfBookmark, deletePdfBookmark, readPdfBookmarks, type PdfBookmark } from "./pdfBookmarkStorage";
import "./styles.css";

pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

const pdfjsAssetBaseUrl = `${import.meta.env.BASE_URL}pdfjs/`;
const MIN_PDF_ZOOM = 0.6;
const MAX_PDF_ZOOM = 3;
const PDF_ZOOM_SENSITIVITY = 0.0025;
const PDF_ZOOM_RENDER_IDLE_MS = 140;

function clampPdfZoom(value: number): number {
  return Math.min(MAX_PDF_ZOOM, Math.max(MIN_PDF_ZOOM, value));
}

interface PdfViewerProps {
  src: string;
  filename: string;
  filePath: string;
  vaultPath: string | null;
}

interface PdfOutlineItem {
  id: string;
  title: string;
  dest: unknown;
  level: number;
  parentId: string | null;
  hasChildren: boolean;
}

async function sourceToBytes(src: string): Promise<Uint8Array> {
  const base64Marker = ";base64,";
  const base64Index = src.indexOf(base64Marker);
  if (src.startsWith("data:") && base64Index !== -1) {
    const binary = atob(src.slice(base64Index + base64Marker.length));
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index++) {
      bytes[index] = binary.charCodeAt(index);
    }
    return bytes;
  }
  return new Uint8Array(await (await fetch(src)).arrayBuffer());
}

async function resolveDestPage(pdf: PDFDocumentProxy, dest: unknown): Promise<number | null> {
  const resolved = typeof dest === "string" ? await pdf.getDestination(dest) : dest;
  if (!Array.isArray(resolved) || !resolved[0]) return null;
  try {
    return (await pdf.getPageIndex(resolved[0])) + 1;
  } catch {
    return null;
  }
}

async function flattenOutline(pdf: PDFDocumentProxy): Promise<PdfOutlineItem[]> {
  const outline = await pdf.getOutline();
  if (!outline) return [];
  const items: PdfOutlineItem[] = [];

  async function walk(nodes: Awaited<ReturnType<PDFDocumentProxy["getOutline"]>>, level: number, parentId: string | null) {
    if (!nodes) return;
    for (const node of nodes) {
      const id = `${items.length}-${level}-${node.title}`;
      const hasChildren = Array.isArray(node.items) && node.items.length > 0;
      items.push({ id, title: node.title || "Untitled", dest: node.dest, level, parentId, hasChildren });
      await walk(node.items, level + 1, id);
    }
  }

  await walk(outline, 0, null);
  return items;
}

export function PdfViewer({ src, filename, filePath, vaultPath }: PdfViewerProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const pageRefs = useRef<Map<number, HTMLDivElement>>(new Map());
  const pendingScrollTimerRef = useRef<number | null>(null);
  const currentPageRafRef = useRef<number | null>(null);
  const zoomRenderTimerRef = useRef<number | null>(null);
  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null);
  const [outline, setOutline] = useState<PdfOutlineItem[]>([]);
  const [bookmarks, setBookmarks] = useState<PdfBookmark[]>([]);
  const [collapsedOutlineIds, setCollapsedOutlineIds] = useState<Set<string>>(new Set());
  const [sidePanelCollapsed, setSidePanelCollapsed] = useState(false);
  const [activeTab, setActiveTab] = useState<"outline" | "bookmarks">("outline");
  const [jumpInput, setJumpInput] = useState("1");
  const [bookmarkPageInput, setBookmarkPageInput] = useState("1");
  const [titleInput, setTitleInput] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [zoom, setZoom] = useState(1);
  const [renderZoom, setRenderZoom] = useState(1);
  const [renderedPages, setRenderedPages] = useState<Set<number>>(() => new Set([1]));
  const [pageAspectRatio, setPageAspectRatio] = useState<number | null>(null);
  const [error, setError] = useState("");
  const pendingScrollRef = useRef<number | null>(null);
  const [scrollToPage, setScrollToPage] = useState<number | null>(null);
  const pageNumbers = useMemo(
    () => Array.from({ length: pdf?.numPages ?? 0 }, (_, index) => index + 1),
    [pdf?.numPages],
  );
  const pageWidthStyle = `min(${Math.round(920 * zoom)}px, ${Math.round(100 * zoom)}%)`;
  const pageMinWidthStyle = `${Math.round(320 * zoom)}px`;
  const pagePlaceholderStyle: CSSProperties = {
    width: pageWidthStyle,
    minWidth: pageMinWidthStyle,
    ...(pageAspectRatio ? { aspectRatio: String(pageAspectRatio) } : {}),
  };
  const visibleOutline = useMemo(() => {
    const itemById = new Map(outline.map((item) => [item.id, item]));
    return outline.filter((item) => {
      let parentId = item.parentId;
      while (parentId) {
        if (collapsedOutlineIds.has(parentId)) return false;
        parentId = itemById.get(parentId)?.parentId ?? null;
      }
      return true;
    });
  }, [collapsedOutlineIds, outline]);

  useEffect(() => {
    let cancelled = false;
    setPdf(null);
    setOutline([]);
    setCollapsedOutlineIds(new Set());
    setRenderedPages(new Set([1]));
    setPageAspectRatio(null);
    setZoom(1);
    setRenderZoom(1);
    setError("");
    let loadingTask: ReturnType<typeof pdfjs.getDocument> | null = null;
    void sourceToBytes(src)
      .then((data) => {
        if (cancelled) return null;
        loadingTask = pdfjs.getDocument({
          data,
          cMapPacked: true,
          cMapUrl: `${pdfjsAssetBaseUrl}cmaps/`,
          iccUrl: `${pdfjsAssetBaseUrl}iccs/`,
          standardFontDataUrl: `${pdfjsAssetBaseUrl}standard_fonts/`,
          wasmUrl: `${pdfjsAssetBaseUrl}wasm/`,
        });
        return loadingTask.promise;
      })
      .then(async (doc) => {
        if (!doc) return;
        if (cancelled) {
          await doc.destroy();
          return;
        }
        setPdf(doc);
        setCurrentPage(1);
        const firstPage = await doc.getPage(1);
        const firstViewport = firstPage.getViewport({ scale: 1 });
        setPageAspectRatio(firstViewport.width / firstViewport.height);
        firstPage.cleanup();
        setOutline(await flattenOutline(doc));
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "PDF 加载失败");
      });
    return () => {
      cancelled = true;
      void loadingTask?.destroy();
    };
  }, [src]);

  useEffect(() => {
    let cancelled = false;
    setBookmarks([]);
    setError("");
    if (!vaultPath) return;
    void readPdfBookmarks(vaultPath, filePath)
      .then((items) => {
        if (!cancelled) setBookmarks(items);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "书签读取失败");
      });
    return () => {
      cancelled = true;
    };
  }, [filePath, vaultPath]);

  const updateCurrentPageFromViewport = () => {
    const root = scrollRef.current;
    if (!root) return;

    const rootRect = root.getBoundingClientRect();
    const viewportAnchor = rootRect.top + rootRect.height * 0.38;
    let bestPage: number | null = null;
    let bestDistance = Number.POSITIVE_INFINITY;

    pageRefs.current.forEach((element, page) => {
      const rect = element.getBoundingClientRect();
      const overlapsViewport = rect.bottom > rootRect.top && rect.top < rootRect.bottom;
      if (!overlapsViewport) return;

      const pageTop = Math.max(rect.top, rootRect.top);
      const pageBottom = Math.min(rect.bottom, rootRect.bottom);
      const pageAnchor = pageTop <= viewportAnchor && pageBottom >= viewportAnchor
        ? viewportAnchor
        : (pageTop + pageBottom) / 2;
      const distance = Math.abs(pageAnchor - viewportAnchor);

      if (distance < bestDistance) {
        bestDistance = distance;
        bestPage = page;
      }
    });

    if (bestPage !== null) setCurrentPage(bestPage);
  };

  const schedulePendingScrollRelease = () => {
    if (pendingScrollTimerRef.current !== null) window.clearTimeout(pendingScrollTimerRef.current);
    pendingScrollTimerRef.current = window.setTimeout(() => {
      pendingScrollTimerRef.current = null;
      pendingScrollRef.current = null;
      updateCurrentPageFromViewport();
    }, 160);
  };

  const scrollPageIntoView = (page: number) => {
    const root = scrollRef.current;
    const target = pageRefs.current.get(page);
    if (!root || !target) return false;

    const rootRect = root.getBoundingClientRect();
    const targetRect = target.getBoundingClientRect();
    const paddingTop = Number.parseFloat(window.getComputedStyle(root).paddingTop) || 0;
    const top = root.scrollTop + targetRect.top - rootRect.top - paddingTop;
    root.scrollTo({ top: Math.max(0, top), behavior: "auto" });
    return true;
  };

  useEffect(() => {
    const root = scrollRef.current;
    if (!root || pageNumbers.length === 0) return;

    const handleScroll = () => {
      if (pendingScrollRef.current !== null) {
        schedulePendingScrollRelease();
        return;
      }
      if (currentPageRafRef.current !== null) return;
      currentPageRafRef.current = window.requestAnimationFrame(() => {
        currentPageRafRef.current = null;
        updateCurrentPageFromViewport();
      });
    };

    root.addEventListener("scroll", handleScroll, { passive: true });
    updateCurrentPageFromViewport();

    return () => {
      root.removeEventListener("scroll", handleScroll);
      if (currentPageRafRef.current !== null) {
        window.cancelAnimationFrame(currentPageRafRef.current);
        currentPageRafRef.current = null;
      }
    };
  }, [pageNumbers]);

  useEffect(() => {
    const root = scrollRef.current;
    if (!root) return;

    const scheduleRenderZoom = (nextZoom: number) => {
      if (zoomRenderTimerRef.current !== null) window.clearTimeout(zoomRenderTimerRef.current);
      zoomRenderTimerRef.current = window.setTimeout(() => {
        zoomRenderTimerRef.current = null;
        setRenderZoom(nextZoom);
      }, PDF_ZOOM_RENDER_IDLE_MS);
    };

    const handleWheel = (event: WheelEvent) => {
      if (!event.ctrlKey) return;
      event.preventDefault();

      const rootRect = root.getBoundingClientRect();
      const cursorX = event.clientX - rootRect.left;
      const cursorY = event.clientY - rootRect.top;
      const beforeLeft = root.scrollLeft + cursorX;
      const beforeTop = root.scrollTop + cursorY;

      setZoom((currentZoom) => {
        const nextZoom = clampPdfZoom(currentZoom * Math.exp(-event.deltaY * PDF_ZOOM_SENSITIVITY));
        if (nextZoom === currentZoom) return currentZoom;
        const ratio = nextZoom / currentZoom;

        window.requestAnimationFrame(() => {
          root.scrollLeft = Math.max(0, beforeLeft * ratio - cursorX);
          root.scrollTop = Math.max(0, beforeTop * ratio - cursorY);
          updateCurrentPageFromViewport();
        });

        scheduleRenderZoom(nextZoom);
        return nextZoom;
      });
    };

    root.addEventListener("wheel", handleWheel, { passive: false });
    return () => {
      root.removeEventListener("wheel", handleWheel);
      if (zoomRenderTimerRef.current !== null) {
        window.clearTimeout(zoomRenderTimerRef.current);
        zoomRenderTimerRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    const root = scrollRef.current;
    if (!root || pageNumbers.length === 0) return;
    const observer = new IntersectionObserver(
      (entries) => {
        const visibleEntries = entries.filter((entry) => entry.isIntersecting);
        if (visibleEntries.length > 0) {
          setRenderedPages((current) => {
            let changed = false;
            const next = new Set(current);
            for (const entry of visibleEntries) {
              const page = Number((entry.target as HTMLElement).dataset.page);
              if (Number.isInteger(page) && page > 0 && !next.has(page)) {
                next.add(page);
                changed = true;
              }
            }
            return changed ? next : current;
          });
        }

      },
      { root, rootMargin: "900px 0px", threshold: [0.01] },
    );
    pageRefs.current.forEach((element) => observer.observe(element));
    return () => observer.disconnect();
  }, [pageNumbers]);

  const goToPage = (page: number | null) => {
    if (!page) return;
    pendingScrollRef.current = page;
    setRenderedPages((current) => {
      const next = new Set(current);
      next.add(page);
      if (page > 1) next.add(page - 1);
      if (pdf && page < pdf.numPages) next.add(page + 1);
      return next;
    });
    setCurrentPage(page);
    setScrollToPage(page);
  };

  useEffect(() => {
    if (scrollToPage === null) return;
    const page = scrollToPage;
    if (!scrollPageIntoView(page)) return;
    setScrollToPage(null);
    schedulePendingScrollRelease();

    window.requestAnimationFrame(() => {
      scrollPageIntoView(page);
      window.requestAnimationFrame(() => {
        scrollPageIntoView(page);
        schedulePendingScrollRelease();
      });
    });
    window.setTimeout(() => {
      scrollPageIntoView(page);
      schedulePendingScrollRelease();
    }, 250);
  }, [scrollToPage, renderedPages]);

  useEffect(() => {
    return () => {
      if (pendingScrollTimerRef.current !== null) window.clearTimeout(pendingScrollTimerRef.current);
    };
  }, []);

  const handlePageJump = () => {
    const page = Number(jumpInput);
    if (!Number.isInteger(page) || page < 1 || (pdf && page > pdf.numPages)) {
      setError("请输入有效页码");
      return;
    }
    setError("");
    goToPage(page);
  };

  const goToOutlineItem = async (item: PdfOutlineItem) => {
    if (!pdf) return;
    const page = await resolveDestPage(pdf, item.dest);
    goToPage(page);
  };

  const toggleOutlineItem = (id: string) => {
    setCollapsedOutlineIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleAddBookmark = async () => {
    if (!vaultPath) return;
    const page = Number(bookmarkPageInput);
    if (!Number.isInteger(page) || page < 1 || (pdf && page > pdf.numPages)) {
      setError("请输入有效页码");
      return;
    }
    try {
      setBookmarks(await addPdfBookmark(vaultPath, filePath, { page, title: titleInput }));
      setTitleInput("");
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "书签保存失败");
    }
  };

  const handleDeleteBookmark = async (id: string) => {
    if (!vaultPath) return;
    try {
      setBookmarks(await deletePdfBookmark(vaultPath, filePath, id));
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "书签删除失败");
    }
  };

  return (
    <div className={`pdf-viewer ${sidePanelCollapsed ? "pdf-viewer-side-collapsed" : ""}`}>
      <aside className="pdf-side-panel">
        <div className="pdf-side-header">
          <span className="pdf-viewer-name">{filename}</span>
          <button
            type="button"
            className="pdf-side-collapse"
            onClick={() => setSidePanelCollapsed((value) => !value)}
            title={sidePanelCollapsed ? "展开目录" : "收起目录"}
            aria-label={sidePanelCollapsed ? "展开目录" : "收起目录"}
          >
            {sidePanelCollapsed ? <PanelLeftOpen size={14} /> : <PanelLeftClose size={14} />}
          </button>
        </div>
        <div className="pdf-page-jump">
          <span className="pdf-page-display">
            <span className="pdf-page-current">{currentPage}</span>
            <span className="pdf-page-sep">/</span>
            <span className="pdf-page-total">{pdf?.numPages ?? "-"}</span>
          </span>
          <span className="pdf-zoom-display">{Math.round(zoom * 100)}%</span>
          <input
            className="pdf-page-jump-input"
            value={jumpInput}
            onChange={(event) => setJumpInput(event.target.value)}
            onFocus={(event) => event.currentTarget.select()}
            onKeyDown={(event) => {
              if (event.key === "Enter") handlePageJump();
            }}
            inputMode="numeric"
            pattern="[0-9]*"
            placeholder="页码"
            aria-label="跳转目标页码"
          />
          <button type="button" className="pdf-page-jump-button" onClick={handlePageJump} title="跳转" aria-label="跳转">
            <MoveRight size={14} />
          </button>
        </div>
        <div className="pdf-side-tabs">
          <button type="button" className={`pdf-side-tab ${activeTab === "outline" ? "pdf-side-tab-active" : ""}`} onClick={() => setActiveTab("outline")}>
            <ListTree size={14} />
            目录
          </button>
          <button type="button" className={`pdf-side-tab ${activeTab === "bookmarks" ? "pdf-side-tab-active" : ""}`} onClick={() => setActiveTab("bookmarks")}>
            <Bookmark size={14} />
            书签
          </button>
        </div>
        <div className="pdf-side-body">
          {activeTab === "outline" ? (
            <div className="pdf-outline-list">
              {outline.length === 0 ? (
                <div className="pdf-side-empty">此 PDF 没有目录</div>
              ) : visibleOutline.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className="pdf-outline-item"
                  style={{ paddingLeft: 10 + item.level * 14 }}
                  onClick={() => {
                    if (item.hasChildren) toggleOutlineItem(item.id);
                    else void goToOutlineItem(item);
                  }}
                  disabled={!item.dest && !item.hasChildren}
                  title={item.title}
                >
                  {item.hasChildren ? (
                    <span className="pdf-outline-caret" aria-hidden="true">
                      {collapsedOutlineIds.has(item.id) ? <ChevronRight size={13} /> : <ChevronDown size={13} />}
                    </span>
                  ) : (
                    <span className="pdf-outline-caret" aria-hidden="true" />
                  )}
                  <span>{item.title}</span>
                </button>
              ))}
            </div>
          ) : (
            <div className="pdf-bookmark-panel">
              <div className="pdf-bookmark-form" aria-label="PDF 书签">
                <label className="pdf-bookmark-page">
                  <span>页</span>
                  <input
                    value={bookmarkPageInput}
                    onChange={(event) => setBookmarkPageInput(event.target.value)}
                    inputMode="numeric"
                    pattern="[0-9]*"
                    aria-label="书签页码"
                  />
                </label>
                <input
                  value={titleInput}
                  onChange={(event) => setTitleInput(event.target.value)}
                  className="pdf-bookmark-title"
                  placeholder="书签名称"
                  aria-label="书签名称"
                />
                <button type="button" className="pdf-bookmark-add" onClick={handleAddBookmark} title="添加书签" disabled={!vaultPath}>
                  <Plus size={13} />
                </button>
              </div>
              <div className="pdf-bookmarks" aria-label="PDF 书签列表">
                {bookmarks.length === 0 ? (
                  <div className="pdf-side-empty">暂无书签</div>
                ) : bookmarks.map((bookmark) => (
                  <span key={bookmark.id} className="pdf-bookmark-chip">
                    <button
                      type="button"
                      className="pdf-bookmark-jump"
                      onClick={() => goToPage(bookmark.page)}
                      title={`跳转到第 ${bookmark.page} 页`}
                    >
                      <Bookmark size={12} />
                      <span className="pdf-bookmark-chip-title">{bookmark.title}</span>
                      <span className="pdf-bookmark-chip-page">P{bookmark.page}</span>
                    </button>
                    <button
                      type="button"
                      className="pdf-bookmark-delete"
                      title="删除书签"
                      onClick={() => void handleDeleteBookmark(bookmark.id)}
                    >
                      <Trash2 size={11} />
                    </button>
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
        {error && <div className="pdf-bookmark-error">{error}</div>}
      </aside>
      <main ref={scrollRef} className="pdf-document-scroll">
        {!pdf ? (
          <div className="pdf-loading">PDF 加载中</div>
        ) : pageNumbers.map((pageNumber) => (
          <div
            key={pageNumber}
            ref={(element) => {
              if (element) pageRefs.current.set(pageNumber, element);
              else pageRefs.current.delete(pageNumber);
            }}
            className="pdf-page-wrap"
            data-page={pageNumber}
          >
            {renderedPages.has(pageNumber) ? (
              <PdfCanvas
                pdf={pdf}
                pageNumber={pageNumber}
                renderZoom={renderZoom}
                placeholderStyle={pagePlaceholderStyle}
              />
            ) : (
              <div
                className="pdf-page-placeholder"
                style={pagePlaceholderStyle}
              >
                第 {pageNumber} 页
              </div>
            )}
            <div className="pdf-page-number">第 {pageNumber} 页</div>
          </div>
        ))}
      </main>
    </div>
  );
}

function PdfCanvas({
  pdf,
  pageNumber,
  renderZoom,
  placeholderStyle,
}: {
  pdf: PDFDocumentProxy;
  pageNumber: number;
  renderZoom: number;
  placeholderStyle?: CSSProperties;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    let cancelled = false;
    let page: PDFPageProxy | null = null;
    let renderTask: ReturnType<PDFPageProxy["render"]> | null = null;
    const canvas = canvasRef.current;
    if (!canvas) return;

    void pdf.getPage(pageNumber).then(async (loadedPage) => {
      if (cancelled) return;
      page = loadedPage;
      const baseViewport = loadedPage.getViewport({ scale: 1 });
      const fitWidth = Math.min(920, Math.max(320, canvas.parentElement?.clientWidth ?? 820));
      const width = fitWidth * renderZoom;
      const scale = width / baseViewport.width;
      const viewport = loadedPage.getViewport({ scale });
      const ratio = window.devicePixelRatio || 1;
      canvas.width = Math.floor(viewport.width * ratio);
      canvas.height = Math.floor(viewport.height * ratio);
      canvas.style.width = `${Math.floor(viewport.width)}px`;
      canvas.style.height = `${Math.floor(viewport.height)}px`;
      const context = canvas.getContext("2d");
      if (!context) return;
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      renderTask = loadedPage.render({ canvas, canvasContext: context, viewport });
      await renderTask.promise.catch(() => undefined);
    });

    return () => {
      cancelled = true;
      renderTask?.cancel();
      page?.cleanup();
    };
  }, [pageNumber, pdf, renderZoom]);

  return <canvas ref={canvasRef} className="pdf-page-canvas" style={placeholderStyle} />;
}
