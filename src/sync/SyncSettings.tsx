import { useState, useCallback, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { ChevronDown, Eye, EyeOff, RefreshCw, Loader2 } from "lucide-react";
import { useSyncStore } from "./syncStore";
import { useVaultStore } from "@/stores/vaultStore";
import { githubPullRemote, githubPushLocal } from "@/lib/tauriCommands";
import { writeGitConfig, ensureGitConfig } from "./gitConfigStorage";
import type { SyncMethod } from "./types";

interface SyncSettingsProps {
  onSave: () => Promise<void>;
}

export function SyncSettings({ onSave }: SyncSettingsProps) {
  const { t } = useTranslation();
  const config = useSyncStore((s) => s.config);
  const setMethod = useSyncStore((s) => s.setMethod);
  const updateGitConfig = useSyncStore((s) => s.updateGitConfig);

  const vaultPath = useVaultStore((s) => s.vaultPath);
  const showToast = useSyncStore((s) => s.showToast);

  const [expanded, setExpanded] = useState(false);
  const [showGitHubToken, setShowGitHubToken] = useState(false);
  const [githubAction, setGithubAction] = useState<"pull" | "push" | null>(null);
  const [githubUsername, setGithubUsername] = useState("");
  const [githubToken, setGithubToken] = useState("");

  useEffect(() => {
    if (!vaultPath) return;
    ensureGitConfig(vaultPath)
      .then((creds) => {
        setGithubUsername(creds.username || "");
        setGithubToken(creds.token || "");
      })
      .catch(() => {});
  }, [vaultPath]);

  const changeMethod = useCallback(
    async (method: SyncMethod) => {
      setMethod(method);
      await onSave();
    },
    [setMethod, onSave],
  );

  const handleGitHubConfigBlur = useCallback(async () => {
    await onSave();
    if (!vaultPath) return;
    await writeGitConfig(vaultPath, {
      username: githubUsername.trim(),
      token: githubToken.trim(),
    });
  }, [githubToken, githubUsername, onSave, vaultPath]);

  const runGitHubAction = useCallback(async (action: "pull" | "push") => {
    if (!vaultPath || githubAction) return;
    setGithubAction(action);
    try {
      await writeGitConfig(vaultPath, {
        username: githubUsername.trim(),
        token: githubToken.trim(),
      });
      const result =
        action === "pull"
          ? await githubPullRemote(vaultPath, config.git.remoteUrl, config.git.branch)
          : await githubPushLocal(vaultPath, config.git.remoteUrl, config.git.branch);
      await onSave();
      showToast(
        result.success ? "success" : "error",
        result.message || result.errors.join("\n"),
      );
    } catch (e) {
      showToast("error", e instanceof Error ? e.message : "GitHub operation failed.");
    } finally {
      setGithubAction(null);
    }
  }, [vaultPath, githubAction, githubUsername, githubToken, config.git, onSave, showToast]);

  const methodLabel = () => {
    if (config.method === "github") return t("sync.methodGitHub");
    return t("sync.methodNone");
  };

  const METHODS: { value: SyncMethod; label: string }[] = [
    { value: "none", label: t("sync.methodNone") },
    { value: "github", label: t("sync.methodGitHub") },
  ];

  return (
    <div className="settings-card">
      <button type="button" onClick={() => setExpanded(!expanded)} className="settings-card-toggle">
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

          {config.method === "github" && (
            <>
              <div className="settings-ai-row">
                <label className="settings-ai-label">{t("sync.gitRemoteUrl")}</label>
                <input
                  type="text"
                  value={config.git.remoteUrl}
                  onChange={(e) => updateGitConfig({ remoteUrl: e.target.value })}
                  onBlur={handleGitHubConfigBlur}
                  className="input-base settings-ai-control"
                  placeholder="https://github.com/user/vault.git"
                />
              </div>
              <div className="settings-ai-row">
                <label className="settings-ai-label">{t("sync.gitBranch")}</label>
                <input
                  type="text"
                  value={config.git.branch}
                  onChange={(e) => updateGitConfig({ branch: e.target.value })}
                  onBlur={handleGitHubConfigBlur}
                  className="input-base settings-ai-control"
                  placeholder="main"
                />
              </div>
              <div className="settings-ai-row">
                <label className="settings-ai-label">{t("sync.gitUsername")}</label>
                <input
                  type="text"
                  value={githubUsername}
                  onChange={(e) => setGithubUsername(e.target.value)}
                  onBlur={handleGitHubConfigBlur}
                  className="input-base settings-ai-control"
                  placeholder="octocat"
                />
              </div>
              <div className="settings-ai-row">
                <label className="settings-ai-label">{t("sync.gitToken")}</label>
                <div className="settings-ai-secret">
                  <input
                    type={showGitHubToken ? "text" : "password"}
                    value={githubToken}
                    onChange={(e) => setGithubToken(e.target.value)}
                    onBlur={handleGitHubConfigBlur}
                    className="input-base settings-ai-control"
                    placeholder="github_pat_..."
                  />
                  <button
                    type="button"
                    onClick={() => setShowGitHubToken(!showGitHubToken)}
                    className="settings-ai-inline-button"
                    title={showGitHubToken ? t("sync.hide") : t("sync.show")}
                    aria-label={showGitHubToken ? t("sync.hide") : t("sync.show")}
                  >
                    {showGitHubToken ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                </div>
              </div>
              <div className="settings-ai-actions">
                <button
                  type="button"
                  className="settings-ai-test-button"
                  onClick={() => runGitHubAction("pull")}
                  disabled={
                    !!githubAction ||
                    !config.git.remoteUrl ||
                    !githubUsername.trim() ||
                    !githubToken.trim()
                  }
                >
                  {githubAction === "pull" && <Loader2 size={14} className="animate-spin" />}
                  {t("sync.pullFromGitHub")}
                </button>
                <button
                  type="button"
                  className="settings-ai-test-button"
                  onClick={() => runGitHubAction("push")}
                  disabled={
                    !!githubAction ||
                    !config.git.remoteUrl ||
                    !githubUsername.trim() ||
                    !githubToken.trim()
                  }
                >
                  {githubAction === "push" && <Loader2 size={14} className="animate-spin" />}
                  {t("sync.pushToGitHub")}
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
