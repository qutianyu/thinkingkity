import { useRef, useState, useCallback, useEffect } from "react";
import {
  Milkdown,
  MilkdownProvider,
  useEditor,
} from "@milkdown/react";
import { Editor, rootCtx, defaultValueCtx } from "@milkdown/kit/core";
import { commonmark } from "@milkdown/kit/preset/commonmark";
import { gfm } from "@milkdown/kit/preset/gfm";
import { history } from "@milkdown/kit/plugin/history";
import { clipboard } from "@milkdown/kit/plugin/clipboard";
import { listener, listenerCtx } from "@milkdown/kit/plugin/listener";
import { TextSelection } from "@milkdown/prose/state";
import {
  addColumnAfter,
  addColumnBefore,
  addRowAfter,
  addRowBefore,
  deleteColumn,
  deleteRow,
  selectedRect,
} from "@milkdown/prose/tables";
import { nord } from "@milkdown/theme-nord";
import { blockHandlePlugin, setBlockHandleCallbacks } from "./BlockHandlePlugin";
import { prism } from "@milkdown/plugin-prism";
import { InsertMenu } from "./InsertMenu";
import { linkClickPlugin } from "./LinkClickPlugin";
import {
  createImageHtml,
  dirname,
  getFileName,
  getMarkdownRelativePath,
  joinPath,
  renderHtmlImages,
  uniqueFileName,
} from "./markdownUtils";
import { copyFile, createFolder, getAssetUrl, isTauri, readDirectory } from "@/lib/tauriCommands";
import { useDialogStore } from "@/stores/dialogStore";
import { useEditorStore } from "@/stores/editorStore";
import { useFileTreeStore } from "@/stores/fileTreeStore";
import { useVaultStore } from "@/stores/vaultStore";
import { Plus } from "lucide-react";

interface MilkdownEditorProps {
  content: string;
  onChange: (markdown: string) => void;
}

type MenuAction =
  | "image"
  | "link"
  | "table"
  | "heading"
  | "bulletList"
  | "orderedList"
  | "codeBlock"
  | "blockquote"
  | "divider";

type EditorContext =
  | {
      type: "table";
      top: number;
      left: number;
    }
  | {
      type: "code";
      top: number;
      left: number;
      pos: number;
      language: string;
    };

const CODE_LANGUAGES = [
  "",
  "javascript",
  "typescript",
  "python",
  "java",
  "go",
  "rust",
  "sql",
  "html",
  "css",
  "json",
  "bash",
];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function findParentNode(view: any, typeName: string) {
  const { from } = view.state.selection;
  const $pos = view.state.doc.resolve(from);

  for (let depth = $pos.depth; depth > 0; depth -= 1) {
    const node = $pos.node(depth);
    if (node.type.name !== typeName) continue;

    const pos = $pos.before(depth);
    const el = view.nodeDOM(pos) as HTMLElement | null;
    if (!el) return null;
    return { node, pos, el };
  }

  return null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getEditorContext(view: any): EditorContext | null {
  // Toolbar actions are driven by the node around the current selection.
  const table = findParentNode(view, "table");
  if (table) {
    const rect = table.el.getBoundingClientRect();
    return {
      type: "table",
      top: Math.max(8, rect.top - 36),
      left: Math.max(8, rect.left),
    };
  }

  const codeBlock = findParentNode(view, "code_block");
  if (codeBlock) {
    const rect = codeBlock.el.getBoundingClientRect();
    return {
      type: "code",
      top: Math.max(8, rect.top - 36),
      left: Math.max(8, rect.left),
      pos: codeBlock.pos,
      language: codeBlock.node.attrs.language ?? "",
    };
  }

  return null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function insertLink(view: any, url: string) {
  const { state } = view;
  const { schema } = state;
  const { from, to } = state.selection;
  const mark = schema.marks.link?.create({ href: url });
  if (!mark) return;

  let tr = state.tr;
  if (from === to) {
    const text = "Link";
    const linkNode = schema.text(text, [mark]);
    tr = tr.replaceSelectionWith(linkNode);
    const position = Math.max(0, Math.min(from + linkNode.nodeSize, tr.doc.content.size));
    tr = tr.setSelection(TextSelection.near(tr.doc.resolve(position), 1));
  } else {
    tr = tr.removeMark(from, to, schema.marks.link).addMark(from, to, mark);
    const position = Math.max(0, Math.min(to, tr.doc.content.size));
    tr = tr.setSelection(TextSelection.near(tr.doc.resolve(position), 1));
  }

  view.dispatch(tr.scrollIntoView());
  view.focus();
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function executeInsertAction(view: any, action: MenuAction) {
  // Insert-menu actions operate at the ProseMirror level to keep Markdown output predictable.
  const { state } = view;
  const { schema } = state;
  const { from, to } = state.selection;
  let tr = state.tr;

  const setCursorNear = (position: number) => {
    const resolvedPosition = Math.max(0, Math.min(position, tr.doc.content.size));
    tr = tr.setSelection(TextSelection.near(tr.doc.resolve(resolvedPosition), 1));
  };

  switch (action) {
    case "heading": {
      const heading = schema.nodes.heading;
      if (heading) tr = tr.setBlockType(from, to, heading, { level: 2 });
      break;
    }
    case "bulletList": {
      const node = schema.nodes.bullet_list?.create({}, schema.nodes.list_item?.create({}, schema.nodes.paragraph?.create()));
      if (node) {
        tr = tr.replaceSelectionWith(node);
        setCursorNear(from + 3);
      }
      break;
    }
    case "orderedList": {
      const node = schema.nodes.ordered_list?.create({}, schema.nodes.list_item?.create({}, schema.nodes.paragraph?.create()));
      if (node) {
        tr = tr.replaceSelectionWith(node);
        setCursorNear(from + 3);
      }
      break;
    }
    case "image": {
      const url = prompt("Enter image URL:");
      if (!url) return;
      const node = schema.nodes.html?.create({
        value: createImageHtml(url, ""),
      });
      if (node) {
        tr = tr.replaceSelectionWith(node);
      } else {
        tr = tr.insertText(createImageHtml(url, ""), from, to);
      }
      break;
    }
    case "link": {
      const url = prompt("Enter link URL:");
      if (!url) return;
      insertLink(view, url);
      return;
    }
    case "table": {
      const table = schema.nodes.table?.create({}, [
        schema.nodes.table_header_row?.create({}, [
          schema.nodes.table_header?.create({}, schema.nodes.paragraph?.create()),
          schema.nodes.table_header?.create({}, schema.nodes.paragraph?.create()),
          schema.nodes.table_header?.create({}, schema.nodes.paragraph?.create()),
        ]),
        schema.nodes.table_row?.create({}, [
          schema.nodes.table_cell?.create({}, schema.nodes.paragraph?.create()),
          schema.nodes.table_cell?.create({}, schema.nodes.paragraph?.create()),
          schema.nodes.table_cell?.create({}, schema.nodes.paragraph?.create()),
        ]),
        schema.nodes.table_row?.create({}, [
          schema.nodes.table_cell?.create({}, schema.nodes.paragraph?.create()),
          schema.nodes.table_cell?.create({}, schema.nodes.paragraph?.create()),
          schema.nodes.table_cell?.create({}, schema.nodes.paragraph?.create()),
        ]),
      ]);
      if (table) {
        tr = tr.replaceSelectionWith(table);
        setCursorNear(from + 4);
      }
      break;
    }
    case "codeBlock": {
      const node = schema.nodes.code_block?.create({ language: "" }, schema.text(""));
      if (node) {
        tr = tr.replaceSelectionWith(node);
        setCursorNear(from + 1);
      }
      break;
    }
    case "blockquote": {
      const node = schema.nodes.blockquote?.create({}, schema.nodes.paragraph?.create());
      if (node) {
        tr = tr.replaceSelectionWith(node);
        setCursorNear(from + 2);
      }
      break;
    }
    case "divider": {
      const node = schema.nodes.hr?.create();
      if (node) tr = tr.replaceSelectionWith(node);
      break;
    }
  }

  view.dispatch(tr);
  view.focus();
}

async function pickImage(): Promise<string | null> {
  // Desktop Tauri uses a native picker; browser fallback has no durable file path.
  if (!isTauri()) return null;
  const { open } = await import("@tauri-apps/plugin-dialog");
  const selected: string | string[] | null = await open({
    multiple: false,
    filters: [
      {
        name: "Images",
        extensions: ["jpg", "jpeg", "png", "gif", "svg", "webp", "bmp"],
      },
    ],
  });
  if (!selected) return null;
  if (Array.isArray(selected)) return selected[0] ?? null;
  return selected;
}

function addRowBeforeSafely(state: any, dispatch?: any) {
  const rect = selectedRect(state);
  if (rect.top === 0) return addRowAfter(state, dispatch);
  return addRowBefore(state, dispatch);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function insertCodeBlock(view: any, language: string) {
  const { state } = view;
  const codeBlock = state.schema.nodes.code_block;
  if (!codeBlock) return;

  const { from } = state.selection;
  let tr = state.tr.replaceSelectionWith(codeBlock.create({ language }));
  const position = Math.max(0, Math.min(from + 1, tr.doc.content.size));
  tr = tr.setSelection(TextSelection.near(tr.doc.resolve(position), 1));
  view.dispatch(tr.scrollIntoView());
  view.focus();
}

async function copyImageToVaultAssets(filePath: string, vaultPath: string): Promise<string> {
  // Imported images are copied into the vault instead of referencing external absolute paths.
  const assetsPath = joinPath(vaultPath, "assets");
  await createFolder(assetsPath);

  let existingNames = new Set<string>();
  try {
    const entries = await readDirectory(assetsPath);
    existingNames = new Set(entries.map((entry) => entry.name));
  } catch {
    existingNames = new Set();
  }

  const copiedName = uniqueFileName(getFileName(filePath), existingNames);
  const destinationPath = joinPath(assetsPath, copiedName);
  if (destinationPath !== filePath) {
    await copyFile(filePath, destinationPath);
  }
  return destinationPath;
}

function MilkdownEditorInner({ content, onChange }: MilkdownEditorProps) {
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const showPrompt = useDialogStore((s) => s.showPrompt);
  const activeTabPath = useEditorStore((s) => s.activeTabPath);
  const vaultPath = useVaultStore((s) => s.vaultPath);
  const refreshTree = useFileTreeStore((s) => s.refreshTree);
  const editorContainerRef = useRef<HTMLDivElement>(null);
  const [lineTop, setLineTop] = useState<number | null>(null);
  const [menuPosition, setMenuPosition] = useState<{
    top: number;
    left: number;
  } | null>(null);
  const [editorContext, setEditorContext] = useState<EditorContext | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const viewRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const selectionBookmarkRef = useRef<any>(null);

  const onHide = useCallback(() => {
    setMenuPosition(null);
  }, []);

  setBlockHandleCallbacks({
    onLineTop: (_top: number, view: any) => {
      viewRef.current = view;
      setLineTop(_top);
      setEditorContext(getEditorContext(view));
    },
    onHide: () => {
      setLineTop(null);
      setMenuPosition(null);
      setEditorContext(null);
    },
  });

  useEditor((root) => {
    return Editor.make()
      .config((ctx) => {
        ctx.set(rootCtx, root);
        ctx.set(defaultValueCtx, content);
        ctx.get(listenerCtx).markdownUpdated((_, markdown) => {
          onChangeRef.current(markdown);
        });
      })
      .use(nord as any)
      .use(commonmark)
      .use(gfm)
      .use(history)
      .use(clipboard)
      .use(listener)
      .use(blockHandlePlugin)
      .use(linkClickPlugin)
      .use(prism);
  }, []);

  const MENU_WIDTH = 220;
  const MENU_HEIGHT = 300;

  const rememberSelection = useCallback(() => {
    const view = viewRef.current;
    if (view) {
      selectionBookmarkRef.current = view.state.selection.getBookmark();
    }
  }, []);

  const handlePlusClick = useCallback(() => {
    if (lineTop === null) return;
    rememberSelection();
    const editorEl = editorContainerRef.current?.querySelector(".milkdown .ProseMirror") as HTMLElement | null;
    if (!editorEl) return;
    const editorRect = editorEl.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    let top = lineTop;
    let left = editorRect.left;

    if (left + MENU_WIDTH > vw) {
      left = vw - MENU_WIDTH - 8;
    }
    if (left < 8) {
      left = 8;
    }
    if (top + MENU_HEIGHT > vh) {
      top = vh - MENU_HEIGHT - 8;
    }
    if (top < 8) {
      top = 8;
    }

    setMenuPosition({ top, left });
  }, [lineTop, rememberSelection]);

  useEffect(() => {
    if (!menuPosition) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenuPosition(null);
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [menuPosition]);

  useEffect(() => {
    const root = editorContainerRef.current;
    if (!root) return;

    // Re-render raw HTML images after Milkdown mutates its ProseMirror DOM.
    const render = () => renderHtmlImages(root, {
      activeTabPath,
      vaultPath,
      resolveAssetUrl: isTauri() ? getAssetUrl : undefined,
    });
    const frame = requestAnimationFrame(render);
    const observer = new MutationObserver(() => {
      requestAnimationFrame(render);
    });
    observer.observe(root, {
      childList: true,
      subtree: true,
    });

    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [activeTabPath, vaultPath]);

  const handleAction = useCallback(
    async (action: MenuAction) => {
      const restoreSelection = () => {
        // Keep toolbar clicks from stealing focus and losing the original selection.
        const view = viewRef.current;
        const bookmark = selectionBookmarkRef.current;
        if (!view || !bookmark) return view;

        try {
          view.dispatch(
            view.state.tr.setSelection(bookmark.resolve(view.state.doc)),
          );
        } catch {
          selectionBookmarkRef.current = null;
        }
        view.focus();
        return view;
      };

      if (action === "link") {
        onHide();
        const url = await showPrompt({
          title: "Insert link",
          placeholder: "https://example.com",
          confirmLabel: "Insert",
        });
        if (!url) return;
        const view = restoreSelection();
        if (!view) return;
        insertLink(view, url.trim());
        return;
      }

      if (action === "codeBlock") {
        const view = restoreSelection();
        if (!view) return;
        insertCodeBlock(view, "");
        onHide();
        return;
      }

      if (action === "image" && isTauri()) {
        const filePath = await pickImage();
        if (!filePath) {
          onHide();
          return;
        }
        const view = restoreSelection();
        if (!view) {
          onHide();
          return;
        }
        const copiedPath = vaultPath
          ? await copyImageToVaultAssets(filePath, vaultPath)
          : filePath;
        if (vaultPath) await refreshTree(vaultPath);
        const imageSrc = activeTabPath
          ? getMarkdownRelativePath(dirname(activeTabPath), copiedPath)
          : getFileName(copiedPath);
        const { state, dispatch } = view;
        const tr = state.tr;
        const imageHtml = createImageHtml(encodeURI(imageSrc), getFileName(copiedPath));
        const imgNode = state.schema.nodes.html?.create({
          value: imageHtml,
        });
        if (imgNode) {
          dispatch(tr.replaceSelectionWith(imgNode));
        } else {
          dispatch(tr.insertText(imageHtml));
        }
        view.focus();
        onHide();
        return;
      }

      const view = restoreSelection();
      if (!view) return;
      executeInsertAction(view, action);
      onHide();
    },
    [activeTabPath, onHide, refreshTree, showPrompt, vaultPath],
  );

  const computeHandleStyle = useCallback((): React.CSSProperties | undefined => {
    if (lineTop === null) return undefined;
    const editorEl = editorContainerRef.current?.querySelector(".milkdown .ProseMirror") as HTMLElement | null;
    if (!editorEl) return undefined;
    const editorRect = editorEl.getBoundingClientRect();
    return {
      position: "fixed",
      top: lineTop,
      left: editorRect.left - 32,
    };
  }, [lineTop]);

  const runTableCommand = useCallback((command: (state: any, dispatch?: any) => boolean) => {
    const view = viewRef.current;
    if (!view) return;
    command(view.state, view.dispatch);
    view.focus();
    setEditorContext(getEditorContext(view));
  }, []);

  const handleCodeLanguageChange = useCallback((language: string) => {
    const view = viewRef.current;
    if (!view || editorContext?.type !== "code") return;

    const node = view.state.doc.nodeAt(editorContext.pos);
    if (!node || node.type.name !== "code_block") return;

    const tr = view.state.tr.setNodeMarkup(editorContext.pos, undefined, {
      ...node.attrs,
      language,
    });
    view.dispatch(tr.scrollIntoView());
    view.focus();
    setEditorContext({ ...editorContext, language });
  }, [editorContext]);

  const promptCodeLanguage = useCallback(async () => {
    if (editorContext?.type !== "code") return;
    const language = await showPrompt({
      title: "Code block language",
      defaultValue: editorContext.language,
      placeholder: "python, java, typescript...",
      confirmLabel: "Update",
    });
    if (language === null) return;
    handleCodeLanguageChange(language.trim());
  }, [editorContext, handleCodeLanguageChange, showPrompt]);

  return (
    <div ref={editorContainerRef} className="milkdown-editor-wrapper">
      {lineTop !== null && !menuPosition && (
        <button
          type="button"
          className="block-handle-button"
          style={computeHandleStyle()}
          onMouseDown={(e) => {
            e.preventDefault();
            rememberSelection();
          }}
          onClick={handlePlusClick}
        >
          <Plus size={14} />
        </button>
      )}
      {editorContext?.type === "table" && (
        <div
          className="md-context-toolbar"
          style={{ top: editorContext.top, left: editorContext.left }}
          onMouseDown={(e) => e.preventDefault()}
        >
          <button type="button" onClick={() => runTableCommand(addRowBeforeSafely)}>Row +</button>
          <button type="button" onClick={() => runTableCommand(addRowAfter)}>+ Row</button>
          <button type="button" onClick={() => runTableCommand(deleteRow)}>Row -</button>
          <span className="md-context-separator" />
          <button type="button" onClick={() => runTableCommand(addColumnBefore)}>Col +</button>
          <button type="button" onClick={() => runTableCommand(addColumnAfter)}>+ Col</button>
          <button type="button" onClick={() => runTableCommand(deleteColumn)}>Col -</button>
        </div>
      )}
      {editorContext?.type === "code" && (
        <div
          className="md-context-toolbar"
          style={{ top: editorContext.top, left: editorContext.left }}
          onMouseDown={(e) => e.preventDefault()}
        >
          <select
            className="md-code-language-select"
            value={editorContext.language}
            onMouseDown={(e) => e.stopPropagation()}
            onChange={(e) => handleCodeLanguageChange(e.target.value)}
          >
            {CODE_LANGUAGES.map((language) => (
              <option key={language || "plain"} value={language}>
                {language || "plain text"}
              </option>
            ))}
          </select>
          <button type="button" onClick={promptCodeLanguage}>Language...</button>
        </div>
      )}
      <Milkdown />
      <InsertMenu
        position={menuPosition}
        onAction={handleAction}
        onClose={onHide}
      />
    </div>
  );
}

export function MilkdownEditor({ content, onChange }: MilkdownEditorProps) {
  return (
    <MilkdownProvider>
      <MilkdownEditorInner content={content} onChange={onChange} />
    </MilkdownProvider>
  );
}
