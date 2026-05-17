import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import {
  FolderOpen, RefreshCw, ArrowLeft, Image, ChevronRight, Video,
} from "lucide-react";
import { readDirectory, isImageFile, isTauri, pathBasename } from "@/lib/tauriCommands";

interface ImagePickerModalProps {
  vaultPath: string;
  onSelect: (filePath: string) => void;
  onClose: () => void;
  kind?: "image" | "video";
}

interface DirEntry {
  name: string;
  path: string;
  is_dir: boolean;
}

async function fetchAllowedPaths(): Promise<string[]> {
  if (isTauri()) {
    const { invoke } = await import("@tauri-apps/api/core");
    return invoke<string[]>("read_allowed_paths");
  }
  const res = await fetch("/api/list-allowed-paths");
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

function isVideoFile(name: string): boolean {
  return /\.(mp4|webm|ogg|mov|m4v)$/i.test(name);
}

export function ImagePickerModal({ vaultPath, onSelect, onClose, kind = "image" }: ImagePickerModalProps) {
  const { t } = useTranslation();
  // null = showing workspace list, string = browsing a directory
  const [currentPath, setCurrentPath] = useState<string | null>(null);
  const [workspaces, setWorkspaces] = useState<string[]>([]);
  const [entries, setEntries] = useState<DirEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadWorkspaces = async () => {
    setLoading(true);
    setError(null);
    try {
      const paths = await fetchAllowedPaths();
      setWorkspaces(paths);
      setCurrentPath(null);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadWorkspaces(); }, []);

  const browseDir = async (path: string) => {
    setLoading(true);
    setError(null);
    try {
      const all = await readDirectory(path);
      const isAllowedAsset = kind === "image" ? isImageFile : isVideoFile;
      const filtered = all.filter((e) => e.is_dir || isAllowedAsset(e.name));
      setEntries(filtered.map((e) => ({ name: e.name, path: e.path, is_dir: e.is_dir })));
      setCurrentPath(path);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  };

  const goBack = () => {
    if (!currentPath) return;
    const isWorkspaceRoot = workspaces.includes(currentPath);
    if (isWorkspaceRoot) {
      setCurrentPath(null);
      setEntries([]);
    } else {
      const sep = currentPath.includes("\\") && !currentPath.includes("/") ? "\\" : "/";
      const parts = currentPath.split(sep);
      parts.pop();
      browseDir(parts.join(sep) || sep);
    }
  };

  const handleSelectImage = (imagePath: string) => {
    onSelect(imagePath);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault();
      if (currentPath) goBack();
      else onClose();
    }
  };

  const isWorkspaceList = currentPath === null;

  return (
    <>
      <div className="dialog-backdrop fixed inset-0 z-50" onClick={onClose} />
      <div
        className="prompt-modal asset-picker-modal fixed left-1/2 top-[10%] -translate-x-1/2 z-50"
        role="dialog" aria-modal="true"
        onKeyDown={handleKeyDown}
      >
        <div className="asset-picker-header">
          {!isWorkspaceList ? (
            <button onClick={goBack} className="asset-picker-back" aria-label={t("imagePicker.back")}>
              <ArrowLeft size={16} />
            </button>
          ) : (
            <div className="asset-picker-kind-icon" aria-hidden="true">
              {kind === "image" ? <Image size={18} /> : <Video size={18} />}
            </div>
          )}
          <div className="asset-picker-heading">
            <h3 className="asset-picker-title">
              {isWorkspaceList ? t(`imagePicker.${kind}Title`) : pathBasename(currentPath!)}
            </h3>
            <p className="asset-picker-description">
              {isWorkspaceList ? t(`imagePicker.${kind}ChooseWorkspace`) : currentPath}
            </p>
          </div>
        </div>

        {error && (
          <div className="text-[13px] text-[var(--color-danger)] px-5 pb-3 text-center">{error}</div>
        )}

        {loading ? (
          <div className="asset-picker-state">
            <RefreshCw size={16} className="animate-spin mr-2" />
            {t("imagePicker.loading")}
          </div>
        ) : (
          <div className="asset-picker-body">
            {/* Step 1: workspace list */}
            {isWorkspaceList && (
              <>
                {workspaces.length === 0 && (
                  <p className="text-[13px] text-[var(--color-text-muted)] py-8 text-center">
                    {t("imagePicker.noWorkspaces")}
                  </p>
                )}
                {workspaces.length > 0 && (
                  <div className="asset-picker-section-label">{t("imagePicker.workspaces")}</div>
                )}
                {workspaces.map((ws) => (
                  <button
                    key={ws}
                    onClick={() => browseDir(ws)}
                    className="asset-picker-row asset-picker-workspace-row"
                  >
                    <span className="asset-picker-row-icon asset-picker-row-icon-workspace">
                      <FolderOpen size={20} />
                    </span>
                    <span className="asset-picker-row-copy">
                      <span className="asset-picker-row-title">{pathBasename(ws)}</span>
                      <span className="asset-picker-row-path">{ws}</span>
                    </span>
                    <ChevronRight size={16} className="asset-picker-chevron" />
                  </button>
                ))}
              </>
            )}

            {/* Step 2: browse directory */}
            {!isWorkspaceList && (
              <>
                {entries.length === 0 && (
                  <p className="text-[13px] text-[var(--color-text-muted)] py-8 text-center">
                    {t(`imagePicker.${kind}Empty`)}
                  </p>
                )}
                {entries.length > 0 && (
                  <div className="asset-picker-section-label">
                    {t(`imagePicker.${kind}BrowseLabel`)}
                  </div>
                )}
                {entries.map((d) => (
                  <button
                    key={d.path}
                    onClick={() => d.is_dir ? browseDir(d.path) : handleSelectImage(d.path)}
                    className={`asset-picker-row ${d.is_dir ? "asset-picker-folder-row" : "asset-picker-file-row"}`}
                  >
                    <span className={`asset-picker-row-icon ${d.is_dir ? "asset-picker-row-icon-folder" : "asset-picker-row-icon-file"}`}>
                      {d.is_dir ? <FolderOpen size={20} /> : kind === "image" ? <Image size={20} /> : <Video size={20} />}
                    </span>
                    <span className="asset-picker-row-copy">
                      <span className="asset-picker-row-title">{d.name}</span>
                      <span className="asset-picker-row-path">{d.path}</span>
                    </span>
                    {d.is_dir && <ChevronRight size={16} className="asset-picker-chevron" />}
                  </button>
                ))}
              </>
            )}
          </div>
        )}

        <div className="asset-picker-actions">
          <button onClick={onClose} className="dialog-button dialog-button-secondary">
            {t("dialog.cancel")}
          </button>
        </div>
      </div>
    </>
  );
}
