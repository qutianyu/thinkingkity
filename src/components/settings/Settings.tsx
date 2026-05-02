import { useEffect, useState, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { X, Moon, Languages, Eye, EyeOff, ChevronDown, Bot, Loader2, CheckCircle2, XCircle } from "lucide-react";
import { useThemeStore } from "@/stores/themeStore";
import { useVaultStore } from "@/stores/vaultStore";
import { ensureVaultConfig, writeVaultConfig, ALL_DISPLAY_TYPES, type VaultMode } from "@/lib/vaultConfig";
import { useFileTreeStore } from "@/stores/fileTreeStore";
import {
  AI_PROVIDER_BASE_URLS,
  DEFAULT_AI_CONFIG,
  testAiConnection,
  useAiStore,
  type AiConfig,
  type AiProvider,
} from "@/ai";

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

const DISPLAY_TYPE_GROUPS = [
  {
    labelKey: "settings.displayGroupDocuments",
    types: [
      { ext: "md", label: ".md" },
      { ext: "markdown", label: ".markdown" },
      { ext: "csv", label: ".csv" },
      { ext: "json", label: ".json" },
      { ext: "yaml", label: ".yaml" },
      { ext: "yml", label: ".yml" },
      { ext: "toml", label: ".toml" },
      { ext: "ini", label: ".ini" },
      { ext: "conf", label: ".conf" },
      { ext: "env", label: ".env" },
      { ext: "properties", label: ".properties" },
      { ext: "mermaid", label: ".mermaid" },
      { ext: "txt", label: ".txt" },
      { ext: "pdf", label: ".pdf" },
    ],
  },
  {
    labelKey: "settings.displayGroupImages",
    types: [
      { ext: "jpg", label: ".jpg" },
      { ext: "jpeg", label: ".jpeg" },
      { ext: "png", label: ".png" },
      { ext: "gif", label: ".gif" },
      { ext: "svg", label: ".svg" },
      { ext: "webp", label: ".webp" },
      { ext: "bmp", label: ".bmp" },
      { ext: "ico", label: ".ico" },
    ],
  },
  {
    labelKey: "settings.displayGroupCode",
    types: [
      { ext: "ts", label: ".ts" },
      { ext: "tsx", label: ".tsx" },
      { ext: "js", label: ".js" },
      { ext: "jsx", label: ".jsx" },
      { ext: "py", label: ".py" },
      { ext: "java", label: ".java" },
      { ext: "c", label: ".c" },
      { ext: "h", label: ".h" },
      { ext: "cpp", label: ".cpp" },
      { ext: "hpp", label: ".hpp" },
      { ext: "go", label: ".go" },
      { ext: "rs", label: ".rs" },
      { ext: "css", label: ".css" },
      { ext: "scss", label: ".scss" },
      { ext: "less", label: ".less" },
      { ext: "html", label: ".html" },
      { ext: "htm", label: ".htm" },
      { ext: "xml", label: ".xml" },
      { ext: "sql", label: ".sql" },
      { ext: "sh", label: ".sh" },
      { ext: "bash", label: ".bash" },
      { ext: "zsh", label: ".zsh" },
    ],
  },
];

export function Settings({ onClose }: SettingsProps) {
  const { t, i18n } = useTranslation();
  const vaultPath = useVaultStore((s) => s.vaultPath);
  const displayType = useVaultStore((s) => s.displayType);
  const setDisplayType = useVaultStore((s) => s.setDisplayType);
  const refreshTree = useFileTreeStore((s) => s.refreshTree);
  const preference = useThemeStore((s) => s.preference);
  const setPreference = useThemeStore((s) => s.setPreference);
  const ai = useAiStore((s) => s.ai);
  const setAi = useAiStore((s) => s.setAi);
  const setProvider = useAiStore((s) => s.setProvider);
  const setBaseUrl = useAiStore((s) => s.setBaseUrl);
  const setApiKey = useAiStore((s) => s.setApiKey);
  const setModel = useAiStore((s) => s.setModel);
  const [localDisplayType, setLocalDisplayType] = useState<string[]>(displayType);
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
        display_type: ALL_DISPLAY_TYPES,
        ai: DEFAULT_AI_CONFIG,
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

  const toggleDisplayType = useCallback(async (ext: string) => {
    const next = localDisplayType.includes(ext)
      ? localDisplayType.filter((t) => t !== ext)
      : [...localDisplayType, ext];
    setLocalDisplayType(next);
    setDisplayType(next);
    await saveVaultConfig({ display_type: next });
    if (vaultPath) await refreshTree(vaultPath);
  }, [localDisplayType, vaultPath, refreshTree, setDisplayType]);

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

  const selectAll = useCallback(async () => {
    setLocalDisplayType(ALL_DISPLAY_TYPES);
    setDisplayType(ALL_DISPLAY_TYPES);
    await saveVaultConfig({ display_type: ALL_DISPLAY_TYPES });
    if (vaultPath) await refreshTree(vaultPath);
  }, [vaultPath, refreshTree, setDisplayType]);

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
                    {t("settings.displayTypeCount", { count: localDisplayType.length, total: ALL_DISPLAY_TYPES.length })}
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
              <div className="mt-4 space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-[13px] text-[var(--color-text-muted)]">
                    {t("settings.displayTypeDescription")}
                  </p>
                  <button
                    onClick={selectAll}
                    className="text-[12px] text-[var(--color-primary)] hover:underline shrink-0"
                  >
                    {t("settings.selectAll")}
                  </button>
                </div>
                {DISPLAY_TYPE_GROUPS.map((group) => (
                  <div key={group.labelKey}>
                    <p className="text-[12px] font-medium text-[var(--color-text-muted)] mb-2">
                      {t(group.labelKey)}
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {group.types.map((type) => {
                        const active = localDisplayType.includes(type.ext);
                        return (
                          <button
                            key={type.ext}
                            onClick={() => toggleDisplayType(type.ext)}
                            className={`display-type-chip ${active ? "display-type-chip-active" : ""}`}
                          >
                            {type.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
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
                    {ai.provider === "anthropic" ? "Anthropic" : "OpenAI"}
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
        </div>
      </div>
    </>
  );
}
