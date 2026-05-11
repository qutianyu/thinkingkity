import { ViewPlugin, ViewUpdate, Decoration, DecorationSet } from "@codemirror/view";
import { EditorView } from "@codemirror/view";
import type { Extension } from "@codemirror/state";
import { parseWikiLink } from "@/md/links/wikiLinkParser";
import { useLinkStore } from "@/md/links/linkStore";
import { useEditorStore } from "@/stores/editorStore";

const WIKI_LINK_RE = /\[\[[\s\S]*?\]\]/g;

function resolveStatus(
  raw: string,
  currentPath: string | null,
): "resolved" | "unresolved" | "ambiguous" | "loading" {
  if (!currentPath) return "loading";
  const index = useLinkStore.getState().index;
  if (!index) return "loading";

  const entry = index.files[currentPath];
  if (!entry) return "unresolved";

  // Link index entries are keyed by their original wiki-link source text.
  const match = entry.outgoing.find((ol) => ol.raw === raw);
  return match?.status ?? "unresolved";
}

function buildDecorations(view: EditorView): DecorationSet {
  const decorations: { from: number; to: number; value: Decoration }[] = [];
  const doc = view.state.doc.toString();
  const currentPath = useEditorStore.getState().activeTabPath;

  let match: RegExpExecArray | null;
  WIKI_LINK_RE.lastIndex = 0;
  while ((match = WIKI_LINK_RE.exec(doc)) !== null) {
    const from = match.index;
    const to = match.index + match[0].length;
    const status = resolveStatus(match[0], currentPath);
    const attributes = {
      "data-wiki-link": match[0],
      "data-wiki-link-from": String(from),
      "data-wiki-link-to": String(to),
    };

    decorations.push({
      from,
      to: from + 2,
      value: Decoration.mark({
        class: `cm-wiki-link-token cm-wiki-link-syntax cm-wiki-link-${status}`,
        attributes,
      }),
    });

    if (to - from > 4) {
      decorations.push({
        from: from + 2,
        to: to - 2,
        value: Decoration.mark({
          class: `cm-wiki-link-token cm-wiki-link-label cm-wiki-link-${status}`,
          attributes,
        }),
      });
    }

    decorations.push({
      from: to - 2,
      to,
      value: Decoration.mark({
        class: `cm-wiki-link-token cm-wiki-link-syntax cm-wiki-link-${status}`,
        attributes,
      }),
    });
  }

  return Decoration.set(decorations, true);
}

let cmHoverTimer: ReturnType<typeof setTimeout> | null = null;
let cmActiveHoverEl: HTMLElement | null = null;
const CM_HOVER_DELAY = 250;

function getCmHoverInfo(raw: string, el: HTMLElement): Record<string, unknown> | null {
  const link = parseWikiLink(raw);
  if (!link) return null;

  const linkStore = useLinkStore.getState();
  const editorStore = useEditorStore.getState();
  const currentPath = editorStore.activeTabPath;

  if (!currentPath || !linkStore.index) {
    return { ...link, status: "loading", el };
  }

  const fileEntry = linkStore.index.files[currentPath];
  const match = fileEntry?.outgoing.find((ol) => ol.raw === link.raw);

  const rect = el.getBoundingClientRect();
  return {
    raw: link.raw,
    target: link.target,
    alias: link.alias,
    heading: link.heading,
    resolvedPath: match?.resolvedPath,
    status: match?.status ?? "unresolved",
    rect: { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom, width: rect.width, height: rect.height },
  };
}

const wikiLinkViewPlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;

    constructor(view: EditorView) {
      this.decorations = buildDecorations(view);
    }

    update(update: ViewUpdate) {
      if (update.docChanged || update.viewportChanged) {
        this.decorations = buildDecorations(update.view);
      }
    }
  },
  {
    decorations: (v) => v.decorations,
    eventHandlers: {
      click: (e, view) => {
        const target = e.target as HTMLElement;
        const linkEl = target.closest(".cm-wiki-link-token") as HTMLElement | null;
        if (!linkEl) return false;

        e.preventDefault();
        e.stopPropagation();

        const from = Number(linkEl.getAttribute("data-wiki-link-from"));
        const to = Number(linkEl.getAttribute("data-wiki-link-to"));
        if (!Number.isFinite(from) || !Number.isFinite(to)) return true;

        const rawText = view.state.doc.sliceString(from, to);

        const link = parseWikiLink(rawText);
        if (!link) return true;
        const linkStore = useLinkStore.getState();
        const editorStore = useEditorStore.getState();
        const currentPath = editorStore.activeTabPath;

        if (!linkStore.index || !currentPath) return true;

        const fileEntry = linkStore.index.files[currentPath];
        const match = fileEntry?.outgoing.find((ol) => ol.raw === link.raw);

        if (match?.status === "resolved" && match.resolvedPath) {
          editorStore.openFile(match.resolvedPath);
          if (link.heading) {
            window.dispatchEvent(
              new CustomEvent("wiki-link-scroll-to", {
                detail: { heading: link.heading },
              }),
            );
          }
          return true;
        }

        if (match?.status === "unresolved" || match?.status === "ambiguous") {
          window.dispatchEvent(
            new CustomEvent("wiki-link-unresolved", {
              detail: { target: link.target },
            }),
          );
          return true;
        }

        return true;
      },
      mouseover: (e) => {
        const target = e.target as HTMLElement;
        const linkEl = target.closest(".cm-wiki-link-token") as HTMLElement | null;
        if (!linkEl) return false;

        if (linkEl === cmActiveHoverEl) return false;

        if (cmHoverTimer) {
          clearTimeout(cmHoverTimer);
          cmHoverTimer = null;
        }

        cmActiveHoverEl = linkEl;
        const rawText = linkEl.getAttribute("data-wiki-link") || "";

        cmHoverTimer = setTimeout(() => {
          const info = getCmHoverInfo(rawText, linkEl);
          if (info) {
            window.dispatchEvent(new CustomEvent("wiki-link-hover", { detail: info }));
          }
        }, CM_HOVER_DELAY);

        return false;
      },
      mouseout: (e) => {
        const target = e.target as HTMLElement;
        const linkEl = target.closest(".cm-wiki-link-token") as HTMLElement | null;
        if (!linkEl) return false;

        if (linkEl === cmActiveHoverEl) {
          if (cmHoverTimer) {
            clearTimeout(cmHoverTimer);
            cmHoverTimer = null;
          }
          cmActiveHoverEl = null;
          window.dispatchEvent(new CustomEvent("wiki-link-hover-leave"));
        }

        return false;
      },
    },
  },
);

export function wikiLinkCmExtension(): Extension {
  return [wikiLinkViewPlugin];
}
