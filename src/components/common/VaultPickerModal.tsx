import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { FolderOpen, RefreshCw, ArrowLeft, ChevronRight } from "lucide-react";
import { readDirectory, createFolder, isTauri, pathBasename } from "@/lib/tauriCommands";

interface VaultPickerModalProps {
  openVaultPath: (path: string) => Promise<void>;
  onClose: () => void;
}

interface DirEntry {
  name: string;
  path: string;
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

function sanitizeVaultName(name: string): string {
  return name
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9\-_]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    || "my-vault";
}

export function VaultPickerModal({ openVaultPath, onClose }: VaultPickerModalProps) {
  const { t } = useTranslation();

  const [workspaces, setWorkspaces] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Step 2 state
  const [currentPath, setCurrentPath] = useState<string | null>(null);
  const [entries, setEntries] = useState<DirEntry[]>([]);
  const [browseLoading, setBrowseLoading] = useState(false);

  // Create form
  const [nameValue, setNameValue] = useState("");
  const [creating, setCreating] = useState(false);

  const loadWorkspaces = async () => {
    setLoading(true);
    setError(null);
    setCurrentPath(null);
    try {
      const paths = await fetchAllowedPaths();
      setWorkspaces(paths);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadWorkspaces(); }, []);

  const browseDir = async (path: string) => {
    setBrowseLoading(true);
    setError(null);
    try {
      const all = await readDirectory(path);
      const dirs = all
        .filter((e) => e.is_dir)
        .map((e) => ({ name: e.name, path: e.path }));
      setEntries(dirs);
      setCurrentPath(path);
    } catch (e) {
      setError(String(e));
    } finally {
      setBrowseLoading(false);
    }
  };

  const goBack = () => {
    if (!currentPath) return;
    const sep = currentPath.includes("\\") && !currentPath.includes("/") ? "\\" : "/";
    const parent = currentPath.split(sep).slice(0, -1).join(sep) || sep;
    const isWorkspaceRoot = workspaces.includes(currentPath);
    if (isWorkspaceRoot) {
      setCurrentPath(null);
      setEntries([]);
    } else {
      browseDir(parent);
    }
  };

  const handleCreate = async () => {
    if (!nameValue.trim() || !currentPath || creating) return;
    setCreating(true);
    try {
      const vaultPath = `${currentPath}/${sanitizeVaultName(nameValue)}`;
      await createFolder(vaultPath);
      await openVaultPath(vaultPath);
    } catch (e) {
      setError(String(e));
    } finally {
      setCreating(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault();
      if (currentPath && !workspaces.includes(currentPath)) {
        goBack();
      } else if (currentPath) {
        setCurrentPath(null);
      } else {
        onClose();
      }
    }
    if (e.key === "Enter" && currentPath && nameValue.trim()) {
      e.preventDefault();
      handleCreate();
    }
  };

  return (
    <>
      <div className="dialog-backdrop fixed inset-0 z-50" onClick={onClose} />
      <div
        className="prompt-modal fixed left-1/2 top-[12%] -translate-x-1/2 z-50"
        style={{ width: 460, maxHeight: "80vh", overflow: "auto" }}
        role="dialog" aria-modal="true"
        onKeyDown={handleKeyDown}
      >
        {/* Header */}
        <div className="prompt-modal-header">
          {currentPath ? (
            <button onClick={goBack} className="dialog-button dialog-button-secondary shrink-0" style={{ minWidth: 36, minHeight: 36, padding: 0 }}>
              <ArrowLeft size={16} />
            </button>
          ) : (
            <div className="prompt-modal-icon" aria-hidden="true">
              <FolderOpen size={18} />
            </div>
          )}
          <div className="prompt-modal-copy">
            <h3 className="prompt-modal-title">
              {currentPath ? pathBasename(currentPath) : t("vaultPicker.title")}
            </h3>
            <p className="prompt-modal-description" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {currentPath ? currentPath : t("vaultPicker.step1Desc")}
            </p>
          </div>
        </div>

        {error && (
          <div className="text-[13px] text-[var(--color-danger)] px-5 pb-3 text-center">{error}</div>
        )}

        {/* ── Step 1: workspace list ── */}
        {!currentPath && (
          <>
            {loading ? (
              <div className="flex items-center justify-center py-10 text-[13px] text-[var(--color-text-muted)]">
                <RefreshCw size={16} className="animate-spin mr-2" />
                {t("vaultPicker.loading")}
              </div>
            ) : (
              <div className="px-4 pb-2 flex flex-col gap-1.5">
                {workspaces.length === 0 && (
                  <div className="text-[13px] text-[var(--color-text-muted)] py-6 text-center">
                    {t("vaultPicker.noWorkspaces")}
                  </div>
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
                      <span className="text-[14px] font-semibold text-[var(--color-text-primary)]">
                        {pathBasename(ws)}
                      </span>
                      <span className="text-[11px] text-[var(--color-text-muted)] truncate">{ws}</span>
                    </span>
                    <ChevronRight size={16} className="text-[var(--color-text-muted)] shrink-0" />
                  </button>
                ))}
              </div>
            )}
          </>
        )}

        {/* ── Step 2: browse directory ── */}
        {currentPath && (
          <>
            {browseLoading ? (
              <div className="flex items-center justify-center py-10 text-[13px] text-[var(--color-text-muted)]">
                <RefreshCw size={16} className="animate-spin mr-2" />
                {t("vaultPicker.loading")}
              </div>
            ) : (
              <div className="px-4 pb-2 flex flex-col gap-1.5">
                {/* Use this folder as vault */}
                <button
                  onClick={() => openVaultPath(currentPath)}
                  className="flex items-center gap-3 w-full px-4 py-3 rounded-[var(--radius-md)] border border-[var(--color-primary-30)] bg-[rgba(99,102,241,0.06)] text-left transition-all duration-200 hover:bg-[rgba(99,102,241,0.12)]"
                >
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[var(--radius-md)] bg-[rgba(99,102,241,0.15)] text-[var(--color-primary)]">
                    <FolderOpen size={20} />
                  </span>
                  <span className="flex flex-col min-w-0 flex-1">
                    <span className="text-[14px] font-semibold text-[var(--color-text-primary)]">
                      {t("vaultPicker.useFolder")}
                    </span>
                    <span className="text-[11px] text-[var(--color-text-muted)] truncate">{currentPath}</span>
                  </span>
                </button>

                {/* Subdirectories — chevron only to navigate deeper */}
                {entries.length === 0 && (
                  <p className="text-[13px] text-[var(--color-text-muted)] py-4 text-center">
                    {t("vaultPicker.emptyWorkspace")}
                  </p>
                )}
                {entries.map((d) => (
                  <button
                    key={d.path}
                    onClick={() => browseDir(d.path)}
                    className="flex items-center gap-3 w-full px-4 py-3 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg-surface)] text-left transition-all duration-200 hover:border-[var(--color-primary-30)] hover:bg-[var(--color-bg-hover)]"
                  >
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[var(--radius-md)] bg-[rgba(245,158,11,0.12)] text-[var(--color-folder)]">
                      <FolderOpen size={20} />
                    </span>
                    <span className="flex flex-col min-w-0 flex-1">
                      <span className="text-[14px] font-semibold text-[var(--color-text-primary)]">{d.name}</span>
                      <span className="text-[11px] text-[var(--color-text-muted)] truncate">{d.path}</span>
                    </span>
                    <ChevronRight size={16} className="text-[var(--color-text-muted)] shrink-0" />
                  </button>
                ))}

                {/* Divider */}
                <div className="flex items-center gap-3 py-2">
                  <div className="flex-1 h-px bg-[var(--color-border-light)]" />
                  <span className="text-[11px] text-[var(--color-text-muted)] uppercase tracking-wider">{t("vaultPicker.or")}</span>
                  <div className="flex-1 h-px bg-[var(--color-border-light)]" />
                </div>

                {/* Create new vault */}
                <div className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg-surface)] px-4 py-3.5">
                  <div className="mb-3">
                    <span className="text-[14px] font-semibold text-[var(--color-text-primary)]">
                      {t("vaultPicker.createVault")}
                    </span>
                    <span className="text-[11px] text-[var(--color-text-muted)] ml-2">{currentPath}/</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={nameValue}
                      onChange={(e) => setNameValue(e.target.value)}
                      className="input-base flex-1"
                      placeholder={t("vaultPicker.namePlaceholder")}
                      autoFocus
                    />
                    <button
                      onClick={handleCreate}
                      disabled={!nameValue.trim() || creating}
                      className="dialog-button dialog-button-primary shrink-0"
                    >
                      {creating ? "..." : t("dialog.create")}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </>
        )}

        <div className="prompt-modal-actions">
          {!currentPath && (
            <button onClick={() => loadWorkspaces()} className="dialog-button dialog-button-secondary" title={t("vaultPicker.refresh")}>
              <RefreshCw size={14} />
            </button>
          )}
          <button onClick={onClose} className="dialog-button dialog-button-secondary">
            {t("dialog.cancel")}
          </button>
        </div>
      </div>
    </>
  );
}
