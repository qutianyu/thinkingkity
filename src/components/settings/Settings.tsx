import { useEffect, useState, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { X, Plus, Minus, Moon, Languages, Eye, EyeOff, ChevronDown, Bot, Loader2, CheckCircle2, XCircle, CaseSensitive } from "lucide-react";
import { useThemeStore } from "@/stores/themeStore";
import { useVaultStore } from "@/stores/vaultStore";
import { ensureVaultConfig, writeVaultConfig, ALL_DISPLAY_TYPES, type VaultMode } from "@/lib/vaultConfig";
import {
  MAX_APP_FONT_SIZE_PX,
  MIN_APP_FONT_SIZE_PX,
  normalizeAppFontSizePx,
} from "@/lib/fontSize";
import { useFileTreeStore } from "@/stores/fileTreeStore";
import {
  AI_PROVIDER_BASE_URLS,
  DEFAULT_AI_CONFIG,
  MAX_AI_CONTEXT_COMPACTION_THRESHOLD_KB,
  MIN_AI_CONTEXT_COMPACTION_THRESHOLD_KB,
  normalizeAiContextCompactionThresholdKb,
  testAiConnection,
  useAiStore,
  type AiConfig,
  type AiProvider,
} from "@/ai";
import { SyncSettings, useSyncStore, type SyncConfig } from "@/sync";

interface SettingsProps {
  onClose: () => void;
}

const LANGUAGE_OPTIONS = [
  { value: "zh-CN", label: "简体中文" },
  { value: "zh-TW", label: "繁體中文" },
  { value: "en-US", label: "English" },
  { value: "fr-FR", label: "Français" },
  { value: "ko-KR", label: "한국어" },
  { value: "ja-JP", label: "日本語" },
  { value: "ru-RU", label: "Русский" },
  { value: "de-DE", label: "Deutsch" },
  { value: "es-ES", label: "Español" },
];

export function Settings({ onClose }: SettingsProps) {
  const { t, i18n } = useTranslation();
  const vaultPath = useVaultStore((s) => s.vaultPath);
  const displayType = useVaultStore((s) => s.displayType);
  const setDisplayType = useVaultStore((s) => s.setDisplayType);
  const fontSizePx = useVaultStore((s) => s.fontSizePx);
  const setFontSizePx = useVaultStore((s) => s.setFontSizePx);
  const refreshTree = useFileTreeStore((s) => s.refreshTree);
  const preference = useThemeStore((s) => s.preference);
  const setPreference = useThemeStore((s) => s.setPreference);
  const ai = useAiStore((s) => s.ai);
  const setAi = useAiStore((s) => s.setAi);
  const setProvider = useAiStore((s) => s.setProvider);
  const setProviderName = useAiStore((s) => s.setProviderName);
  const setBaseUrl = useAiStore((s) => s.setBaseUrl);
  const setApiKey = useAiStore((s) => s.setApiKey);
  const setModel = useAiStore((s) => s.setModel);
  const setContextCompactionThresholdKb = useAiStore((s) => s.setContextCompactionThresholdKb);
  const [localDisplayType, setLocalDisplayType] = useState<string[]>(displayType);
  const [newExt, setNewExt] = useState("");
  const [displayTypeExpanded, setDisplayTypeExpanded] = useState(false);
  const [aiExpanded, setAiExpanded] = useState(false);
  const [showApiKey, setShowApiKey] = useState(false);
  const [testStatus, setTestStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [testMessage, setTestMessage] = useState("");

  useEffect(() => {
    setLocalDisplayType(displayType);
  }, [displayType]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  const saveVaultConfig = async (next: Record<string, unknown>) => {
    if (!vaultPath) return;
    try {
      const current = await ensureVaultConfig(vaultPath, {
        language: i18n.language || "zh-CN",
        mode: preference,
        font_size_px: fontSizePx,
        display_type: ALL_DISPLAY_TYPES,
        ai: DEFAULT_AI_CONFIG,
        sync: useSyncStore.getState().config,
      });
      await writeVaultConfig(vaultPath, { ...current, ...next });
    } catch (e) {
      console.error("Failed to save vault config:", e);
    }
  };

  const changeLanguage = async (lng: string) => {
    await i18n.changeLanguage(lng);
    await saveVaultConfig({ language: lng });
  };

  const changeMode = async (mode: VaultMode) => {
    setPreference(mode);
    await saveVaultConfig({ mode });
  };

  const changeFontSize = async (value: number | string) => {
    const nextFontSizePx = normalizeAppFontSizePx(value, fontSizePx);
    setFontSizePx(nextFontSizePx);
    await saveVaultConfig({ font_size_px: nextFontSizePx });
  };

  const adjustFontSize = (delta: number) => {
    void changeFontSize(fontSizePx + delta);
  };

  const removeExt = useCallback(async (ext: string) => {
    const next = localDisplayType.filter((t) => t !== ext);
    setLocalDisplayType(next);
    setDisplayType(next);
    await saveVaultConfig({ display_type: next });
    if (vaultPath) await refreshTree(vaultPath);
  }, [localDisplayType, vaultPath, refreshTree, setDisplayType]);

  const addExt = useCallback(async () => {
    const ext = newExt.trim().toLowerCase().replace(/^\./, "");
    if (!ext || localDisplayType.includes(ext)) return;
    const next = [...localDisplayType, ext];
    setLocalDisplayType(next);
    setDisplayType(next);
    await saveVaultConfig({ display_type: next });
    if (vaultPath) await refreshTree(vaultPath);
    setNewExt("");
  }, [newExt, localDisplayType, vaultPath, refreshTree, setDisplayType]);

  const saveAiConfig = async (nextAi?: AiConfig) => {
    const config = nextAi ?? useAiStore.getState().ai;
    setAi(config);
    await saveVaultConfig({ ai: config });
  };

  const changeAiProvider = async (provider: AiProvider) => {
    const nextAi = {
      ...ai,
      provider,
      base_url: AI_PROVIDER_BASE_URLS[provider],
      model: "",
    };
    setProvider(provider);
    await saveAiConfig(nextAi);
  };

  const changeProviderName = (provider_name: string) => {
    setProviderName(provider_name);
    setTestStatus("idle");
    setTestMessage("");
  };

  const changeBaseUrl = (base_url: string) => {
    setBaseUrl(base_url);
    setTestStatus("idle");
    setTestMessage("");
  };

  const changeApiKey = (api_key: string) => {
    setApiKey(api_key);
    setTestStatus("idle");
    setTestMessage("");
  };

  const changeModel = (model: string) => {
    setModel(model);
    setTestStatus("idle");
    setTestMessage("");
  };

  const changeContextCompactionThresholdKb = (value: string) => {
    setContextCompactionThresholdKb(
      normalizeAiContextCompactionThresholdKb(value, ai.context_compaction_threshold_kb),
    );
  };

  const testConnection = async () => {
    setTestStatus("loading");
    setTestMessage("");
    try {
      const ok = await testAiConnection(ai);
      setTestStatus(ok ? "success" : "error");
      setTestMessage(ok ? t("settings.aiTestSuccess") : t("settings.aiTestFailed"));
    } catch (error) {
      setTestStatus("error");
      setTestMessage(error instanceof Error ? error.message : t("settings.aiTestFailed"));
    }
  };

  const saveSyncConfig = async () => {
    const syncConfig = useSyncStore.getState().config;
    await saveVaultConfig({ sync: syncConfig });
  };

  return (
    <>
      <div
        className="fixed inset-0 z-50 bg-black/25 backdrop-blur-md"
        onClick={onClose}
      />
      <div
        className="settings-modal fixed left-1/2 top-1/2 z-50 flex max-h-[min(680px,calc(100vh-40px))] w-[560px] max-w-[calc(100vw-32px)] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden"
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-title"
      >
        <div className="settings-modal-header">
          <h1 id="settings-title" className="text-[16px] font-semibold">
            {t("settings.title")}
          </h1>
          <button
            onClick={onClose}
            className="btn-ghost settings-close-button"
            title="Close"
          >
            <X size={17} />
          </button>
        </div>

        <div className="settings-modal-body">
          {/* Language */}
          <div className="settings-card flex items-center gap-3">
            <div className="w-9 h-9 rounded-[var(--radius-md)] bg-[var(--color-accent-bg)] flex items-center justify-center shrink-0">
              <Languages size={18} className="text-[var(--color-primary)]" />
            </div>
            <h3 className="text-[15px] font-semibold shrink-0">{t("settings.language")}</h3>
            <div className="flex-1" />
            <select
              value={i18n.language}
              onChange={(e) => changeLanguage(e.target.value)}
              className="input-base w-auto max-w-[140px]"
            >
              {LANGUAGE_OPTIONS.map((language) => (
                <option key={language.value} value={language.value}>
                  {language.label}
                </option>
              ))}
            </select>
          </div>

          {/* Theme */}
          <div className="settings-card flex items-start gap-3">
            <div className="w-9 h-9 rounded-[var(--radius-md)] bg-[var(--color-accent-bg)] flex items-center justify-center shrink-0">
              <Moon size={18} className="text-[var(--color-primary)]" />
            </div>
            <div className="min-w-0 flex-1">
              <h3 className="text-[15px] font-semibold">{t("settings.theme")}</h3>
              <p className="mt-1 text-[12px] leading-5 text-[var(--color-text-muted)]">
                {t("settings.themeReadabilityNotice")}
              </p>
            </div>
            <select
              value={preference}
              onChange={(e) => changeMode(e.target.value as VaultMode)}
              className="input-base w-auto max-w-[120px] shrink-0"
            >
              <option value="system">{t("settings.system")}</option>
              <option value="dark">{t("settings.dark")}</option>
              <option value="light">{t("settings.light")}</option>
            </select>
          </div>

          {/* Font Size */}
          <div className="settings-card settings-font-size-card">
            <div className="w-9 h-9 rounded-[var(--radius-md)] bg-[var(--color-accent-bg)] flex items-center justify-center shrink-0">
              <CaseSensitive size={18} className="text-[var(--color-primary)]" />
            </div>
            <div className="min-w-0 flex-1">
              <h3 className="text-[15px] font-semibold">{t("settings.fontSize")}</h3>
              <p className="mt-1 text-[12px] leading-5 text-[var(--color-text-muted)]">
                {t("settings.fontSizeDescription")}
              </p>
            </div>
            <div className="settings-font-size-control" aria-label={t("settings.fontSize")}>
              <button
                type="button"
                onClick={() => adjustFontSize(-1)}
                disabled={fontSizePx <= MIN_APP_FONT_SIZE_PX}
                title={`${t("settings.fontSize")} - 1`}
                aria-label={`${t("settings.fontSize")} - 1`}
              >
                <Minus size={14} />
              </button>
              <input
                type="range"
                min={MIN_APP_FONT_SIZE_PX}
                max={MAX_APP_FONT_SIZE_PX}
                step={1}
                value={fontSizePx}
                onChange={(e) => changeFontSize(e.target.value)}
                aria-label={t("settings.fontSize")}
              />
              <button
                type="button"
                onClick={() => adjustFontSize(1)}
                disabled={fontSizePx >= MAX_APP_FONT_SIZE_PX}
                title={`${t("settings.fontSize")} + 1`}
                aria-label={`${t("settings.fontSize")} + 1`}
              >
                <Plus size={14} />
              </button>
              <span>{fontSizePx}px</span>
            </div>
          </div>

          {/* Display Types */}
          <div className="settings-card">
            <button
              onClick={() => setDisplayTypeExpanded(!displayTypeExpanded)}
              className="flex items-center gap-3 w-full text-left"
            >
              <div className="w-9 h-9 rounded-[var(--radius-md)] bg-[var(--color-accent-bg)] flex items-center justify-center shrink-0">
                <Eye size={18} className="text-[var(--color-primary)]" />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-[15px] font-semibold">{t("settings.displayType")}</h3>
                {!displayTypeExpanded && (
                  <p className="text-[13px] text-[var(--color-text-muted)]">
                    {t("settings.displayTypeCount", { count: localDisplayType.length })}
                  </p>
                )}
              </div>
              <ChevronDown
                size={16}
                className={`text-[var(--color-text-muted)] shrink-0 transition-transform duration-200 ${
                  displayTypeExpanded ? "rotate-180" : ""
                }`}
              />
            </button>
            {displayTypeExpanded && (
              <div className="mt-4 flex flex-col gap-3">
                <p className="text-[13px] text-[var(--color-text-muted)]">
                  {t("settings.displayTypeDescription")}
                </p>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={newExt}
                    onChange={(e) => setNewExt(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") addExt();
                    }}
                    placeholder={t("settings.displayTypePlaceholder")}
                    className="flex-1 h-8 px-2.5 text-[13px] rounded-[var(--radius-sm)] bg-[var(--color-bg-app)] border border-[var(--color-border-light)] text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] focus:outline-none focus:border-[var(--color-primary)]"
                  />
                  <button
                    onClick={addExt}
                    className="h-8 px-3 min-w-[68px] justify-center text-[12px] rounded-[var(--radius-sm)] bg-[var(--color-primary)] text-white hover:opacity-90 shrink-0 inline-flex items-center gap-1"
                  >
                    <Plus size={14} />
                    {t("settings.add")}
                  </button>
                </div>
                {localDisplayType.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {localDisplayType.map((ext) => (
                      <span
                        key={ext}
                        className="display-type-chip display-type-chip-active inline-flex items-center gap-0.5"
                      >
                        .{ext}
                        <button
                          onClick={() => removeExt(ext)}
                          className="ml-0.5 hover:text-[var(--color-text-primary)]"
                        >
                          <X size={12} />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
          {/* AI Configuration */}
          <div className="settings-card">
            <button
              type="button"
              onClick={() => setAiExpanded(!aiExpanded)}
              className="settings-card-toggle"
            >
              <div className="w-9 h-9 rounded-[var(--radius-md)] bg-[var(--color-accent-bg)] flex items-center justify-center shrink-0">
                <Bot size={18} className="text-[var(--color-primary)]" />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-[15px] font-semibold">{t("settings.ai")}</h3>
                {!aiExpanded && (
                  <p className="text-[13px] text-[var(--color-text-muted)] truncate">
                    {ai.provider_name.trim()}
                    {ai.model ? ` · ${ai.model}` : ""}
                  </p>
                )}
              </div>
              <ChevronDown
                size={16}
                className={`text-[var(--color-text-muted)] shrink-0 transition-transform duration-200 ${
                  aiExpanded ? "rotate-180" : ""
                }`}
              />
            </button>
            {aiExpanded && (
              <div className="settings-ai-form">
              <div className="settings-ai-row">
                <label className="settings-ai-label">
                  {t("settings.aiProvider")}
                </label>
                <input
                  type="text"
                  value={ai.provider_name}
                  onChange={(e) => changeProviderName(e.target.value)}
                  onBlur={() => saveAiConfig()}
                  className="input-base settings-ai-control"
                />
              </div>
              <div className="settings-ai-row">
                <label className="settings-ai-label">
                  {t("settings.aiProtocol")}
                </label>
                <select
                  value={ai.provider}
                  onChange={(e) => changeAiProvider(e.target.value as AiProvider)}
                  className="input-base settings-ai-control"
                >
                  <option value="openai">OpenAI</option>
                  <option value="anthropic">Anthropic</option>
                </select>
              </div>
              <div className="settings-ai-row">
                <label className="settings-ai-label">
                  {t("settings.aiBaseUrl")}
                </label>
                <input
                  type="text"
                  value={ai.base_url}
                  onChange={(e) => changeBaseUrl(e.target.value)}
                  onBlur={() => saveAiConfig()}
                  className="input-base settings-ai-control"
                  placeholder={ai.provider === "anthropic" ? "https://api.anthropic.com" : "https://api.openai.com/v1"}
                />
              </div>
              <div className="settings-ai-row">
                <label className="settings-ai-label">
                  API Key
                </label>
                <div className="settings-ai-secret">
                  <input
                    type={showApiKey ? "text" : "password"}
                    value={ai.api_key}
                    onChange={(e) => changeApiKey(e.target.value)}
                    onBlur={() => saveAiConfig()}
                    className="input-base settings-ai-control"
                    placeholder="sk-..."
                  />
                  <button
                    type="button"
                    onClick={() => setShowApiKey(!showApiKey)}
                    className="settings-ai-inline-button"
                    title={showApiKey ? t("settings.aiHideKey") : t("settings.aiShowKey")}
                    aria-label={showApiKey ? t("settings.aiHideKey") : t("settings.aiShowKey")}
                  >
                    {showApiKey ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                </div>
              </div>
              <div className="settings-ai-row">
                <label className="settings-ai-label">
                  {t("settings.aiModel")}
                </label>
                <input
                  type="text"
                  value={ai.model}
                  onChange={(e) => changeModel(e.target.value)}
                  onBlur={() => saveAiConfig()}
                  className="input-base settings-ai-control"
                  placeholder={ai.provider === "anthropic" ? "claude-sonnet-4-20250514" : "gpt-4o"}
                />
              </div>
              <div className="settings-ai-row">
                <label className="settings-ai-label">
                  {t("settings.aiContextCompactionThreshold")}
                </label>
                <input
                  type="number"
                  min={MIN_AI_CONTEXT_COMPACTION_THRESHOLD_KB}
                  max={MAX_AI_CONTEXT_COMPACTION_THRESHOLD_KB}
                  step={10}
                  value={ai.context_compaction_threshold_kb}
                  onChange={(e) => changeContextCompactionThresholdKb(e.target.value)}
                  onBlur={() => saveAiConfig()}
                  className="input-base settings-ai-control"
                />
              </div>
              <div className="settings-ai-actions">
                <button
                  onClick={testConnection}
                  disabled={testStatus === "loading" || !ai.api_key || !ai.base_url || !ai.model}
                  className="settings-ai-test-button"
                >
                  {testStatus === "loading" && <Loader2 size={14} className="animate-spin" />}
                  {testStatus === "success" && <CheckCircle2 size={14} className="text-green-500" />}
                  {testStatus === "error" && <XCircle size={14} className="text-red-400" />}
                  {t("settings.aiTestConnection")}
                </button>
                {testMessage && (
                  <p className={`settings-ai-test-message settings-ai-test-message-${testStatus}`}>
                    {testMessage}
                  </p>
                )}
              </div>
            </div>
            )}
          </div>

          {/* Sync */}
          <SyncSettings onSave={saveSyncConfig} />
        </div>
      </div>
    </>
  );
}
