import { useCallback, useEffect, useRef } from "react";
import { useFileTreeStore } from "@/stores/fileTreeStore";
import { useVaultStore } from "@/stores/vaultStore";
import { FileTreeNode } from "./FileTreeNode";

export function FileTree() {
  const vaultPath = useVaultStore((s) => s.vaultPath);
  const nodes = useFileTreeStore((s) => s.nodes);
  const dragSourcePath = useFileTreeStore((s) => s.dragSourcePath);
  const dropTarget = useFileTreeStore((s) => s.dropTarget);
  const setDragSource = useFileTreeStore((s) => s.setDragSource);
  const setDropTarget = useFileTreeStore((s) => s.setDropTarget);
  const moveEntry = useFileTreeStore((s) => s.moveEntry);
  const moveEntryToPosition = useFileTreeStore((s) => s.moveEntryToPosition);

  const dragStateRef = useRef<{
    sourcePath: string;
    sourceIsDir: boolean;
    startX: number;
    startY: number;
    isDragging: boolean;
    pointerId: number;
    longPressTimer: number | null;
    onLongPress?: (clientX: number, clientY: number) => void;
  } | null>(null);

  const ghostRef = useRef<HTMLDivElement | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const scrollTimerRef = useRef<number>(0);

  const getDropInfo = useCallback((clientX: number, clientY: number) => {
    // Resolve drop zones from DOM geometry so nested nodes do not need bespoke handlers.
    const el = document.elementFromPoint(clientX, clientY);
    if (!el) return null;
    const treeItem = (el as HTMLElement).closest("[data-tree-path]");
    if (!treeItem) {
      const container = containerRef.current;
      if (container) {
        const rect = container.getBoundingClientRect();
        if (clientX >= rect.left && clientX <= rect.right && clientY >= rect.top && clientY <= rect.bottom) {
          return { path: vaultPath ?? "", position: "inside" as const };
        }
      }
      return null;
    }
    const path = (treeItem as HTMLElement).dataset.treePath!;
    const isDir = (treeItem as HTMLElement).dataset.treeIsDir === "true";
    const rect = treeItem.getBoundingClientRect();
    const y = clientY - rect.top;
    const height = rect.height;

    let position: "before" | "inside" | "after";
    if (isDir) {
      if (y < height * 0.25) position = "before";
      else if (y > height * 0.75) position = "after";
      else position = "inside";
    } else {
      position = y < height / 2 ? "before" : "after";
    }
    return { path, position };
  }, [vaultPath]);

  const startAutoScroll = useCallback((clientY: number) => {
    // Dragging near the tree edges scrolls continuously until the pointer moves away.
    const container = containerRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    const scrollSpeed = 8;

    if (scrollTimerRef.current) {
      clearInterval(scrollTimerRef.current);
      scrollTimerRef.current = 0;
    }

    if (clientY < rect.top + 40) {
      scrollTimerRef.current = window.setInterval(() => {
        container.scrollTop -= scrollSpeed;
      }, 16);
    } else if (clientY > rect.bottom - 40) {
      scrollTimerRef.current = window.setInterval(() => {
        container.scrollTop += scrollSpeed;
      }, 16);
    }
  }, []);

  const stopAutoScroll = useCallback(() => {
    if (scrollTimerRef.current) {
      clearInterval(scrollTimerRef.current);
      scrollTimerRef.current = 0;
    }
  }, []);

  const handlePointerMove = useCallback((e: PointerEvent) => {
    const ds = dragStateRef.current;
    if (!ds) return;

    const dx = e.clientX - ds.startX;
    const dy = e.clientY - ds.startY;

    if (!ds.isDragging) {
      if (ds.longPressTimer) {
        window.clearTimeout(ds.longPressTimer);
        ds.longPressTimer = null;
      }
      if (Math.abs(dx) + Math.abs(dy) < 5) return;
      ds.isDragging = true;
      setDragSource(ds.sourcePath);

      if (!ghostRef.current) {
        const ghost = document.createElement("div");
        ghost.className = "tree-item-drag-ghost";
        ghost.textContent = ds.sourcePath.split(/[/\\]/).pop() ?? "";
        ghost.style.position = "fixed";
        ghost.style.left = "0";
        ghost.style.top = "0";
        ghost.style.pointerEvents = "none";
        ghost.style.zIndex = "9999";
        ghost.style.willChange = "transform";
        ghost.style.opacity = "0.88";
        ghost.style.whiteSpace = "nowrap";
        document.body.appendChild(ghost);
        ghostRef.current = ghost;
      }
    }

    if (ghostRef.current) {
      ghostRef.current.style.transform = `translate3d(${e.clientX + 8}px, ${e.clientY - 12}px, 0)`;
    }

    const dropInfo = getDropInfo(e.clientX, e.clientY);
    if (dropInfo && dropInfo.path !== ds.sourcePath) {
      const sourcePath = ds.sourcePath;
      const targetPath = dropInfo.path;
      const sep = targetPath.includes("\\") ? "\\" : "/";
      if (ds.sourceIsDir && targetPath.startsWith(sourcePath + sep)) {
        setDropTarget(null);
      } else {
        setDropTarget({ path: targetPath, position: dropInfo.position });
      }
    } else {
      setDropTarget(null);
    }

    startAutoScroll(e.clientY);
  }, [getDropInfo, setDragSource, setDropTarget, startAutoScroll]);

  const handlePointerUp = useCallback(() => {
    const ds = dragStateRef.current;
    if (!ds) return;

    if (ds.isDragging) {
      const dt = useFileTreeStore.getState().dropTarget;
      if (dt && dt.path !== ds.sourcePath) {
        const sourcePath = ds.sourcePath;
        const sep = dt.path.includes("\\") ? "\\" : "/";
        const isDescendant = ds.sourceIsDir && dt.path.startsWith(sourcePath + sep);
        if (!isDescendant) {
          if (dt.position === "inside") {
            moveEntry(sourcePath, dt.path);
          } else if (dt.path === vaultPath) {
            moveEntry(sourcePath, vaultPath);
          } else {
            const lastSep = dt.path.lastIndexOf(sep);
            const targetParent = lastSep > 0 ? dt.path.substring(0, lastSep) : dt.path;
            const targetName = dt.path.substring(lastSep + 1);
            moveEntryToPosition(sourcePath, targetParent, targetName, dt.position);
          }
        }
      }
    }

    if (ghostRef.current) {
      ghostRef.current.remove();
      ghostRef.current = null;
    }

    stopAutoScroll();
    setDragSource(null);
    setDropTarget(null);
    dragStateRef.current = null;
  }, [moveEntry, moveEntryToPosition, setDragSource, setDropTarget, stopAutoScroll, vaultPath]);

  const handlePointerCancel = useCallback(() => {
    if (ghostRef.current) {
      ghostRef.current.remove();
      ghostRef.current = null;
    }
    stopAutoScroll();
    setDragSource(null);
    setDropTarget(null);
    if (dragStateRef.current?.longPressTimer) {
      window.clearTimeout(dragStateRef.current.longPressTimer);
    }
    dragStateRef.current = null;
  }, [setDragSource, setDropTarget, stopAutoScroll]);

  useEffect(() => {
    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
    window.addEventListener("pointercancel", handlePointerCancel);
    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
      window.removeEventListener("pointercancel", handlePointerCancel);
      if (ghostRef.current) {
        ghostRef.current.remove();
        ghostRef.current = null;
      }
    };
  }, [handlePointerMove, handlePointerUp, handlePointerCancel]);

  const handleItemPointerDown = useCallback((
    e: React.PointerEvent<HTMLDivElement>,
    path: string,
    isDir: boolean,
    onLongPress?: (clientX: number, clientY: number) => void,
  ) => {
    if (e.button !== 0) return;
    const longPressTimer = window.setTimeout(() => {
      const state = dragStateRef.current;
      if (!state || state.isDragging) return;
      state.longPressTimer = null;
      state.onLongPress?.(state.startX, state.startY);
      dragStateRef.current = null;
    }, 500);
    dragStateRef.current = {
      sourcePath: path,
      sourceIsDir: isDir,
      startX: e.clientX,
      startY: e.clientY,
      isDragging: false,
      pointerId: e.pointerId,
      longPressTimer,
      onLongPress,
    };
  }, []);

  const handleContainerPointerUp = useCallback((e: React.PointerEvent) => {
    if (dragStateRef.current && !dragStateRef.current.isDragging) {
      if (dragStateRef.current.longPressTimer) {
        window.clearTimeout(dragStateRef.current.longPressTimer);
      }
      dragStateRef.current = null;
    }
  }, []);

  if (!vaultPath) return null;

  return (
    <div
      ref={containerRef}
      className="file-tree flex-1 overflow-y-auto px-3 py-2"
      onPointerUp={handleContainerPointerUp}
    >
      {nodes.map((node) => (
        <FileTreeNode
          key={node.path}
          entry={node}
          depth={0}
          dropTarget={dropTarget}
              onPointerDown={handleItemPointerDown}
        />
      ))}
    </div>
  );
}
