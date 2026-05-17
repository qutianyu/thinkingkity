import { useState } from "react";
import { Code2, Eye } from "lucide-react";
import { CodeEditor } from "./CodeEditor";

type HtmlMode = "source" | "preview";

interface HtmlEditorProps {
  content: string;
  onChange: (content: string) => void;
}

export function HtmlEditor({ content, onChange }: HtmlEditorProps) {
  const [mode, setMode] = useState<HtmlMode>("source");

  return (
    <div className="html-editor">
      <div className="html-toolbar">
        <div className="editor-mode-switch" aria-label="HTML editor mode">
          <button
            type="button"
            className={`editor-mode-button ${mode === "source" ? "editor-mode-button-active" : ""}`}
            title="Source"
            aria-pressed={mode === "source"}
            onClick={() => setMode("source")}
          >
            <Code2 size={15} />
          </button>
          <button
            type="button"
            className={`editor-mode-button ${mode === "preview" ? "editor-mode-button-active" : ""}`}
            title="Render"
            aria-pressed={mode === "preview"}
            onClick={() => setMode("preview")}
          >
            <Eye size={15} />
          </button>
        </div>
      </div>
      <div className="html-body">
        {mode === "source" ? (
          <CodeEditor content={content} language="html" onChange={onChange} />
        ) : (
          <iframe
            className="html-preview"
            title="HTML render preview"
            srcDoc={content}
            sandbox=""
          />
        )}
      </div>
    </div>
  );
}
