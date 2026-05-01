import { useTranslation } from "react-i18next";
import { FolderOpen, Check, ChevronDown, X } from "lucide-react";
import { useVaultStore } from "@/stores/vaultStore";
import { useFileTreeStore } from "@/stores/fileTreeStore";
import { useThemeStore } from "@/stores/themeStore";
import { DEFAULT_AI_CONFIG, useAiStore } from "@/ai";
import { isTauri } from "@/lib/tauriCommands";
import { pathBasename } from "@/lib/tauriCommands";
import { ensureVaultConfig, ALL_DISPLAY_TYPES } from "@/lib/vaultConfig";
import { ensureTestVault } from "@/lib/globalVaults";
import { useState, useRef, useEffect } from "react";

export function VaultSelector() {
  const { t } = useTranslation();
  const { i18n } = useTranslation();
  const { vaultPath, vaultName, recentVaults, setVault, setDisplayType, removeRecentVault, loadRecentVaults } = useVaultStore();
  const refreshTree = useFileTreeStore((s) => s.refreshTree);
  const preference = useThemeStore((s) => s.preference);
  const setPreference = useThemeStore((s) => s.setPreference);
  const setAi = useAiStore((s) => s.setAi);
  const [showRecent, setShowRecent] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setShowRecent(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

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
    setShowRecent(false);
    await openVaultPath(path);
  };

  return (
    <div className="px-3 py-2.5" ref={ref}>
      {vaultPath ? (
        <button
          onClick={() => setShowRecent(!showRecent)}
          className="flex items-center gap-2 w-full px-3 py-2 rounded-[var(--radius-md)] hover:bg-[var(--color-bg-hover)] text-[14px] text-[var(--color-text-primary)] font-medium transition-colors duration-200"
        >
          <FolderOpen size={16} className="text-[var(--color-folder)] shrink-0" />
          <span className="truncate flex-1 text-left">{vaultName}</span>
          <ChevronDown
            size={14}
            className={`shrink-0 text-[var(--color-text-muted)] transition-transform duration-200 ${
              showRecent ? "rotate-180" : ""
            }`}
          />
        </button>
      ) : (
        <button
          onClick={handleOpenVault}
          className="btn-primary w-full"
        >
          <FolderOpen size={16} />
          {t("sidebar.openVault")}
        </button>
      )}

      {showRecent && recentVaults.length > 0 && (
        <div className="mt-1 border border-[var(--glass-border)] rounded-[var(--radius-lg)] bg-[var(--glass-bg)] backdrop-blur-xl shadow-[var(--shadow-lg)]">
          <div className="px-3 py-2 text-[11px] font-semibold text-[var(--color-text-muted)] uppercase tracking-wider">
            Recent Vaults
          </div>
          {recentVaults.map((p) => (
            <div
              key={p}
              className="flex items-center w-full px-3 py-2 hover:bg-[var(--color-bg-hover)] text-[14px] text-left transition-colors duration-200 group"
            >
              <button
                onClick={() => handleSelectRecent(p)}
                className="flex items-center gap-2 flex-1 min-w-0"
              >
                <span className="truncate flex-1 font-medium">{pathBasename(p)}</span>
                {p === vaultPath && (
                  <Check size={14} className="text-[var(--color-primary)] shrink-0" />
                )}
                <span className="text-[11px] text-[var(--color-text-muted)] truncate max-w-[120px]">
                  {p}
                </span>
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); removeRecentVault(p); }}
                className="shrink-0 p-1.5 rounded-[var(--radius-sm)] text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-bg-surface)] opacity-0 group-hover:opacity-100 transition-all duration-150"
                title={t("sidebar.removeRecent")}
              >
                <X size={12} />
              </button>
            </div>
          ))}
          <div className="h-1" />
        </div>
      )}
    </div>
  );
}
