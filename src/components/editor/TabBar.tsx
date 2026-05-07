import { useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { X, XCircle, CopyX, FolderX } from "lucide-react";
import { useEditorStore } from "@/stores/editorStore";

export function TabBar() {
  const { t } = useTranslation();
  const tabs = useEditorStore((s) => s.tabs);
  const activeTabPath = useEditorStore((s) => s.activeTabPath);
  const setActiveTab = useEditorStore((s) => s.setActiveTab);
  const closeTab = useEditorStore((s) => s.closeTab);
  const closeOthers = useEditorStore((s) => s.closeOthers);
  const closeAll = useEditorStore((s) => s.closeAll);
  const isTabDirty = useEditorStore((s) => s.isTabDirty);
  const isDirty = useEditorStore((s) => s.hasDirtyTabs);
  const stripRef = useRef<HTMLDivElement>(null);
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    tabPath: string;
  } | null>(null);

  if (tabs.length === 0) return null;

  const closeContextMenu = () => setContextMenu(null);

  const handleClose = (path: string) => {
    if (isTabDirty(path)) {
      if (!confirm(t("tab.unsaved") + " - " + t("tab.close") + "?")) return;
    }
    closeTab(path);
  };

  const handleCloseOthers = (path: string) => {
    const dirtyOthers = tabs.filter((tab) => tab.path !== path && tab.isDirty);
    if (dirtyOthers.length > 0) {
      if (!confirm(dirtyOthers.length + " " + t("tab.unsaved") + " " + t("tab.closeOthers") + "?"))
        return;
    }
    closeOthers(path);
  };

  const handleCloseAll = () => {
    if (isDirty()) {
      if (!confirm(t("tab.unsaved") + " " + t("tab.closeAll") + "?")) return;
    }
    closeAll();
  };

  return (
    <>
      <div
        ref={stripRef}
        className="tab-strip flex items-center overflow-x-auto shrink-0"
        onWheel={(e) => {
          const strip = stripRef.current;
          if (!strip) return;
          if (strip.scrollWidth <= strip.clientWidth) return;

          e.preventDefault();
          strip.scrollLeft += e.deltaX || e.deltaY;
        }}
      >
        {tabs.map((tab) => {
          const isActive = tab.path === activeTabPath;
          return (
            <div
              key={tab.path}
              onClick={() => setActiveTab(tab.path)}
              onContextMenu={(e) => {
                e.preventDefault();
                setContextMenu({ x: e.clientX, y: e.clientY, tabPath: tab.path });
              }}
              className={`tab-item group ${
                isActive
                  ? "tab-item-active"
                  : "text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]"
              }`}
            >
              <span className="truncate flex-1">{tab.title}</span>
              {tab.isDirty && (
                <span className="w-[7px] h-[7px] rounded-full bg-[var(--color-primary)] shrink-0" />
              )}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleClose(tab.path);
                }}
                className="tab-close-button"
                title={t("tab.close")}
                aria-label={t("tab.close")}
                type="button"
              >
                <X size={13} />
              </button>
            </div>
          );
        })}
      </div>

      {/* Context Menu */}
      {contextMenu && createPortal(
        <>
          <div
            className="fixed inset-0 z-40"
            onClick={closeContextMenu}
            onContextMenu={(e) => {
              e.preventDefault();
              closeContextMenu();
            }}
          />
          <div
            className="context-menu fixed z-50 min-w-[200px]"
            style={{ left: contextMenu.x, top: contextMenu.y }}
          >
            <button
              className="menu-item"
              onClick={() => {
                handleClose(contextMenu.tabPath);
                closeContextMenu();
              }}
            >
              <XCircle size={15} className="text-[var(--color-text-muted)] shrink-0" />
              {t("tab.close")}
            </button>
            <div className="menu-separator" />
            <button
              className="menu-item"
              onClick={() => {
                handleCloseOthers(contextMenu.tabPath);
                closeContextMenu();
              }}
            >
              <CopyX size={15} className="text-[var(--color-text-muted)] shrink-0" />
              {t("tab.closeOthers")}
            </button>
            <button
              className="menu-item"
              onClick={() => {
                handleCloseAll();
                closeContextMenu();
              }}
            >
              <FolderX size={15} className="text-[var(--color-text-muted)] shrink-0" />
              {t("tab.closeAll")}
            </button>
          </div>
        </>,
        document.body,
      )}
    </>
  );
}
