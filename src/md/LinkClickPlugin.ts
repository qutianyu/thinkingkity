import { Plugin, PluginKey } from "@milkdown/prose/state";
import { $prose } from "@milkdown/utils";
import { isTauri } from "@/lib/tauriCommands";

export const linkClickKey = new PluginKey("linkClick");

const LONG_PRESS_MS = 550;
const TOUCH_MOVE_TOLERANCE = 10;

function getAnchor(target: EventTarget | null): HTMLAnchorElement | null {
  if (!(target instanceof Element)) return null;
  return target.closest("a[href]");
}

function normalizeHref(href: string): string {
  // Bare domains should behave like links while relative Markdown links remain untouched.
  const trimmed = href.trim();
  if (!trimmed) return trimmed;
  if (/^[A-Za-z][A-Za-z0-9+.-]*:/.test(trimmed)) return trimmed;
  if (trimmed.startsWith("#") || trimmed.startsWith("/") || trimmed.startsWith(".")) return trimmed;
  return `https://${trimmed}`;
}

async function openHref(href: string) {
  const url = normalizeHref(href);
  if (!url) return;

  if (isTauri()) {
    const { open } = await import("@tauri-apps/plugin-shell");
    await open(url);
    return;
  }

  window.open(url, "_blank", "noopener,noreferrer");
}

export const linkClickPlugin = $prose(() => {
  let longPressTimer: number | null = null;
  let touchAnchor: HTMLAnchorElement | null = null;
  let touchStartX = 0;
  let touchStartY = 0;
  let openedByLongPress = false;

  const clearLongPress = () => {
    if (longPressTimer) {
      window.clearTimeout(longPressTimer);
      longPressTimer = null;
    }
    touchAnchor = null;
  };

  return new Plugin({
    key: linkClickKey,
    props: {
      attributes: {
        title: "Cmd/Ctrl-click or long-press links to open",
      },
      handleDOMEvents: {
        click: (_view, event) => {
          if (event.defaultPrevented || event.button !== 0) return false;
          if (openedByLongPress) {
            openedByLongPress = false;
            event.preventDefault();
            event.stopPropagation();
            return true;
          }
          if (!event.metaKey && !event.ctrlKey) return false;

          const anchor = getAnchor(event.target);
          const href = anchor?.getAttribute("href");
          if (!href) return false;

          event.preventDefault();
          event.stopPropagation();
          void openHref(href);
          return true;
        },
        touchstart: (_view, event) => {
          const touchEvent = event as TouchEvent;
          if (touchEvent.touches.length !== 1) return false;

          // Long-press supports touch devices where Cmd/Ctrl-click is unavailable.
          const anchor = getAnchor(event.target);
          const href = anchor?.getAttribute("href");
          if (!anchor || !href) return false;

          const touch = touchEvent.touches[0];
          touchAnchor = anchor;
          touchStartX = touch.clientX;
          touchStartY = touch.clientY;
          openedByLongPress = false;

          longPressTimer = window.setTimeout(() => {
            if (!touchAnchor) return;
            openedByLongPress = true;
            void openHref(href);
            clearLongPress();
          }, LONG_PRESS_MS);

          return false;
        },
        touchmove: (_view, event) => {
          if (!longPressTimer) return false;
          const touchEvent = event as TouchEvent;
          const touch = touchEvent.touches[0];
          if (!touch) {
            clearLongPress();
            return false;
          }

          const dx = Math.abs(touch.clientX - touchStartX);
          const dy = Math.abs(touch.clientY - touchStartY);
          if (dx > TOUCH_MOVE_TOLERANCE || dy > TOUCH_MOVE_TOLERANCE) {
            clearLongPress();
          }
          return false;
        },
        touchend: (_view, event) => {
          const wasLongPress = openedByLongPress;
          clearLongPress();
          if (!wasLongPress) return false;
          event.preventDefault();
          event.stopPropagation();
          return true;
        },
        touchcancel: () => {
          clearLongPress();
          return false;
        },
      },
    },
  });
});
