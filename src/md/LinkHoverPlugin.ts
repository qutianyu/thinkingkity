import { Plugin, PluginKey } from "@milkdown/prose/state";
import { $prose } from "@milkdown/utils";
import { parseWikiLink } from "@/md/links/wikiLinkParser";
import { useLinkStore } from "@/md/links/linkStore";
import { useEditorStore } from "@/stores/editorStore";

export const linkHoverPluginKey = new PluginKey("linkHover");

interface HoverInfo {
  raw: string;
  target: string;
  alias?: string;
  heading?: string;
  resolvedPath?: string;
  status: "resolved" | "unresolved" | "ambiguous" | "loading";
  rect: DOMRect;
}

let hoverTimer: ReturnType<typeof setTimeout> | null = null;
let activeHoverEl: HTMLElement | null = null;

function getHoverInfoFromElement(el: HTMLElement, view: any): HoverInfo | null {
  const wikiLinkEl = el.closest(".wiki-link") as HTMLElement | null;
  if (!wikiLinkEl) return null;

  const rawText = wikiLinkEl.dataset.raw;
  if (!rawText) return null;

  const link = parseWikiLink(rawText);
  if (!link) return null;

  const linkStore = useLinkStore.getState();
  const editorStore = useEditorStore.getState();
  const currentPath = editorStore.activeTabPath;
  if (!currentPath || !linkStore.index) {
    return { ...link, status: "loading", rect: wikiLinkEl.getBoundingClientRect() };
  }

  const fileEntry = linkStore.index.files[currentPath];
  const match = fileEntry?.outgoing.find((ol) => ol.raw === link.raw);

  return {
    raw: link.raw,
    target: link.target,
    alias: link.alias,
    heading: link.heading,
    resolvedPath: match?.resolvedPath,
    status: match?.status ?? "unresolved",
    rect: wikiLinkEl.getBoundingClientRect(),
  };
}

const HOVER_DELAY = 250;

export const linkHoverPlugin = $prose(() => {
  return new Plugin({
    key: linkHoverPluginKey,
    props: {
      handleDOMEvents: {
        mouseover: (view, event) => {
          const target = event.target as HTMLElement;
          const wikiLinkEl = target.closest(".wiki-link") as HTMLElement | null;
          if (!wikiLinkEl) return false;

          if (wikiLinkEl === activeHoverEl) return false;

          if (hoverTimer) {
            clearTimeout(hoverTimer);
            hoverTimer = null;
          }

          activeHoverEl = wikiLinkEl;
          hoverTimer = setTimeout(() => {
            const info = getHoverInfoFromElement(wikiLinkEl!, view);
            if (!info) return;

            window.dispatchEvent(
              new CustomEvent("wiki-link-hover", {
                detail: {
                  raw: info.raw,
                  target: info.target,
                  alias: info.alias,
                  heading: info.heading,
                  resolvedPath: info.resolvedPath,
                  status: info.status,
                  rect: {
                    left: info.rect.left,
                    top: info.rect.top,
                    right: info.rect.right,
                    bottom: info.rect.bottom,
                    width: info.rect.width,
                    height: info.rect.height,
                  },
                },
              }),
            );
          }, HOVER_DELAY);

          return false;
        },
        mouseout: (view, event) => {
          const target = event.target as HTMLElement;
          const wikiLinkEl = target.closest(".wiki-link") as HTMLElement | null;
          if (!wikiLinkEl) return false;

          if (wikiLinkEl === activeHoverEl) {
            if (hoverTimer) {
              clearTimeout(hoverTimer);
              hoverTimer = null;
            }
            activeHoverEl = null;
            window.dispatchEvent(new CustomEvent("wiki-link-hover-leave"));
          }

          return false;
        },
      },
    },
  });
});