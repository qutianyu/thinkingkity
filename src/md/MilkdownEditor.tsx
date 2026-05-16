import { useRef, useState, useCallback, useEffect } from "react";
import {
  Milkdown,
  MilkdownProvider,
  useEditor,
} from "@milkdown/react";
import { Editor, rootCtx, defaultValueCtx, remarkStringifyOptionsCtx } from "@milkdown/kit/core";
import { commonmark } from "@milkdown/kit/preset/commonmark";
import { gfm } from "@milkdown/kit/preset/gfm";
import { history } from "@milkdown/kit/plugin/history";
import { clipboard } from "@milkdown/kit/plugin/clipboard";
import { listener, listenerCtx } from "@milkdown/kit/plugin/listener";
import { Plugin, PluginKey, TextSelection } from "@milkdown/prose/state";
import {
  addColumnAfter,
  addColumnBefore,
  addRowAfter,
  addRowBefore,
  deleteColumn,
  deleteRow,
  selectedRect,
} from "@milkdown/prose/tables";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { nord } from "@milkdown/theme-nord";
import { blockHandlePlugin, setBlockHandleCallbacks } from "./BlockHandlePlugin";
import { prism, prismConfig } from "@milkdown/plugin-prism";
import toml from "refractor/toml";
import properties from "refractor/properties";
import { JSON_CODE_LANGUAGES } from "@/json";
import { configureJsonRefractor, normalizeJsonPrismLanguage } from "@/json/prism";
import { InsertMenu } from "./InsertMenu";
import { ImagePickerModal } from "./ImagePickerModal";
import { linkClickPlugin } from "./LinkClickPlugin";
import { linkHoverPlugin } from "./LinkHoverPlugin";
import { wikiLinkPlugin } from "./WikiLinkPlugin";
import {
  wikiLinkInputRule,
  wikiLinkNodeName,
  wikiLinkRemarkPlugin,
  wikiLinkSchema,
} from "./WikiLinkExtension";
import {
  blankLineMarkdownHandler,
  blankLineNodeName,
  blankLineRemarkPlugin,
  blankLineSchema,
  decodeBlankLineSentinels,
  encodeBlankLinesForRichEditor,
} from "./BlankLineExtension";
import {
  createImageHtml,
  dirname,
  getFileName,
  getMarkdownRelativePath,
  joinPath,
  renderHtmlImages,
  uniqueFileName,
  brToHardbreak,
  hardbreakToBr,
  normalizeEscapedWikiLinks,
} from "./markdownUtils";
import { $prose } from "@milkdown/utils";
import { copyFile, createFolder, isTauri, readDirectory, readFileBase64, writeFileBase64, pathBasename, pathJoin } from "@/lib/tauriCommands";
import { useDialogStore } from "@/stores/dialogStore";
import { useEditorStore } from "@/stores/editorStore";
import { useFileTreeStore } from "@/stores/fileTreeStore";
import { useVaultStore } from "@/stores/vaultStore";

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

type SlashCommandCallbacks = {
  onOpen: (view: any, slashFrom: number) => void;
  onClose: () => void;
};

const slashCommandCallbacksRef: { current: SlashCommandCallbacks | null } = { current: null };

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
  ...JSON_CODE_LANGUAGES,
  "yaml",
  "toml",
  "properties",
  "bash",
];

const TABLE_TOOLBAR_WIDTH = 344;
const CODE_TOOLBAR_WIDTH = 246;
const FLOATING_MARGIN = 8;

function clampFloatingToolbarPosition(rect: DOMRect, toolbarWidth: number) {
  const viewportWidth = window.innerWidth;
  const maxLeft = Math.max(FLOATING_MARGIN, viewportWidth - toolbarWidth - FLOATING_MARGIN);
  const left = Math.min(Math.max(FLOATING_MARGIN, rect.left), maxLeft);

  return {
    top: Math.max(FLOATING_MARGIN, rect.top - 36),
    left,
  };
}

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
    const position = clampFloatingToolbarPosition(rect, TABLE_TOOLBAR_WIDTH);
    return {
      type: "table",
      top: position.top,
      left: position.left,
    };
  }

  const codeBlock = findParentNode(view, "code_block");
  if (codeBlock) {
    const rect = codeBlock.el.getBoundingClientRect();
    const position = clampFloatingToolbarPosition(rect, CODE_TOOLBAR_WIDTH);
    return {
      type: "code",
      top: position.top,
      left: position.left,
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

const imagePastePlugin = $prose((ctx) => {
  async function saveClipboardImage(view: any, file: File) {
    // Access refs via closures — they're captured when the plugin runs.
    const vault = vaultPathRef_inner;
    if (!vault) return;
    const ext = file.name.split(".").pop() || "png";
    const stamp = Date.now();
    const baseName = `paste-${stamp}.${ext}`;
    const assetsPath = pathJoin(vault, "assets");
    await createFolder(assetsPath);
    const destPath = pathJoin(assetsPath, baseName);

    const dataUrl: string = await new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.readAsDataURL(file);
    });
    await writeFileBase64(destPath, dataUrl);

    const activeTab = activeTabPath_inner;
    const { dirname, getMarkdownRelativePath, createImageHtml } = await import("./markdownUtils");
    const imageSrc = activeTab
      ? getMarkdownRelativePath(dirname(activeTab), destPath)
      : baseName;

    const html = createImageHtml(encodeURI(imageSrc), baseName);
    const node = view.state.schema.nodes.html?.create({ value: html });
    if (node) {
      view.dispatch(view.state.tr.replaceSelectionWith(node));
    } else {
      view.dispatch(view.state.tr.insertText(html));
    }
  }

  return new Plugin({
    key: new PluginKey("imagePaste"),
    props: {
      handlePaste(view, _event) {
        const e = _event as ClipboardEvent;
        const clipboardData = e.clipboardData;
        if (!clipboardData) return false;

        const items = Array.from(clipboardData.items);
        const imageFiles: File[] = [];
        for (const item of items) {
          if (item.type.startsWith("image/")) {
            const file = item.getAsFile();
            if (file) imageFiles.push(file);
          }
        }

        if (imageFiles.length > 0) {
          (async () => {
            for (const file of imageFiles) {
              await saveClipboardImage(view, file);
            }
          })();
          return true;
        }

        return false;
      },
    },
  });
});

const slashCommandPlugin = $prose(() => {
  return new Plugin({
    key: new PluginKey("slashCommand"),
    props: {
      handleTextInput(view, from, _to, text) {
        const callbacks = slashCommandCallbacksRef.current;
        if (!callbacks) return false;

        if (text !== "/") {
          callbacks.onClose();
          return false;
        }

        requestAnimationFrame(() => {
          const current = slashCommandCallbacksRef.current;
          if (current) current.onOpen(view, from);
        });
        return false;
      },
      handleKeyDown(_view, event) {
        if (event.key.length === 1 || event.key === "Backspace" || event.key === "Delete" || event.key === "Enter") {
          slashCommandCallbacksRef.current?.onClose();
        }
        return false;
      },
    },
  });
});

const preserveHeadingLevelOnBackspacePlugin = $prose(() => {
  return new Plugin({
    key: new PluginKey("preserveHeadingLevelOnBackspace"),
    props: {
      handleKeyDown(view, event) {
        if (event.key !== "Backspace") return false;

        const { selection } = view.state;
        if (!selection.empty) return false;

        const { $from } = selection;
        if ($from.parent.type.name !== "heading") return false;
        if ($from.parentOffset !== 0) return false;
        if ($from.parent.textContent.length === 0) return false;

        // ProseMirror's default backspace behavior at the start of a heading
        // downgrades h2 -> h1. Prefer a clearer editor action here: exit the
        // heading block entirely and keep the text as a normal paragraph.
        const paragraphType = view.state.schema.nodes.paragraph;
        if (!paragraphType) return false;
        view.dispatch(view.state.tr.setBlockType(
          $from.before(),
          $from.after(),
          paragraphType,
        ));
        event.preventDefault();
        return true;
      },
    },
  });
});

const normalizeEmptyParagraphsPlugin = $prose(() => {
  return new Plugin({
    key: new PluginKey("normalizeEmptyParagraphs"),
    appendTransaction(transactions, _oldState, newState) {
      if (!transactions.some((tr) => tr.docChanged)) return null;

      const blankLineType = newState.schema.nodes[blankLineNodeName];
      const paragraphType = newState.schema.nodes.paragraph;
      if (!blankLineType) return null;

      let tr = newState.tr;
      let changed = false;
      newState.doc.descendants((node: any, pos: number) => {
        if (node.type.name === "paragraph" && node.content.size === 0) {
          tr = tr.replaceWith(pos, pos + node.nodeSize, blankLineType.create());
          changed = true;
        } else if (
          paragraphType &&
          node.type.name === blankLineNodeName &&
          node.content.size > 0
        ) {
          tr = tr.setNodeMarkup(pos, paragraphType);
          changed = true;
        }
      });
      return changed ? tr : null;
    },
  });
});


// Module-level vars set by the component for the paste plugin to read.
let vaultPathRef_inner: string | null = null;
let activeTabPath_inner: string | null = null;

function MilkdownEditorInner({ content, onChange }: MilkdownEditorProps) {
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const initialContentRef = useRef(content);
  const hasAcceptedInitialMarkdownRef = useRef(false);
  const showPrompt = useDialogStore((s) => s.showPrompt);
  const activeTabPath = useEditorStore((s) => s.activeTabPath);
  const vaultPath = useVaultStore((s) => s.vaultPath);
  vaultPathRef_inner = vaultPath;
  activeTabPath_inner = activeTabPath;
  const refreshTree = useFileTreeStore((s) => s.refreshTree);
  const editorContainerRef = useRef<HTMLDivElement>(null);
  const [menuPosition, setMenuPosition] = useState<{
    top: number;
    left: number;
  } | null>(null);
  const [editorContext, setEditorContext] = useState<EditorContext | null>(null);
  const [contextToolbarCollapsed, setContextToolbarCollapsed] = useState(false);
  const [showImagePicker, setShowImagePicker] = useState(false);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const viewRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const selectionBookmarkRef = useRef<any>(null);
  const slashRangeRef = useRef<{ from: number; to: number } | null>(null);

  const onHide = useCallback(() => {
    setMenuPosition(null);
    slashRangeRef.current = null;
  }, []);

  slashCommandCallbacksRef.current = {
    onOpen: (view: any, slashFrom: number) => {
      viewRef.current = view;
      const slashTo = slashFrom + 1;
      const cursor = view.state.selection.from;
      const slashChar = view.state.doc.textBetween(slashFrom, slashTo);
      if (cursor !== slashTo || slashChar !== "/") {
        onHide();
        return;
      }

      const coords = view.coordsAtPos(slashTo);
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      let left = coords.left;
      let top = coords.bottom + 6;

      if (left + MENU_WIDTH > vw) left = vw - MENU_WIDTH - 8;
      if (left < 8) left = 8;
      if (top + MENU_HEIGHT > vh) top = Math.max(8, coords.top - MENU_HEIGHT - 6);
      if (top < 8) top = 8;

      slashRangeRef.current = { from: slashFrom, to: slashTo };
      selectionBookmarkRef.current = view.state.selection.getBookmark();
      setMenuPosition({ top, left });
    },
    onClose: onHide,
  };

  setBlockHandleCallbacks({
    onLineTop: (_top: number, view: any) => {
      viewRef.current = view;
      setEditorContext(getEditorContext(view));
    },
    onHide: () => {
      setMenuPosition(null);
      setEditorContext(null);
    },
  });

  useEffect(() => {
    const updateFloatingToolbar = () => {
      const view = viewRef.current;
      if (!view) return;
      setEditorContext(getEditorContext(view));
    };

    window.addEventListener("resize", updateFloatingToolbar);
    window.addEventListener("orientationchange", updateFloatingToolbar);
    return () => {
      window.removeEventListener("resize", updateFloatingToolbar);
      window.removeEventListener("orientationchange", updateFloatingToolbar);
    };
  }, []);

  useEditor((root) => {
    return Editor.make()
      .config((ctx) => {
        ctx.set(rootCtx, root);
        ctx.set(defaultValueCtx, encodeBlankLinesForRichEditor(brToHardbreak(content)));
        ctx.update(remarkStringifyOptionsCtx, (options) => ({
          ...options,
          handlers: {
            ...options.handlers,
            [wikiLinkNodeName]: (node: any) => node.value || node.raw || "",
            [blankLineNodeName]: blankLineMarkdownHandler,
          },
        }));
        ctx.update(prismConfig.key, (config) => ({
          ...config,
          configureRefractor: (refractor) => {
            if (!refractor.registered("toml")) refractor.register(toml);
            if (!refractor.registered("properties")) refractor.register(properties);
            configureJsonRefractor(refractor);
            // Skip markdown highlighting — code fences in a markdown doc don't need it
            const original = refractor.highlight.bind(refractor);
            refractor.highlight = ((text: string, language: any) => {
              if (language === "markdown" || language === "md") return text as any;
              return original(text, normalizeJsonPrismLanguage(language));
            }) as typeof refractor.highlight;
            return refractor;
          },
        }));
        ctx.get(listenerCtx).markdownUpdated((_, markdown) => {
          const cleaned = decodeBlankLineSentinels(
            normalizeEscapedWikiLinks(hardbreakToBr(markdown)),
          );
          // Milkdown emits once while hydrating its initial document. Treat that
          // as editor setup, not as a user edit, so entering rich mode cannot
          // rewrite source text or expand preserved blank lines.
          if (!hasAcceptedInitialMarkdownRef.current) {
            hasAcceptedInitialMarkdownRef.current = true;
            return;
          }
          if (cleaned === initialContentRef.current) return;
          initialContentRef.current = cleaned;
          onChangeRef.current(cleaned);
        });
      })
      .use(nord as any)
      .use(commonmark)
      .use(gfm)
      .use(wikiLinkRemarkPlugin)
      .use(blankLineRemarkPlugin)
      .use(wikiLinkSchema)
      .use(blankLineSchema)
      .use(wikiLinkInputRule)
      .use(history)
      .use(clipboard)
      .use(listener)
      .use(blockHandlePlugin)
      .use(slashCommandPlugin)
      .use(preserveHeadingLevelOnBackspacePlugin)
      .use(normalizeEmptyParagraphsPlugin)
      .use(linkClickPlugin)
      .use(linkHoverPlugin)
      .use(wikiLinkPlugin)
      .use(prism)
      .use(imagePastePlugin);
  }, []);

  const MENU_WIDTH = 220;
  const MENU_HEIGHT = 300;

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
      resolveAssetUrl: readFileBase64,
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
      const removeSlashCommandTrigger = (view: any) => {
        const range = slashRangeRef.current;
        if (!range) return;
        if (view.state.doc.textBetween(range.from, range.to) !== "/") return;
        view.dispatch(view.state.tr.delete(range.from, range.to));
        selectionBookmarkRef.current = view.state.selection.getBookmark();
        slashRangeRef.current = null;
      };

      if (action === "link") {
        const view = restoreSelection();
        if (!view) return;
        removeSlashCommandTrigger(view);
        onHide();
        const url = await showPrompt({
          title: "Insert link",
          placeholder: "https://example.com",
          confirmLabel: "Insert",
        });
        if (!url) return;
        insertLink(view, url.trim());
        return;
      }

      if (action === "codeBlock") {
        const view = restoreSelection();
        if (!view) return;
        removeSlashCommandTrigger(view);
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
        removeSlashCommandTrigger(view);
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

      if (action === "image") {
        const view = restoreSelection();
        if (view) removeSlashCommandTrigger(view);
        onHide();
        setShowImagePicker(true);
        return;
      }

      const view = restoreSelection();
      if (!view) return;
      removeSlashCommandTrigger(view);
      executeInsertAction(view, action);
      onHide();
    },
    [activeTabPath, onHide, refreshTree, showPrompt, vaultPath],
  );

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
      {editorContext?.type === "table" && (
        <div
          className={`md-context-toolbar ${contextToolbarCollapsed ? "md-context-toolbar-collapsed" : ""}`}
          style={{ top: editorContext.top, left: editorContext.left }}
          onMouseDown={(e) => e.preventDefault()}
        >
          <button
            type="button"
            className="md-context-toggle"
            aria-label={contextToolbarCollapsed ? "Expand table tools" : "Collapse table tools"}
            title={contextToolbarCollapsed ? "Expand" : "Collapse"}
            onClick={() => setContextToolbarCollapsed((collapsed) => !collapsed)}
          >
            {contextToolbarCollapsed ? <ChevronRight size={14} strokeWidth={2.2} /> : <ChevronLeft size={14} strokeWidth={2.2} />}
            <span>{contextToolbarCollapsed ? "Table" : "Collapse"}</span>
          </button>
          {!contextToolbarCollapsed && (
            <>
              <button type="button" onClick={() => runTableCommand(addRowBeforeSafely)}>Row +</button>
              <button type="button" onClick={() => runTableCommand(addRowAfter)}>+ Row</button>
              <button type="button" onClick={() => runTableCommand(deleteRow)}>Row -</button>
              <span className="md-context-separator" />
              <button type="button" onClick={() => runTableCommand(addColumnBefore)}>Col +</button>
              <button type="button" onClick={() => runTableCommand(addColumnAfter)}>+ Col</button>
              <button type="button" onClick={() => runTableCommand(deleteColumn)}>Col -</button>
            </>
          )}
        </div>
      )}
      {editorContext?.type === "code" && (
        <div
          className={`md-context-toolbar ${contextToolbarCollapsed ? "md-context-toolbar-collapsed" : ""}`}
          style={{ top: editorContext.top, left: editorContext.left }}
          onMouseDown={(e) => e.preventDefault()}
        >
          <button
            type="button"
            className="md-context-toggle"
            aria-label={contextToolbarCollapsed ? "Expand code tools" : "Collapse code tools"}
            title={contextToolbarCollapsed ? "Expand" : "Collapse"}
            onClick={() => setContextToolbarCollapsed((collapsed) => !collapsed)}
          >
            {contextToolbarCollapsed ? <ChevronRight size={14} strokeWidth={2.2} /> : <ChevronLeft size={14} strokeWidth={2.2} />}
            <span>{contextToolbarCollapsed ? "Code" : "Collapse"}</span>
          </button>
          {!contextToolbarCollapsed && (
            <>
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
            </>
          )}
        </div>
      )}
      <Milkdown />
      <InsertMenu
        position={menuPosition}
        onAction={handleAction}
        onClose={onHide}
      />
      {showImagePicker && vaultPath && (
        <ImagePickerModal
          vaultPath={vaultPath}
          onSelect={async (filePath) => {
            setShowImagePicker(false);
            const view = viewRef.current;
            if (!view) return;
            const copiedPath = await copyImageToVaultAssets(filePath, vaultPath);
            await refreshTree(vaultPath);
            const imageSrc = activeTabPath
              ? getMarkdownRelativePath(dirname(activeTabPath), copiedPath)
              : getFileName(copiedPath);
            const html = createImageHtml(encodeURI(imageSrc), getFileName(copiedPath));
            const { state, dispatch } = view;
            const node = state.schema.nodes.html?.create({ value: html });
            if (node) {
              dispatch(state.tr.replaceSelectionWith(node));
            } else {
              dispatch(state.tr.insertText(html));
            }
            view.focus();
          }}
          onClose={() => setShowImagePicker(false)}
        />
      )}
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
