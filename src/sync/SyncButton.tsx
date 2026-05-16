import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { RefreshCw } from "lucide-react";
import { useSyncStore } from "./syncStore";
import { useVaultStore } from "@/stores/vaultStore";
import { githubPushLocal } from "@/lib/tauriCommands";
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
    showToast("loading", t("sync.syncing"));
    try {
      let result;
      result = await githubPushLocal(
        vaultPath,
        config.git.remoteUrl,
        config.git.branch,
      );

      if (result.success) {
        setStatus("success", result.message);
        showToast("success", result.message);
        await refreshTree(vaultPath);
      } else {
        setStatus("error", result.message || result.errors.join("\n"));
        showToast("error", result.message || result.errors.join("\n"));
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Sync failed.";
      setStatus("error", msg);
      showToast("error", msg);
    }
  }, [vaultPath, status, config, setStatus, showToast, refreshTree, t]);

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
          : syncing
            ? t("sync.syncing")
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
