import { useCallback, useEffect, useMemo } from "react";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";
import Image from "@tiptap/extension-image";
import { Bold, Code2, Heading1, Heading2, Heading3, ImagePlus, Italic, Link2, List, ListOrdered, Quote, Redo2, Strikethrough, Undo2, Video } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useDialogStore } from "@/stores/dialogStore";
import { useVaultStore } from "@/stores/vaultStore";
import { dirname, getMarkdownRelativePath } from "@/md/markdownUtils";
import { parseTkdoc, serializeTkdoc } from "./tkdocStorage";
import { saveTkdocFileAssetToVault } from "./assetUtils";
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
  const parsed = useMemo(() => parseTkdoc(content), [content]);

  const editor = useEditor({
    extensions: [
      StarterKit,
      Link.configure({
        openOnClick: false,
        autolink: true,
        defaultProtocol: "https",
      }),
      Image,
      VideoExtension,
    ],
    content: parsed.document.content,
    immediatelyRender: false,
    onUpdate: ({ editor }) => {
      onChange(serializeTkdoc(editor.getJSON()));
    },
  });

  useEffect(() => {
    if (!editor || parsed.error) return;
    const current = serializeTkdoc(editor.getJSON());
    if (current !== content) {
      editor.commands.setContent(parsed.document.content, { emitUpdate: false });
    }
  }, [content, editor, parsed.document.content, parsed.error]);

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
      const picker = document.createElement("input");
      picker.type = "file";
      picker.accept = kind === "image" ? "image/*" : "video/*";
      picker.onchange = async () => {
        const file = picker.files?.[0];
        if (!file) return;
        const assetPath = await saveTkdocFileAssetToVault(vaultPath, file);
        const relativePath = getMarkdownRelativePath(dirname(filePath), assetPath);
        if (kind === "image") {
          editor.chain().focus().setImage({ src: encodeURI(relativePath), alt: file.name }).run();
        } else {
          editor.chain().focus().setVideo({ src: encodeURI(relativePath) }).run();
        }
      };
      picker.click();
    },
    [editor, filePath, vaultPath],
  );

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
    <div className="tkdoc-shell">
      <div className="tkdoc-toolbar" aria-label={t("tkdoc.toolbar")}>
        <ToolbarButton label={t("tkdoc.undo")} active={false} disabled={!editor.can().undo()} onClick={() => editor.chain().focus().undo().run()}>
          <Undo2 size={15} />
        </ToolbarButton>
        <ToolbarButton label={t("tkdoc.redo")} active={false} disabled={!editor.can().redo()} onClick={() => editor.chain().focus().redo().run()}>
          <Redo2 size={15} />
        </ToolbarButton>
        <ToolbarSeparator />
        <ToolbarButton label={t("tkdoc.heading1")} active={editor.isActive("heading", { level: 1 })} onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}>
          <Heading1 size={15} />
        </ToolbarButton>
        <ToolbarButton label={t("tkdoc.heading2")} active={editor.isActive("heading", { level: 2 })} onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}>
          <Heading2 size={15} />
        </ToolbarButton>
        <ToolbarButton label={t("tkdoc.heading3")} active={editor.isActive("heading", { level: 3 })} onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}>
          <Heading3 size={15} />
        </ToolbarButton>
        <ToolbarSeparator />
        <ToolbarButton label={t("tkdoc.bold")} active={editor.isActive("bold")} onClick={() => editor.chain().focus().toggleBold().run()}>
          <Bold size={15} />
        </ToolbarButton>
        <ToolbarButton label={t("tkdoc.italic")} active={editor.isActive("italic")} onClick={() => editor.chain().focus().toggleItalic().run()}>
          <Italic size={15} />
        </ToolbarButton>
        <ToolbarButton label={t("tkdoc.strike")} active={editor.isActive("strike")} onClick={() => editor.chain().focus().toggleStrike().run()}>
          <Strikethrough size={15} />
        </ToolbarButton>
        <ToolbarButton label={t("tkdoc.link")} active={editor.isActive("link")} onClick={setLink}>
          <Link2 size={15} />
        </ToolbarButton>
        <ToolbarButton label={t("tkdoc.image")} active={false} onClick={() => insertAsset("image")}>
          <ImagePlus size={15} />
        </ToolbarButton>
        <ToolbarButton label={t("tkdoc.video")} active={false} onClick={() => insertAsset("video")}>
          <Video size={15} />
        </ToolbarButton>
        <ToolbarSeparator />
        <ToolbarButton label={t("tkdoc.bulletList")} active={editor.isActive("bulletList")} onClick={() => editor.chain().focus().toggleBulletList().run()}>
          <List size={15} />
        </ToolbarButton>
        <ToolbarButton label={t("tkdoc.orderedList")} active={editor.isActive("orderedList")} onClick={() => editor.chain().focus().toggleOrderedList().run()}>
          <ListOrdered size={15} />
        </ToolbarButton>
        <ToolbarButton label={t("tkdoc.blockquote")} active={editor.isActive("blockquote")} onClick={() => editor.chain().focus().toggleBlockquote().run()}>
          <Quote size={15} />
        </ToolbarButton>
        <ToolbarButton label={t("tkdoc.codeBlock")} active={editor.isActive("codeBlock")} onClick={() => editor.chain().focus().toggleCodeBlock().run()}>
          <Code2 size={15} />
        </ToolbarButton>
      </div>
      <EditorContent editor={editor} className="tkdoc-editor" />
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
      onClick={onClick}
    >
      {children}
    </button>
  );
}

function ToolbarSeparator() {
  return <span className="tkdoc-toolbar-separator" aria-hidden="true" />;
}
