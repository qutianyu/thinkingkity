import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import {
  FolderOpen, RefreshCw, ArrowLeft, Image, ChevronRight,
} from "lucide-react";
import { readDirectory, isImageFile, isTauri, pathBasename } from "@/lib/tauriCommands";

interface ImagePickerModalProps {
  vaultPath: string;
  onSelect: (filePath: string) => void;
  onClose: () => void;
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

export function ImagePickerModal({ vaultPath, onSelect, onClose }: ImagePickerModalProps) {
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
      const filtered = all.filter((e) => e.is_dir || isImageFile(e.name));
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
        className="prompt-modal fixed left-1/2 top-[10%] -translate-x-1/2 z-50"
        style={{ width: 480, maxHeight: "75vh", overflow: "auto" }}
        role="dialog" aria-modal="true"
        onKeyDown={handleKeyDown}
      >
        <div className="prompt-modal-header">
          {!isWorkspaceList ? (
            <button onClick={goBack} className="dialog-button dialog-button-secondary shrink-0" style={{ minWidth: 36, minHeight: 36, padding: 0 }}>
              <ArrowLeft size={16} />
            </button>
          ) : (
            <div className="prompt-modal-icon" aria-hidden="true">
              <Image size={18} />
            </div>
          )}
          <div className="prompt-modal-copy">
            <h3 className="prompt-modal-title">
              {isWorkspaceList ? t("imagePicker.title") : pathBasename(currentPath!)}
            </h3>
            <p className="prompt-modal-description" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {isWorkspaceList ? t("imagePicker.chooseWorkspace") : currentPath}
            </p>
          </div>
        </div>

        {error && (
          <div className="text-[13px] text-[var(--color-danger)] px-5 pb-3 text-center">{error}</div>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-10 text-[13px] text-[var(--color-text-muted)]">
            <RefreshCw size={16} className="animate-spin mr-2" />
            {t("imagePicker.loading")}
          </div>
        ) : (
          <div className="px-4 pb-2 flex flex-col gap-1">
            {/* Step 1: workspace list */}
            {isWorkspaceList && (
              <>
                {workspaces.length === 0 && (
                  <p className="text-[13px] text-[var(--color-text-muted)] py-8 text-center">
                    {t("imagePicker.noWorkspaces")}
                  </p>
                )}
                {workspaces.map((ws) => (
                  <button
                    key={ws}
                    onClick={() => browseDir(ws)}
                    className="flex items-center gap-3 w-full px-4 py-3 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg-surface)] text-left transition-all duration-200 hover:border-[var(--color-primary-30)] hover:bg-[var(--color-bg-hover)]"
                  >
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[var(--radius-md)] bg-[rgba(99,102,241,0.08)] text-[var(--color-primary)]">
                      <FolderOpen size={20} />
                    </span>
                    <span className="flex flex-col min-w-0 flex-1">
                      <span className="text-[14px] font-semibold text-[var(--color-text-primary)]">{pathBasename(ws)}</span>
                      <span className="text-[11px] text-[var(--color-text-muted)] truncate">{ws}</span>
                    </span>
                    <ChevronRight size={16} className="text-[var(--color-text-muted)] shrink-0" />
                  </button>
                ))}
              </>
            )}

            {/* Step 2: browse directory */}
            {!isWorkspaceList && (
              <>
                {entries.length === 0 && (
                  <p className="text-[13px] text-[var(--color-text-muted)] py-8 text-center">
                    {t("imagePicker.empty")}
                  </p>
                )}
                {entries.map((d) => (
                  <button
                    key={d.path}
                    onClick={() => d.is_dir ? browseDir(d.path) : handleSelectImage(d.path)}
                    className={`flex items-center gap-3 w-full px-4 py-3 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg-surface)] text-left transition-all duration-200 hover:border-[var(--color-primary-30)] hover:bg-[var(--color-bg-hover)] ${
                      !d.is_dir ? "border-[var(--color-primary-30)]" : ""
                    }`}
                  >
                    <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-[var(--radius-md)] ${
                      d.is_dir
                        ? "bg-[rgba(245,158,11,0.12)] text-[var(--color-folder)]"
                        : "bg-[rgba(99,102,241,0.08)] text-[var(--color-primary)]"
                    }`}>
                      {d.is_dir ? <FolderOpen size={20} /> : <Image size={20} />}
                    </span>
                    <span className="flex flex-col min-w-0 flex-1">
                      <span className="text-[14px] font-semibold text-[var(--color-text-primary)] truncate">{d.name}</span>
                      <span className="text-[11px] text-[var(--color-text-muted)] truncate">{d.path}</span>
                    </span>
                    {d.is_dir && <ChevronRight size={16} className="text-[var(--color-text-muted)] shrink-0" />}
                  </button>
                ))}
              </>
            )}
          </div>
        )}

        <div className="prompt-modal-actions">
          <button onClick={onClose} className="dialog-button dialog-button-secondary">
            {t("dialog.cancel")}
          </button>
        </div>
      </div>
    </>
  );
}
