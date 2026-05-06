import { useEffect, useMemo, useRef } from "react";
import { basicSetup, EditorView } from "codemirror";
import { json } from "@codemirror/lang-json";
import { sql } from "@codemirror/lang-sql";
import { javascript } from "@codemirror/lang-javascript";
import { python } from "@codemirror/lang-python";
import { java } from "@codemirror/lang-java";
import { rust } from "@codemirror/lang-rust";
import { cpp } from "@codemirror/lang-cpp";
import { css } from "@codemirror/lang-css";
import { html } from "@codemirror/lang-html";
import { xml } from "@codemirror/lang-xml";
import { yaml } from "@codemirror/lang-yaml";
import { markdown } from "@codemirror/lang-markdown";
import { go } from "@codemirror/lang-go";
import { sass } from "@codemirror/lang-sass";
import { less } from "@codemirror/lang-less";
import { vue } from "@codemirror/lang-vue";
import { StreamLanguage } from "@codemirror/language";
import { toml } from "@codemirror/legacy-modes/mode/toml";
import { properties } from "@codemirror/legacy-modes/mode/properties";
import { lua } from "@codemirror/legacy-modes/mode/lua";
import { r } from "@codemirror/legacy-modes/mode/r";
import { groovy } from "@codemirror/legacy-modes/mode/groovy";
import { dockerFile } from "@codemirror/legacy-modes/mode/dockerfile";
import { sass as sassMode } from "@codemirror/legacy-modes/mode/sass";
import { oneDark } from "@codemirror/theme-one-dark";
import { autocompletion } from "@codemirror/autocomplete";
import type { Extension } from "@codemirror/state";
import { Compartment, EditorState } from "@codemirror/state";
import { useThemeStore } from "@/stores/themeStore";
import { completionSourceFor } from "@/lib/completions";

interface CodeEditorProps {
  content: string;
  language: string;
  onChange: (content: string) => void;
}

function languageExtension(language: string): Extension {
  switch (language) {
    case "json":
      return json();
    case "sql":
      return sql();
    case "javascript":
      return javascript();
    case "typescript":
      return javascript({ jsx: true, typescript: true });
    case "python":
      return python();
    case "java":
      return java();
    case "rust":
      return rust();
    case "c":
    case "cpp":
    case "h":
    case "hpp":
      return cpp();
    case "css":
      return css();
    case "scss":
      return StreamLanguage.define(sassMode);
    case "sass":
      return sass();
    case "less":
      return less();
    case "html":
      return html();
    case "xml":
      return xml();
    case "vue":
      return vue();
    case "go":
      return go();
    case "yaml":
      return yaml();
    case "toml":
      return StreamLanguage.define(toml);
    case "ini":
    case "properties":
      return StreamLanguage.define(properties);
    case "lua":
      return StreamLanguage.define(lua);
    case "r":
      return StreamLanguage.define(r);
    case "groovy":
      return StreamLanguage.define(groovy);
    case "dockerfile":
      return StreamLanguage.define(dockerFile);
    case "markdown":
      return markdown();
    case "mermaid":
      return markdown();
    default:
      return [];
  }
}

const lightTheme = EditorView.theme({
  "&": {
    height: "100%",
    backgroundColor: "var(--color-bg-surface)",
    color: "var(--color-text-primary)",
    fontSize: "calc(var(--app-font-size) - 3px)",
  },
  ".cm-scroller": {
    fontFamily: '"SF Mono", "Fira Code", "Fira Mono", ui-monospace, monospace',
    lineHeight: "1.7",
  },
  ".cm-content": {
    padding: "18px 0",
  },
  ".cm-line": {
    padding: "0 22px",
  },
  ".cm-gutters": {
    backgroundColor: "var(--color-bg-app)",
    borderRight: "1px solid var(--color-border-light)",
    color: "var(--color-text-muted)",
  },
  ".cm-activeLineGutter": {
    backgroundColor: "var(--color-bg-hover)",
  },
  ".cm-activeLine": {
    backgroundColor: "var(--color-bg-hover)",
  },
  ".cm-selectionBackground, &.cm-focused .cm-selectionBackground": {
    backgroundColor: "rgba(59, 130, 246, 0.22)",
  },
  "&.cm-focused": {
    outline: "none",
  },
});

const themeCompartment = new Compartment();

function themeExtension(theme: "dark" | "light"): Extension {
  return theme === "dark" ? oneDark : [];
}

export function CodeEditor({ content, language, onChange }: CodeEditorProps) {
  const theme = useThemeStore((s) => s.theme);
  const rootRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const langExtensions = useMemo(() => {
    const completionSource = completionSourceFor(language);
    return [
      basicSetup,
      languageExtension(language),
      completionSource
        ? autocompletion({ override: [completionSource] })
        : [],
      lightTheme,
      themeCompartment.of(themeExtension(theme)),
      EditorView.lineWrapping,
      EditorView.updateListener.of((update) => {
        if (update.docChanged) {
          onChangeRef.current(update.state.doc.toString());
        }
      }),
    ];
  }, [language]);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    const view = new EditorView({
      state: EditorState.create({
        doc: content,
        extensions: langExtensions,
      }),
      parent: root,
    });
    viewRef.current = view;

    return () => {
      view.destroy();
      viewRef.current = null;
    };
  }, []);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    view.dispatch({
      effects: themeCompartment.reconfigure(themeExtension(theme)),
    });
  }, [theme]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const current = view.state.doc.toString();
    if (current === content) return;
    view.dispatch({
      changes: {
        from: 0,
        to: current.length,
        insert: content,
      },
    });
  }, [content]);

  return <div ref={rootRef} className="code-editor-shell" />;
}
