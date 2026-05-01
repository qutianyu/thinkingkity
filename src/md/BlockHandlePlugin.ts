import { $prose } from "@milkdown/utils";
import { Plugin, PluginKey } from "@milkdown/prose/state";
import type { Node, ResolvedPos } from "@milkdown/prose/model";

export const blockHandleKey = new PluginKey("blockHandle");

export type BlockHandleCallbacks = {
  onLineTop: (top: number, view: any) => void;
  onHide: () => void;
};

const callbacksRef: { current: BlockHandleCallbacks | null } = { current: null };

export function setBlockHandleCallbacks(cb: BlockHandleCallbacks) {
  callbacksRef.current = cb;
}

function findActiveLineNode(view: any) {
  // The insert handle follows the nearest block node under the current selection.
  const { from } = view.state.selection;
  const $pos: ResolvedPos = view.state.doc.resolve(from);
  let node: Node | null = null;
  let pos = 0;

  for (let d = $pos.depth; d > 0; d -= 1) {
    const n = $pos.node(d);
    if (n.type.isBlock) {
      node = n;
      pos = $pos.before(d);
      break;
    }
  }

  if (!node && $pos.parent.type.isBlock) {
    node = $pos.parent;
    pos = $pos.before($pos.depth);
  }

  if (!node) return null;
  const el = view.nodeDOM(pos) as HTMLElement | null;
  if (!el) return null;
  return { pos, node, el };
}

export const blockHandlePlugin = $prose(() => {
  return new Plugin({
    key: blockHandleKey,
    view(editorView) {
      let frame: number | null = null;
      const updatePosition = () => {
        frame = null;
        const cb = callbacksRef.current;
        if (!cb) return;
        const info = findActiveLineNode(editorView);
        if (!info) {
          cb.onHide();
          return;
        }
        const elRect = info.el.getBoundingClientRect();
        if (elRect.width === 0 && elRect.height === 0) {
          cb.onHide();
          return;
        }
        const scrollRoot = editorView.dom.closest(".editor-scroll") as HTMLElement | null;
        const scrollRect = scrollRoot?.getBoundingClientRect();
        // Hide when the active block is outside the visible editor viewport.
        if (
          scrollRect &&
          (elRect.bottom < scrollRect.top || elRect.top > scrollRect.bottom)
        ) {
          cb.onHide();
          return;
        }
        cb.onLineTop(elRect.top, editorView);
      };
      const scheduleUpdatePosition = () => {
        // Coalesce rapid scroll/selection updates into one layout read per frame.
        if (frame !== null) return;
        frame = requestAnimationFrame(updatePosition);
      };

      updatePosition();
      document.addEventListener("scroll", scheduleUpdatePosition, true);
      window.addEventListener("resize", scheduleUpdatePosition);

      return {
        update: () => {
          scheduleUpdatePosition();
        },
        destroy: () => {
          document.removeEventListener("scroll", scheduleUpdatePosition, true);
          window.removeEventListener("resize", scheduleUpdatePosition);
          if (frame !== null) {
            cancelAnimationFrame(frame);
          }
          const cb = callbacksRef.current;
          if (cb) cb.onHide();
        },
      };
    },
  });
});
