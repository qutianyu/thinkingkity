import { useCallback, useEffect, useState } from "react";
import { History, RotateCcw, Trash2, X } from "lucide-react";
import Papa from "papaparse";
import { useTranslation } from "react-i18next";
import {
  clearSnapshots,
  deleteSnapshot,
  deleteTrashEntry,
  listSnapshots,
  listTrash,
  readSnapshot,
  restoreSnapshot,
  restoreTrash,
  type SnapshotEntry,
  type TrashEntry,
} from "@/lib/tauriCommands";
import { useDialogStore } from "@/stores/dialogStore";
import { useEditorStore } from "@/stores/editorStore";
import { useFileTreeStore } from "@/stores/fileTreeStore";
import { useVaultStore } from "@/stores/vaultStore";

type RecoveryTab = "history" | "trash";

interface RecoveryCenterProps {
  filePath?: string;
  onClose: () => void;
}

function formatTime(value: string): string {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return value;
  return new Date(numeric).toLocaleString();
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function basename(path: string): string {
  return path.split(/[\\/]/).pop() || path;
}

function isCsvPath(path: string): boolean {
  return path.toLowerCase().endsWith(".csv");
}

function parseCsvPreview(content: string): string[][] {
  if (!content.trim()) return [];
  const result = Papa.parse<string[]>(content, {
    skipEmptyLines: false,
  });
  return result.data.map((row) => row.map((cell) => cell ?? ""));
}

export function RecoveryCenter({ filePath, onClose }: RecoveryCenterProps) {
  const { t } = useTranslation();
  const vaultPath = useVaultStore((s) => s.vaultPath);
  const refreshTree = useFileTreeStore((s) => s.refreshTree);
  const openFile = useEditorStore((s) => s.openFile);
  const closeTab = useEditorStore((s) => s.closeTab);
  const showConfirm = useDialogStore((s) => s.showConfirm);
  const [tab, setTab] = useState<RecoveryTab>("history");
  const [snapshots, setSnapshots] = useState<SnapshotEntry[]>([]);
  const [trash, setTrash] = useState<TrashEntry[]>([]);
  const [selectedSnapshot, setSelectedSnapshot] = useState<SnapshotEntry | null>(null);
  const [preview, setPreview] = useState("");
  const [loading, setLoading] = useState(false);
  const csvPreviewRows =
    selectedSnapshot && isCsvPath(selectedSnapshot.filePath)
      ? parseCsvPreview(preview)
      : null;

  const load = useCallback(async () => {
    if (!vaultPath) return;
    setLoading(true);
    try {
      const [snapshotEntries, trashEntries] = await Promise.all([
        listSnapshots(vaultPath, filePath),
        listTrash(vaultPath),
      ]);
      setSnapshots(snapshotEntries);
      setTrash(trashEntries);
      setSelectedSnapshot((current) => {
        if (current && snapshotEntries.some((entry) => entry.id === current.id)) return current;
        return snapshotEntries[0] ?? null;
      });
    } finally {
      setLoading(false);
    }
  }, [filePath, vaultPath]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    let disposed = false;
    async function loadPreview() {
      if (!vaultPath || !selectedSnapshot) {
        setPreview("");
        return;
      }
      const content = await readSnapshot(vaultPath, selectedSnapshot.id);
      if (!disposed) setPreview(content);
    }
    loadPreview().catch(() => {
      if (!disposed) setPreview("");
    });
    return () => {
      disposed = true;
    };
  }, [selectedSnapshot, vaultPath]);

  const handleRestoreSnapshot = useCallback(async () => {
    if (!vaultPath || !selectedSnapshot) return;
    const confirmed = await showConfirm({
      title: t("recovery.restoreSnapshotTitle"),
      description: t("recovery.restoreSnapshotDescription", { path: selectedSnapshot.filePath }),
      confirmLabel: t("recovery.restore"),
      cancelLabel: t("dialog.cancel"),
    });
    if (!confirmed) return;
    const restoredPath = await restoreSnapshot(vaultPath, selectedSnapshot.id);
    closeTab(restoredPath);
    await openFile(restoredPath);
    await refreshTree(vaultPath);
    await load();
  }, [closeTab, load, openFile, refreshTree, selectedSnapshot, showConfirm, t, vaultPath]);

  const handleDeleteSnapshot = useCallback(async () => {
    if (!vaultPath || !selectedSnapshot) return;
    const confirmed = await showConfirm({
      title: t("recovery.deleteSnapshotTitle"),
      description: t("recovery.deleteSnapshotDescription", { path: selectedSnapshot.filePath }),
      confirmLabel: t("recovery.delete"),
      cancelLabel: t("dialog.cancel"),
      variant: "danger",
    });
    if (!confirmed) return;
    await deleteSnapshot(vaultPath, selectedSnapshot.id);
    await load();
  }, [load, selectedSnapshot, showConfirm, t, vaultPath]);

  const handleClearSnapshots = useCallback(async () => {
    if (!vaultPath || snapshots.length === 0) return;
    const confirmed = await showConfirm({
      title: filePath ? t("recovery.clearFileSnapshotsTitle") : t("recovery.clearAllSnapshotsTitle"),
      description: filePath
        ? t("recovery.clearFileSnapshotsDescription", { path: filePath })
        : t("recovery.clearAllSnapshotsDescription"),
      confirmLabel: t("recovery.clear"),
      cancelLabel: t("dialog.cancel"),
      variant: "danger",
    });
    if (!confirmed) return;
    await clearSnapshots(vaultPath, filePath);
    await load();
  }, [filePath, load, showConfirm, snapshots.length, t, vaultPath]);

  const handleRestoreTrash = useCallback(async (entry: TrashEntry) => {
    if (!vaultPath) return;
    const restoredPath = await restoreTrash(vaultPath, entry.id);
    await refreshTree(vaultPath);
    if (!entry.isDirectory) {
      closeTab(restoredPath);
      await openFile(restoredPath);
    }
    await load();
  }, [closeTab, load, openFile, refreshTree, vaultPath]);

  const handleDeleteTrash = useCallback(async (entry: TrashEntry) => {
    if (!vaultPath) return;
    const confirmed = await showConfirm({
      title: t("recovery.deletePermanentlyTitle"),
      description: t("recovery.deletePermanentlyDescription", { path: entry.originalPath }),
      confirmLabel: t("recovery.delete"),
      cancelLabel: t("dialog.cancel"),
      variant: "danger",
    });
    if (!confirmed) return;
    await deleteTrashEntry(vaultPath, entry.id);
    await load();
  }, [load, showConfirm, t, vaultPath]);

  const formatReason = useCallback((reason: string) => {
    if (reason === "manual-save") return t("recovery.reasonManualSave");
    if (reason === "before-restore") return t("recovery.reasonBeforeRestore");
    return reason;
  }, [t]);

  return (
    <div
      className="recovery-overlay"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      <div className="recovery-modal" onClick={(event) => event.stopPropagation()}>
        <div className="recovery-header">
          <div>
            <div className="recovery-title">{t("recovery.title")}</div>
            <div className="recovery-subtitle">
              {filePath
                ? t("recovery.historyFor", { name: basename(filePath) })
                : t("recovery.subtitle")}
            </div>
          </div>
          <button className="recovery-icon-button" type="button" onClick={onClose} aria-label={t("tab.close")}>
            <X size={16} />
          </button>
        </div>

        <div className="recovery-tabs">
          <button
            type="button"
            className={tab === "history" ? "recovery-tab recovery-tab-active" : "recovery-tab"}
            onClick={() => setTab("history")}
          >
            <History size={14} />
            {t("recovery.fileHistory")}
          </button>
          <button
            type="button"
            className={tab === "trash" ? "recovery-tab recovery-tab-active" : "recovery-tab"}
            onClick={() => setTab("trash")}
          >
            <Trash2 size={14} />
            {t("recovery.deletedFiles")}
          </button>
        </div>

        {loading ? (
          <div className="recovery-empty">{t("recovery.loading")}</div>
        ) : tab === "history" ? (
          <div className="recovery-body recovery-history-layout">
            <div className="recovery-history-pane">
              <div className="recovery-history-toolbar">
                <button
                  type="button"
                  className="recovery-button recovery-button-danger"
                  onClick={handleClearSnapshots}
                  disabled={snapshots.length === 0}
                >
                  {t("recovery.clearHistory")}
                </button>
              </div>
              <div className="recovery-list">
                {snapshots.length === 0 ? (
                  <div className="recovery-empty">{t("recovery.noSnapshots")}</div>
                ) : (
                  snapshots.map((entry) => (
                    <button
                      key={entry.id}
                      type="button"
                      className={
                        selectedSnapshot?.id === entry.id
                          ? "recovery-list-item recovery-list-item-active"
                          : "recovery-list-item"
                      }
                      onClick={() => setSelectedSnapshot(entry)}
                      >
                      <span className="recovery-list-title">{entry.filePath}</span>
                      <span className="recovery-list-meta">
                        {formatTime(entry.createdAt)} · {formatSize(entry.size)} · {formatReason(entry.reason)}
                      </span>
                    </button>
                  ))
                )}
              </div>
            </div>
            <div className="recovery-preview-pane">
              <div className="recovery-preview-toolbar">
                <button
                  type="button"
                  className="recovery-button recovery-button-danger"
                  onClick={handleDeleteSnapshot}
                  disabled={!selectedSnapshot}
                >
                  {t("recovery.delete")}
                </button>
                <button type="button" className="recovery-button recovery-button-primary" onClick={handleRestoreSnapshot} disabled={!selectedSnapshot}>
                  <RotateCcw size={14} />
                  {t("recovery.restore")}
                </button>
              </div>
              {csvPreviewRows ? (
                csvPreviewRows.length === 0 ? (
                  <pre className="recovery-preview">{t("recovery.selectSnapshot")}</pre>
                ) : (
                  <div className="recovery-csv-preview">
                    <table>
                      <tbody>
                        {csvPreviewRows.map((row, rowIndex) => (
                          <tr key={rowIndex}>
                            {row.map((cell, cellIndex) => (
                              <td key={cellIndex}>{cell}</td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )
              ) : (
                <pre className="recovery-preview">{preview || t("recovery.selectSnapshot")}</pre>
              )}
            </div>
          </div>
        ) : (
          <div className="recovery-body">
            {trash.length === 0 ? (
              <div className="recovery-empty">{t("recovery.trashEmpty")}</div>
            ) : (
              <div className="recovery-trash-list">
                {trash.map((entry) => (
                  <div key={entry.id} className="recovery-trash-item">
                    <div className="recovery-trash-main">
                      <span className="recovery-list-title">{entry.originalPath}</span>
                      <span className="recovery-list-meta">
                        {t("recovery.deletedAt", { time: formatTime(entry.deletedAt) })} · {formatSize(entry.size)}
                        {entry.isDirectory ? ` · ${t("recovery.folder")}` : ""}
                      </span>
                    </div>
                    <div className="recovery-trash-actions">
                      <button type="button" className="recovery-button" onClick={() => handleRestoreTrash(entry)}>
                        {t("recovery.restore")}
                      </button>
                      <button type="button" className="recovery-button recovery-button-danger" onClick={() => handleDeleteTrash(entry)}>
                        {t("recovery.delete")}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
