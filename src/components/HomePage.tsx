import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { FolderOpen, Info, LogOut, X } from "lucide-react";
import { useVaultStore } from "@/stores/vaultStore";
import { useFileTreeStore } from "@/stores/fileTreeStore";
import { useEditorStore } from "@/stores/editorStore";
import { useThemeStore } from "@/stores/themeStore";
import { DEFAULT_AI_CONFIG, ensureAiConfig, useAiStore } from "@/ai";
import { pathBasename } from "@/lib/tauriCommands";
import { ensureVaultConfig, ALL_DISPLAY_TYPES } from "@/lib/vaultConfig";
import { DEFAULT_APP_FONT_SIZE_PX } from "@/lib/fontSize";
import { DEFAULT_SYNC_CONFIG, useSyncStore } from "@/sync";
import { ensureDemoVault, logout } from "@/lib/globalVaults";
import { getAuthToken } from "@/lib/authSession";
import { VaultPickerModal } from "@/components/common/VaultPickerModal";
import { AboutModal } from "@/components/AboutPage";

export function HomePage() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const { vaultPath, recentVaults, setVault, setDisplayType, setFontSizePx, removeRecentVault, loadRecentVaults } = useVaultStore();
  const refreshTree = useFileTreeStore((s) => s.refreshTree);
  const preference = useThemeStore((s) => s.preference);
  const setPreference = useThemeStore((s) => s.setPreference);
  const setAi = useAiStore((s) => s.setAi);
  const [showVaultPicker, setShowVaultPicker] = useState(false);
  const [showLogout, setShowLogout] = useState(false);
  const [showAbout, setShowAbout] = useState(false);

  useEffect(() => {
    setShowLogout(Boolean(getAuthToken()));
    ensureDemoVault().then(() => loadRecentVaults());
  }, []);

  const openVaultPath = async (path: string) => {
    useEditorStore.getState().closeAll();
    const aiConfig = await ensureAiConfig(path, DEFAULT_AI_CONFIG);
    const config = await ensureVaultConfig(path, {
      language: i18n.language || "zh-CN",
      mode: preference,
      font_size_px: DEFAULT_APP_FONT_SIZE_PX,
      display_type: ALL_DISPLAY_TYPES,
      sync: DEFAULT_SYNC_CONFIG,
    });
    await i18n.changeLanguage(config.language);
    setPreference(config.mode);
    setFontSizePx(config.font_size_px);
    setDisplayType(config.display_type);
    setAi(aiConfig);
    useSyncStore.getState().setConfig(config.sync);
    setVault(path);
    await refreshTree(path);
    navigate("/editor");
  };

  const handleOpenVault = async () => {
    try {
      setShowVaultPicker(true);
    } catch (e) {
      console.error("Failed to open vault:", e);
    }
  };

  const handleSelectRecent = async (path: string) => {
    await openVaultPath(path);
  };

  return (
    <div className="home-shell flex flex-col items-center justify-center h-full bg-[var(--color-bg-app)] select-none px-6">
      <button
        className="home-about-button"
        onClick={() => setShowAbout(true)}
        title={t("about.title")}
      >
        <Info size={15} />
        <span>{t("about.title")}</span>
      </button>
      {showLogout && (
        <button
          className="home-logout-button"
          onClick={() => logout()}
          title={t("login.logout")}
        >
          <LogOut size={15} />
          <span>{t("login.logout")}</span>
        </button>
      )}
      <div className="card flex flex-col items-center gap-8 max-w-[560px] w-full">
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
          <div className="w-full flex flex-col gap-3">
            <div className="flex items-center justify-between px-1">
              <p className="text-[11px] font-bold text-[var(--color-text-secondary)] uppercase tracking-[0.18em]">
                Recent Vaults
              </p>
              <span className="text-[11px] font-medium text-[var(--color-text-muted)]">
                {recentVaults.length} saved
              </span>
            </div>
            <div className="flex flex-col gap-2">
              {recentVaults.map((p) => (
                <div
                  key={p}
                  role="button"
                  tabIndex={0}
                  className="group flex items-center gap-3 w-full rounded-[var(--radius-md)] border border-transparent bg-transparent px-3.5 py-3 text-left transition-colors duration-200 hover:bg-[var(--color-bg-hover)]"
                  onClick={() => handleSelectRecent(p)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      handleSelectRecent(p);
                    }
                  }}
                >
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[var(--radius-md)] bg-[rgba(245,158,11,0.10)] text-[var(--color-folder)] ring-1 ring-[rgba(245,158,11,0.20)]">
                    <FolderOpen size={21} strokeWidth={1.8} />
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate text-[15px] font-semibold leading-5 text-[var(--color-text-primary)]">
                      {pathBasename(p)}
                    </span>
                    <span className="truncate text-[12px] leading-5 text-[var(--color-text-muted)]">
                      {p}
                    </span>
                  </span>
                  <span className="flex shrink-0 items-center text-[var(--color-text-muted)]">
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); removeRecentVault(p); }}
                      className="flex h-7 w-7 items-center justify-center rounded-[var(--radius-sm)] opacity-0 transition-all duration-150 hover:bg-[rgba(239,68,68,0.10)] hover:text-[var(--color-danger)] group-hover:opacity-100 focus:opacity-100 focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-15)]"
                      title={t("sidebar.removeRecent")}
                    >
                      <X size={14} />
                    </button>
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {showVaultPicker && (
        <VaultPickerModal
          openVaultPath={openVaultPath}
          onClose={() => setShowVaultPicker(false)}
        />
      )}
      {showAbout && <AboutModal onClose={() => setShowAbout(false)} />}
    </div>
  );
}
