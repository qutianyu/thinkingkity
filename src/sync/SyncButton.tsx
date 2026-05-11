import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { RefreshCw } from "lucide-react";
import { useSyncStore } from "./syncStore";
import { useVaultStore } from "@/stores/vaultStore";
import { syncGitSync } from "@/lib/tauriCommands";
import { useFileTreeStore } from "@/stores/fileTreeStore";

export function SyncButton() {
  const { t } = useTranslation();
  const config = useSyncStore((s) => s.config);
  const status = useSyncStore((s) => s.status);
  const setStatus = useSyncStore((s) => s.setStatus);
  const showToast = useSyncStore((s) => s.showToast);
  const vaultPath = useVaultStore((s) => s.vaultPath);
  const refreshTree = useFileTreeStore((s) => s.refreshTree);

  const handleSync = useCallback(async () => {
    if (!vaultPath || config.method === "none" || status === "syncing") return;

    setStatus("syncing");
    try {
      let result;
      if (config.method === "git") {
        result = await syncGitSync(
          vaultPath,
          config.git.remoteUrl,
          config.git.branch,
        );
      } else {
        showToast(false, "WebDAV sync is not yet implemented.");
        setStatus("error", "WebDAV sync is not yet implemented.");
        return;
      }

      if (result.success) {
        setStatus("success", result.message);
        showToast(true, result.message);
        await refreshTree(vaultPath);
      } else {
        setStatus("error", result.message || result.errors.join("\n"));
        showToast(false, result.message || result.errors.join("\n"));
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Sync failed.";
      setStatus("error", msg);
      showToast(false, msg);
    }
  }, [vaultPath, status, config, setStatus, showToast, refreshTree]);

  const syncing = status === "syncing";
  const disabled = !vaultPath || config.method === "none";

  return (
    <button
      onClick={handleSync}
      className="bottom-sync-button"
      disabled={disabled}
      title={
        disabled
          ? t("sync.notConfigured")
          :
        status === "error"
          ? `${t("sync.statusError")}: ${useSyncStore.getState().statusMessage}`
          : t("sync.syncNow")
      }
    >
      <RefreshCw
        size={13}
        className={syncing ? "animate-spin" : ""}
        color={status === "error" ? "var(--color-error, #ef4444)" : undefined}
      />
    </button>
  );
}
