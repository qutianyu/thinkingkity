import { useEffect, useMemo, useState } from "react";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import { Table } from "@tiptap/extension-table";
import TableRow from "@tiptap/extension-table-row";
import TableHeader from "@tiptap/extension-table-header";
import TableCell from "@tiptap/extension-table-cell";
import { parseTkdoc } from "./tkdocStorage";
import { resolveTkdocAssetsForRender } from "./assetResolver";
import { RichImage } from "./RichImage";
import { Video as VideoExtension } from "./VideoExtension";
import "./styles.css";

interface TkdocPreviewProps {
  filePath: string;
  content: string;
}

export function TkdocPreview({ filePath, content }: TkdocPreviewProps) {
  const parsed = useMemo(() => parseTkdoc(content), [content]);
  const [renderContent, setRenderContent] = useState(parsed.document.content);

  useEffect(() => {
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
      Table.configure({ resizable: false }),
      TableRow,
      TableHeader,
      TableCell,
    ],
    content: renderContent,
    editable: false,
    immediatelyRender: false,
  });

  useEffect(() => {
    if (!editor || parsed.error) return;
    editor.commands.setContent(renderContent, { emitUpdate: false });
  }, [editor, parsed.error, renderContent]);

  if (parsed.error) {
    return <pre className="recovery-preview">{content}</pre>;
  }

  if (!editor) return null;

  return <EditorContent editor={editor} className="tkdoc-editor tkdoc-preview" />;
}
