import { useState, useEffect, useRef, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { History, Info, Settings } from "lucide-react";
import { Sidebar } from "./sidebar/Sidebar";
import { EditorArea } from "./editor/EditorArea";
import { QuickSwitcher } from "./common/QuickSwitcher";
import { Settings as SettingsModal } from "./settings/Settings";
import { RecoveryCenter } from "./recovery/RecoveryCenter";
import { AboutModal } from "./AboutPage";
import { SyncButton, SyncToast } from "@/sync";
import { isJsonPath, JSON_FILE_TYPE } from "@/json";
import { useVaultStore } from "@/stores/vaultStore";
import { useFileTreeStore } from "@/stores/fileTreeStore";
import { useEditorStore } from "@/stores/editorStore";
import { useLinkStore } from "@/md/links/linkStore";

const AUTO_SAVE_DELAY = 3000;
const AUTO_SAVE_POLL_INTERVAL = 500;

type FileType = "markdown" | "csv" | typeof JSON_FILE_TYPE | "code" | "text" | "image" | "pdf" | "unknown";

function getFileType(path: string | null): FileType {
  if (!path) return "unknown";
  const lower = path.toLowerCase();
  if (lower.endsWith(".md") || lower.endsWith(".markdown")) return "markdown";
  if (lower.endsWith(".csv")) return "csv";
  if (isJsonPath(lower)) return JSON_FILE_TYPE;
  if (lower.endsWith(".txt")) return "text";
  if (/\.(js|ts|jsx|tsx|py|java|rs|c|cpp|h|hpp|css|scss|html|xml|yaml|yml|toml|ini|conf|env|properties|mermaid|sh|bash|sql|go|rb|php|swift|kt|dart|r|m|mm|pl|lua|vim|zig|hs|ml|scala|clj|ex|exs|erl|v|sv|vhd)$/.test(lower)) return "code";
  if (/\.(jpg|jpeg|png|gif|svg|webp|bmp|ico)$/.test(lower)) return "image";
  if (lower.endsWith(".pdf")) return "pdf";
  return "unknown";
}

function stripMarkdown(text: string): string {
  // Status counts should describe readable prose, not Markdown delimiters.
  return text
    .replace(/```[\s\S]*?```/g, "")
    .replace(/~~~[\s\S]*?~~~/g, "")
    .replace(/`[^`\n]+`/g, "")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/(\*{1,3}|_{1,3})(.*?)\1/g, "$2")
    .replace(/~~(.*?)~~/g, "$1")
    .replace(/^>\s+/gm, "")
    .replace(/^[-*_]{3,}\s*$/gm, "")
    .replace(/^[\s]*[-*+]\s+/gm, "")
    .replace(/^[\s]*\d+\.\s+/gm, "")
    .replace(/<[^>]+>/g, "")
    .replace(/https?:\/\/\S+/g, "");
}

function countWords(text: string): number {
  const cjkCount = (
    text.match(
      /[\u3400-\u9fff\uf900-\ufaff\u{20000}-\u{2a6df}\u3040-\u309f\u30a0-\u30ff\uac00-\ud7af]/gu,
    ) ?? []
  ).length;
  const wordCount = (
    text.match(/[A-Za-z\u00c0-\u024f0-9]+(?:[-'][A-Za-z\u00c0-\u024f0-9]+)*/g) ?? []
  ).length;
  return cjkCount + wordCount;
}

function countLines(text: string): number {
  if (!text) return 0;
  let count = 1;
  for (let i = 0; i < text.length; i++) {
    if (text[i] === "\n") count++;
  }
  return count;
}

function parseCsvRowsCols(content: string): { rows: number; cols: number } {
  // Lightweight CSV dimensions are enough for the footer and avoid loading the grid parser.
  if (!content.trim()) return { rows: 0, cols: 0 };
  const lines = content.split(/\r?\n/).filter((l) => l.trim());
  let maxCols = 0;
  for (const line of lines) {
    let colCount = 0;
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      if (line[i] === '"') {
        inQuotes = !inQuotes;
      } else if (line[i] === "," && !inQuotes) {
        colCount++;
      }
    }
    colCount++;
    maxCols = Math.max(maxCols, colCount);
  }
  return { rows: lines.length, cols: maxCols };
}

function getStatusInfo(content: string, path: string | null):
  | { key: "words"; value: number; lines: number }
  | { key: "lines"; value: number }
  | { key: "csv"; rows: number; cols: number }
  | null {
  // Different file families expose different status metrics in the footer.
  if (!path) return null;
  const type = getFileType(path);
  switch (type) {
    case "markdown": {
      let text = content.replace(/^(---\r?\n[\s\S]*?\r?\n---)(?:\r?\n)?/, "");
      const lines = countLines(text);
      text = stripMarkdown(text);
      return { key: "words", value: countWords(text), lines };
    }
    case "csv": {
      const { rows, cols } = parseCsvRowsCols(content);
      return { key: "csv", rows, cols };
    }
    case JSON_FILE_TYPE:
    case "code":
    case "text": {
      return { key: "lines", value: countLines(content) };
    }
    case "image":
    case "pdf":
    case "unknown":
      return null;
  }
}

function formatVaultSize(bytes: number): string {
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / Math.pow(1024, i);
  return `${i === 0 ? value : value.toFixed(1)} ${units[i]}`;
}

export function Layout() {
  const { t } = useTranslation();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [showQuickSwitcher, setShowQuickSwitcher] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showRecovery, setShowRecovery] = useState(false);
  const [showAbout, setShowAbout] = useState(false);
  const vaultPath = useVaultStore((s) => s.vaultPath);
  const fileCount = useFileTreeStore((s) => s.fileCount);
  const vaultSize = useFileTreeStore((s) => s.vaultSize);
  const activeTabPath = useEditorStore((s) => s.activeTabPath);
  const activeContent = useEditorStore((s) =>
    s.activeTabPath ? s.fileContents.get(s.activeTabPath) ?? "" : "",
  );
  const statusInfo = useMemo(
    () => getStatusInfo(activeContent, activeTabPath),
    [activeContent, activeTabPath],
  );
  const navigate = useNavigate();
  const savingPathsRef = useRef<Set<string>>(new Set());
  const loadRecentVaults = useVaultStore((s) => s.loadRecentVaults);

  useEffect(() => {
    loadRecentVaults();
  }, []);

  useEffect(() => {
    const timer = setInterval(() => {
      const { tabs, saveFile, lastEditedAt } = useEditorStore.getState();
      const now = Date.now();
      const dirtyTabs = tabs.filter((t) => {
        if (!t.isDirty || savingPathsRef.current.has(t.path)) return false;
        const editedAt = lastEditedAt.get(t.path);
        return editedAt !== undefined && now - editedAt >= AUTO_SAVE_DELAY;
      });
      if (dirtyTabs.length === 0) return;
      dirtyTabs.forEach((tab) => {
        savingPathsRef.current.add(tab.path);
        saveFile(tab.path)
          .then(() => {
            useLinkStore.getState().onFileChanged(tab.path);
          })
          .finally(() => {
            savingPathsRef.current.delete(tab.path);
          });
      });
    }, AUTO_SAVE_POLL_INTERVAL);
    return () => clearInterval(timer);
  }, []);

  // Redirect to home if no vault is open
  useEffect(() => {
    if (!vaultPath) {
      navigate("/", { replace: true });
    }
  }, [vaultPath, navigate]);

  // Initialize link index when vault opens
  const initIndex = useLinkStore((s) => s.initIndex);
  const clearIndex = useLinkStore((s) => s.clearIndex);
  useEffect(() => {
    if (vaultPath) {
      initIndex(vaultPath);
    } else {
      clearIndex();
    }
  }, [vaultPath]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "p") {
        e.preventDefault();
        setShowQuickSwitcher(true);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  if (!vaultPath) return null;

  return (
    <div className="app-root flex flex-col h-full bg-[var(--color-bg-app)]">
      <div className="app-workspace flex flex-1 overflow-hidden">
        <Sidebar
          collapsed={sidebarCollapsed}
          onToggle={() => setSidebarCollapsed(!sidebarCollapsed)}
        />
        <EditorArea sidebarCollapsed={sidebarCollapsed} />
      </div>
      {showQuickSwitcher && (
        <QuickSwitcher onClose={() => setShowQuickSwitcher(false)} />
      )}
      <div className="app-bottom-bar">
        <span className="bottom-file-count">
          <span>{formatVaultSize(vaultSize)}</span>
          <span style={{ marginLeft: 8 }}>{fileCount} {t(fileCount === 1 ? "status.file" : "status.files")}</span>
          {statusInfo && (
            <>
              <span className="bottom-status-separator">·</span>
              {statusInfo.key === "words" && (
                <span>{statusInfo.value} {t(statusInfo.value === 1 ? "status.word" : "status.words")} · {statusInfo.lines} {t(statusInfo.lines === 1 ? "status.line" : "status.lines")}</span>
              )}
              {statusInfo.key === "lines" && (
                <span>{statusInfo.value} {t(statusInfo.value === 1 ? "status.line" : "status.lines")}</span>
              )}
              {statusInfo.key === "csv" && (
                <span>{statusInfo.rows} {t(statusInfo.rows === 1 ? "status.row" : "status.rows")} · {statusInfo.cols} {t(statusInfo.cols === 1 ? "status.column" : "status.columns")}</span>
              )}
            </>
          )}
        </span>
        <div className="bottom-actions">
          <SyncButton />
          <button
            onClick={() => setShowRecovery(true)}
            className="bottom-settings-button"
            title={t("recovery.title")}
            disabled={!vaultPath}
          >
            <History size={13} />
          </button>
          <button
            onClick={() => setShowAbout(true)}
            className="bottom-settings-button"
            title={t("about.title")}
          >
            <Info size={13} />
          </button>
          <button
            onClick={() => setShowSettings(true)}
            className="bottom-settings-button"
            title="Settings"
          >
            <Settings size={13} />
          </button>
        </div>
      </div>
      {showRecovery && <RecoveryCenter onClose={() => setShowRecovery(false)} />}
      {showSettings && <SettingsModal onClose={() => setShowSettings(false)} />}
      {showAbout && <AboutModal onClose={() => setShowAbout(false)} />}
      <SyncToast />
    </div>
  );
}
