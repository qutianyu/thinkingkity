import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./i18n";
import "./styles/index.css";
import { applyAppFontSizePx, DEFAULT_APP_FONT_SIZE_PX } from "@/lib/fontSize";

applyAppFontSizePx(DEFAULT_APP_FONT_SIZE_PX);

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
