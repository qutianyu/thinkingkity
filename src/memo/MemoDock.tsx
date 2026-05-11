import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Archive, ArchiveRestore, Check, CheckSquare, Clock, Code2, FileText, Maximize2, Minimize2, Pin, Plus, Sparkles, StickyNote, Trash2, X } from "lucide-react";
import { CodeEditor } from "@/components/editor/CodeEditor";
import { useVaultStore } from "@/stores/vaultStore";
import { createMemo, deleteMemo, readMemoContent, readMemoIndex, updateMemo } from "./memoStorage";
import type { MemoItem, MemoType } from "./types";

interface MemoDockProps {
  sidebarCollapsed?: boolean;
}

type TodoStatus = "pending" | "done" | "cancelled" | "deferred";

interface TodoItem {
  text: string;
  status: TodoStatus;
}

const TYPE_LABELS: Record<MemoType, string> = {
  note: "便签",
  code: "代码",
  todo: "待办",
};

const TYPE_META: Record<MemoType, { desc: string; iconClass: string }> = {
  note: { desc: "随手记录想法", iconClass: "memo-type-note" },
  code: { desc: "保存代码片段", iconClass: "memo-type-code" },
  todo: { desc: "追踪任务进度", iconClass: "memo-type-todo" },
};

const CODE_LANGUAGES = [
  { value: "typescript", label: "TypeScript" },
  { value: "javascript", label: "JavaScript" },
  { value: "python", label: "Python" },
  { value: "rust", label: "Rust" },
  { value: "go", label: "Go" },
  { value: "java", label: "Java" },
  { value: "cpp", label: "C++" },
  { value: "css", label: "CSS" },
  { value: "html", label: "HTML" },
  { value: "json", label: "JSON" },
  { value: "markdown", label: "Markdown" },
  { value: "sql", label: "SQL" },
  { value: "shell", label: "Shell" },
  { value: "text", label: "Text" },
];

function getTypeIcon(type: MemoType) {
  if (type === "code") return <Code2 size={13} />;
  if (type === "todo") return <CheckSquare size={13} />;
  return <FileText size={13} />;
}

function getInitialContent(type: MemoType): string {
  if (type === "todo") return "- [ ] ";
  return "";
}

function parseTodoContent(content: string): TodoItem[] {
  const lines = content.split(/\r?\n/);
  const items = lines
    .map((line): TodoItem | null => {
      const trimmed = line.trim();
      if (!trimmed) return null;
      const match = trimmed.match(/^[-*]\s+\[( |x|X|-|>)\]\s*(.*)$/);
      if (!match) return { status: "pending", text: trimmed.replace(/^[-*]\s+/, "") };
      const marker = match[1];
      const status: TodoStatus =
        marker === "x" || marker === "X"
          ? "done"
          : marker === "-"
            ? "cancelled"
            : marker === ">"
              ? "deferred"
              : "pending";
      return { status, text: match[2] };
    })
    .filter((item): item is TodoItem => Boolean(item));
  return items.length > 0 ? items : [{ status: "pending", text: "" }];
}

function serializeTodos(items: TodoItem[]): string {
  const markerByStatus: Record<TodoStatus, string> = {
    pending: " ",
    done: "x",
    cancelled: "-",
    deferred: ">",
  };
  return items.map((item) => `- [${markerByStatus[item.status]}] ${item.text}`).join("\n");
}

const TODO_STATUS_ORDER: TodoStatus[] = ["pending", "done", "cancelled", "deferred"];

function nextTodoStatus(status: TodoStatus): TodoStatus {
  return TODO_STATUS_ORDER[(TODO_STATUS_ORDER.indexOf(status) + 1) % TODO_STATUS_ORDER.length];
}

const TODO_STATUS_META: Record<TodoStatus, { label: string; color: string; bg: string; icon: typeof Check }> = {
  pending: { label: "待办", color: "var(--color-text-muted)", bg: "transparent", icon: Check },
  done: { label: "完成", color: "#34c759", bg: "rgba(52, 199, 89, 0.12)", icon: Check },
  cancelled: { label: "取消", color: "#ef4444", bg: "rgba(239, 68, 68, 0.1)", icon: X },
  deferred: { label: "延后", color: "#ff9500", bg: "rgba(255, 149, 0, 0.1)", icon: Clock },
};

function todoSummary(content: string): string {
  const todos = parseTodoContent(content).filter((item) => item.text.trim());
  const active = todos.filter((item) => item.status !== "cancelled");
  const done = active.filter((item) => item.status === "done").length;
  if (active.length === 0) return "无待办任务";
  return `${done}/${active.length} 已完成`;
}

function sortMemos(items: MemoItem[]): MemoItem[] {
  return [...items]
    .sort((a, b) => {
      if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
      return b.createdAt - a.createdAt;
    });
}

function formatDateGroup(value: number): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "未归档日期";
  return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日`;
}

function formatShortDate(value: number): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("zh-CN", { month: "short", day: "numeric" });
}

export function MemoDock({ sidebarCollapsed = false }: MemoDockProps) {
  const vaultPath = useVaultStore((s) => s.vaultPath);
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [items, setItems] = useState<MemoItem[]>([]);
  const [viewTab, setViewTab] = useState<"active" | "archived">("active");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [createTypeOpen, setCreateTypeOpen] = useState(false);
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [draftType, setDraftType] = useState<MemoType | null>(null);
  const [draftTitle, setDraftTitle] = useState("");
  const [draftContent, setDraftContent] = useState("");
  const [draftTodos, setDraftTodos] = useState<TodoItem[]>([{ status: "pending", text: "" }]);
  const [draftLanguage, setDraftLanguage] = useState("typescript");
  const [activeTitle, setActiveTitle] = useState("");
  const [activeContent, setActiveContent] = useState("");
  const [activeTodos, setActiveTodos] = useState<TodoItem[]>([]);
  const [activeLanguage, setActiveLanguage] = useState("typescript");
  const [activeDirty, setActiveDirty] = useState(false);
  const [previewById, setPreviewById] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const selected = items.find((item) => item.id === selectedId) ?? null;
  const activeItems = useMemo(() => items.filter((item) => !item.archived), [items]);
  const archivedItems = useMemo(() => items.filter((item) => item.archived), [items]);
  const counts = useMemo(() => {
    let note = 0;
    let code = 0;
    let todo = 0;
    for (const item of activeItems) {
      if (item.type === "note") note++;
      else if (item.type === "code") code++;
      else todo++;
    }
    return { note, code, todo };
  }, [activeItems]);
  const visibleItems = useMemo(() => {
    const source = viewTab === "active" ? activeItems : archivedItems;
    return sortMemos(source);
  }, [activeItems, archivedItems, viewTab]);

  const groupedItems = useMemo(() => {
    const groups: Array<{ date: string; items: MemoItem[] }> = [];
    for (const item of visibleItems) {
      const date = formatDateGroup(item.createdAt);
      const group = groups.find((entry) => entry.date === date);
      if (group) {
        group.items.push(item);
      } else {
        groups.push({ date, items: [item] });
      }
    }
    return groups;
  }, [visibleItems]);

  useEffect(() => {
    if (!vaultPath) return;
    let cancelled = false;
    readMemoIndex(vaultPath)
      .then((index) => {
        if (cancelled) return;
        setItems(index.items);
        setError("");
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "便签加载失败");
      });
    return () => {
      cancelled = true;
    };
  }, [vaultPath]);

  useEffect(() => {
    if (!vaultPath || !selected) {
      setActiveTitle("");
      setActiveContent("");
      setActiveDirty(false);
      return;
    }
    let cancelled = false;
    readMemoContent(vaultPath, selected)
      .then((content) => {
        if (!cancelled) {
          setActiveTitle(selected.title);
          setActiveContent(content);
          setActiveTodos(selected.type === "todo" ? parseTodoContent(content) : []);
          setActiveLanguage(selected.language || "typescript");
          setActiveDirty(false);
          setPreviewById((current) => ({ ...current, [selected.id]: content }));
        }
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "便签读取失败");
      });
    return () => {
      cancelled = true;
    };
  }, [vaultPath, selectedId]);

  useEffect(() => {
    if (!vaultPath || !selected || !activeDirty) return;
    const timer = window.setTimeout(async () => {
      setSaving(true);
      try {
        const next = await updateMemo(vaultPath, selected.id, {
          content: activeContent,
          title: activeTitle.trim() || selected.title,
          language: selected.type === "code" ? activeLanguage : undefined,
        });
        if (next) {
          setItems((current) => current.map((item) => (item.id === next.id ? next : item)));
          setPreviewById((current) => ({ ...current, [next.id]: activeContent }));
          setActiveDirty(false);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "便签保存失败");
      } finally {
        setSaving(false);
      }
    }, 600);
    return () => window.clearTimeout(timer);
  }, [activeContent, activeDirty, activeLanguage, activeTitle, vaultPath, selectedId]);

  const handleCreate = async (type: MemoType) => {
    if (!vaultPath) return;
    const content = type === "todo"
      ? serializeTodos(draftTodos)
      : draftContent || getInitialContent(type);
    try {
      const item = await createMemo(vaultPath, { type, content, title: draftTitle, language: draftLanguage });
      setItems((current) => [item, ...current]);
      setSelectedId(item.id);
      setPreviewById((current) => ({ ...current, [item.id]: content }));
      setDraftTitle("");
      setDraftContent("");
      setDraftTodos([{ status: "pending", text: "" }]);
      setDraftLanguage("typescript");
      setDraftType(null);
      setCreateModalOpen(false);
      setActiveTitle(item.title);
      setActiveContent(content);
      setActiveTodos(type === "todo" ? parseTodoContent(content) : []);
      setActiveDirty(false);
      setCreateTypeOpen(false);
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "便签创建失败");
    }
  };

  const handleDelete = async () => {
    if (!vaultPath || !selected) return;
    await deleteMemo(vaultPath, selected.id);
    const nextItems = items.filter((item) => item.id !== selected.id);
    setItems(nextItems);
    setSelectedId(null);
    setPreviewById((current) => {
      const next = { ...current };
      delete next[selected.id];
      return next;
    });
  };

  const togglePin = async () => {
    if (!vaultPath || !selected) return;
    const next = await updateMemo(vaultPath, selected.id, { pinned: !selected.pinned });
    if (next) setItems((current) => current.map((item) => (item.id === next.id ? next : item)));
  };

  const setMemoArchived = async (item: MemoItem, archived: boolean) => {
    if (!vaultPath) return;
    const next = await updateMemo(vaultPath, item.id, { archived });
    if (next) {
      setItems((current) => current.map((memo) => (memo.id === next.id ? next : memo)));
      if (selectedId === item.id) setSelectedId(null);
    }
  };

  const startCreate = (type: MemoType) => {
    setDraftType(type);
    if (type === "todo") {
      setDraftTodos([{ status: "pending", text: "" }]);
      setDraftContent(getInitialContent(type));
    } else {
      setDraftContent((current) => current || getInitialContent(type));
    }
    setCreateTypeOpen(false);
    setCreateModalOpen(true);
  };

  const cancelCreate = () => {
    setDraftType(null);
    setDraftTitle("");
    setDraftContent("");
    setDraftTodos([{ status: "pending", text: "" }]);
    setDraftLanguage("typescript");
    setCreateTypeOpen(false);
    setCreateModalOpen(false);
  };

  const updateDraftTodos = (updater: (items: TodoItem[]) => TodoItem[]) => {
    setDraftTodos((current) => {
      const next = updater(current);
      setDraftContent(serializeTodos(next));
      return next;
    });
  };

  const updateActiveTodos = (updater: (items: TodoItem[]) => TodoItem[]) => {
    setActiveTodos((current) => {
      const next = updater(current);
      const content = serializeTodos(next);
      setActiveContent(content);
      setActiveDirty(true);
      if (selected) {
        setPreviewById((previews) => ({ ...previews, [selected.id]: content }));
      }
      return next;
    });
  };

  return (
    <div className="memo-dock">
      <button
        type="button"
        className={`memo-trigger ${open ? "memo-trigger-active" : ""}`}
        onClick={() => setOpen((value) => !value)}
        title="便签"
        aria-label="便签"
        aria-expanded={open}
      >
        <StickyNote size={17} />
      </button>
      {open && createPortal(
        <aside
          className={`memo-panel ${expanded ? "memo-panel-expanded" : ""}`}
          style={expanded ? { left: sidebarCollapsed ? 56 : 300 } : undefined}
          aria-label="便签面板"
        >
          <div className="memo-panel-header">
            <div className="memo-panel-title">
              <StickyNote size={16} />
              <span>便签</span>
              {saving && <span className="memo-saving">保存中</span>}
            </div>
            <div className="memo-panel-actions">
              <button type="button" className="memo-icon-button" onClick={() => setExpanded((value) => !value)} title={expanded ? "收起" : "展开"}>
                {expanded ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
              </button>
              <button type="button" className="memo-icon-button" onClick={() => setOpen(false)} title="关闭">
                <X size={15} />
              </button>
            </div>
          </div>
          <div className="memo-create">
            <div className="memo-create-start">
                <button
                  type="button"
                  className="memo-create-start-button"
                  onClick={() => setCreateTypeOpen((value) => !value)}
                  title="新建便签"
                >
                  <Plus size={16} />
                  <span>新建便签</span>
                </button>
                {createTypeOpen && (
                  <div className="memo-create-menu memo-create-menu-start" role="menu" aria-label="选择便签类型">
                    {(["note", "code", "todo"] as MemoType[]).map((type) => (
                      <button
                        key={type}
                        type="button"
                        className="memo-create-menu-item"
                        onClick={() => startCreate(type)}
                      >
                        <span className={`memo-create-menu-icon ${TYPE_META[type].iconClass}`}>
                          {getTypeIcon(type)}
                        </span>
                        <span className="memo-create-menu-text">
                          <span>{TYPE_LABELS[type]}</span>
                          <span>{TYPE_META[type].desc}</span>
                        </span>
                      </button>
                    ))}
                  </div>
                )}
            </div>
          </div>
          {items.length > 0 && (
            <>
              <div className="memo-stats">
                <div className="memo-stat-item">
                  <StickyNote size={13} />
                  <span>活跃 <strong>{activeItems.length}</strong> 条</span>
                </div>
                {counts.note > 0 && (
                  <div className="memo-stat-item memo-stat-note">
                    <span className="memo-stat-dot" />
                    <span>{counts.note} 笔记</span>
                  </div>
                )}
                {counts.code > 0 && (
                  <div className="memo-stat-item memo-stat-code">
                    <span className="memo-stat-dot" />
                    <span>{counts.code} 代码</span>
                  </div>
                )}
                {counts.todo > 0 && (
                  <div className="memo-stat-item memo-stat-todo">
                    <span className="memo-stat-dot" />
                    <span>{counts.todo} 待办</span>
                  </div>
                )}
                {archivedItems.length > 0 && (
                  <div className="memo-stat-item">
                    <Archive size={12} />
                    <span>归档 <strong>{archivedItems.length}</strong> 条</span>
                  </div>
                )}
              </div>
              <div className="memo-tabs">
                <button
                  type="button"
                  className={`memo-tab ${viewTab === "active" ? "memo-tab-active" : ""}`}
                  onClick={() => setViewTab("active")}
                >
                  活跃 ({activeItems.length})
                </button>
                <button
                  type="button"
                  className={`memo-tab ${viewTab === "archived" ? "memo-tab-active" : ""}`}
                  onClick={() => setViewTab("archived")}
                >
                  <Archive size={12} />
                  已归档 ({archivedItems.length})
                </button>
              </div>
            </>
          )}
          <div className="memo-panel-body">
            <div className="memo-list">
              {visibleItems.length === 0 ? (
                <div className="memo-empty">
                  {viewTab === "archived" ? <Archive size={18} /> : <Sparkles size={18} />}
                  <span>{viewTab === "archived" ? "没有已归档的便签" : "暂无便签"}</span>
                </div>
              ) : groupedItems.map((group) => (
                <section key={group.date} className="memo-date-group">
                  <div className="memo-date-label">{group.date}</div>
                  {group.items.map((item) => (
                    <article
                      key={item.id}
                      className={`memo-list-item memo-list-item-${item.type}`}
                      onClick={() => setSelectedId(item.id)}
                      title={item.title}
                    >
                      <span className={`memo-card-accent memo-card-accent-${item.type}`} aria-hidden="true" />
                      <span className={`memo-list-item-icon ${TYPE_META[item.type].iconClass}`}>
                        {item.pinned ? <Pin size={14} fill="currentColor" /> : getTypeIcon(item.type)}
                      </span>
                      <span className="memo-list-item-main">
                        <span className="memo-list-item-title">{item.title}</span>
                        <span className="memo-list-item-meta">
                          {item.type === "todo"
                            ? todoSummary(previewById[item.id] ?? "")
                            : previewById[item.id]
                              ? previewById[item.id].replace(/\s+/g, " ").slice(0, 58)
                              : "无内容"}
                        </span>
                      </span>
                      <span className="memo-card-footer">
                        <span className="memo-card-time">
                          <Clock size={10} />
                          {formatShortDate(item.createdAt)}
                        </span>
                        <span className="memo-card-actions">
                          <button
                            type="button"
                            className="memo-card-action"
                            title={item.archived ? "取消归档" : "归档"}
                            onClick={(event) => {
                              event.stopPropagation();
                              setMemoArchived(item, !item.archived);
                            }}
                          >
                            {item.archived ? <ArchiveRestore size={13} /> : <Archive size={13} />}
                          </button>
                          <button
                            type="button"
                            className="memo-card-action memo-card-action-danger"
                            title="删除"
                            onClick={(event) => {
                              event.stopPropagation();
                              setSelectedId(item.id);
                              window.setTimeout(() => {
                                void deleteMemo(vaultPath!, item.id).then(() => {
                                  setItems((current) => current.filter((memo) => memo.id !== item.id));
                                  setSelectedId(null);
                                });
                              }, 0);
                            }}
                          >
                            <Trash2 size={13} />
                          </button>
                        </span>
                      </span>
                    </article>
                  ))}
                </section>
              ))}
            </div>
          </div>
          {error && <div className="memo-error">{error}</div>}
          {createModalOpen && draftType && (
            <div className="memo-popover-backdrop" onMouseDown={cancelCreate}>
              <section className={`memo-popover memo-popover-${draftType}`} onMouseDown={(event) => event.stopPropagation()}>
                <div className="memo-popover-header">
                  <div className="memo-popover-title">
                    <span className={`memo-popover-type-icon ${TYPE_META[draftType].iconClass}`}>
                      {getTypeIcon(draftType)}
                    </span>
                    <input
                      value={draftTitle}
                      onChange={(event) => setDraftTitle(event.target.value)}
                      className="memo-popover-title-input"
                      placeholder="便签名称"
                      autoFocus
                    />
                  </div>
                  <div className="memo-panel-actions">
                    {draftType === "code" && (
                      <select
                        value={draftLanguage}
                        onChange={(event) => setDraftLanguage(event.target.value)}
                        className="memo-language-select"
                        title="编程语言"
                      >
                        {CODE_LANGUAGES.map((language) => (
                          <option key={language.value} value={language.value}>{language.label}</option>
                        ))}
                      </select>
                    )}
                    <button type="button" className="memo-icon-button memo-confirm-button" onClick={() => handleCreate(draftType)} title="创建">
                      <Check size={15} />
                    </button>
                    <button type="button" className="memo-icon-button" onClick={cancelCreate} title="关闭">
                      <X size={15} />
                    </button>
                  </div>
                </div>
                <div className="memo-editor-frame">
                  {draftType === "code" ? (
                    <CodeEditor content={draftContent} language={draftLanguage} onChange={setDraftContent} />
                  ) : draftType === "todo" ? (
                    <TodoEditor
                      items={draftTodos}
                      onChange={updateDraftTodos}
                    />
                  ) : (
                    <textarea
                      value={draftContent}
                      onChange={(event) => setDraftContent(event.target.value)}
                      className="memo-editor-input"
                      spellCheck={false}
                    />
                  )}
                </div>
              </section>
            </div>
          )}
          {selected && (
            <div className="memo-popover-backdrop" onMouseDown={() => setSelectedId(null)}>
              <section className={`memo-popover memo-popover-${selected.type}`} onMouseDown={(event) => event.stopPropagation()}>
                <div className="memo-popover-header">
                  <div className="memo-popover-title">
                    <span className={`memo-popover-type-icon ${TYPE_META[selected.type].iconClass}`}>
                      {getTypeIcon(selected.type)}
                    </span>
                    <input
                      value={activeTitle}
                      onChange={(event) => {
                        setActiveTitle(event.target.value);
                        setActiveDirty(true);
                      }}
                      className="memo-popover-title-input"
                      placeholder="便签名称"
                    />
                  </div>
                  <div className="memo-panel-actions">
                    {selected.type === "code" && (
                      <select
                        value={activeLanguage}
                        onChange={(event) => {
                          setActiveLanguage(event.target.value);
                          setActiveDirty(true);
                        }}
                        className="memo-language-select"
                        title="编程语言"
                      >
                        {CODE_LANGUAGES.map((language) => (
                          <option key={language.value} value={language.value}>{language.label}</option>
                        ))}
                      </select>
                    )}
                    <button type="button" className="memo-icon-button" onClick={togglePin} title="置顶">
                      <Pin size={14} fill={selected.pinned ? "currentColor" : "none"} />
                    </button>
                    <button
                      type="button"
                      className="memo-icon-button"
                      onClick={() => setMemoArchived(selected, !selected.archived)}
                      title={selected.archived ? "取消归档" : "归档"}
                    >
                      {selected.archived ? <ArchiveRestore size={14} /> : <Archive size={14} />}
                    </button>
                    <button type="button" className="memo-icon-button" onClick={handleDelete} title="删除">
                      <Trash2 size={14} />
                    </button>
                    <button type="button" className="memo-icon-button" onClick={() => setSelectedId(null)} title="关闭">
                      <X size={15} />
                    </button>
                  </div>
                </div>
                <div className="memo-editor-frame">
                  {selected.type === "code" ? (
                    <CodeEditor
                      content={activeContent}
                      language={activeLanguage}
                      onChange={(content) => {
                        setActiveContent(content);
                        setActiveDirty(true);
                        setPreviewById((current) => selected ? { ...current, [selected.id]: content } : current);
                      }}
                    />
                  ) : selected.type === "todo" ? (
                    <TodoEditor
                      items={activeTodos}
                      onChange={updateActiveTodos}
                    />
                  ) : (
                    <textarea
                      value={activeContent}
                      onChange={(event) => {
                        const content = event.target.value;
                        setActiveContent(content);
                        setActiveDirty(true);
                        setPreviewById((current) => selected ? { ...current, [selected.id]: content } : current);
                      }}
                      className="memo-editor-input"
                      spellCheck={false}
                      autoFocus
                    />
                  )}
                </div>
              </section>
            </div>
          )}
        </aside>,
        document.body,
      )}
    </div>
  );
}

function TodoEditor({
  items,
  onChange,
}: {
  items: TodoItem[];
  onChange: (updater: (items: TodoItem[]) => TodoItem[]) => void;
}) {
  const activeItems = items.filter((item) => item.status !== "cancelled");
  const doneCount = activeItems.filter((item) => item.status === "done").length;
  const progress = activeItems.length > 0 ? Math.round((doneCount / activeItems.length) * 100) : 0;

  return (
    <div className="memo-todo-editor">
      <div className="memo-todo-summary">
        <div className="memo-todo-summary-main">
          <CheckSquare size={14} />
          <span>{doneCount}/{activeItems.length} 已完成</span>
        </div>
        <span>{progress}%</span>
      </div>
      <div className="memo-todo-list">
        {items.map((item, index) => {
          const statusMeta = TODO_STATUS_META[item.status];
          const StatusIcon = statusMeta.icon;
          return (
            <div key={index} className={`memo-todo-item memo-todo-item-${item.status}`}>
              <button
                type="button"
                className="memo-todo-status"
                style={{ color: statusMeta.color, background: statusMeta.bg }}
                title={statusMeta.label}
                onClick={() =>
                  onChange((current) =>
                    current.map((entry, entryIndex) =>
                      entryIndex === index ? { ...entry, status: nextTodoStatus(entry.status) } : entry,
                    ),
                  )
                }
              >
                <StatusIcon size={13} />
              </button>
              <input
                value={item.text}
                onChange={(event) =>
                  onChange((current) =>
                    current.map((entry, entryIndex) =>
                      entryIndex === index ? { ...entry, text: event.target.value } : entry,
                    ),
                  )
                }
                className="memo-todo-input"
                placeholder="待办事项"
              />
              <button
                type="button"
                className="memo-todo-delete"
                title="删除"
                onClick={() =>
                  onChange((current) => {
                    const next = current.filter((_, entryIndex) => entryIndex !== index);
                    return next.length > 0 ? next : [{ status: "pending", text: "" }];
                  })
                }
              >
                <Trash2 size={13} />
              </button>
            </div>
          );
        })}
      </div>
      <button
        type="button"
        className="memo-todo-add"
        onClick={() => onChange((current) => [...current, { status: "pending", text: "" }])}
      >
        <Plus size={14} />
        添加待办
      </button>
    </div>
  );
}
