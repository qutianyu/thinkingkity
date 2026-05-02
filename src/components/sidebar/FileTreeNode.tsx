import { useState, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { ChevronRight, Folder, FolderOpen, FileText, FilePlus, FolderPlus, Pencil, Trash2, FileSpreadsheet, Image, File, Code, FolderSearch } from "lucide-react";
import type { FileEntry } from "@/types";
import { useFileTreeStore } from "@/stores/fileTreeStore";
import { useEditorStore } from "@/stores/editorStore";
import { useFileOperations } from "@/hooks/useFileOperations";
import { isImageFile, isJsonFile, isPdfFile, isTextFile, isCodeFile, isMarkdownFile, isMermaidFile, revealInExplorer } from "@/lib/tauriCommands";
import { getIconEntry } from "@/lib/fileIcons";
import { FileTypePicker, CodeTypePicker } from "./FileActions";

type DropPosition = "before" | "inside" | "after";

interface FileTreeNodeProps {
  entry: FileEntry;
  depth: number;
  dropTarget: { path: string; position: DropPosition } | null;
  onPointerDown: (e: React.PointerEvent<HTMLDivElement>, path: string, isDir: boolean) => void;
}

export function FileTreeNode({ entry, depth, dropTarget, onPointerDown }: FileTreeNodeProps) {
  const { t } = useTranslation();
  const expandedPaths = useFileTreeStore((s) => s.expandedPaths);
  const treeVersion = useFileTreeStore((s) => s.treeVersion);
  const toggleExpand = useFileTreeStore((s) => s.toggleExpand);
  const loadChildren = useFileTreeStore((s) => s.loadChildren);
  const openFile = useEditorStore((s) => s.openFile);
  const activeTabPath = useEditorStore((s) => s.activeTabPath);
  const { handleNewJsonFile, handleNewCodeFile, handleNewFolder, handleRename, handleDelete } =
    useFileOperations();
  const [children, setChildren] = useState<FileEntry[]>([]);
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
  } | null>(null);
  const [fileTypePicker, setFileTypePicker] = useState<{
    x: number;
    y: number;
    parentPath: string;
  } | null>(null);
  const [codeTypePicker, setCodeTypePicker] = useState<{
    x: number;
    y: number;
    parentPath: string;
  } | null>(null);
  const isExpanded = expandedPaths.has(entry.path);
  const lowerName = entry.name.toLowerCase();
  const isMd = isMarkdownFile(entry.path);
  const isCsv = lowerName.endsWith(".csv");
  const isJson = isJsonFile(entry.path);
  const isText = isTextFile(entry.path);
  const isImageFileEntry = isImageFile(entry.path);
  const isPdf = isPdfFile(entry.path);
  const isCode = isCodeFile(entry.path);
  const isMermaid = isMermaidFile(entry.path);
  const isOpenable = isMd || isCsv || isJson || isText || isCode || isMermaid || isImageFileEntry || isPdf;
  const isActive = activeTabPath === entry.path;
  const dragSourcePath = useFileTreeStore((s) => s.dragSourcePath);

  const isDragSelf = dragSourcePath === entry.path;

  const isDropTarget = dropTarget?.path === entry.path;
  const dropPosition = isDropTarget ? dropTarget.position : null;

  useEffect(() => {
    if (isExpanded && entry.is_dir) {
      loadChildren(entry).then(setChildren);
    } else if (!isExpanded) {
      setChildren([]);
    }
  }, [isExpanded, entry, treeVersion]);

  const handleClick = useCallback(() => {
    if (entry.is_dir) {
      toggleExpand(entry.path);
    } else if (isOpenable) {
      openFile(entry.path);
    }
  }, [entry, isOpenable, openFile, toggleExpand]);

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY });
  };

  const closeContextMenu = () => setContextMenu(null);

  let dropClass = "";
  if (dropPosition === "inside") dropClass = "tree-item-drop-inside";
  else if (dropPosition === "before") dropClass = "tree-item-drop-before";
  else if (dropPosition === "after") dropClass = "tree-item-drop-after";

  return (
    <>
      <div
        data-tree-path={entry.path}
        data-tree-is-dir={entry.is_dir ? "true" : "false"}
        className={`tree-item group ${
          isActive
            ? "tree-item-active"
            : "text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]"
        } ${isDragSelf ? "tree-item-dragging" : ""} ${dropClass}`}
        style={{ paddingLeft: `${depth * 18 + 12}px` }}
        onClick={handleClick}
        onContextMenu={handleContextMenu}
        onPointerDown={(e) => onPointerDown(e, entry.path, entry.is_dir)}
      >
        {entry.is_dir ? (
          <>
            <span className="shrink-0">
              <ChevronRight
                size={15}
                className={`transition-transform duration-200 ${
                  isExpanded ? "rotate-90" : ""
                }`}
              />
            </span>
            {isExpanded ? (
              <FolderOpen size={15} className="text-[var(--color-folder)] shrink-0" />
            ) : (
              <Folder size={15} className="text-[var(--color-folder)] shrink-0" />
            )}
          </>
        ) : (
          <>
            <span className="w-[15px] shrink-0" />
            {isImageFileEntry ? (
              <Image
                size={15}
                className={`shrink-0 ${
                  isActive ? "text-[var(--color-primary)]" : "text-[var(--color-file-image)]"
                }`}
              />
            ) : isPdf ? (
              <File
                size={15}
                className={`shrink-0 ${
                  isActive ? "text-[var(--color-primary)]" : "text-[var(--color-file-pdf)]"
                }`}
              />
            ) : isCsv ? (
              <FileSpreadsheet
                size={15}
                className={`shrink-0 ${
                  isActive ? "text-[var(--color-primary)]" : "text-[var(--color-file-csv)]"
                }`}
              />
            ) : (() => {
              const iconEntry = getIconEntry(entry.path);
              if (iconEntry) {
                const Icon = iconEntry.component;
                return (
                  <Icon
                    width={15}
                    height={15}
                    className="shrink-0 file-tree-devicon"
                    style={{ color: isActive ? "var(--color-primary)" : iconEntry.color }}
                  />
                );
              }
              return (
                <FileText
                  size={15}
                  className={`shrink-0 ${
                    isActive
                      ? "text-[var(--color-primary)]"
                      : isMd
                        ? "text-[var(--color-file-md)]"
                        : isText
                          ? "text-[var(--color-file-text)]"
                        : "text-[var(--color-text-muted)]"
                  }`}
                />
              );
            })()}
          </>
        )}
        <span className="truncate">{entry.name}</span>
      </div>

      {isExpanded &&
        entry.is_dir &&
        children.map((child) => (
          <FileTreeNode
            key={child.path}
            entry={child}
            depth={depth + 1}
            dropTarget={dropTarget}
            onPointerDown={onPointerDown}
          />
        ))}

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
            className="context-menu fixed z-50 min-w-[220px]"
            style={{ left: contextMenu.x, top: contextMenu.y }}
          >
            {entry.is_dir && (
              <>
                <button
                  className="menu-item"
                  onClick={(e) => {
                    const rect = e.currentTarget.getBoundingClientRect();
                    setContextMenu(null);
                    setFileTypePicker({
                      x: rect.right + 8,
                      y: rect.bottom + 4,
                      parentPath: entry.path,
                    });
                  }}
                >
                  <FilePlus size={15} className="text-[var(--color-file-md)] shrink-0" />
                  {t("sidebar.newFile")}
                </button>
                <button
                  className="menu-item"
                  onClick={() => {
                    handleNewFolder(entry.path);
                    closeContextMenu();
                  }}
                >
                  <FolderPlus size={15} className="text-[var(--color-folder)] shrink-0" />
                  {t("sidebar.newFolder")}
                </button>
                <button
                  className="menu-item"
                  onClick={(e) => {
                    const rect = e.currentTarget.getBoundingClientRect();
                    setContextMenu(null);
                    setCodeTypePicker({
                      x: rect.right + 8,
                      y: rect.bottom + 4,
                      parentPath: entry.path,
                    });
                  }}
                >
                  <Code size={15} className="text-[var(--color-primary)] shrink-0" />
                  {t("sidebar.newCode")}
                </button>
                <div className="menu-separator" />
              </>
            )}
            <button
              className="menu-item"
              onClick={() => {
                handleRename(entry.path);
                closeContextMenu();
              }}
            >
              <Pencil size={15} className="text-[var(--color-text-muted)] shrink-0" />
              {t("contextMenu.rename")}
            </button>
            <button
              className="menu-item"
              onClick={() => {
                revealInExplorer(entry.path);
                closeContextMenu();
              }}
            >
              <FolderSearch size={15} className="text-[var(--color-text-muted)] shrink-0" />
              {t("contextMenu.revealInExplorer")}
            </button>
            <div className="menu-separator" />
            <button
              className="menu-item menu-item-danger"
              onClick={() => {
                handleDelete(entry.path);
                closeContextMenu();
              }}
            >
              <Trash2 size={15} className="shrink-0" />
              {t("contextMenu.delete")}
            </button>
          </div>
        </>,
        document.body,
      )}

      {fileTypePicker && createPortal(
        <FileTypePicker
          x={fileTypePicker.x}
          y={fileTypePicker.y}
          onClose={() => setFileTypePicker(null)}
          onSelect={(ext, titleKey, descKey) => {
            if (ext === "json") {
              handleNewJsonFile(fileTypePicker.parentPath);
            } else {
              handleNewCodeFile(fileTypePicker.parentPath, ext, titleKey, descKey);
            }
            setFileTypePicker(null);
          }}
        />,
        document.body,
      )}

      {codeTypePicker && createPortal(
        <CodeTypePicker
          x={codeTypePicker.x}
          y={codeTypePicker.y}
          onClose={() => setCodeTypePicker(null)}
          onSelect={(ext, titleKey, descKey) => {
            handleNewCodeFile(codeTypePicker.parentPath, ext, titleKey, descKey);
            setCodeTypePicker(null);
          }}
        />,
        document.body,
      )}
    </>
  );
}
