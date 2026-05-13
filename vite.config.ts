import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";
import fs from "fs";

const pdfjsAssetDirs = ["cmaps", "iccs", "standard_fonts", "wasm"];

function pdfjsAssetsPlugin() {
  const pdfjsRoot = path.resolve(__dirname, "node_modules/pdfjs-dist");
  const publicPrefix = "/pdfjs/";

  return {
    name: "thinkingkity-pdfjs-assets",
    configureServer(server) {
      server.middlewares.use(publicPrefix, (req, res, next) => {
        const requestPath = decodeURIComponent(req.url?.split("?")[0] ?? "");
        const assetPath = path.normalize(path.join(pdfjsRoot, requestPath));
        if (!assetPath.startsWith(pdfjsRoot + path.sep)) {
          next();
          return;
        }
        fs.createReadStream(assetPath)
          .on("error", next)
          .pipe(res);
      });
    },
    closeBundle() {
      const outDir = path.resolve(__dirname, "dist/pdfjs");
      fs.mkdirSync(outDir, { recursive: true });
      for (const dir of pdfjsAssetDirs) {
        fs.cpSync(path.join(pdfjsRoot, dir), path.join(outDir, dir), { recursive: true });
      }
    },
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), pdfjsAssetsPlugin()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    proxy: {
      "/api": {
        target: `http://localhost:${process.env.THINKINGKITY_PORT || "19840"}`,
        changeOrigin: true,
      },
    },
  },
  envPrefix: ["VITE_", "TAURI_"],
});
