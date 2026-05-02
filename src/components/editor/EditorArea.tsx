import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { HotTable } from "@handsontable/react-wrapper";
import { registerAllModules } from "handsontable/registry";
import type { CellChange, ChangeSource } from "handsontable/common";
import Papa from "papaparse";
import { Code2, FileText, PanelRightClose, PanelRightOpen } from "lucide-react";
import { AiChatDock } from "@/ai";
import { useEditorStore } from "@/stores/editorStore";
import { isImageFile, isJsonFile, isPdfFile, isTextFile, isCodeFile, isMarkdownFile, isMermaidFile, getCodeLanguage, pathBasename } from "@/lib/tauriCommands";
import { CodeEditor } from "./CodeEditor";
import { MermaidEditor } from "./MermaidEditor";
import { MilkdownEditor } from "@/md";
import { TabBar } from "./TabBar";
import { EmptyState } from "../common/EmptyState";
import "handsontable/styles/handsontable.min.css";
import "handsontable/styles/ht-theme-main.min.css";

registerAllModules();

type EditorMode = "rich" | "source";

interface FrontmatterParts {
  frontmatter: string;
  body: string;
}

interface FrontmatterField {
  key: string;
  value: string | string[];
}

interface MarkdownHeading {
  id: string;
  index: number;
  level: number;
  line: number;
  text: string;
}

function splitFrontmatter(content: string): FrontmatterParts {
  // Rich editor edits only the body; frontmatter is preserved around Milkdown updates.
  const match = content.match(/^(---\r?\n[\s\S]*?\r?\n---)(?:\r?\n)?/);
  if (!match) return { frontmatter: "", body: content };

  return {
    frontmatter: `${match[1]}\n\n`,
    body: content.slice(match[0].length),
  };
}

function parseFrontmatter(frontmatter: string): FrontmatterField[] {
  if (!frontmatter) return [];
  const lines = frontmatter
    .replace(/^---\r?\n/, "")
    .replace(/\r?\n---\s*\r?\n?$/, "")
    .split(/\r?\n/);
  const fields: FrontmatterField[] = [];
  let current: FrontmatterField | null = null;

  for (const line of lines) {
    const listMatch = line.match(/^\s*-\s*(.*)$/);
    if (listMatch && current) {
      if (!Array.isArray(current.value)) current.value = [];
      current.value.push(listMatch[1]);
      continue;
    }

    const fieldMatch = line.match(/^([^:#][^:]*):\s*(.*)$/);
    if (!fieldMatch) continue;

    current = {
      key: fieldMatch[1].trim(),
      value: fieldMatch[2].trim(),
    };
    fields.push(current);
  }

  return fields;
}

function serializeFrontmatter(fields: FrontmatterField[]): string {
  if (fields.length === 0) return "";
  const lines = fields.flatMap((field) => {
    if (Array.isArray(field.value)) {
      return [
        `${field.key}:`,
        ...field.value.map((item) => ` - ${item}`),
      ];
    }
    return `${field.key}: ${field.value}`;
  });
  return `---\n${lines.join("\n")}\n---\n\n`;
}

function getMarkdownHeadings(markdown: string): MarkdownHeading[] {
  const seen = new Map<string, number>();
  let headingIndex = 0;
  // Generate stable, GitHub-like ids for outline navigation inside the current document.
  return markdown
    .split(/\r?\n/)
    .map((line, lineIndex) => {
      const match = line.match(/^(#{1,6})\s+(.+)$/);
      if (!match) return null;

      const text = match[2]
        .replace(/[#*_`[\]()]/g, "")
        .trim();
      if (!text) return null;

      const baseId = text
        .toLowerCase()
        .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, "-")
        .replace(/^-|-$/g, "") || "heading";
      const count = seen.get(baseId) ?? 0;
      seen.set(baseId, count + 1);

      const heading = {
        id: count === 0 ? baseId : `${baseId}-${count + 1}`,
        index: headingIndex,
        level: match[1].length,
        line: lineIndex,
        text,
      };
      headingIndex += 1;
      return heading;
    })
    .filter((heading): heading is MarkdownHeading => heading !== null);
}

function parseCsv(content: string): string[][] {
  if (!content.trim()) return [];
  const result = Papa.parse<string[]>(content, {
    skipEmptyLines: false,
  });
  return result.data.map((row) => row.map((cell) => cell ?? ""));
}

function serializeCsv(rows: string[][]): string {
  // Trim the unused spreadsheet tail so empty grid space is not persisted as CSV noise.
  let lastRow = rows.length - 1;
  while (
    lastRow >= 0 &&
    rows[lastRow].every((cell) => cell.trim().length === 0)
  ) {
    lastRow -= 1;
  }

  const keptRows = rows.slice(0, lastRow + 1);
  let lastColumn = -1;
  for (const row of keptRows) {
    row.forEach((cell, index) => {
      if (cell.trim().length > 0) lastColumn = Math.max(lastColumn, index);
    });
  }

  if (keptRows.length === 0 || lastColumn === -1) return "";

  return Papa.unparse(
    keptRows.map((row) =>
      Array.from({ length: lastColumn + 1 }, (_, index) => row[index] ?? ""),
    ),
  );
}

export function EditorArea() {
  const [mode, setMode] = useState<EditorMode>("rich");
  const [outlineCollapsed, setOutlineCollapsed] = useState(false);
  const activeTabPath = useEditorStore((s) => s.activeTabPath);
  const activeContent = useEditorStore((s) =>
    s.activeTabPath ? s.fileContents.get(s.activeTabPath) ?? "" : "",
  );
  const updateContent = useEditorStore((s) => s.updateContent);
  const saveFile = useEditorStore((s) => s.saveFile);
  const frontmatterParts = splitFrontmatter(activeContent);
  const frontmatterFields = parseFrontmatter(frontmatterParts.frontmatter);
  const isCsv = activeTabPath?.toLowerCase().endsWith(".csv") ?? false;
  const isMarkdown = activeTabPath ? isMarkdownFile(activeTabPath) : false;
  const isJson = activeTabPath ? isJsonFile(activeTabPath) : false;
  const isMermaid = activeTabPath ? isMermaidFile(activeTabPath) : false;
  const isText = activeTabPath ? isTextFile(activeTabPath) : false;
  const isCode = activeTabPath ? isCodeFile(activeTabPath) : false;
  const codeLang = activeTabPath ? getCodeLanguage(activeTabPath) : "text";
  const isImage = activeTabPath ? isImageFile(activeTabPath) : false;
  const isPdf = activeTabPath ? isPdfFile(activeTabPath) : false;
  const headings = useMemo(
    () => getMarkdownHeadings(frontmatterParts.body),
    [frontmatterParts.body],
  );
  const editorScrollRef = useRef<HTMLDivElement>(null);
  const usesCodeEditor = isJson || isText || isCode || isMermaid || (isMarkdown && mode === "source");

  const handleRichChange = useCallback(
    (markdown: string) => {
      if (activeTabPath) {
        // Reattach frontmatter because Milkdown only receives the editable body.
        updateContent(activeTabPath, frontmatterParts.frontmatter + markdown);
      }
    },
    [activeTabPath, frontmatterParts.frontmatter, updateContent],
  );

  const handleKeyDown = useCallback(
    async (e: React.KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "s") {
        e.preventDefault();
        if (activeTabPath) {
          await saveFile(activeTabPath);
        }
      }
    },
    [activeTabPath, saveFile],
  );

  const scrollToHeading = useCallback(
    (heading: MarkdownHeading) => {
      if (mode === "source") {
        const scrollRoot = editorScrollRef.current;
        if (!scrollRoot) return;
        const lineHeight = 22;
        scrollRoot.scrollTo({
          top: Math.max(0, heading.line * lineHeight - 80),
          behavior: "smooth" as ScrollBehavior,
        });
        return;
      }

      const scrollRoot = editorScrollRef.current;
      if (!scrollRoot) return;
      const headingNodes = scrollRoot.querySelectorAll(
        ".milkdown .ProseMirror h1, .milkdown .ProseMirror h2, .milkdown .ProseMirror h3, .milkdown .ProseMirror h4, .milkdown .ProseMirror h5, .milkdown .ProseMirror h6",
      );
      const target = headingNodes[heading.index] as HTMLElement | undefined;
      if (!target) return;
      scrollRoot.scrollTo({
        top: target.offsetTop - 24,
        behavior: "smooth",
      });
    },
    [frontmatterParts.body, frontmatterParts.frontmatter.length, mode],
  );

  const updateFrontmatterField = useCallback(
    (fieldIndex: number, value: string, itemIndex?: number) => {
      if (!activeTabPath) return;
      const nextFields = frontmatterFields.map((field, index) => {
        if (index !== fieldIndex) return field;
        if (Array.isArray(field.value)) {
          const nextValue = [...field.value];
          nextValue[itemIndex ?? 0] = value;
          return { ...field, value: nextValue };
        }
        return { ...field, value };
      });
      updateContent(
        activeTabPath,
        serializeFrontmatter(nextFields) + frontmatterParts.body,
      );
    },
    [activeTabPath, frontmatterFields, frontmatterParts.body, updateContent],
  );

  return (
    <div
      className="editor-shell flex flex-col flex-1 bg-[var(--color-bg-editor)] min-w-0"
      onKeyDown={handleKeyDown}
      tabIndex={-1}
    >
      <div className="editor-topbar">
        <div className="editor-tabs">
          <TabBar />
        </div>
        <AiChatDock />
      </div>
      <div className="editor-main flex-1 min-h-0">
        <div
          ref={editorScrollRef}
          className={`editor-scroll flex-1 ${isCsv || isImage || isPdf ? "editor-scroll-csv" : "overflow-y-auto"}`}
        >
          <div className={`editor-content ${isCsv ? "editor-content-csv" : isImage || isPdf ? "h-full min-h-0" : usesCodeEditor ? "code-editor-content" : "max-w-[1280px] mx-auto"}`}>
          {activeTabPath && isCsv ? (
            <CsvGridEditor
              content={activeContent}
              onChange={(content) => updateContent(activeTabPath, content)}
            />
          ) : activeTabPath && isMermaid ? (
            <MermaidEditor
              content={activeContent}
              onChange={(content) => updateContent(activeTabPath, content)}
            />
          ) : activeTabPath && isJson ? (
            <CodeEditor
              content={activeContent}
              language="json"
              onChange={(content) => updateContent(activeTabPath, content)}
            />
          ) : activeTabPath && isText ? (
            <CodeEditor
              content={activeContent}
              language="text"
              onChange={(content) => updateContent(activeTabPath, content)}
            />
          ) : activeTabPath && isCode ? (
            <CodeEditor
              content={activeContent}
              language={codeLang}
              onChange={(content) => updateContent(activeTabPath, content)}
            />
          ) : activeTabPath && isImage ? (
            <ImageViewer src={activeContent} filename={pathBasename(activeTabPath)} />
          ) : activeTabPath && isPdf ? (
            <PdfViewer src={activeContent} filename={pathBasename(activeTabPath)} />
          ) : activeTabPath && mode === "rich" ? (
            <>
              {frontmatterFields.length > 0 && (
                <div className="frontmatter-table" aria-label="Article metadata">
                  {frontmatterFields.map((field, fieldIndex) => (
                    <div className="frontmatter-row" key={`${field.key}-${fieldIndex}`}>
                      <div className="frontmatter-key">{field.key}</div>
                      <div className="frontmatter-value">
                        {Array.isArray(field.value) ? (
                          <div className="frontmatter-list">
                            {field.value.map((item, itemIndex) => (
                              <input
                                key={itemIndex}
                                className="frontmatter-input"
                                value={item}
                                onChange={(e) =>
                                  updateFrontmatterField(
                                    fieldIndex,
                                    e.target.value,
                                    itemIndex,
                                  )
                                }
                              />
                            ))}
                          </div>
                        ) : (
                          <input
                            className="frontmatter-input"
                            value={field.value}
                            onChange={(e) =>
                              updateFrontmatterField(fieldIndex, e.target.value)
                            }
                          />
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
              <MilkdownEditor
                key={activeTabPath}
                content={frontmatterParts.body}
                onChange={handleRichChange}
              />
            </>
          ) : activeTabPath ? (
            <CodeEditor
              content={activeContent}
              language="markdown"
              onChange={(content) => updateContent(activeTabPath, content)}
            />
          ) : (
            <EmptyState />
          )}
          </div>
        </div>
        {activeTabPath && isMarkdown && (
          <MarkdownOutline
            mode={mode}
            headings={headings}
            collapsed={outlineCollapsed}
            onModeChange={setMode}
            onHeadingClick={scrollToHeading}
            onToggleCollapsed={() => setOutlineCollapsed((value) => !value)}
          />
        )}
      </div>
    </div>
  );
}

function MarkdownOutline({
  mode,
  headings,
  collapsed,
  onModeChange,
  onHeadingClick,
  onToggleCollapsed,
}: {
  mode: EditorMode;
  headings: MarkdownHeading[];
  collapsed: boolean;
  onModeChange: (mode: EditorMode) => void;
  onHeadingClick: (heading: MarkdownHeading) => void;
  onToggleCollapsed: () => void;
}) {
  if (collapsed) {
    return (
      <aside className="markdown-outline markdown-outline-collapsed">
        <button
          type="button"
          className="markdown-outline-toggle"
          onClick={onToggleCollapsed}
          title="Expand outline"
        >
          <PanelRightOpen size={15} />
        </button>
      </aside>
    );
  }

  return (
    <aside className="markdown-outline">
      <div className="markdown-outline-tools">
        <div className="editor-mode-switch" aria-label="Markdown editor mode">
          <button
            type="button"
            onClick={() => onModeChange("rich")}
            className={`editor-mode-button ${mode === "rich" ? "editor-mode-button-active" : ""}`}
            title="Rich editor"
            aria-pressed={mode === "rich"}
          >
            <FileText size={15} />
          </button>
          <button
            type="button"
            onClick={() => onModeChange("source")}
            className={`editor-mode-button ${mode === "source" ? "editor-mode-button-active" : ""}`}
            title="Source editor"
            aria-pressed={mode === "source"}
          >
            <Code2 size={15} />
          </button>
        </div>
        <button
          type="button"
          className="markdown-outline-toggle"
          onClick={onToggleCollapsed}
          title="Collapse outline"
        >
          <PanelRightClose size={15} />
        </button>
      </div>
      <div className="markdown-outline-title">Outline</div>
      <div className="markdown-outline-list">
        {headings.length > 0 ? (
          headings.map((heading) => (
            <button
              key={heading.id}
              type="button"
              className="markdown-outline-item"
              onClick={() => onHeadingClick(heading)}
              style={{ paddingLeft: `${(heading.level - 1) * 10 + 8}px` }}
            >
              {heading.text}
            </button>
          ))
        ) : (
          <div className="markdown-outline-empty">No headings</div>
        )}
      </div>
    </aside>
  );
}

function CsvGridEditor({
  content,
  onChange,
}: {
  content: string;
  onChange: (content: string) => void;
}) {
  const [minRows, setMinRows] = useState(20);
  const [minColumns, setMinColumns] = useState(6);
  const [gridHeight, setGridHeight] = useState(480);
  const gridWrapRef = useRef<HTMLDivElement>(null);
  const parsedRows = useMemo(() => parseCsv(content), [content]);
  const columnCount = Math.max(minColumns, ...parsedRows.map((row) => row.length));
  const rowCount = Math.max(minRows, parsedRows.length + 1);
  const gridData = useMemo(
    () =>
      Array.from({ length: rowCount }, (_, rowIndex) =>
        Array.from(
          { length: columnCount },
          (_, columnIndex) => parsedRows[rowIndex]?.[columnIndex] ?? "",
        ),
      ),
    [columnCount, parsedRows, rowCount],
  );

  const commitRows = useCallback(
    (rows: string[][]) => {
      onChange(serializeCsv(rows));
    },
    [onChange],
  );

  const handleChange = useCallback(
    (changes: CellChange[] | null, source: ChangeSource) => {
      if (!changes || source === "loadData") return;
      const nextRows = parsedRows.map((nextRow) => [...nextRow]);
      for (const [row, prop, , nextValue] of changes) {
        const col = Number(prop);
        if (!Number.isFinite(col)) continue;
        while (nextRows.length <= row) nextRows.push([]);
        while (nextRows[row].length <= col) nextRows[row].push("");
        nextRows[row][col] = String(nextValue ?? "");
      }
      commitRows(nextRows);
    },
    [commitRows, parsedRows],
  );

  useEffect(() => {
    const element = gridWrapRef.current;
    if (!element) return;

    const updateHeight = () => {
      // Handsontable needs a fixed height; derive it from the visible editor pane.
      setGridHeight(Math.max(240, Math.floor(element.getBoundingClientRect().height)));
    };
    updateHeight();

    const observer = new ResizeObserver(updateHeight);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return (
    <div className="csv-sheet-shell">
      <div className="csv-grid-toolbar">
        <button
          type="button"
          className="csv-grid-button"
          onClick={() => setMinRows((value) => value + 1)}
        >
          Add row
        </button>
        <button
          type="button"
          className="csv-grid-button"
          onClick={() => setMinColumns((value) => value + 1)}
        >
          Add column
        </button>
      </div>
      <div ref={gridWrapRef} className="csv-sheet-wrap ht-theme-main">
        <HotTable
          data={gridData}
          rowHeaders
          colHeaders
          width="100%"
          height={gridHeight}
          stretchH="all"
          manualColumnResize
          manualRowResize
          copyPaste
          fillHandle
          contextMenu={[
            "row_above",
            "row_below",
            "col_left",
            "col_right",
            "remove_row",
            "remove_col",
            "undo",
            "redo",
          ]}
          afterChange={handleChange}
          afterCreateRow={() => setMinRows((value) => value + 1)}
          afterCreateCol={() => setMinColumns((value) => value + 1)}
          afterRemoveRow={(_index, amount) =>
            setMinRows((value) => Math.max(1, value - amount))
          }
          afterRemoveCol={(_index, amount) =>
            setMinColumns((value) => Math.max(1, value - amount))
          }
          licenseKey="non-commercial-and-evaluation"
        />
      </div>
    </div>
  );
}

function ImageViewer({ src, filename }: { src: string; filename: string }) {
  const [dimensions, setDimensions] = useState<{ w: number; h: number } | null>(null);

  return (
    <div className="image-viewer">
      <div className="image-viewer-canvas">
        <img
          src={src}
          alt={filename}
          onLoad={(e) => {
            const img = e.currentTarget;
            setDimensions({ w: img.naturalWidth, h: img.naturalHeight });
          }}
        />
      </div>
      <div className="image-viewer-toolbar">
        <span className="image-viewer-name">{filename}</span>
        {dimensions && (
          <span className="image-viewer-size">
            {dimensions.w} x {dimensions.h}
          </span>
        )}
      </div>
    </div>
  );
}

function PdfViewer({ src, filename }: { src: string; filename: string }) {
  return (
    <div className="pdf-viewer">
      <iframe
        className="pdf-viewer-frame"
        src={src}
        title={filename}
      />
      <div className="pdf-viewer-toolbar">
        <span className="pdf-viewer-name">{filename}</span>
      </div>
    </div>
  );
}
