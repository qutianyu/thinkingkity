import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { FolderOpen, X } from "lucide-react";
import { useVaultStore } from "@/stores/vaultStore";
import { useFileTreeStore } from "@/stores/fileTreeStore";
import { useThemeStore } from "@/stores/themeStore";
import { DEFAULT_AI_CONFIG, useAiStore } from "@/ai";
import { isTauri } from "@/lib/tauriCommands";
import { pathBasename } from "@/lib/tauriCommands";
import { ensureVaultConfig, ALL_DISPLAY_TYPES } from "@/lib/vaultConfig";
import { ensureTestVault } from "@/lib/globalVaults";

export function HomePage() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const { vaultPath, recentVaults, setVault, setDisplayType, removeRecentVault, loadRecentVaults } = useVaultStore();
  const refreshTree = useFileTreeStore((s) => s.refreshTree);
  const preference = useThemeStore((s) => s.preference);
  const setPreference = useThemeStore((s) => s.setPreference);
  const setAi = useAiStore((s) => s.setAi);

  useEffect(() => {
    ensureTestVault().then(() => loadRecentVaults());
  }, []);

  const openVaultPath = async (path: string) => {
    const config = await ensureVaultConfig(path, {
      language: i18n.language || "zh-CN",
      mode: preference,
      display_type: ALL_DISPLAY_TYPES,
      ai: DEFAULT_AI_CONFIG,
    });
    await i18n.changeLanguage(config.language);
    setPreference(config.mode);
    setDisplayType(config.display_type);
    setAi(config.ai);
    setVault(path);
    await refreshTree(path);
    navigate("/editor");
  };

  const handleOpenVault = async () => {
    try {
      if (isTauri()) {
        const { open } = await import("@tauri-apps/plugin-dialog");
        const selected = await open({ directory: true, multiple: false });
        if (selected) {
          await openVaultPath(selected as string);
        }
      } else {
        await openVaultPath("/demo-vault");
      }
    } catch (e) {
      console.error("Failed to open vault:", e);
    }
  };

  const handleSelectRecent = async (path: string) => {
    await openVaultPath(path);
  };

  return (
    <div className="home-shell flex flex-col items-center justify-center h-full bg-[var(--color-bg-app)] select-none px-6">
      <div className="card flex flex-col items-center gap-8 max-w-[420px] w-full">
        {/* Logo & Brand */}
        <div className="flex flex-col items-center gap-3">
          <div className="w-20 h-20 rounded-[var(--radius-xl)] bg-[var(--color-bg-surface)] border border-[var(--color-border)] flex items-center justify-center shadow-[var(--shadow-md)] overflow-hidden p-2 transition-transform duration-300 hover:scale-105">
            <img src="/logo.png" alt="Logo" className="w-full h-full object-contain" />
          </div>
          <h1 className="text-2xl font-bold text-[var(--color-text-primary)] tracking-tight">
            ThinkingKity
          </h1>
          <p className="text-[15px] text-[var(--color-text-muted)] text-center leading-relaxed">
            Your local knowledge base.
            <br />
            Open a folder of Markdown files to get started.
          </p>
        </div>

        {/* Open Vault */}
        <button
          onClick={handleOpenVault}
          className="btn-primary w-full text-[15px] font-semibold"
        >
          <FolderOpen size={20} />
          {t("sidebar.openVault")}
        </button>

        {/* Recent Vaults */}
        {recentVaults.length > 0 && (
          <div className="w-full">
            <p className="text-[11px] font-semibold text-[var(--color-text-muted)] uppercase tracking-widest mb-3 px-1">
              Recent Vaults
            </p>
            <div className="space-y-1">
              {recentVaults.map((p) => (
                <div
                  key={p}
                  className="flex items-center gap-3 w-full px-3 py-2.5 rounded-[var(--radius-md)] hover:bg-[var(--color-bg-hover)] text-left transition-all duration-200 group"
                >
                  <button
                    onClick={() => handleSelectRecent(p)}
                    className="flex items-center gap-3 flex-1 min-w-0"
                  >
                    <FolderOpen
                      size={18}
                      className="text-[var(--color-folder)] shrink-0"
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-[14px] font-medium text-[var(--color-text-primary)] truncate">
                        {pathBasename(p)}
                      </p>
                      <p className="text-[12px] text-[var(--color-text-muted)] truncate">
                        {p}
                      </p>
                    </div>
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); removeRecentVault(p); }}
                    className="shrink-0 ml-1 p-1.5 rounded-[var(--radius-sm)] text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-bg-surface)] opacity-0 group-hover:opacity-100 transition-all duration-150"
                    title={t("sidebar.removeRecent")}
                  >
                    <X size={14} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
