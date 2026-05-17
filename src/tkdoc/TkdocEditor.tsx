import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { EditorContent, useEditor, useEditorState } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import { Table } from "@tiptap/extension-table";
import TableRow from "@tiptap/extension-table-row";
import TableHeader from "@tiptap/extension-table-header";
import TableCell from "@tiptap/extension-table-cell";
import { AlignCenter, AlignLeft, AlignRight, Bold, Code2, Heading1, Heading2, Heading3, ImagePlus, Italic, Link2, List, ListChecks, ListOrdered, Plus, Quote, Redo2, Strikethrough, Table2, Trash2, Undo2, Video } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useDialogStore } from "@/stores/dialogStore";
import { useVaultStore } from "@/stores/vaultStore";
import { useFileTreeStore } from "@/stores/fileTreeStore";
import { readFileBase64 } from "@/lib/tauriCommands";
import { dirname, getMarkdownRelativePath } from "@/md/markdownUtils";
import { ImagePickerModal } from "@/md/ImagePickerModal";
import { parseTkdoc, serializeTkdoc } from "./tkdocStorage";
import { copyTkdocAssetToVault } from "./assetUtils";
import { resolveTkdocAssetsForRender, restoreTkdocAssetSources } from "./assetResolver";
import { RichImage, type TkdocImageAlign, type TkdocImageWidth } from "./RichImage";
import { Video as VideoExtension } from "./VideoExtension";
import "./styles.css";

interface TkdocEditorProps {
  filePath: string;
  content: string;
  onChange: (content: string) => void;
}

export function TkdocEditor({ filePath, content, onChange }: TkdocEditorProps) {
  const { t } = useTranslation();
  const showPrompt = useDialogStore((s) => s.showPrompt);
  const vaultPath = useVaultStore((s) => s.vaultPath);
  const refreshTree = useFileTreeStore((s) => s.refreshTree);
  const parsed = useMemo(() => parseTkdoc(content), [content]);
  const [renderContent, setRenderContent] = useState(parsed.document.content);
  const [assetPickerKind, setAssetPickerKind] = useState<"image" | "video" | null>(null);
  const [tableControlPosition, setTableControlPosition] = useState<{ top: number; left: number } | null>(null);
  const [tableMenuOpen, setTableMenuOpen] = useState(false);
  const shellRef = useRef<HTMLDivElement>(null);
  const lastEmittedContentRef = useRef<string | null>(null);

  useEffect(() => {
    // Changes emitted by this editor come back through `content` immediately.
    // Re-hydrating those changes with setContent resets selection/input rules,
    // which is especially disruptive for heading shortcuts such as `# `.
    if (content === lastEmittedContentRef.current) {
      return;
    }
    let cancelled = false;
    resolveTkdocAssetsForRender(parsed.document.content, filePath)
      .then((resolved) => {
        if (!cancelled) setRenderContent(resolved);
      })
      .catch(() => {
        if (!cancelled) setRenderContent(parsed.document.content);
      });
    return () => {
      cancelled = true;
    };
  }, [filePath, parsed.document.content]);

  const editor = useEditor({
    extensions: [
      StarterKit,
      Link.configure({
        openOnClick: false,
        autolink: true,
        defaultProtocol: "https",
      }),
      RichImage,
      VideoExtension,
      TaskList,
      TaskItem.configure({ nested: true }),
      Table.configure({ resizable: true }),
      TableRow,
      TableHeader,
      TableCell,
    ],
    content: renderContent,
    immediatelyRender: false,
    onUpdate: ({ editor }) => {
      const nextContent = serializeTkdoc(restoreTkdocAssetSources(editor.getJSON()));
      lastEmittedContentRef.current = nextContent;
      onChange(nextContent);
    },
  });

  useEffect(() => {
    if (!editor || parsed.error) return;
    editor.commands.setContent(renderContent, { emitUpdate: false });
  }, [editor, parsed.error, renderContent]);

  const setLink = useCallback(async () => {
    if (!editor) return;
    const previousUrl = editor.getAttributes("link").href as string | undefined;
    const url = await showPrompt({
      title: t("tkdoc.linkTitle"),
      description: t("tkdoc.linkDescription"),
      defaultValue: previousUrl ?? "",
      placeholder: "https://example.com",
      confirmLabel: t("tkdoc.apply"),
      cancelLabel: t("dialog.cancel"),
    });
    if (url === null) return;
    const trimmed = url.trim();
    if (!trimmed) {
      editor.chain().focus().extendMarkRange("link").unsetLink().run();
      return;
    }
    editor.chain().focus().extendMarkRange("link").setLink({ href: trimmed }).run();
  }, [editor, showPrompt, t]);

  const insertAsset = useCallback(
    async (kind: "image" | "video") => {
      if (!editor || !vaultPath) return;
      setAssetPickerKind(kind);
    },
    [editor, filePath, vaultPath],
  );

  const updateImageAlign = useCallback((align: TkdocImageAlign) => {
    if (!editor || !editor.isActive("image")) return;
    editor.chain().focus().updateAttributes("image", { align }).run();
  }, [editor]);

  const updateImageWidth = useCallback((widthPreset: TkdocImageWidth) => {
    if (!editor || !editor.isActive("image")) return;
    editor.chain().focus().updateAttributes("image", { widthPreset }).run();
  }, [editor]);

  const editorState = useEditorState({
    editor,
    selector: ({ editor }) => ({
      canUndo: editor?.can().undo() ?? false,
      canRedo: editor?.can().redo() ?? false,
      heading1Active: editor?.isActive("heading", { level: 1 }) ?? false,
      heading2Active: editor?.isActive("heading", { level: 2 }) ?? false,
      heading3Active: editor?.isActive("heading", { level: 3 }) ?? false,
      boldActive: editor?.isActive("bold") ?? false,
      italicActive: editor?.isActive("italic") ?? false,
      strikeActive: editor?.isActive("strike") ?? false,
      linkActive: editor?.isActive("link") ?? false,
      bulletListActive: editor?.isActive("bulletList") ?? false,
      orderedListActive: editor?.isActive("orderedList") ?? false,
      taskListActive: editor?.isActive("taskList") ?? false,
      tableActive: editor?.isActive("table") ?? false,
      blockquoteActive: editor?.isActive("blockquote") ?? false,
      codeBlockActive: editor?.isActive("codeBlock") ?? false,
      imageActive: editor?.isActive("image") ?? false,
      imageAttrs: editor?.getAttributes("image") as {
        align?: TkdocImageAlign;
        widthPreset?: TkdocImageWidth;
      },
    }),
  });
  const toolbarState = editorState ?? {
    canUndo: false,
    canRedo: false,
    heading1Active: false,
    heading2Active: false,
    heading3Active: false,
    boldActive: false,
    italicActive: false,
    strikeActive: false,
    linkActive: false,
    bulletListActive: false,
    orderedListActive: false,
    taskListActive: false,
    tableActive: false,
    blockquoteActive: false,
    codeBlockActive: false,
    imageActive: false,
    imageAttrs: {} as {
      align?: TkdocImageAlign;
      widthPreset?: TkdocImageWidth;
    },
  };

  useEffect(() => {
    if (!editor) return;
    const updateTableControlPosition = () => {
      if (!shellRef.current || !editor.isActive("table")) {
        setTableControlPosition(null);
        setTableMenuOpen(false);
        return;
      }
      const { from } = editor.state.selection;
      const dom = editor.view.domAtPos(from).node;
      const element = dom instanceof HTMLElement ? dom : dom.parentElement;
      const wrapper = element?.closest(".tableWrapper");
      if (!(wrapper instanceof HTMLElement)) {
        setTableControlPosition(null);
        return;
      }
      const shellRect = shellRef.current.getBoundingClientRect();
      const tableRect = wrapper.getBoundingClientRect();
      setTableControlPosition({
        top: tableRect.top - shellRect.top - 10,
        left: tableRect.left - shellRect.left - 10,
      });
    };

    updateTableControlPosition();
    editor.on("selectionUpdate", updateTableControlPosition);
    editor.on("transaction", updateTableControlPosition);
    window.addEventListener("resize", updateTableControlPosition);
    window.addEventListener("scroll", updateTableControlPosition, true);
    return () => {
      editor.off("selectionUpdate", updateTableControlPosition);
      editor.off("transaction", updateTableControlPosition);
      window.removeEventListener("resize", updateTableControlPosition);
      window.removeEventListener("scroll", updateTableControlPosition, true);
    };
  }, [editor]);

  if (parsed.error) {
    return (
      <div className="tkdoc-invalid">
        <strong>{t("tkdoc.invalidTitle")}</strong>
        <span>{t("tkdoc.invalidDescription")}</span>
        <code>{parsed.error}</code>
      </div>
    );
  }

  if (!editor) return null;

  return (
    <div className="tkdoc-shell" ref={shellRef}>
      <div className="tkdoc-toolbar" aria-label={t("tkdoc.toolbar")}>
        <ToolbarButton label={t("tkdoc.undo")} active={false} disabled={!toolbarState.canUndo} onClick={() => editor.chain().focus().undo().run()}>
          <Undo2 size={15} />
        </ToolbarButton>
        <ToolbarButton label={t("tkdoc.redo")} active={false} disabled={!toolbarState.canRedo} onClick={() => editor.chain().focus().redo().run()}>
          <Redo2 size={15} />
        </ToolbarButton>
        <ToolbarSeparator />
        <ToolbarButton label={t("tkdoc.heading1")} active={toolbarState.heading1Active} onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}>
          <Heading1 size={15} />
        </ToolbarButton>
        <ToolbarButton label={t("tkdoc.heading2")} active={toolbarState.heading2Active} onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}>
          <Heading2 size={15} />
        </ToolbarButton>
        <ToolbarButton label={t("tkdoc.heading3")} active={toolbarState.heading3Active} onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}>
          <Heading3 size={15} />
        </ToolbarButton>
        <ToolbarSeparator />
        <ToolbarButton label={t("tkdoc.bold")} active={toolbarState.boldActive} onClick={() => editor.chain().focus().toggleBold().run()}>
          <Bold size={15} />
        </ToolbarButton>
        <ToolbarButton label={t("tkdoc.italic")} active={toolbarState.italicActive} onClick={() => editor.chain().focus().toggleItalic().run()}>
          <Italic size={15} />
        </ToolbarButton>
        <ToolbarButton label={t("tkdoc.strike")} active={toolbarState.strikeActive} onClick={() => editor.chain().focus().toggleStrike().run()}>
          <Strikethrough size={15} />
        </ToolbarButton>
        <ToolbarButton label={t("tkdoc.link")} active={toolbarState.linkActive} onClick={setLink}>
          <Link2 size={15} />
        </ToolbarButton>
        <ToolbarButton label={t("tkdoc.image")} active={false} onClick={() => insertAsset("image")}>
          <ImagePlus size={15} />
        </ToolbarButton>
        <ToolbarButton label={t("tkdoc.video")} active={false} onClick={() => insertAsset("video")}>
          <Video size={15} />
        </ToolbarButton>
        <ToolbarSeparator />
        <ToolbarButton label={t("tkdoc.bulletList")} active={toolbarState.bulletListActive} onClick={() => editor.chain().focus().toggleBulletList().run()}>
          <List size={15} />
        </ToolbarButton>
        <ToolbarButton label={t("tkdoc.orderedList")} active={toolbarState.orderedListActive} onClick={() => editor.chain().focus().toggleOrderedList().run()}>
          <ListOrdered size={15} />
        </ToolbarButton>
        <ToolbarButton label={t("tkdoc.taskList")} active={toolbarState.taskListActive} onClick={() => editor.chain().focus().toggleTaskList().run()}>
          <ListChecks size={15} />
        </ToolbarButton>
        <ToolbarButton label={t("tkdoc.table")} active={toolbarState.tableActive} onClick={() => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}>
          <Table2 size={15} />
        </ToolbarButton>
        <ToolbarButton label={t("tkdoc.blockquote")} active={toolbarState.blockquoteActive} onClick={() => editor.chain().focus().toggleBlockquote().run()}>
          <Quote size={15} />
        </ToolbarButton>
        <ToolbarButton label={t("tkdoc.codeBlock")} active={toolbarState.codeBlockActive} onClick={() => editor.chain().focus().toggleCodeBlock().run()}>
          <Code2 size={15} />
        </ToolbarButton>
        {toolbarState.imageActive && (
          <>
            <ToolbarSeparator />
            <ToolbarButton label={t("tkdoc.imageAlignLeft")} active={(toolbarState.imageAttrs?.align ?? "left") === "left"} onClick={() => updateImageAlign("left")}>
              <AlignLeft size={15} />
            </ToolbarButton>
            <ToolbarButton label={t("tkdoc.imageAlignCenter")} active={toolbarState.imageAttrs?.align === "center"} onClick={() => updateImageAlign("center")}>
              <AlignCenter size={15} />
            </ToolbarButton>
            <ToolbarButton label={t("tkdoc.imageAlignRight")} active={toolbarState.imageAttrs?.align === "right"} onClick={() => updateImageAlign("right")}>
              <AlignRight size={15} />
            </ToolbarButton>
            <ToolbarTextButton label={t("tkdoc.imageWidthSmall")} active={toolbarState.imageAttrs?.widthPreset === "small"} onClick={() => updateImageWidth("small")}>S</ToolbarTextButton>
            <ToolbarTextButton label={t("tkdoc.imageWidthMedium")} active={toolbarState.imageAttrs?.widthPreset === "medium"} onClick={() => updateImageWidth("medium")}>M</ToolbarTextButton>
            <ToolbarTextButton label={t("tkdoc.imageWidthOriginal")} active={(toolbarState.imageAttrs?.widthPreset ?? "original") === "original"} onClick={() => updateImageWidth("original")}>1:1</ToolbarTextButton>
          </>
        )}
      </div>
      {toolbarState.tableActive && tableControlPosition && (
        <div
          className="tkdoc-table-control"
          style={{ top: tableControlPosition.top, left: tableControlPosition.left }}
        >
          <button
            type="button"
            className="tkdoc-table-control-trigger"
            aria-label={t("tkdoc.tableTools")}
            aria-expanded={tableMenuOpen}
            onClick={() => setTableMenuOpen((open) => !open)}
          >
            <Plus size={13} />
          </button>
          {tableMenuOpen && (
            <div className="tkdoc-table-control-menu" aria-label={t("tkdoc.tableTools")}>
              <button type="button" onClick={() => editor.chain().focus().addColumnBefore().run()}>{t("tkdoc.addColumnBefore")}</button>
              <button type="button" onClick={() => editor.chain().focus().addColumnAfter().run()}>{t("tkdoc.addColumnAfter")}</button>
              <button type="button" onClick={() => editor.chain().focus().deleteColumn().run()}>{t("tkdoc.deleteColumn")}</button>
              <span />
              <button type="button" onClick={() => editor.chain().focus().addRowBefore().run()}>{t("tkdoc.addRowBefore")}</button>
              <button type="button" onClick={() => editor.chain().focus().addRowAfter().run()}>{t("tkdoc.addRowAfter")}</button>
              <button type="button" onClick={() => editor.chain().focus().deleteRow().run()}>{t("tkdoc.deleteRow")}</button>
              <span />
              <button type="button" className="tkdoc-table-control-danger" onClick={() => editor.chain().focus().deleteTable().run()}>
                {t("tkdoc.deleteTable")}
              </button>
            </div>
          )}
        </div>
      )}
      <EditorContent editor={editor} className="tkdoc-editor" />
      {assetPickerKind && vaultPath && (
        <ImagePickerModal
          vaultPath={vaultPath}
          kind={assetPickerKind}
          onClose={() => setAssetPickerKind(null)}
          onSelect={async (sourcePath) => {
            const kind = assetPickerKind;
            setAssetPickerKind(null);
            const assetPath = await copyTkdocAssetToVault(vaultPath, sourcePath);
            await refreshTree(vaultPath);
            const relativePath = getMarkdownRelativePath(dirname(filePath), assetPath);
            const persistedSrc = encodeURI(relativePath);
            const renderSrc = await readFileBase64(assetPath);
            if (kind === "image") {
              editor
                .chain()
                .focus()
                .setImage({
                  src: renderSrc,
                  alt: sourcePath.split(/[\\/]/).pop(),
                })
                .updateAttributes("image", { "data-tkdoc-src": persistedSrc })
                .run();
            } else {
              editor.chain().focus().setVideo({
                src: renderSrc,
                "data-tkdoc-src": persistedSrc,
              }).run();
            }
          }}
        />
      )}
    </div>
  );
}

function ToolbarButton({
  label,
  active,
  disabled = false,
  onClick,
  children,
}: {
  label: string;
  active: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      className={active ? "tkdoc-toolbar-button tkdoc-toolbar-button-active" : "tkdoc-toolbar-button"}
      title={label}
      aria-label={label}
      aria-pressed={active}
      disabled={disabled}
      onMouseDown={(event) => event.preventDefault()}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

function ToolbarSeparator() {
  return <span className="tkdoc-toolbar-separator" aria-hidden="true" />;
}

function ToolbarTextButton({
  label,
  active,
  onClick,
  children,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      className={active ? "tkdoc-toolbar-text-button tkdoc-toolbar-button-active" : "tkdoc-toolbar-text-button"}
      title={label}
      aria-label={label}
      aria-pressed={active}
      onMouseDown={(event) => event.preventDefault()}
      onClick={onClick}
    >
      {children}
    </button>
  );
}
