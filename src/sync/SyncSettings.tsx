import { useState, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { ChevronDown, Eye, EyeOff, RefreshCw, Loader2 } from "lucide-react";
import { useSyncStore } from "./syncStore";
import { useVaultStore } from "@/stores/vaultStore";
import { syncGitInit } from "@/lib/tauriCommands";
import type { SyncMethod, SyncDirection } from "./types";

interface SyncSettingsProps {
  onSave: () => Promise<void>;
}

export function SyncSettings({ onSave }: SyncSettingsProps) {
  const { t } = useTranslation();
  const config = useSyncStore((s) => s.config);
  const setMethod = useSyncStore((s) => s.setMethod);
  const setDirection = useSyncStore((s) => s.setDirection);
  const updateWebDAVConfig = useSyncStore((s) => s.updateWebDAVConfig);
  const updateGitConfig = useSyncStore((s) => s.updateGitConfig);

  const vaultPath = useVaultStore((s) => s.vaultPath);
  const showToast = useSyncStore((s) => s.showToast);

  const [expanded, setExpanded] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [initLoading, setInitLoading] = useState(false);

  const changeMethod = useCallback(
    async (method: SyncMethod) => {
      setMethod(method);
      await onSave();
    },
    [setMethod, onSave],
  );

  const changeDirection = useCallback(
    async (direction: SyncDirection) => {
      setDirection(direction);
      await onSave();
    },
    [setDirection, onSave],
  );

  const handleWebDAVBlur = useCallback(async () => {
    await onSave();
  }, [onSave]);

  const handleGitBlur = useCallback(async () => {
    await onSave();
  }, [onSave]);

  const handleInit = useCallback(async () => {
    if (!vaultPath || initLoading) return;
    setInitLoading(true);
    try {
      const result = await syncGitInit(
        vaultPath,
        config.git.remoteUrl,
        config.git.branch,
      );
      await onSave();
      showToast(result.success, result.message);
    } catch (e) {
      showToast(false, e instanceof Error ? e.message : "Init failed.");
    } finally {
      setInitLoading(false);
    }
  }, [vaultPath, initLoading, config.git, onSave, showToast]);

  const methodLabel = () => {
    if (config.method === "webdav") return t("sync.methodWebDAV");
    if (config.method === "git") return t("sync.methodGit");
    return t("sync.methodNone");
  };

  const METHODS: { value: SyncMethod; label: string }[] = [
    { value: "none", label: t("sync.methodNone") },
    { value: "webdav", label: t("sync.methodWebDAV") },
    { value: "git", label: t("sync.methodGit") },
  ];

  const DIRECTIONS: { value: SyncDirection; label: string }[] = [
    { value: "push", label: t("sync.directionPush") },
    { value: "pull", label: t("sync.directionPull") },
  ];

  return (
    <div className="settings-card">
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="settings-card-toggle"
      >
        <div className="w-9 h-9 rounded-[var(--radius-md)] bg-[var(--color-accent-bg)] flex items-center justify-center shrink-0">
          <RefreshCw size={18} className="text-[var(--color-primary)]" />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-[15px] font-semibold">{t("sync.title")}</h3>
          {!expanded && (
            <p className="text-[13px] text-[var(--color-text-muted)] truncate">
              {methodLabel()}
            </p>
          )}
        </div>
        <ChevronDown
          size={16}
          className={`text-[var(--color-text-muted)] shrink-0 transition-transform duration-200 ${
            expanded ? "rotate-180" : ""
          }`}
        />
      </button>

      {expanded && (
        <div className="settings-ai-form">
          {/* Method selector */}
          <div className="settings-ai-row">
            <label className="settings-ai-label">{t("sync.method")}</label>
            <div className="flex gap-1.5">
              {METHODS.map((m) => (
                <button
                  key={m.value}
                  onClick={() => changeMethod(m.value)}
                  className={`display-type-chip ${
                    config.method === m.value ? "display-type-chip-active" : ""
                  }`}
                >
                  {m.label}
                </button>
              ))}
            </div>
          </div>

          {/* Direction selector — only for WebDAV */}
          {config.method === "webdav" && (
            <div className="settings-ai-row">
              <label className="settings-ai-label">
                {t("sync.direction")}
              </label>
              <div className="flex gap-1.5">
                {DIRECTIONS.map((d) => (
                  <button
                    key={d.value}
                    onClick={() => changeDirection(d.value)}
                    className={`display-type-chip ${
                      config.direction === d.value
                        ? "display-type-chip-active"
                        : ""
                    }`}
                  >
                    {d.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* WebDAV config */}
          {config.method === "webdav" && (
            <>
              <div className="settings-ai-row">
                <label className="settings-ai-label">
                  {t("sync.webdavUrl")}
                </label>
                <input
                  type="text"
                  value={config.webdav.url}
                  onChange={(e) => updateWebDAVConfig({ url: e.target.value })}
                  onBlur={handleWebDAVBlur}
                  className="input-base settings-ai-control"
                  placeholder="https://dav.example.com/remote.php/dav/files/user/vault"
                />
              </div>
              <div className="settings-ai-row">
                <label className="settings-ai-label">
                  {t("sync.webdavUsername")}
                </label>
                <input
                  type="text"
                  value={config.webdav.username}
                  onChange={(e) =>
                    updateWebDAVConfig({ username: e.target.value })
                  }
                  onBlur={handleWebDAVBlur}
                  className="input-base settings-ai-control"
                  placeholder="admin"
                />
              </div>
              <div className="settings-ai-row">
                <label className="settings-ai-label">
                  {t("sync.webdavPassword")}
                </label>
                <div className="settings-ai-secret">
                  <input
                    type={showPassword ? "text" : "password"}
                    value={config.webdav.password}
                    onChange={(e) =>
                      updateWebDAVConfig({ password: e.target.value })
                    }
                    onBlur={handleWebDAVBlur}
                    className="input-base settings-ai-control"
                    placeholder="••••••••"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="settings-ai-inline-button"
                    title={
                      showPassword ? t("sync.hide") : t("sync.show")
                    }
                    aria-label={
                      showPassword ? t("sync.hide") : t("sync.show")
                    }
                  >
                    {showPassword ? (
                      <EyeOff size={15} />
                    ) : (
                      <Eye size={15} />
                    )}
                  </button>
                </div>
              </div>
              <div className="settings-ai-actions">
                <button
                  type="button"
                  className="settings-ai-test-button"
                  disabled
                >
                  {t("sync.testConnection")}
                </button>
              </div>
            </>
          )}

          {/* Git config */}
          {config.method === "git" && (
            <>
              <div className="settings-ai-row">
                <label className="settings-ai-label">
                  {t("sync.gitRemoteUrl")}
                </label>
                <input
                  type="text"
                  value={config.git.remoteUrl}
                  onChange={(e) =>
                    updateGitConfig({ remoteUrl: e.target.value })
                  }
                  onBlur={handleGitBlur}
                  className="input-base settings-ai-control"
                  placeholder="https://github.com/user/vault.git"
                />
              </div>
              <div className="settings-ai-row">
                <label className="settings-ai-label">
                  {t("sync.gitBranch")}
                </label>
                <input
                  type="text"
                  value={config.git.branch}
                  onChange={(e) =>
                    updateGitConfig({ branch: e.target.value })
                  }
                  onBlur={handleGitBlur}
                  className="input-base settings-ai-control"
                  placeholder="main"
                />
              </div>
              <div className="settings-ai-actions">
                <button
                  type="button"
                  className="settings-ai-test-button"
                  onClick={handleInit}
                  disabled={initLoading || !config.git.remoteUrl}
                >
                  {initLoading && <Loader2 size={14} className="animate-spin" />}
                  {t("sync.initGit")}
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
