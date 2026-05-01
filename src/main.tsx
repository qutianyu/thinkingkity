import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./i18n";
import "./styles/index.css";
import { seedFallbackFs, isTauri } from "./lib/tauriCommands";

// Pre-populate the browser fallback filesystem with test vault content so
// `npm run dev` opens a realistic vault without needing the Tauri backend.
if (!isTauri()) {
  const testFiles = import.meta.glob<string>(
    "/test-vault/**/*",
    { query: "?raw", import: "default", eager: true },
  );
  seedFallbackFs(testFiles, "/demo-vault");
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
