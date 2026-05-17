import { generateHTML } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import { Table } from "@tiptap/extension-table";
import TableRow from "@tiptap/extension-table-row";
import TableHeader from "@tiptap/extension-table-header";
import TableCell from "@tiptap/extension-table-cell";
import { RichImage } from "./RichImage";
import { Video as VideoExtension } from "./VideoExtension";
import { parseTkdoc } from "./tkdocStorage";

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function exportTkdocToHtml(raw: string, title: string): string {
  const parsed = parseTkdoc(raw);
  if (parsed.error) throw new Error(parsed.error);
  const body = generateHTML(parsed.document.content, [
    StarterKit,
    Link.configure({ openOnClick: false, autolink: true, defaultProtocol: "https" }),
    RichImage,
    VideoExtension,
    TaskList,
    TaskItem.configure({ nested: true }),
    Table.configure({ resizable: false }),
    TableRow,
    TableHeader,
    TableCell,
  ]);
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(title)}</title>
  <style>
    body{margin:0;background:#f8fafc;color:#0f172a;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;line-height:1.7}
    main{max-width:900px;min-height:100vh;box-sizing:border-box;margin:0 auto;padding:40px 28px 64px;background:#fff}
    h1,h2,h3,h4,h5,h6{line-height:1.25}
    blockquote{margin-left:0;padding-left:14px;border-left:3px solid #cbd5e1;color:#475569}
    pre{overflow:auto;padding:14px;border-radius:10px;background:#f1f5f9}
    a{color:#4f46e5}
    ul[data-type="taskList"]{list-style:none;padding-left:0}
    ul[data-type="taskList"] li{display:flex;gap:8px;align-items:flex-start}
    ul[data-type="taskList"] li>label{margin-top:3px}
    table{width:100%;margin:1em 0;border-collapse:collapse;table-layout:fixed}
    th,td{min-width:90px;padding:9px 11px;border:1px solid #cbd5e1;vertical-align:top}
    th{background:#f8fafc}
    img{display:block;max-width:100%;height:auto;margin:1em 0;border-radius:10px}
    img[data-align="center"]{margin-left:auto;margin-right:auto}
    img[data-align="right"]{margin-left:auto;margin-right:0}
    img[data-width-preset="small"]{width:min(280px,100%)}
    img[data-width-preset="medium"]{width:min(520px,100%)}
    video{display:block;max-width:100%;margin:1em 0}
  </style>
</head>
<body><main>${body}</main></body>
</html>
`;
}
