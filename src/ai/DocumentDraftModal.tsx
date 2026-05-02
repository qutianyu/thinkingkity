import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { Folder, FileText, X, RefreshCw, Save, AlertTriangle, Loader2 } from "lucide-react";
import { readDirectory } from "@/lib/tauriCommands";
import { isVaultSystemEntry } from "@/lib/vaultConfig";
import type { FileEntry } from "@/types";
import { useAiStore } from "./aiStore";
import { generateDocumentDraft } from "./documentGenerator";
import { prepareWriteMarkdownToolCall, executeWriteMarkdownToolCall } from "./documentWriter";
import type { AiDocumentDraft, DocumentGeneratorStatus } from "./documentTypes";
import type { AiSessionData } from "./sessionTypes";
import { extractThinking } from "./thinking";

interface DocumentDraftModalProps {
  open: boolean;
  vaultPath: string;
  session: AiSessionData;
  memory: string;
  language: string;
  onClose: () => void;
  onSaveSuccess: (fullPath: string) => void;
}

const DEFAULT_DIRECTORY = "";

function getVaultRelativePath(vaultPath: string, absolutePath: string): string {
  const normalized = vaultPath.replace(/[/\\]+$/, "");
  const sep = absolutePath.includes("\\") ? "\\" : "/";
  if (absolutePath === normalized) return "";
  if (absolutePath.startsWith(`${normalized}${sep}`)) {
    return absolutePath.slice(normalized.length + 1);
  }
  return absolutePath;
}

function formatDirectoryDisplay(relativePath: string): string {
  if (!relativePath) return "/";
  return `/${relativePath}/`;
}

async function readAllDirectories(vaultPath: string): Promise<string[]> {
  const results: string[] = [];
  const stack: string[] = [vaultPath];

  while (stack.length > 0) {
    const path = stack.pop()!;
    try {
      const entries = (await readDirectory(path))
        .filter((e) => e.is_dir && !isVaultSystemEntry(e))
        .sort((a, b) => a.name.localeCompare(b.name));

      for (const entry of entries) {
        const relative = getVaultRelativePath(vaultPath, entry.path);
        results.push(relative);
        stack.push(entry.path);
      }
    } catch {
      // skip unreadable dirs
    }
  }

  return results.sort((a, b) => a.localeCompare(b));
}

interface DirectoryPickerProps {
  vaultPath: string;
  selectedPath: string;
  onSelect: (relativePath: string) => void;
  onClose: () => void;
}

function DirectoryPicker({ vaultPath, selectedPath, onSelect, onClose }: DirectoryPickerProps) {
  const { t } = useTranslation();
  const [dirs, setDirs] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    readAllDirectories(vaultPath)
      .then((results) => {
        if (!cancelled) setDirs(results);
      })
      .catch(() => {
        if (!cancelled) setDirs([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [vaultPath]);

  return (
    <div className="ai-directory-picker">
      <div className="ai-directory-picker-header">
        <span>{t("aiChat.selectDirectory")}</span>
        <button
          type="button"
          className="ai-directory-picker-close"
          onClick={onClose}
          aria-label={t("tab.close")}
        >
          <X size={14} />
        </button>
      </div>

      <div className="ai-directory-list">
        <button
          type="button"
          className={`ai-directory-row ${selectedPath === "" ? "ai-directory-row-selected" : ""}`}
          onClick={() => onSelect("")}
        >
          <Folder size={14} className="ai-directory-row-icon" />
          <span className="ai-directory-row-label">/</span>
        </button>

        {loading ? (
          <div className="ai-directory-loading">{t("aiChat.searching")}</div>
        ) : (
          dirs.map((relativePath) => {
            const isSelected = relativePath === selectedPath;
            return (
              <button
                key={relativePath}
                type="button"
                className={`ai-directory-row ${isSelected ? "ai-directory-row-selected" : ""}`}
                onClick={() => onSelect(relativePath)}
              >
                <Folder size={14} className="ai-directory-row-icon" />
                <span className="ai-directory-row-label">{formatDirectoryDisplay(relativePath)}</span>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}

export function DocumentDraftModal({
  open,
  vaultPath,
  session,
  memory,
  language,
  onClose,
  onSaveSuccess,
}: DocumentDraftModalProps) {
  const { t } = useTranslation();
  const ai = useAiStore((s) => s.ai);

  const [status, setStatus] = useState<DocumentGeneratorStatus>("idle");
  const [draft, setDraft] = useState<AiDocumentDraft | null>(null);
  const [markdown, setMarkdown] = useState("");
  const [thinking, setThinking] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [targetDirectory, setTargetDirectory] = useState(DEFAULT_DIRECTORY);
  const [fileName, setFileName] = useState("");
  const [directoryPickerOpen, setDirectoryPickerOpen] = useState(false);

  const abortRef = useRef<AbortController | null>(null);

  const resetForm = () => {
    setTargetDirectory(DEFAULT_DIRECTORY);
    setFileName("");
    setError(null);
  };

  const startGeneration = async () => {
    if (!ai.api_key.trim() || !ai.base_url.trim() || !ai.model.trim()) {
      setError(t("aiChat.errors.requestFailed") ?? "AI not configured.");
      setStatus("error");
      return;
    }

    setStatus("generating");
    setError(null);
    setDraft(null);
    setMarkdown("");
    setThinking([]);
    let rawMarkdown = "";

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const result = await generateDocumentDraft({
        ai,
        vaultPath,
        session,
        memory,
        language,
        documentOptions: { targetDirectory, fileName: fileName || "document.md" },
        signal: controller.signal,
        onThinking: (token) => {
          setThinking((current) => {
            const next = current.length ? [...current] : [""];
            next[next.length - 1] = `${next[next.length - 1] ?? ""}${token}`;
            return next;
          });
        },
        onToken: (token) => {
          rawMarkdown += token;
          const extracted = extractThinking(rawMarkdown);
          setThinking(extracted.thinking);
          setMarkdown(extracted.visibleContent);
        },
      });

      setDraft(result);
      setMarkdown(result.markdown);
      setFileName(result.suggestedFileName);
      setStatus("ready");
    } catch (err) {
      if (controller.signal.aborted) {
        setStatus(markdown ? "ready" : "idle");
        return;
      }
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
      setStatus("error");
    } finally {
      if (abortRef.current === controller) {
        abortRef.current = null;
      }
    }
  };

  useEffect(() => {
    if (open && status === "idle" && !draft) {
      void startGeneration();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!open) {
      abortRef.current?.abort();
      abortRef.current = null;
      setStatus("idle");
      setDraft(null);
      setMarkdown("");
      setThinking([]);
      setError(null);
      resetForm();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const handleClose = () => {
    abortRef.current?.abort();
    abortRef.current = null;
    onClose();
  };

  const handleRegenerate = () => {
    setDraft(null);
    setMarkdown("");
    setStatus("idle");
    setError(null);
    void startGeneration();
  };

  const handleSave = async () => {
    if (!draft || !vaultPath) return;
    setStatus("saving");
    setError(null);

    const toolCall = prepareWriteMarkdownToolCall({
      draft,
      targetDirectory,
      fileName: fileName || draft.suggestedFileName,
    });

    const result = await executeWriteMarkdownToolCall({ vaultPath, toolCall });

    if (result.ok && result.relativePath) {
      onSaveSuccess(result.relativePath);
    } else {
      setError(result.error || "Failed to save document.");
      setStatus("error");
    }
  };

  if (!open) return null;

  const isGenerating = status === "generating";
  const isSaving = status === "saving";
  const canEdit = status === "ready" || status === "error";
  const canSave = canEdit && !!draft && !isSaving;

  return createPortal(
    <div className="ai-document-overlay" role="dialog" aria-modal="true" aria-label={t("aiChat.generateDocument")}>
      <div className="ai-document-backdrop" onClick={handleClose} />
      <div className="ai-document-modal">
        <div className="ai-document-header">
          <div className="ai-document-header-title">
            <FileText size={16} />
            <span>{t("aiChat.generateDocument")}</span>
          </div>
          <button
            type="button"
            className="ai-document-header-close"
            onClick={handleClose}
            disabled={isSaving}
            aria-label={t("tab.close")}
          >
            <X size={15} />
          </button>
        </div>

        <div className="ai-document-body">
          <div className="ai-document-form">
            <div className="ai-document-field">
              <label className="ai-document-label">{t("aiChat.documentTargetDirectory")}</label>
              <div className="ai-directory-field">
                <span className="ai-directory-value">
                  {formatDirectoryDisplay(targetDirectory)}
                </span>
                <button
                  type="button"
                  className="ai-directory-select-btn"
                  onClick={() => setDirectoryPickerOpen(true)}
                  disabled={isGenerating || isSaving}
                >
                  {t("aiChat.selectDirectory")}
                </button>
                {directoryPickerOpen && (
                  <>
                    <div
                      className="ai-directory-picker-backdrop"
                      onClick={() => setDirectoryPickerOpen(false)}
                    />
                    <DirectoryPicker
                      vaultPath={vaultPath}
                      selectedPath={targetDirectory}
                      onSelect={(path) => {
                        setTargetDirectory(path);
                        setDirectoryPickerOpen(false);
                      }}
                      onClose={() => setDirectoryPickerOpen(false)}
                    />
                  </>
                )}
              </div>
            </div>

            <div className="ai-document-field">
              <label className="ai-document-label">{t("aiChat.documentFileName")}</label>
              <input
                type="text"
                className="ai-document-input"
                value={fileName}
                onChange={(e) => setFileName(e.target.value)}
                disabled={isGenerating || isSaving}
                placeholder="document.md"
              />
            </div>
          </div>

          <div className="ai-document-preview">
            {isGenerating && (
              <div className="ai-document-generating">
                <Loader2 size={16} className="ai-document-spinner" />
                <span>{t("aiChat.documentGenerating")}</span>
              </div>
            )}
            {thinking.length > 0 && (
              <div className="ai-chat-thinking">
                {thinking.map((item, index) => (
                  <div key={index} className="ai-chat-thinking-block">
                    {item}
                  </div>
                ))}
              </div>
            )}
            <textarea
              className="ai-document-textarea"
              value={markdown}
              onChange={(e) => {
                setMarkdown(e.target.value);
                if (draft) {
                  setDraft({ ...draft, markdown: e.target.value });
                }
              }}
              readOnly={!canEdit}
              placeholder="Markdown draft..."
              rows={16}
            />
          </div>

          {error && (
            <div className="ai-document-error">
              <AlertTriangle size={14} />
              <span>{error}</span>
            </div>
          )}

          <div className="ai-document-actions">
            <button
              type="button"
              className="ai-document-btn ai-document-btn-secondary"
              onClick={handleClose}
              disabled={isSaving}
            >
              {t("dialog.cancel")}
            </button>
            <button
              type="button"
              className="ai-document-btn ai-document-btn-secondary"
              onClick={handleRegenerate}
              disabled={isGenerating || isSaving}
            >
              <RefreshCw size={14} />
              {t("aiChat.documentRegenerate")}
            </button>
            <button
              type="button"
              className="ai-document-btn ai-document-btn-primary"
              onClick={handleSave}
              disabled={!canSave}
            >
              {isSaving ? (
                <>
                  <Loader2 size={14} className="ai-document-spinner" />
                  {t("aiChat.documentSaving")}
                </>
              ) : (
                <>
                  <Save size={14} />
                  {t("aiChat.documentWriteConfirm")}
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
