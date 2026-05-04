import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { Bot, Check, FilePlus, FileText, Folder, Globe, Plus, Search, Send, Square, Trash2, X } from "lucide-react";
import { useEditorStore } from "@/stores/editorStore";
import { useVaultStore } from "@/stores/vaultStore";
import { useFileTreeStore } from "@/stores/fileTreeStore";
import { pathJoin } from "@/lib/tauriCommands";
import { useAiStore } from "./aiStore";
import { searchArticleContexts } from "./articleSearch";
import { getVaultRelativePath } from "./contextBuilder";
import { MarkdownMessage } from "./MarkdownMessage";
import { compactSessionMemoryIfNeeded } from "./memoryCompactor";
import { DocumentDraftModal } from "./DocumentDraftModal";
import { runAiGraph } from "./graph/runAiGraph";
import {
  appendUserAndAssistantPlaceholders,
  createAiSession,
  deleteAiSession,
  loadAiSessions,
  removeArticleContext,
  removeEmptyAssistantMessage,
  saveAiSession,
  switchAiSession,
  toggleArticleContext,
  toggleArticleContextRef,
  updateSessionMessageContent,
} from "./sessionManager";
import type { AiArticleContextRef, AiSessionData, AiSessionManagerData } from "./sessionTypes";
import type { AiKnowledgeToolCall } from "./toolTypes";

interface PendingToolRequest {
  call: AiKnowledgeToolCall;
  session: AiSessionData;
  manager: AiSessionManagerData;
  assistantMessageId: string;
  contextRefs: AiArticleContextRef[];
  running: boolean;
  error?: string;
}

export function AiChatDock() {
  const { t, i18n } = useTranslation();
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [manager, setManager] = useState<AiSessionManagerData | null>(null);
  const [session, setSession] = useState<AiSessionData | null>(null);
  const [memory, setMemory] = useState("");
  const [loading, setLoading] = useState(false);
  const [articleQuery, setArticleQuery] = useState("");
  const [articleResults, setArticleResults] = useState<AiArticleContextRef[]>([]);
  const [articleSearching, setArticleSearching] = useState(false);
  const [contextPickerOpen, setContextPickerOpen] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [documentModalOpen, setDocumentModalOpen] = useState(false);
  const [pendingToolRequest, setPendingToolRequest] = useState<PendingToolRequest | null>(null);
  const [thinkingByMessageId, setThinkingByMessageId] = useState<Record<string, string[]>>({});
  const ai = useAiStore((s) => s.ai);
  const vaultPath = useVaultStore((s) => s.vaultPath);
  const activeTabPath = useEditorStore((s) => s.activeTabPath);
  const ref = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const toolConfirmationRef = useRef<((allowed: boolean) => void) | null>(null);

  const messages = session?.messages ?? [];

  const canGenerateDocument = Boolean(
    vaultPath
    && session
    && !streaming
    && session.messages.some((m) => m.role === "user" && m.content.trim())
    && session.messages.some((m) => m.role === "assistant" && m.content.trim()),
  );
  const sessions = manager?.sessions ?? [];
  // Active editor file can be attached without going through the search picker.
  const activeRelativePath = vaultPath && activeTabPath
    ? getVaultRelativePath(vaultPath, activeTabPath)
    : "";
  const currentArticleAttached = Boolean(
    activeRelativePath && session?.attached_context.some((item) => item.path === activeRelativePath),
  );

  const handleInputKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    const composing = event.nativeEvent.isComposing;
    const plainEnter = event.key === "Enter"
      && !event.shiftKey
      && !event.metaKey
      && !event.ctrlKey
      && !event.altKey
      && !composing;

    if (!plainEnter) return;

    event.preventDefault();
    event.currentTarget.form?.requestSubmit();
  };

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!vaultPath) {
        setManager(null);
        setSession(null);
        setMemory("");
        return;
      }
      setLoading(true);
      setError(null);
      try {
        const loaded = await loadAiSessions(vaultPath);
        if (cancelled) return;
        setManager(loaded.manager);
        setSession(loaded.activeSession);
        setMemory(loaded.memory);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : t("aiChat.errors.loadSessions"));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      // Ignore late async results after the vault switches.
      cancelled = true;
    };
  }, [vaultPath]);

  useEffect(() => {
    const root = scrollRef.current;
    if (!root) return;
    root.scrollTop = root.scrollHeight;
  }, [messages, streaming, error, open, session?.id]);

  useEffect(() => {
    let cancelled = false;
    const query = articleQuery.trim();
    if (!open || !contextPickerOpen || !vaultPath || !query) {
      setArticleResults([]);
      setArticleSearching(false);
      return;
    }

    setArticleSearching(true);
    const timer = window.setTimeout(() => {
      searchArticleContexts(vaultPath, query)
        .then((results) => {
          if (!cancelled) setArticleResults(results);
        })
        .catch((err) => {
          console.warn("Failed to search article contexts:", err);
          if (!cancelled) setArticleResults([]);
        })
        .finally(() => {
          if (!cancelled) setArticleSearching(false);
        });
    }, 180);

    return () => {
      cancelled = true;
      // Debounce file search while the user types in the context picker.
      window.clearTimeout(timer);
    };
  }, [articleQuery, contextPickerOpen, open, vaultPath]);

  const stopStreaming = () => {
    if (toolConfirmationRef.current) {
      toolConfirmationRef.current(false);
      toolConfirmationRef.current = null;
      setPendingToolRequest(null);
    }
    abortRef.current?.abort();
    abortRef.current = null;
    setStreaming(false);
  };

  const applyLoaded = (loaded: { manager: AiSessionManagerData; activeSession: AiSessionData; memory: string }) => {
    setManager(loaded.manager);
    setSession(loaded.activeSession);
    setMemory(loaded.memory);
    setError(null);
    setDeleteConfirmOpen(false);
  };

  const createSession = async () => {
    if (!vaultPath || streaming) return;
    setLoading(true);
    try {
      applyLoaded(await createAiSession(vaultPath));
    } catch (err) {
      setError(err instanceof Error ? err.message : t("aiChat.errors.createSession"));
    } finally {
      setLoading(false);
    }
  };

  const switchSession = async (sessionId: string) => {
    if (!vaultPath || streaming || sessionId === session?.id) return;
    setLoading(true);
    setDeleteConfirmOpen(false);
    try {
      applyLoaded(await switchAiSession(vaultPath, sessionId));
    } catch (err) {
      setError(err instanceof Error ? err.message : t("aiChat.errors.switchSession"));
    } finally {
      setLoading(false);
    }
  };

  const deleteSession = async () => {
    if (!vaultPath || !session || streaming) return;
    setLoading(true);
    try {
      applyLoaded(await deleteAiSession(vaultPath, session.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : t("aiChat.errors.deleteSession"));
    } finally {
      setLoading(false);
    }
  };

  const toggleCurrentArticle = async () => {
    if (!vaultPath || !session || !manager || !activeRelativePath || streaming) return;
    const nextSession = toggleArticleContext(session, activeRelativePath);
    setSession(nextSession);
    try {
      setManager(await saveAiSession(vaultPath, nextSession, manager));
    } catch (err) {
      setError(err instanceof Error ? err.message : t("aiChat.errors.updateContext"));
    }
  };

  const removeAttachedArticle = async (path: string) => {
    if (!vaultPath || !session || !manager || streaming) return;
    const nextSession = removeArticleContext(session, path);
    setSession(nextSession);
    try {
      setManager(await saveAiSession(vaultPath, nextSession, manager));
    } catch (err) {
      setError(err instanceof Error ? err.message : t("aiChat.errors.removeContext"));
    }
  };

  const toggleSearchArticle = async (ref: AiArticleContextRef) => {
    if (!vaultPath || !session || !manager || streaming) return;
    const nextSession = toggleArticleContextRef(session, ref);
    setSession(nextSession);
    try {
      setManager(await saveAiSession(vaultPath, nextSession, manager));
    } catch (err) {
      setError(err instanceof Error ? err.message : t("aiChat.errors.updateContext"));
    }
  };

  const closeContextPicker = () => {
    setContextPickerOpen(false);
    setArticleQuery("");
    setArticleResults([]);
  };

  const appendAssistantThinking = (messageId: string, token: string) => {
    setThinkingByMessageId((current) => {
      const parts = current[messageId] ?? [""];
      const next = [...parts];
      next[next.length - 1] = `${next[next.length - 1] ?? ""}${token}`;
      return {
        ...current,
        [messageId]: next,
      };
    });
  };

  const describeToolRequest = (call: AiKnowledgeToolCall): string => {
    if (call.tool === "fetch_url" || call.tool === "browse_page") {
      return [
        call.tool === "browse_page" ? t("aiChat.toolBrowseRequested") : t("aiChat.toolFetchRequested"),
        "",
        `URL: ${call.url}`,
        call.purpose ? `${t("aiChat.toolPurpose")}: ${call.purpose}` : "",
      ].filter(Boolean).join("\n");
    }
    return t("aiChat.toolRequested");
  };

  const cancelToolRequest = async () => {
    if (toolConfirmationRef.current) {
      toolConfirmationRef.current(false);
      toolConfirmationRef.current = null;
      setPendingToolRequest(null);
      return;
    }
    if (!vaultPath || !pendingToolRequest) return;
    const nextSession = updateSessionMessageContent(
      pendingToolRequest.session,
      pendingToolRequest.assistantMessageId,
      t("aiChat.toolCancelled"),
    );
    setSession(nextSession);
    setPendingToolRequest(null);
    try {
      setManager(await saveAiSession(vaultPath, nextSession, pendingToolRequest.manager));
    } catch (err) {
      setError(err instanceof Error ? err.message : t("aiChat.errors.requestFailed"));
    }
  };

  const confirmToolRequest = async () => {
    if (toolConfirmationRef.current) {
      setPendingToolRequest((current) => current ? { ...current, running: true, error: undefined } : current);
      toolConfirmationRef.current(true);
      toolConfirmationRef.current = null;
    }
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    const text = input.trim();
    if (!text || streaming || !vaultPath || !session || !manager) return;

    // Capture the one-shot context list before appendUserAndAssistantPlaceholders clears it.
    const submittedContextRefs = session.attached_context;
    const {
      session: pendingSession,
      assistantMessageId,
    } = appendUserAndAssistantPlaceholders(session, text, submittedContextRefs);
    const controller = new AbortController();
    let assistantContent = "";
    let nextSession = pendingSession;
    let nextManager = manager;

    setInput("");
    closeContextPicker();
    setError(null);
    setSession(pendingSession);
    setStreaming(true);
    abortRef.current = controller;

    try {
      nextManager = await saveAiSession(vaultPath, pendingSession, manager);
      setManager(nextManager);

      const result = await runAiGraph({
        ai,
        vaultPath,
        session: pendingSession,
        memory,
        language: i18n.language,
        userText: text,
        articleRefs: submittedContextRefs,
        signal: controller.signal,
        confirmToolCall: (call) => new Promise((resolve) => {
          toolConfirmationRef.current = resolve;
          const messageSession = updateSessionMessageContent(pendingSession, assistantMessageId, describeToolRequest(call));
          setSession(messageSession);
          setPendingToolRequest({
            call,
            session: messageSession,
            manager: nextManager,
            assistantMessageId,
            contextRefs: submittedContextRefs,
            running: false,
          });
        }),
        onEvent: (graphEvent) => {
          if (graphEvent.type === "thinking" && graphEvent.node === "final_answer") {
            appendAssistantThinking(assistantMessageId, graphEvent.value);
          }
          if (graphEvent.type === "token" && graphEvent.node === "final_answer") {
            assistantContent = graphEvent.value;
            setSession((current) =>
              current ? updateSessionMessageContent(current, assistantMessageId, assistantContent) : current,
            );
          }
          if (graphEvent.type === "tool_result") {
            console.info("[ThinkingKity AI] tool result", graphEvent.result);
            setPendingToolRequest(null);
            const message = graphEvent.result.ok
              ? t("aiChat.toolFetchedGenerating")
              : `${t("aiChat.toolFetchFailed")}: ${graphEvent.result.error ?? "Unknown error"}`;
            setSession((current) =>
              current ? updateSessionMessageContent(current, assistantMessageId, message) : current,
            );
          }
          if (graphEvent.type === "error") {
            setError(graphEvent.error);
          }
        },
      });
      assistantContent = result.finalAnswer;

      nextSession = updateSessionMessageContent(pendingSession, assistantMessageId, assistantContent);
      nextManager = await saveAiSession(vaultPath, nextSession, nextManager);
      setSession(nextSession);
      setManager(nextManager);

      compactSessionMemoryIfNeeded({
        ai,
        vaultPath,
        session: nextSession,
        manager: nextManager,
        memory,
        language: i18n.language,
      })
        .then((compacted) => {
          // Compaction is background work; only apply it if the same session is still visible.
          setSession((current) => current?.id === compacted.session.id ? compacted.session : current);
          setManager(compacted.manager);
          setMemory(compacted.memory);
        })
        .catch((err) => {
          console.warn("Failed to compact AI session memory:", err);
        });
    } catch (err) {
      if (controller.signal.aborted) {
        nextSession = assistantContent
          ? updateSessionMessageContent(pendingSession, assistantMessageId, assistantContent)
          : removeEmptyAssistantMessage(pendingSession, assistantMessageId);
        setSession(nextSession);
        try {
          setManager(await saveAiSession(vaultPath, nextSession, nextManager));
        } catch (saveError) {
          console.warn("Failed to save stopped AI session:", saveError);
        }
        return;
      }
      setError(err instanceof Error ? err.message : t("aiChat.errors.requestFailed"));
      nextSession = removeEmptyAssistantMessage(pendingSession, assistantMessageId);
      setSession(nextSession);
      try {
        setManager(await saveAiSession(vaultPath, nextSession, nextManager));
      } catch (saveError) {
        console.warn("Failed to save errored AI session:", saveError);
      }
    } finally {
      if (abortRef.current === controller) {
        abortRef.current = null;
      }
      setStreaming(false);
    }
  };

  return (
    <div ref={ref} className="ai-chat-dock">
      <button
        type="button"
        className={`ai-chat-trigger ${open ? "ai-chat-trigger-active" : ""}`}
        onClick={() => setOpen((value) => !value)}
        title={t("aiChat.title")}
        aria-label={t("aiChat.title")}
        aria-expanded={open}
      >
        <Bot size={17} />
      </button>

      {open && createPortal(
        <aside className="ai-chat-panel" aria-label={t("aiChat.panelLabel")}>
          <div className="ai-chat-panel-header">
            <div className="ai-chat-panel-title">
              <Bot size={16} />
              <select
                value={session?.id ?? ""}
                onChange={(event) => switchSession(event.target.value)}
                className="ai-session-select"
                disabled={loading || streaming || sessions.length === 0}
                title={session?.title ?? t("aiChat.title")}
              >
                {sessions.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.title}
                  </option>
                ))}
              </select>
            </div>
            <div className="ai-chat-panel-actions">
              <button
                type="button"
                className="ai-chat-panel-close"
                onClick={createSession}
                disabled={!vaultPath || loading || streaming}
                title={t("aiChat.newSession")}
                aria-label={t("aiChat.newSession")}
              >
                <Plus size={15} />
              </button>
              <button
                type="button"
                className="ai-chat-panel-close"
                onClick={() => setDeleteConfirmOpen((value) => !value)}
                disabled={!session || loading || streaming}
                title={t("aiChat.deleteSession")}
                aria-label={t("aiChat.deleteSession")}
              >
                <Trash2 size={14} />
              </button>
              {deleteConfirmOpen && session && (
                <div className="ai-session-delete-popover" role="dialog" aria-label={t("aiChat.deleteSessionConfirmation")}>
                  <p>{t("aiChat.deleteSessionPrompt", { title: session.title })}</p>
                  <div className="ai-session-delete-actions">
                    <button
                      type="button"
                      className="ai-session-delete-cancel"
                      onClick={() => setDeleteConfirmOpen(false)}
                    >
                      {t("dialog.cancel")}
                    </button>
                    <button
                      type="button"
                      className="ai-session-delete-confirm"
                      onClick={deleteSession}
                    >
                      {t("dialog.delete")}
                    </button>
                  </div>
                </div>
              )}
              <button
                type="button"
                className="ai-chat-panel-close"
                onClick={() => setDocumentModalOpen(true)}
                disabled={!canGenerateDocument}
                title={t("aiChat.generateDocument")}
                aria-label={t("aiChat.generateDocument")}
              >
                <FilePlus size={15} />
              </button>
              <button
                type="button"
                className="ai-chat-panel-close"
                onClick={() => setOpen(false)}
                title={t("tab.close")}
                aria-label={t("tab.close")}
              >
                <X size={15} />
              </button>
            </div>
          </div>
          <div ref={scrollRef} className="ai-chat-panel-body">
            {messages.length === 0 ? (
              <div className="ai-chat-empty">
                <Bot size={22} className="text-[var(--color-primary)]" />
                <span className="text-[13px] text-[var(--color-text-muted)]">{loading ? t("aiChat.loadingSession") : t("aiChat.empty")}</span>
              </div>
            ) : (
              <div className="ai-chat-messages">
                {messages.map((message) => (
                  <div
                    key={message.id}
                    className={`ai-chat-message ai-chat-message-${message.role}`}
                  >
                    <div className="ai-chat-message-role">
                      {message.role === "user" ? t("aiChat.userRole") : t("aiChat.assistantRole")}
                    </div>
                    {message.role === "assistant" && thinkingByMessageId[message.id]?.length > 0 && (
                      <div className="ai-chat-thinking">
                        {thinkingByMessageId[message.id].map((item, index) => (
                          <div key={index} className="ai-chat-thinking-block">
                            {item}
                          </div>
                        ))}
                      </div>
                    )}
                    <div className="ai-chat-message-content">
                      {message.content
                        ? <MarkdownMessage content={message.content} />
                        : (streaming ? <span className="ai-chat-caret" /> : null)}
                    </div>
                    {message.context_refs && message.context_refs.length > 0 && (
                      <div className="ai-chat-message-contexts" aria-label={t("aiChat.attachedFileContext")}>
                        {message.context_refs.map((item) => (
                          <span key={item.path} className="ai-chat-message-context" title={item.path}>
                            {item.type === "directory" ? <Folder size={12} /> : <FileText size={12} />}
                            <span>{item.title}</span>
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
            {error && <div className="ai-chat-error">{error}</div>}
          </div>
          {pendingToolRequest && (
            <div className="ai-tool-confirm" role="dialog" aria-label={t("aiChat.toolConfirmTitle")}>
              <div className="ai-tool-confirm-title">
                <Globe size={15} />
                <span>{t("aiChat.toolConfirmTitle")}</span>
              </div>
              <div className="ai-tool-confirm-body">
                <div className="ai-tool-confirm-url">{pendingToolRequest.call.url}</div>
                {pendingToolRequest.call.purpose && (
                  <div className="ai-tool-confirm-purpose">{pendingToolRequest.call.purpose}</div>
                )}
                {pendingToolRequest.error && <div className="ai-chat-error">{pendingToolRequest.error}</div>}
              </div>
              <div className="ai-tool-confirm-actions">
                <button
                  type="button"
                  className="ai-tool-confirm-cancel"
                  onClick={cancelToolRequest}
                  disabled={pendingToolRequest.running}
                >
                  {t("aiChat.toolCancel")}
                </button>
                <button
                  type="button"
                  className="ai-tool-confirm-allow"
                  onClick={confirmToolRequest}
                  disabled={pendingToolRequest.running}
                >
                  {pendingToolRequest.running
                    ? t("aiChat.toolFetching")
                    : pendingToolRequest.call.tool === "browse_page"
                      ? t("aiChat.toolAllowBrowse")
                      : t("aiChat.toolAllowFetch")}
                </button>
              </div>
            </div>
          )}
          <form className="ai-chat-composer" onSubmit={handleSubmit}>
            {session && (
              <div className="ai-context-bar">
                {session.attached_context.length > 0 && (
                  <div className="ai-context-list">
                    {session.attached_context.map((item) => (
                      <button
                        key={item.path}
                        type="button"
                        className="ai-context-chip"
                        onClick={() => removeAttachedArticle(item.path)}
                        disabled={streaming}
                        title={item.path}
                      >
                        {item.type === "directory" ? <Folder size={12} /> : null}
                        <span>{item.title}</span>
                        <X size={12} />
                      </button>
                    ))}
                  </div>
                )}
                {contextPickerOpen && (
                  <div className="ai-context-picker" role="dialog" aria-label={t("aiChat.selectContextFiles")}>
                    <div className="ai-context-picker-header">
                      <span>{t("aiChat.attachFiles")}</span>
                      <button
                        type="button"
                        className="ai-context-picker-close"
                        onClick={closeContextPicker}
                        aria-label={t("aiChat.closeContextPicker")}
                        title={t("tab.close")}
                      >
                        <X size={14} />
                      </button>
                    </div>
                    {activeRelativePath && (
                      <button
                        type="button"
                        className={`ai-context-current ${currentArticleAttached ? "ai-context-current-active" : ""}`}
                        onClick={toggleCurrentArticle}
                        disabled={loading || streaming}
                        title={currentArticleAttached ? t("aiChat.removeCurrentFileContext") : t("aiChat.addCurrentFileContext")}
                      >
                        <span>{currentArticleAttached ? t("aiChat.currentFileAttached") : t("aiChat.attachCurrentFile")}</span>
                        {currentArticleAttached && <Check size={13} />}
                      </button>
                    )}
                    <div className="ai-context-search">
                      <Search size={14} className="ai-context-search-icon" />
                      <input
                        value={articleQuery}
                        onChange={(event) => setArticleQuery(event.target.value)}
                        className="ai-context-search-input"
                        placeholder={t("aiChat.searchFilesPlaceholder")}
                        disabled={loading || streaming}
                        autoFocus
                      />
                      {articleQuery && (
                        <button
                          type="button"
                          className="ai-context-search-clear"
                          onClick={() => {
                            setArticleQuery("");
                            setArticleResults([]);
                          }}
                          aria-label={t("aiChat.clearSearch")}
                          title={t("aiChat.clear")}
                        >
                          <X size={13} />
                        </button>
                      )}
                    </div>
                    <div className="ai-context-results">
                      {!articleQuery.trim() ? (
                        <div className="ai-context-result-empty">{t("aiChat.searchFilesEmpty")}</div>
                      ) : articleSearching ? (
                        <div className="ai-context-result-empty">{t("aiChat.searching")}</div>
                      ) : articleResults.length === 0 ? (
                        <div className="ai-context-result-empty">{t("aiChat.noFilesFound")}</div>
                      ) : (
                        articleResults.map((item) => {
                          const selected = session.attached_context.some((ref) => ref.path === item.path && ref.type === item.type);
                          return (
                            <button
                              key={item.path}
                              type="button"
                              className={`ai-context-result ${selected ? "ai-context-result-selected" : ""}`}
                              onClick={() => toggleSearchArticle(item)}
                              disabled={streaming}
                              title={item.path}
                            >
                              <span className="ai-context-result-check">
                                {selected && <Check size={13} />}
                              </span>
                              <span className="ai-context-result-text">
                                <span className="ai-context-result-title">
                                  {item.type === "directory" && <Folder size={12} />}
                                  <span>{item.title}</span>
                                </span>
                                <span className="ai-context-result-path">{item.path}</span>
                              </span>
                            </button>
                          );
                        })
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}
            <div className="ai-chat-input-row">
              <button
                type="button"
                className={`ai-context-trigger ${contextPickerOpen ? "ai-context-trigger-active" : ""}`}
                onClick={() => setContextPickerOpen((value) => !value)}
                disabled={!session || loading || streaming}
                title={t("aiChat.attachFileContext")}
                aria-label={t("aiChat.attachFileContext")}
                aria-expanded={contextPickerOpen}
              >
                <Plus size={16} />
                {session && session.attached_context.length > 0 && (
                  <span className="ai-context-trigger-badge">{session.attached_context.length}</span>
                )}
              </button>
              <textarea
                value={input}
                onChange={(event) => setInput(event.target.value)}
                onKeyDown={handleInputKeyDown}
                placeholder={t("aiChat.messagePlaceholder")}
                className="ai-chat-input"
                rows={3}
                disabled={streaming || !vaultPath || !session}
              />
              <button
                type={streaming ? "button" : "submit"}
                className="ai-chat-send"
                onClick={streaming ? stopStreaming : undefined}
                disabled={!streaming && (!input.trim() || !vaultPath || !session)}
                title={streaming ? t("aiChat.stop") : t("aiChat.send")}
                aria-label={streaming ? t("aiChat.stop") : t("aiChat.send")}
              >
                {streaming ? <Square size={14} /> : <Send size={15} />}
              </button>
            </div>
          </form>
        </aside>,
        document.body,
      )}
      {vaultPath && session && (
        <DocumentDraftModal
          open={documentModalOpen}
          vaultPath={vaultPath}
          session={session}
          memory={memory}
          language={i18n.language}
          onClose={() => setDocumentModalOpen(false)}
          onSaveSuccess={async (relativePath) => {
            setDocumentModalOpen(false);
            const fullPath = pathJoin(vaultPath, relativePath);
            await useFileTreeStore.getState().refreshTree(vaultPath);
            await useEditorStore.getState().openFile(fullPath);
          }}
        />
      )}
    </div>
  );
}
