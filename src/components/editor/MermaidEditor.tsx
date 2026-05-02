import { useEffect, useId, useMemo, useState } from "react";
import mermaid from "mermaid";
import { Code2, Eye, Columns2 } from "lucide-react";
import { CodeEditor } from "./CodeEditor";

type MermaidMode = "split" | "source" | "preview";

interface MermaidEditorProps {
  content: string;
  onChange: (content: string) => void;
}

mermaid.initialize({
  startOnLoad: false,
  securityLevel: "strict",
  theme: "base",
  themeVariables: {
    primaryColor: "#EFF6FF",
    primaryTextColor: "#111827",
    primaryBorderColor: "#3B82F6",
    lineColor: "#6B7280",
    secondaryColor: "#F9FAFB",
    tertiaryColor: "#FFFFFF",
  },
});

export function MermaidEditor({ content, onChange }: MermaidEditorProps) {
  const [mode, setMode] = useState<MermaidMode>("split");
  const [svg, setSvg] = useState("");
  const [error, setError] = useState("");
  const rawId = useId();
  const renderId = useMemo(() => {
    let hash = 0;
    for (let i = 0; i < content.length; i += 1) {
      hash = (hash * 31 + content.charCodeAt(i)) >>> 0;
    }
    return `mermaid-${rawId.replace(/[^a-zA-Z0-9_-]/g, "")}-${hash.toString(36)}`;
  }, [content, rawId]);

  useEffect(() => {
    let cancelled = false;

    async function render() {
      const source = content.trim();
      if (!source) {
        setSvg("");
        setError("");
        return;
      }

      try {
        const result = await mermaid.render(renderId, source);
        if (cancelled) return;
        setSvg(result.svg);
        setError("");
      } catch (e) {
        if (cancelled) return;
        setSvg("");
        setError(e instanceof Error ? e.message : String(e));
      }
    }

    render();
    return () => {
      cancelled = true;
    };
  }, [content, renderId]);

  const showSource = mode === "split" || mode === "source";
  const showPreview = mode === "split" || mode === "preview";

  return (
    <div className="mermaid-editor">
      <div className="mermaid-toolbar">
        <div className="editor-mode-switch" aria-label="Mermaid editor mode">
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
            className={`editor-mode-button ${mode === "split" ? "editor-mode-button-active" : ""}`}
            title="Split"
            aria-pressed={mode === "split"}
            onClick={() => setMode("split")}
          >
            <Columns2 size={15} />
          </button>
          <button
            type="button"
            className={`editor-mode-button ${mode === "preview" ? "editor-mode-button-active" : ""}`}
            title="Preview"
            aria-pressed={mode === "preview"}
            onClick={() => setMode("preview")}
          >
            <Eye size={15} />
          </button>
        </div>
      </div>
      <div className={`mermaid-body mermaid-body-${mode}`}>
        {showSource && (
          <div className="mermaid-source">
            <CodeEditor
              content={content}
              language="mermaid"
              onChange={onChange}
            />
          </div>
        )}
        {showPreview && (
          <div className="mermaid-preview">
            {error ? (
              <pre className="mermaid-error">{error}</pre>
            ) : svg ? (
              <div
                className="mermaid-svg"
                dangerouslySetInnerHTML={{ __html: svg }}
              />
            ) : (
              <div className="mermaid-empty">No diagram</div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
